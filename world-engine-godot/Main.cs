using NltWorldEngine;
using NltWorldEngine.Agents;
using Godot;
using NltWorldEngine.Feed;
using NltWorldEngine.Observer;

/// <summary>
/// Composition root. The world comes from <see cref="WorldView"/> (the open world, Phase B); the
/// observer is added on top of it (Phase D).
///
/// The two are deliberately separate systems talking one direction. <see cref="FeedTransport"/>
/// reads documents that already exist; it never writes to the world, never advances a clock Fusion
/// owns, and never derives a value it was not given.
/// </summary>
public partial class Main : NltWorldEngine.WorldView
{
	private FeedTransport _feed = null!;
	private ObserverRoot _observer = null!;
	private bool _following;
	private string _followTargetId = "";
	private const string LocalAvatarTargetId = "__local_avatar__";
	private string _sceneId = "";
	/// <summary>
	/// When true, spawn a live Jolt avatar per feed agent. Off by default so the observer
	/// fixture path is unchanged until the loop is validated.
	/// </summary>
	[Export] public bool EnableLiveAvatars { get; set; } = false;

	private PackedScene? _avatarScene;

	private readonly System.Collections.Generic.Dictionary<string, AvatarCharacter> _avatars = new();


	public override void _Ready()
	{
		base._Ready();

		_feed = new FeedTransport { Name = "FeedTransport" };
		AddChild(_feed);

		_observer = new ObserverRoot { Name = "Observer" };
		AddChild(_observer);
		_observer.Attach(_feed, this);

		// The world view follows the feed's scene (B.3): swap to the room the agents are in.
		_feed.DocumentChanged += OnDocumentChanged;

		// The observer loads its fixture during its own _Ready, which runs before we subscribe, so seed
		// the scene and the residents from whatever is already current rather than waiting a tick.
		OnDocumentChanged(_feed.Current);

		// Inert unless --capture is passed; see ObserverCapture.
		ObserverCapture.TryCreate(this);
		_observer.LevelChanged += ApplyRequestedLevel;
		_observer.FocusRequested += ToggleFollow;
		_observer.FollowTargetChanged += SelectFollowTarget;
		ApplyRequestedLevel();
	}

	private void ApplyRequestedLevel()
	{
		if (_observer == null)
			return;
		var capture = GetNodeOrNull<ObserverCapture>("ObserverCapture");
		if (capture != null)
			_observer.SetReadingLevel(capture.RequestedLevel);
	}

	/// <summary>
	/// Toggle the world camera following the agent the observer is showing.
	///
	/// Routed through here rather than letting the observer reach into the camera: the observer reads
	/// the world, it does not drive it (see <see cref="WorldView.Camera"/>). The composition root owns
	/// both systems, so it is the one place that may connect them.
	/// </summary>
	private void ToggleFollow()
	{
		_following = !_following;
		if (_following)
			Follow(CurrentFollowTargetPoint);
		else
			Follow(null);
		_observer.SetFocusActive(_following);
	}

	private void SelectFollowTarget(string targetId)
	{
		_followTargetId = targetId;
		_observer.SetFollowTargets(_feed.Current?.Agents ?? System.Array.Empty<AgentState>(),
			_followTargetId, EnableLiveAvatars);
		if (_following)
			Follow(CurrentFollowTargetPoint);
	}

	/// <summary>Read the selected subject's current world position.</summary>
	private Vector3? CurrentFollowTargetPoint()
	{
		if (_followTargetId == "__none__")
			return null;
		if (_followTargetId == LocalAvatarTargetId)
		{
			if (_avatars.TryGetValue(LocalAvatarTargetId, out AvatarCharacter? local) && IsInstanceValid(local))
				return local.GlobalPosition;
			return null;
		}

		if (string.IsNullOrEmpty(_followTargetId))
			return FeedTransport.PrimaryAvatar(_feed.Current)?.Position3();

		AgentState? selected = _feed.Current?.Agent(_followTargetId);
		return selected?.Position3();
	}

	/// <summary>
	/// Follow the feed (RENDERER-PLAN.md B.2/B.3): swap the world view when the scene changes, and
	/// re-place the residents on every document.
	///
	/// The scene swap is guarded on the id so a manual camera orbit is not fought on every document —
	/// only a real scene change re-frames. Residents get every document, because an agent moving inside
	/// the same room still has to be re-placed and re-animated.
	/// </summary>
	private void OnDocumentChanged(NltWorldEngine.StateFeed? doc)
	{
		if (doc == null)
			return;

		if (doc.Scene.Id != _sceneId)
		{
			_sceneId = doc.Scene.Id;
			ShowScene(doc.Scene.Id, doc.Scene.Kind);
		}

		Residents.Sync(doc, ReducedMotion);

		SyncLiveAvatars(doc);
		ReconcileFollowTarget(doc);
		_observer.SetFollowTargets(doc.Agents, _followTargetId, EnableLiveAvatars);
		if (_following)
			Follow(CurrentFollowTargetPoint);
	}

