using Godot;
using System;

namespace NltWorldEngine;

public partial class WorldView : Node3D
{
    private double _simT;
    private DirectionalLight3D _sun = null!;
    private WorldEnvironment _env = null!;
    private ShaderMaterial _skyMat = null!;
    private ShaderMaterial _waterMat = null!;
    private Camera3D _cam = null!;

    private Vector3 _target = new(WorldConstants.SettleX, WorldConstants.SettleY + 2f, WorldConstants.SettleZ);
    private float _yaw = 0.6f, _pitch = 0.42f, _dist = 78f;
    private bool _dragging;
    private Vector2 _last;

    public override void _Ready()
    {
        // camera
        _cam = new Camera3D { Fov = 52f, Near = 0.5f, Far = 2400f };
        AddChild(_cam);
        UpdateCamera();

        // environment
        var env = new Godot.Environment();
        env.BackgroundMode = Godot.Environment.BGMode.ClearColor;
        env.BackgroundColor = new Color(0x9fb6c4);
        env.FogEnabled = true;
        env.FogMode = Godot.Environment.FogModeEnum.Exponential;
        env.FogDensity = 0.0016f;
        env.AmbientLightSource = Godot.Environment.AmbientSource.Color;
        env.AmbientLightColor = new Color(0xa8bcc8);
        env.AmbientLightEnergy = 0.34f;
        env.TonemapMode = Godot.Environment.ToneMapper.Aces;
        env.TonemapExposure = 1.0f;
        env.GlowEnabled = true;
        env.GlowIntensity = 0.55f;
        env.GlowBloom = 0.25f;
        env.VolumetricFogEnabled = false;
        _env = new WorldEnvironment { Environment = env };
        AddChild(_env);

        // sun
        _sun = new DirectionalLight3D
        {
            LightColor = new Color(0xfff0d8),
            LightEnergy = 2.3f,
            ShadowEnabled = true,
            DirectionalShadowMaxDistance = 320f,
            DirectionalShadowBlendSplits = true,
        };
        AddChild(_sun);

        // sky
        var sky = SkyBuilder.Build();
        _skyMat = (ShaderMaterial)sky.MaterialOverride;
        AddChild(sky);

        // terrain
        AddChild(TerrainBuilder.Build());

        // water
        var water = WaterBuilder.Build();
        _waterMat = (ShaderMaterial)water.MaterialOverride;
        AddChild(water);

        // settlement plans first (vegetation avoids them)
        var rng = new SimulationRng((uint)WorldConstants.Seed);
        var plans = SettlementBuilder.BuildPlans(rng);
        AddChild(SettlementBuilder.Build(plans));
        AddChild(VegetationBuilder.Build(plans));
    }

    public override void _Process(double delta)
    {
        _simT += delta;
        var s = Daylight.Sample(_simT);

        _sun.LightColor = s.Sun;
        _sun.LightEnergy = s.SunI;
        _sun.Position = _target + s.SunDir * 260f;
        _sun.LookAt(_target, Vector3.Up);

        var env = _env.Environment;
        env.BackgroundColor = s.Fog;
        env.FogDensity = s.Fd;
        env.AmbientLightColor = s.Hor.Lerp(s.Gnd, 0.35f);
        env.AmbientLightEnergy = s.Amb * 0.6f;

        _skyMat.SetShaderParameter("u_top", s.Top);
        _skyMat.SetShaderParameter("u_horizon", s.Hor);
        _skyMat.SetShaderParameter("u_ground", s.Gnd);
        _skyMat.SetShaderParameter("u_sun_color", s.Sun);
        _skyMat.SetShaderParameter("u_sun_dir", s.SunDir);

        _waterMat.SetShaderParameter("u_time", (float)_simT);
        _waterMat.SetShaderParameter("u_sky", s.Hor);
        _waterMat.SetShaderParameter("u_sun_color", s.Sun);
        _waterMat.SetShaderParameter("u_sun_dir", s.SunDir);
        _waterMat.SetShaderParameter("u_fog_color", s.Fog);
        _waterMat.SetShaderParameter("u_fog_density", s.Fd);

        foreach (var m in VegetationBuilder.WindMats)
            m.SetShaderParameter("u_time", (float)_simT);
    }

    private void UpdateCamera()
    {
        _cam.Position = _target + new Vector3(
            MathF.Cos(_pitch) * MathF.Sin(_yaw) * _dist,
            MathF.Sin(_pitch) * _dist,
            MathF.Cos(_pitch) * MathF.Cos(_yaw) * _dist);
        _cam.LookAt(_target, Vector3.Up);
    }

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
