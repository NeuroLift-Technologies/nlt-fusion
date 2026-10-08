using Godot;
using System;
using System.Collections.Generic;

namespace NltWorldEngine;

/// <summary>
/// Root scene node — camera, environment, and world geometry.
///
/// Sky: Sky3D v2.1 (addons/sky_3d/) replaces the procedural SkyBuilder.cs shader.
/// Sky3D is a GDScript WorldEnvironment subclass; we instantiate it from C# via GDScript.New()
/// and drive its clock from the sim elapsed time so the day cycle stays in sync with the
/// simulation rather than real wall time.
///
/// The Sky3D node owns SunLight and MoonLight DirectionalLight3D children. The water and
/// vegetation shaders still need the sun direction and colour each frame; we read them
/// directly from the Sky3D/SunLight child node.
///
/// Reduced motion (RENDERER-PLAN.md D.4): the sky rotation pauses when _skyPaused is true.
/// Set WorldView.SkyPaused = true to honour a reduced-motion accessibility preference.
/// </summary>
public partial class WorldView : Node3D
{
	// Sim elapsed time, used to drive Sky3D's current_time
	private double _simT;

	// Sky3D node (WorldEnvironment subclass, GDScript)
	private WorldEnvironment _sky3d = null!;
	// Sun light — child of _sky3d, created automatically by Sky3D._initialize()
	private DirectionalLight3D _sun = null!;

	// Water and vegetation shader materials — still need sun uniforms each frame
	private ShaderMaterial _waterMat = null!;

	private Camera3D _cam = null!;

	private Vector3 _target = new(WorldConstants.SettleX, WorldConstants.SettleY + 2f, WorldConstants.SettleZ);
	private float _yaw = 0.6f, _pitch = 0.42f, _dist = 78f;
	private bool _dragging;
	private Vector2 _last;
	private const float PanSpeed = 24f;

	// Focus / follow. The camera otherwise stays pinned on the settlement while the feed moves the
	// agent away from it, so the agent's pins project off-frame and are culled. See FocusOn/Follow.
	private Func<Vector3?>? _followSource;
	private bool _following;

	// Scene swap (RENDERER-PLAN.md B.3-lite). The procedural world and the current interior room are
	// held under separate nodes so the view can switch between them without rebuilding either.
	private Node3D _openWorld = null!;
	private Node3D _interior = null!;
	private string _interiorPath = "";
	private float _focusLift = 2f;
	private float _minDist = 8f;

	// Rendered residents (RENDERER-PLAN.md B.2). One character per agent, under the world root so it
	// shows in both the open world and interiors — the feed's positions are already scene-local.
	private ResidentLayer _residents = null!;

	// Doorways (B.3 / C.2): the observer's way in and out. World doors are built once with the
	// settlement; the interior exit belongs to whichever level is showing.
	private readonly List<Portal> _worldPortals = new();
	private Portal? _interiorPortal;
	private bool _clickPending;
	private Vector2 _clickAt;

	private const float OpenWorldDist = 78f;
	private const float OpenWorldPitch = 0.42f;

	// Reduced-motion toggle (RENDERER-PLAN.md D.4)
	// When true, sky rotation is paused; water/vegetation animation continues.
	private bool _skyPaused;
	public bool SkyPaused
	{
		get => _skyPaused;
		set
		{
			_skyPaused = value;
		}
	}

	/// <summary>
	/// Whether the world's other moving parts should also hold still. The observer sets this alongside
	/// <see cref="SkyPaused"/> from its reduced-motion setting (RENDERER-PLAN.md D.4); residents read it
	/// so an agent's walk cycle freezes too, rather than only the sky.
	/// </summary>
	public bool ReducedMotion { get; set; }

	/// <summary>
	/// The world camera. Exposed so the observer's World View HUD can project agent positions onto
	/// the screen. Read-only: the observer may look through this camera, never move it.
	/// </summary>
	public Camera3D Camera => _cam;

	/// <summary>True while the camera is tracking a moving point (the agent the observer follows).</summary>
	public bool Following => _following;

	/// <summary>The rendered residents — one character per agent in the document on show (B.2).</summary>
	public ResidentLayer Residents => _residents;

