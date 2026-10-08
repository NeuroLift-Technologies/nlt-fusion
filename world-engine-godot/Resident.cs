using Godot;

namespace NltWorldEngine;

/// <summary>
/// A rendered resident: the walk-cycle character (RENDERER-PLAN.md B.2) plus a name and named-state
/// label (B.4).
///
/// Contract §4.4 — an idle agent must not animate — so the walk clip advances only while the agent is
/// moving, and reduced motion (D.4) freezes it entirely. The model stands with feet at y=0 and is
/// ~1.78 m tall, so it is placed straight at the feed position with no scaling.
/// </summary>
public partial class Resident : Node3D
{
    private const string ModelPath = "res://assets/characters/_pipeline_probe/nlt_resident_walk.glb";

    private AnimationPlayer? _anim;
    private Label3D _label = null!;
    private string _walk = "";

    public override void _Ready()
    {
        Node? model = GetNodeOrNull<Node>("Model");
        if (model == null)
        {
            var packed = GD.Load<PackedScene>(ModelPath);
            if (packed != null)
            {
                model = packed.Instantiate();
                model.Name = "Model";
                AddChild(model);
            }
        }

        if (model != null)
        {
            _anim = model.GetNodeOrNull<AnimationPlayer>("AnimationPlayer");

            // This clip targets ResidentRig/Skeleton3D explicitly. NLTHumanoid uses :Bone
            // paths that do not match this imported scene's skeleton hierarchy.
            const string residentWalk = "ResidentRig";
            if (_anim != null && _anim.HasAnimation(residentWalk))
            {
                _walk = residentWalk;
                Animation walkAnimation = _anim.GetAnimation(_walk);
                walkAnimation.LoopMode = Animation.LoopModeEnum.Linear;
            }
        }

        _label = new Label3D
        {
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            FontSize = 44,
            PixelSize = 0.005f,
            Position = new Vector3(0f, 2.05f, 0f),
            Modulate = new Color("e6edf3"),
            OutlineModulate = new Color(0f, 0f, 0f, 0.8f),
            OutlineSize = 10,
        };
        AddChild(_label);
    }

    /// <summary>Place and animate from the feed. <paramref name="world"/> is in the shown scene's space.</summary>
    public void Sync(Vector3 world, Vector3 velocity, string name, string stateWord, bool reducedMotion)
    {
        Position = world;

        float speed = new Vector2(velocity.X, velocity.Z).Length();
        bool walking = speed > 0.05f && !reducedMotion;
        if (walking)
            Rotation = new Vector3(0f, Mathf.Atan2(velocity.X, velocity.Z), 0f);

        _label.Text = $"{name}\n{stateWord}";

        if (_anim == null || _walk.Length == 0)
            return;

        if (walking)
        {
            _anim.SpeedScale = Mathf.Clamp(speed / 1.4f, 0.5f, 2f);
            if (!_anim.IsPlaying() || _anim.CurrentAnimation != _walk)
                _anim.Play(_walk);
        }
        else
        {
            // Hold the first walk frame rather than the rest pose: the rest pose is a bare rig, while
            // frame 0 reads as a standing person (the clip closes its loop back to standing).
            _anim.Play(_walk);
            _anim.SpeedScale = 0f;
            _anim.Seek(0.0, true);
        }
    }
}