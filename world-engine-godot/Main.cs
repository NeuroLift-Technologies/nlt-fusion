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
	private string _sceneId = "";

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
			Follow(CurrentAvatarPoint);
		else
			Follow(null);
		_observer.SetFocusActive(_following);
	}

	/// <summary>The followed avatar's world position from the document on show, or null without one.</summary>
	private Vector3? CurrentAvatarPoint()
	{
		var avatar = FeedTransport.PrimaryAvatar(_feed.Current);
		return avatar?.Position3();
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
	}
}