	private void ReconcileFollowTarget(NltWorldEngine.StateFeed doc)
	{
		if (_followTargetId == "__none__")
			return;

		if (_followTargetId == LocalAvatarTargetId)
		{
			if (EnableLiveAvatars
				&& _avatars.TryGetValue(LocalAvatarTargetId, out AvatarCharacter? selectedLocal)
				&& IsInstanceValid(selectedLocal))
				return;
		}
		else if (!string.IsNullOrEmpty(_followTargetId) && doc.Agent(_followTargetId) != null)
		{
			return;
		}

		_followTargetId = FeedTransport.PrimaryAvatar(doc)?.Id
			?? FirstAgentId(doc)
			?? (EnableLiveAvatars
				&& _avatars.TryGetValue(LocalAvatarTargetId, out AvatarCharacter? fallbackLocal)
				&& IsInstanceValid(fallbackLocal)
					? LocalAvatarTargetId
					: "__none__");
	}

	private static string? FirstAgentId(NltWorldEngine.StateFeed doc)
	{
		foreach (AgentState agent in doc.Agents)
			return agent.Id;
		return null;
	}

	/// <summary>
	/// Spawn/sync one <see cref="AvatarCharacter"/> per feed agent when live avatars are
	/// enabled. Feed <see cref="Resident"/> ghosts keep rendering unchanged — avatars are
	/// additive, offset +2 m on X so both are visible side by side for comparison.
	/// No transport, no Fusion, no ASFDK here: default UtilityAgentController only.
	/// </summary>
	private void SyncLiveAvatars(NltWorldEngine.StateFeed doc)
	{
		if (!EnableLiveAvatars)
			return;

		_avatarScene ??= GD.Load<PackedScene>("res://Agents/avatar.tscn");
		if (_avatarScene == null)
			return;

		EnsureAvatarGround();

		const string localId = LocalAvatarTargetId;
		if (!_avatars.TryGetValue(localId, out AvatarCharacter? localAvatar) || !IsInstanceValid(localAvatar))
		{
			localAvatar = _avatarScene.Instantiate<AvatarCharacter>();
			localAvatar.Name = localId;
			localAvatar.DisplayName = "Local Model";
			localAvatar.ReducedMotion = ReducedMotion;
			AddChild(localAvatar);
			AgentState? primary = FeedTransport.PrimaryAvatar(doc);
			Vector3 spawn = primary?.Position3() ?? Vector3.Zero;
			localAvatar.GlobalPosition = spawn + new Vector3(2f, 1f, 0f);
			localAvatar.Observe(localAvatar.GlobalPosition, new[] { 0.5f, 0.5f, 0.5f, 0.5f }, doc.Scene.Id);
			_avatars[localId] = localAvatar;
		}

		var seen = new System.Collections.Generic.HashSet<string> { localId };
		foreach (var agent in doc.Agents)
		{
			seen.Add(agent.Id);
			if (!_avatars.TryGetValue(agent.Id, out var avatar) || !IsInstanceValid(avatar))
			{
				avatar = _avatarScene.Instantiate<AvatarCharacter>();
				avatar.Name = agent.Id;
				avatar.DisplayName = agent.Name;
				avatar.ReducedMotion = ReducedMotion;
				AddChild(avatar);
				// Offset so the live body doesn't z-fight the feed ghost.
				avatar.GlobalPosition = agent.Position3() + new Vector3(2f, 1f, 0f);
				avatar.Observe(avatar.GlobalPosition,
					new[] { 0.5f, 0.5f, 0.5f, 0.5f }, doc.Scene.Id);
				_avatars[agent.Id] = avatar;
			}
			else
			{
				avatar.ReducedMotion = ReducedMotion;
			}
		}

		var gone = new System.Collections.Generic.List<string>();
		foreach (var id in _avatars.Keys)
			if (!seen.Contains(id))
				gone.Add(id);
		foreach (var id in gone)
		{
			if (IsInstanceValid(_avatars[id]))
				_avatars[id].QueueFree();
			_avatars.Remove(id);
		}
	}

	/// <summary>
	/// Flat Jolt ground so <c>IsOnFloor()</c> has something to stand on. Levels like
	/// workplace (FBX instance, no collision) otherwise leave avatars falling forever.
	/// </summary>
	private void EnsureAvatarGround()
	{
		if (GetNodeOrNull<StaticBody3D>("AvatarGround") != null)
			return;
		var ground = new StaticBody3D { Name = "AvatarGround" };
		var shape = new CollisionShape3D();
		var box = new BoxShape3D { Size = new Vector3(500f, 1f, 500f) };
		shape.Shape = box;
		ground.AddChild(shape);
		ground.Position = new Vector3(0f, -0.5f, 0f);
		AddChild(ground);
	}
}
