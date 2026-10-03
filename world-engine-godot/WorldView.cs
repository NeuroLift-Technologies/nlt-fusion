using Godot;
using System;

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
        _sky3d.Set("current_time", 6.0f);
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
				LightColor = new Color(0xfff0d8),
				LightEnergy = 2.3f,
				ShadowEnabled = true,
				DirectionalShadowMaxDistance = 320f,
				DirectionalShadowBlendSplits = true,
			};
			AddChild(_sun);
		}

		// --- Terrain ---
		AddChild(TerrainBuilder.Build());

		// --- Water ---
		var water = WaterBuilder.Build();
		_waterMat = (ShaderMaterial)water.MaterialOverride;
		AddChild(water);

		// --- Settlement + Vegetation ---
		var rng = new SimulationRng((uint)WorldConstants.Seed);
		var plans = SettlementBuilder.BuildPlans(rng);
		AddChild(SettlementBuilder.Build(plans));
		AddChild(VegetationBuilder.Build(plans));
	}

	/// <summary>Advances the sim clock and writes Sky3D's current_time (unless paused); updates sun uniforms for water/vegetation.</summary>
	public override void _Process(double delta)
	{
		_simT += delta;

		// Drive Sky3D's clock from sim elapsed time.
        // DayLen = 260 s → one full 24-hour cycle = 260 s real time.
        // current_time is hours [0, 24).
        if (!_skyPaused)
        {
            float hours = (float)((_simT % WorldConstants.DayLen) / WorldConstants.DayLen * 24.0);
            _sky3d.Set("current_time", hours);
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
        Color fog = new Color(0x9fb6c4).Lerp(new Color(0xffd0a0), t * 0.35f);

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
    public override void _UnhandledInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb)
        {
            if (mb.ButtonIndex == MouseButton.Left) _dragging = mb.Pressed;
            if (mb.ButtonIndex == MouseButton.WheelUp) _dist = MathF.Max(8f, _dist - 6f);
            if (mb.ButtonIndex == MouseButton.WheelDown) _dist = MathF.Min(340f, _dist + 6f);
            UpdateCamera();
        }
        else if (@event is InputEventMouseMotion mm && _dragging)
        {
            _yaw -= mm.Relative.X * 0.005f;
            _pitch = Mathx.Clamp(_pitch + mm.Relative.Y * 0.004f, 0.05f, Mathf.Pi * 0.487f);
            UpdateCamera();
        }
    }
}