	/// <summary>
	/// Aim the orbit camera at a world point, lifted slightly so the subject sits in the middle of the
	/// frame instead of under the bottom edge.
	///
	/// This is the seam the World View needs: without it the camera stays pinned on the settlement
	/// (WorldConstants.SettleX/Z) while the feed moves the agent away from it, so the agent's pins
	/// project ~46 degrees off-axis and are culled — the one region that should answer "where is the
	/// agent" shows someone else entirely. Snapped rather than eased, so it honours reduced motion.
	/// </summary>
	public void FocusOn(Vector3 world)
	{
		_target = new Vector3(world.X, world.Y + _focusLift, world.Z);
		UpdateCamera();
	}

	/// <summary>
	/// Track a moving point each frame — e.g. the followed avatar's position from the feed. Pass
	/// <c>null</c> to stop following and leave the camera where it is. The source may itself return
	/// <c>null</c> to say there is currently nothing to follow.
	/// </summary>
	public void Follow(Func<Vector3?>? source)
	{
		_followSource = source;
		_following = source != null;
		PollFollow();
	}

	private void PollFollow()
	{
		if (!_following || _followSource == null)
			return;
		Vector3? point = _followSource();
		if (point.HasValue)
			FocusOn(point.Value);
	}

	// --- Scene swap (B.3-lite) -------------------------------------------------

	/// <summary>Feed scene-id prefix → interior scene file, mirroring RENDERER-PLAN.md B.3's mapping.</summary>
	private static readonly (string Prefix, string Path)[] InnerScenes =
	{
		("personal", "res://personal_level.tscn"),
		("workplace", "res://workplace_level.tscn"),
		("social", "res://social_level.tscn"),
		("academic", "res://academic_level.tscn"),
	};

	private static string? InteriorPathFor(string sceneId)
	{
		foreach (var (prefix, path) in InnerScenes)
			if (sceneId.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
				return path;
		return null;
	}

	/// <summary>
	/// Show the scene the feed says the agents are in (RENDERER-PLAN.md B.3). <paramref name="kind"/>
	/// "open_world" shows the procedural world; "interior" swaps to the room for
	/// <paramref name="sceneId"/>.
	///
	/// The camera is re-framed for the kind, because a room ~10 m across is not viewed from the
	/// open-world distance of 78 m: the camera would sit outside the walls and frame the building, not
	/// the room. Idempotent — showing the same interior again is a no-op — so it is safe to call on
	/// every document; the caller only needs to guard the change.
	/// </summary>
	public void ShowScene(string sceneId, string kind)
	{
		if (_openWorld == null)
			return;

		string? path = kind == "interior" ? InteriorPathFor(sceneId) : null;

		if (path == null)
		{
			_openWorld.Visible = true;
			_interior.Visible = false;
			_interiorPortal = null;
			if (_interiorPath.Length > 0)
			{
				_interiorPath = "";
				ClearInterior();
			}
			_focusLift = 2f;
			_minDist = 8f;
			_dist = OpenWorldDist;
			_pitch = OpenWorldPitch;
			_target = new Vector3(WorldConstants.SettleX, WorldConstants.SettleY + 2f, WorldConstants.SettleZ);
			UpdateCamera();
			return;
		}

		_openWorld.Visible = false;
		if (_interiorPath != path)
		{
			ClearInterior();
			var packed = GD.Load<PackedScene>(path);
			if (packed == null)
			{
				GD.PushWarning($"WorldView: no interior scene at {path} for '{sceneId}'");
				return;
			}
			_interiorPath = path;
			var instance = packed.Instantiate();
			_interior.AddChild(instance);
			StripInteriorClutter(instance);
			DecorateInteriorExit(instance);
		}
		_interior.Visible = true;

		// Frame from the level's own geometry: the four levels differ in scale (the personal level's
		// footprint is ~80 units, the workspace level's ~32), so one fixed distance cannot serve them,
		// and the feed's agent positions are not in the level's local space. A bounds overview shows
		// each level as a whole, with the agent's pin somewhere inside it.
		_focusLift = 1.1f;
		_minDist = 3f;
		FrameInterior(_interior);
	}

	/// <summary>Look at an interior instance from above, sized to its own footprint.</summary>
	private void FrameInterior(Node root)
	{
		if (!TryBounds(root, out Aabb box) || box.Size == Vector3.Zero)
		{
			// Nothing measurable — fall back to a room-sized frame rather than the open-world distance.
			_target = new Vector3(0f, 1.1f, 0f);
			_dist = 8f;
			_pitch = 0.5f;
			UpdateCamera();
			return;
		}

		_target = box.Position + box.Size * 0.5f;
		float span = MathF.Max(box.Size.X, box.Size.Z);
		_dist = Math.Clamp(span * 0.55f, 8f, 70f);
		_pitch = 0.5f;
		UpdateCamera();
	}

	/// <summary>World-space bounds of every visible mesh under <paramref name="root"/>.</summary>
	private static bool TryBounds(Node root, out Aabb box)
	{
		Vector3 min = new(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
		Vector3 max = new(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
		bool any = false;
		Accumulate(root, Transform3D.Identity, ref min, ref max, ref any);
		box = any ? new Aabb(min, max - min) : default;
		return any;
	}

	private static void Accumulate(Node node, Transform3D xf, ref Vector3 min, ref Vector3 max, ref bool any)
	{
		Transform3D world = node is Node3D n3 ? xf * n3.Transform : xf;
		if (node is MeshInstance3D mi && mi.Mesh != null && mi.Visible)
		{
			Aabb a = mi.GetAabb();
			for (int i = 0; i < 8; i++)
			{
				Vector3 corner = a.Position + new Vector3(
					a.Size.X * (i & 1), a.Size.Y * ((i >> 1) & 1), a.Size.Z * ((i >> 2) & 1));
				Vector3 w = world * corner;
				min = min.Min(w);
				max = max.Max(w);
				any = true;
			}
		}
		foreach (var child in node.GetChildren())
			Accumulate(child, world, ref min, ref max, ref any);
	}

	private void ClearInterior()
	{
		foreach (var child in _interior.GetChildren())
		{
			_interior.RemoveChild(child);
			child.QueueFree();
		}
	}

	/// <summary>
	/// Hide the import leftovers that do not belong in a room view: the <c>SM_SkySphere</c> (a
	/// 400×-scaled dome from the UE export, which otherwise encloses the camera) and the <c>UCX_*</c>
	/// collision hulls, which render as duplicate geometry over the real surfaces.
	/// </summary>
	private static void StripInteriorClutter(Node node)
	{
		string name = node.Name.ToString();
		if (name.Contains("Sky", StringComparison.Ordinal) || name.StartsWith("UCX_", StringComparison.Ordinal))
			(node as Node3D)?.Hide();
		foreach (var child in node.GetChildren())
			StripInteriorClutter(child);
	}

	// --- Doorways (B.3 / C.2) --------------------------------------------------

	private const float ClickSlop = 6f;
	private const float ClickRadiusPx = 44f;

	/// <summary>
	/// The return door inside an interior: the level's own front door where it has one (three of the
	/// four levels do), else a marked spot at the room's centre. Marked with the same arch as the
	/// building doors, so the observer can see and click it rather than having to know the exit key.
	/// </summary>
	private void DecorateInteriorExit(Node root)
	{
		_interiorPortal = null;
		Node3D? door = null;
		FindDoorNamed(root, Transform3D.Identity, ref door);

		Vector3 pos;
		Vector3 facing;
		if (door != null)
		{
			pos = door.GlobalTransform.Origin;
			facing = DoorFacing(door);
		}
		else if (root.Name.ToString().StartsWith("Social_Level", StringComparison.OrdinalIgnoreCase))
		{
			// The social/cafe FBX has a solid north wall but no door mesh. Cut a clearly visible
			// doorway into that wall and install a door leaf, frame and portal marker there.
			AddSocialExitDoorway(root);
			pos = new Vector3(0f, 0f, 10f);
			facing = Vector3.Back;
		}
		else if (TryBounds(root, out Aabb box))
		{
			// Last-resort fallback for an unexpected future level: keep its exit visible and
			// clickable even if it has no named door mesh.
			pos = box.Position + new Vector3(box.Size.X * 0.5f, 0f, box.Size.Z * 0.5f);
			facing = Vector3.Back;
		}
		else
		{
			pos = new Vector3(0f, 0f, 0f);
			facing = Vector3.Back;
		}

		var markerPosition = new Vector3(pos.X, 0f, pos.Z);
		if (door != null)
		{
			// Authored doors sit in the wall plane; put the arch just inside the room so it is visible.
			markerPosition -= facing * 0.2f;
		}
		else if (root.Name.ToString().StartsWith("Social_Level", StringComparison.OrdinalIgnoreCase))
		{
			// The custom cafe door leaf sits just inside the north wall opening.
			markerPosition = new Vector3(pos.X, 0f, pos.Z - 1.4f);
		}
		else
		{
			markerPosition.Y = 0f;
		}

		var marker = PortalMarker.Build("Exit", new Color("e6edf3"));
		marker.Position = markerPosition;
		if (facing.X < -0.5f)
			marker.RotationDegrees = new Vector3(0f, 90f, 0f);
		else if (facing.X > 0.5f)
			marker.RotationDegrees = new Vector3(0f, -90f, 0f);
		else if (facing.Z < -0.5f)
			marker.RotationDegrees = new Vector3(0f, 180f, 0f);
		root.AddChild(marker);

		_interiorPortal = new Portal("Exit", "Exit", "", new Vector3(pos.X, 0f, pos.Z), facing);
	}

	/// <summary>
	/// The cafe FBX has four continuous perimeter walls and no door mesh. Leave the centre 2.2 m
	/// of its north wall open, add a frame and hinged-looking door leaf, and put the Exit marker
	/// in the passage so every interior has a real visible doorway.
	/// </summary>
	private static void AddSocialExitDoorway(Node root)
	{
		// The FBX has a single continuous north wall and no door mesh. Replace that wall with
		// three world-space sections around a real opening; don't modify its highly-scaled FBX node.
		var wall = root.FindChild("Social_Wall_N", true, false) as MeshInstance3D;
		if (wall == null)
		{
			GD.PushWarning("WorldView: Social_Level has no Social_Wall_N mesh; cannot cut the exit opening.");
			return;
		}

		wall.Hide();
		// The imported collision hull mirrors the continuous wall mesh; hide it too so it does not
		// cover the new passage for picking or future physics use.
		(root.FindChild("UCX_Social_Wall_N", true, false) as Node3D)?.Hide();
		const float halfWidth = 1.1f;
		const float height = 3.5f;
		const float wallZ = 10f;
		var wallMat = new StandardMaterial3D
		{
			AlbedoColor = new Color("7d6957"),
			Roughness = 0.82f,
		};

		AddSocialWallSegment((Node3D)root, "Social_Wall_N_Left", new Vector3(-7.5f, height * 0.5f, wallZ),
			new Vector3(13f, height, 0.3f), wallMat);
		AddSocialWallSegment((Node3D)root, "Social_Wall_N_Right", new Vector3(7.5f, height * 0.5f, wallZ),
			new Vector3(13f, height, 0.3f), wallMat);
		AddSocialWallSegment((Node3D)root, "Social_Wall_N_Lintel", new Vector3(0f, height - 0.25f, wallZ),
			new Vector3(2f * halfWidth, 0.5f, 0.3f), wallMat);

		var doorMat = new StandardMaterial3D
		{
			AlbedoColor = new Color("9c8064"),
			Roughness = 0.72f,
		};
		root.AddChild(new MeshInstance3D
		{
			Name = "Social_Exit_Door",
			Mesh = new BoxMesh { Size = new Vector3(2f * halfWidth - 0.12f, 2.75f, 0.12f) },
			MaterialOverride = doorMat,
			Position = new Vector3(0f, 1.375f, wallZ - 0.12f),
		});

		var handleMat = new StandardMaterial3D
		{
			AlbedoColor = new Color("d5b46a"),
			Metallic = 0.65f,
			Roughness = 0.28f,
		};
		root.AddChild(new MeshInstance3D
		{
			Name = "Social_Exit_Door_Handle",
			Mesh = new SphereMesh { Radius = 0.055f, Height = 0.11f },
			MaterialOverride = handleMat,
			Position = new Vector3(0.78f, 1.25f, wallZ - 0.20f),
		});
	}

	private static void AddSocialWallSegment(Node3D parent, string name, Vector3 position, Vector3 size, Material material)
	{
		parent.AddChild(new MeshInstance3D
		{
			Name = name,
			Mesh = new BoxMesh { Size = size },
			MaterialOverride = material,
			Position = position,
		});
	}

	/// <summary>Outward direction from an authored door, from the door's position relative to the room centre.</summary>
	private static Vector3 DoorFacing(Node3D door)
	{
		// Door FBX nodes use a Z-up basis in every NLT level, so the basis cannot tell us
		// the horizontal facing — derive outward from where the door sits vs the room centre.
		Vector3 door_pos = door.GlobalPosition;
		if (Mathf.Abs(door_pos.Z) >= Mathf.Abs(door_pos.X))
			return door_pos.Z < 0f ? Vector3.Forward : Vector3.Back;
		return door_pos.X < 0f ? Vector3.Left : Vector3.Right;
	}

	/// <summary>First visible door mesh that is not a cupboard: skips <c>UCX_*</c>, wardrobe and washer.</summary>
	private static void FindDoorNamed(Node node, Transform3D xf, ref Node3D door)
	{
		if (door != null)
			return;
		Transform3D world = node is Node3D n3 ? xf * n3.Transform : xf;
		if (node is MeshInstance3D mi && mi.Visible)
		{
			string nm = mi.Name.ToString().ToLowerInvariant();
			if (nm.Contains("door") && !nm.StartsWith("ucx_")
				&& !nm.Contains("wardrobe") && !nm.Contains("washer"))
			{
				door = mi;
				return;
			}
		}
		foreach (var child in node.GetChildren())
		{
			FindDoorNamed(child, world, ref door);
			if (door != null)
				return;
		}
	}

	/// <summary>Step through a doorway with <c>E</c>: enter a building, or exit an interior.</summary>
	public override void _UnhandledKeyInput(InputEvent @event)
	{
		if (@event is not InputEventKey { Pressed: true, Echo: false } k || k.Keycode != Key.E)
			return;
		if (EnterOrExit())
			GetViewport().SetInputAsHandled();
	}

	/// <summary>The doorways the observer can currently use: the building doors, or the exit.</summary>
	private IEnumerable<Portal> ActivePortals()
	{
		if (_interior.Visible)
		{
			if (_interiorPortal != null)
				yield return _interiorPortal;
			yield break;
		}
		foreach (var p in _worldPortals)
			yield return p;
	}

	/// <summary>Activate the doorway the pointer clicked, if the click landed on one.</summary>
	private bool TryActivateAtScreen(Vector2 screen)
	{
		Portal? best = null;
		float bestD = ClickRadiusPx;
		foreach (var p in ActivePortals())
		{
			if (_cam.IsPositionBehind(p.Position))
				continue;
			float d = _cam.UnprojectPosition(p.Position).DistanceTo(screen);
			if (d < bestD)
			{
				bestD = d;
				best = p;
			}
		}
		if (best == null)
			return false;
		Activate(best);
		return true;
	}

	/// <summary>Enter the building doorway nearest the camera's focus, or leave an interior.</summary>
	private bool EnterOrExit()
	{
		if (_interior.Visible)
		{
			ShowScene("", "open_world");
			return true;
		}

		Portal? best = null;
		float bestD = 46f;
		foreach (var p in _worldPortals)
		{
			float d = p.Position.DistanceTo(_target);
			if (d < bestD)
			{
				bestD = d;
				best = p;
			}
		}
		if (best == null)
			return false;
		Activate(best);
		return true;
	}

	private void Activate(Portal portal)
	{
		if (portal.SceneId.Length == 0)
			ShowScene("", "open_world");   // the return door
		else
			ShowScene(portal.SceneId, "interior");
	}

	/// <summary>Initializes the state feed, camera, Sky3D sky, terrain, water, settlement and vegetation builders.</summary>
	public override void _Ready()
	{
		// Phase A.5 — fixture provider (schema-validated on load)
		StateFeedLoader.Load();

		// --- Camera ---
		_cam = new Camera3D { Fov = 52f, Near = 0.5f, Far = 2400f };
		AddChild(_cam);
		UpdateCamera();

		// --- Sky3D (replaces SkyBuilder.cs + Daylight.cs + manual WorldEnvironment + manual sun) ---
		// Sky3D is a GDScript @tool node extending WorldEnvironment.
		// Instantiate via GD.Load<GDScript> so C# doesn't need a generated wrapper.
		var sky3dScript = GD.Load<GDScript>("res://addons/sky_3d/src/Sky3D.gd");
		_sky3d = (WorldEnvironment)sky3dScript.New().AsGodotObject();
		_sky3d.Name = "Sky3D";

		// Simulation clock owns the sky: Sky3D's own time timer stays off.
		AddChild(_sky3d);

		// Sky3D forwards these to TimeOfDay/SunLight, which only exist after
		// AddChild has run _initialize(). Set them here so the values are not lost.
		_sky3d.Set("game_time_enabled", false);
		_sky3d.Set("current_time", 12.0f);
		_sky3d.Set("sun_shadow_opacity", 1.0f);

		// After AddChild, Sky3D._initialize() has run and created SunLight/MoonLight/SkyDome/TimeOfDay.
		// Grab the SunLight so water/vegetation shaders can read direction & colour each frame.
		var sunNode = _sky3d.GetNodeOrNull<DirectionalLight3D>("SunLight");
		if (sunNode != null)
		{
			_sun = sunNode;
			// Match shadow max distance from the previous manual sun
			_sun.DirectionalShadowMaxDistance = 320f;
			_sun.DirectionalShadowBlendSplits = true;
		}
		else
		{
			// Sky3D didn't create SunLight yet (can happen in editor context) — create a fallback
			GD.PushWarning("WorldView: Sky3D/SunLight not found after AddChild. Falling back to manual sun.");
			_sun = new DirectionalLight3D
			{
				LightColor = new Color(0xfff0d8FF),
				LightEnergy = 2.3f,
				ShadowEnabled = true,
				DirectionalShadowMaxDistance = 320f,
				DirectionalShadowBlendSplits = true,
			};
			AddChild(_sun);
		}

		// --- Open world (procedural), held under one node so the view can swap to an interior (B.3) ---
		_openWorld = new Node3D { Name = "OpenWorld" };
		AddChild(_openWorld);

		// --- Terrain ---
		_openWorld.AddChild(TerrainBuilder.Build());

		// --- Water ---
		var water = WaterBuilder.Build();
		_waterMat = (ShaderMaterial)water.MaterialOverride;
		_openWorld.AddChild(water);

		// --- Settlement + Vegetation ---
		var rng = new SimulationRng((uint)WorldConstants.Seed);
		var plans = SettlementBuilder.BuildPlans(rng);
		var settlement = SettlementBuilder.Build(plans, out List<Portal> portals);
		_worldPortals.AddRange(portals);
		_openWorld.AddChild(settlement);
		_openWorld.AddChild(VegetationBuilder.Build(plans));

		// Interiors are instanced here on demand by ShowScene; hidden until one is asked for.
		_interior = new Node3D { Name = "Interior" };
		_interior.Visible = false;
		AddChild(_interior);

		// Residents sit under the root, not under either scene: the feed's positions are already in the
		// shown scene's space, so one layer serves the open world and every interior (B.2).
		_residents = new ResidentLayer { Name = "Residents" };
		AddChild(_residents);
	}

	/// <summary>Advances the sim clock and writes Sky3D's current_time (unless paused); updates sun uniforms for water/vegetation.</summary>
	public override void _Process(double delta)
	{
		_simT += delta;

		// Keep the camera on the followed agent before the sky/water uniforms are read, so a focus
		// change lands on the same frame it was asked for.
		PollFollow();

		Vector2 pan = Vector2.Zero;
		if (Input.IsKeyPressed(Key.A) || Input.IsKeyPressed(Key.Left))
			pan.X -= 1f;
		if (Input.IsKeyPressed(Key.D) || Input.IsKeyPressed(Key.Right))
			pan.X += 1f;
		if (Input.IsKeyPressed(Key.W) || Input.IsKeyPressed(Key.Up))
			pan.Y -= 1f;
		if (Input.IsKeyPressed(Key.S) || Input.IsKeyPressed(Key.Down))
			pan.Y += 1f;
		if (pan.LengthSquared() > 0f)
		{
			pan = pan.Normalized();
			var forward = new Vector3(-MathF.Sin(_yaw), 0f, -MathF.Cos(_yaw));
			var right = new Vector3(MathF.Cos(_yaw), 0f, -MathF.Sin(_yaw));
			_target += (right * pan.X + forward * -pan.Y) * PanSpeed * (float)delta;
			if (_following)
				Follow(null);
			UpdateCamera();
		}

		// Drive Sky3D's clock from sim elapsed time.
		// DayLen = 260 s → one full 24-hour cycle = 260 s real time.
		// current_time is hours [0, 24).
		if (!_skyPaused)
		{
			// +12h offset: sim time 0 opens at noon, matching the current_time set in _Ready.
			// Without it the first _Process frame reset the clock to hour 0, so the world
			// launched into midnight — 18:00-06:00 has no directional light at all
			// (SunLight and MoonLight both sit at energy 0), leaving only Sky3D's blue
			// atm_night_tint ambient (0.24, 0.28, 0.35) to light everything.
			double hours = ((_simT + WorldConstants.DayLen * 0.5) % WorldConstants.DayLen) / WorldConstants.DayLen * 24.0;
			_sky3d.Set("current_time", (float)hours);
		}

		// Update water and vegetation shaders from the live sun state.
		// Sky3D owns the DirectionalLight3D; we read its world-space forward direction.
		Vector3 sunDir = -_sun.GlobalTransform.Basis.Z;
		Color sunColor = _sun.LightColor;
		float sunEnergy = _sun.LightEnergy;

		// Derive a simple fog/horizon colour from sun elevation (sky contribution absent here;
		// Sky3D manages the Environment directly, so we only update the water shader uniforms).
		float elevation = sunDir.Dot(Vector3.Up);                   // -1 (nadir) to 1 (zenith)
		float t = Mathx.Clamp01(elevation * 0.5f + 0.5f);          // 0 = midnight, 1 = noon
		Color fog = new Color(0x9fb6c4FF).Lerp(new Color(0xffd0a0FF), t * 0.35f);

		_waterMat.SetShaderParameter("u_time", (float)_simT);
		_waterMat.SetShaderParameter("u_sky", fog);
		_waterMat.SetShaderParameter("u_sun_color", sunColor);
		_waterMat.SetShaderParameter("u_sun_dir", sunDir);
		_waterMat.SetShaderParameter("u_fog_color", fog);
		_waterMat.SetShaderParameter("u_fog_density", 0.0016f);

		foreach (var m in VegetationBuilder.WindMats)
			m.SetShaderParameter("u_time", (float)_simT);
	}

	/// <summary>Positions the spectator camera on its orbit target.</summary>
	private void UpdateCamera()
	{
		_cam.Position = _target + new Vector3(
			MathF.Cos(_pitch) * MathF.Sin(_yaw) * _dist,
			MathF.Sin(_pitch) * _dist,
			MathF.Cos(_pitch) * MathF.Cos(_yaw) * _dist);
		_cam.LookAt(_target, Vector3.Up);
	}

	/// <summary>Handles spectator input such as camera control.</summary>
	public override void _Input(InputEvent @event)
	{
		if (@event is InputEventMouseButton mb)
		{
			if (mb.ButtonIndex == MouseButton.WheelUp)
			{
				if (!CameraOwnsPointer(CameraIntent.Zoom))
					return;
				_dist = MathF.Max(_minDist, _dist - 6f);
				UpdateCamera();
			}
			else if (mb.ButtonIndex == MouseButton.WheelDown)
			{
				if (!CameraOwnsPointer(CameraIntent.Zoom))
					return;
				_dist = MathF.Min(340f, _dist + 6f);
				UpdateCamera();
			}
			else if (mb.ButtonIndex == MouseButton.Left)
			{
				// A press that lands on a control owns the whole gesture. Clearing the flag here is
				// what stops a drag begun over the world from continuing once the pointer crosses a
				// button — and, more importantly, stops the button press from becoming an orbit.
				if (mb.Pressed)
				{
					if (!CameraOwnsPointer(CameraIntent.Orbit))
					{
						_dragging = false;
						_clickPending = false;
						return;
					}
					_dragging = true;
					// A press that does not become a drag is a doorway activation instead of an orbit.
					_clickPending = true;
					_clickAt = mb.Position;
				}
				else
				{
					_dragging = false;
					if (_clickPending && mb.Position.DistanceTo(_clickAt) <= ClickSlop)
						TryActivateAtScreen(mb.Position);
					_clickPending = false;
				}
			}
		}
		else if (@event is InputEventMouseMotion mm && _dragging)
		{
			if (!CameraOwnsPointer(CameraIntent.Orbit))
				return;
			_yaw -= mm.Relative.X * 0.005f;
			_pitch = Mathx.Clamp(_pitch + mm.Relative.Y * 0.004f, 0.05f, Mathf.Pi * 0.487f);
			UpdateCamera();
		}
	}

	private enum CameraIntent
	{
		/// <summary>Left-drag to orbit.</summary>
		Orbit,

		/// <summary>Wheel to change distance.</summary>
		Zoom,
	}

	/// <summary>
	/// Whether the camera may act on a pointer event where it currently sits.
	///
	/// <para>
	/// This reads <c>_Input</c> rather than <c>_UnhandledInput</c>, and that is the whole reason the
	/// camera works at all. The observer covers the window with a full-rect Control tree, and its
	/// split containers default to <c>MOUSE_FILTER_STOP</c>, so the GUI consumes every mouse event
	/// over the middle of the screen before an unhandled-input handler could ever see it. The
	/// click-through spacer is <c>Ignore</c>, but hit-testing stops at the first ancestor that claims
	/// the event, so setting that spacer alone was never enough.
	/// </para>
	///
	/// <para>
	/// The containers cannot simply be made click-through either: a <c>SplitContainer</c> needs
	/// <c>STOP</c> to drag its divider, so ignoring them would break rail resizing. <c>_Input</c>
	/// runs ahead of GUI processing, which sidesteps the conflict instead of trading one bug for
	/// another.
	/// </para>
	///
	/// <para>
	/// The trade is that the camera now sees clicks the GUI also sees, so this has to decide which
	/// wins. Layout containers answer <c>STOP</c> by default and would otherwise veto every click
	/// anywhere, so the test walks up from the hovered control and looks for one that genuinely acts
	/// on the mouse — buttons and sliders for the orbit, plus scroll containers for the wheel, since
	/// a wheel over a panel should scroll that panel rather than push the camera away.
	/// </para>
	/// </summary>
	private bool CameraOwnsPointer(CameraIntent intent)
	{
		var hovered = GetViewport().GuiGetHoveredControl();
		if (hovered == null)
			return true;

		for (Control? c = hovered; c != null; c = c.GetParent() as Control)
		{
			// Godot.Range covers ScrollBar, HSlider, VSlider and SpinBox. It must be qualified:
			// System.Range is a real type and WorldView has `using System`, so bare `Range` is CS0104.
			if (c is BaseButton or Godot.Range or LineEdit or TextEdit or ItemList or Tree or TabBar)
				return false;
			// A ScrollContainer only claims the wheel when it has somewhere to go. Yielding
			// unconditionally was wrong in both directions: over a panel that overflows the wheel
			// scrolled the panel correctly, but over a panel whose content fits the wheel did
			// nothing at all -- the panel ignored it and the camera had already stood down. The
			// observer then felt like it could only zoom down the middle. Compare MaxValue against
			// Page: equal means the content fits and there is nothing to scroll.
			if (intent == CameraIntent.Zoom && c is ScrollContainer sc && CanScroll(sc))
				return false;
		}
		return true;
	}

	/// <summary>
	/// Whether a scroll container currently has content beyond its visible area.
	///
	/// <see cref="ScrollContainer.GetVScrollBar"/> reports the range it would scroll: MaxValue is
	/// the full content extent and Page is the visible extent, so the two are equal exactly when
	/// nothing is hidden. An axis that is disabled reports the same equality.
	/// </summary>
	private static bool CanScroll(ScrollContainer sc)
	{
		if (sc.VerticalScrollMode != ScrollContainer.ScrollMode.Disabled)
		{
			var v = sc.GetVScrollBar();
			if (v != null && v.MaxValue > v.Page)
				return true;
		}
		return false;
	}
}
