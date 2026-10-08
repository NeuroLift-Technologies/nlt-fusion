using System;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// One agent whose position is owned by the Jolt physics engine via <see cref="CharacterBody3D"/>.
///
/// AgentBrain is the CharacterBody3D scene root for a live avatar. It:
///   1. Runs the decision loop (poll IAgentController, validate, apply).
///   2. Translates the accepted AgentAction into a physics velocity.
///   3. Calls MoveAndSlide() each physics tick so Jolt resolves collisions.
///   4. Keeps LocomotionController in sync for direction/speed math (accel/decel ramps),
///      but no longer lets it write Position directly — the physics body owns position.
///
/// The IAgentController seam is unchanged: Fusion, LLM, utility, or RL all drop in.
/// </summary>
public partial class AgentBrain : CharacterBody3D
{
    // --- Gravity ------------------------------------------------------------------
    // Standard Godot approach: cache gravity once from project settings.
    private static readonly float Gravity =
        (float)ProjectSettings.GetSetting("physics/3d/default_gravity");

    // --- State --------------------------------------------------------------------
    private IAgentController? _controller;
    private LocomotionController _locomotion = null!;
    private AgentObservation _observation;
    private DecisionHold _decision;
    private float _sinceDecision;
    private int _tick;

    // --- Events -------------------------------------------------------------------
    /// <summary>Raised each tick with the action actually applied, for HUD/debug and the observer.</summary>
    public event Action<AgentAction>? Acted;

    /// <summary>Raised when a decision was rejected by validation, with the reason.</summary>
    public event Action<string>? Rejected;

    // --- Public API ---------------------------------------------------------------
    /// <summary>The locomotion state (velocity/yaw). Resident reads this for visuals.</summary>
    public LocomotionController Locomotion => _locomotion;

    public string AgentId { get; private set; } = "";

    /// <summary>Scene the agent is currently deciding in. Set by Observe, read by ingress.</summary>
    public string SceneId => _observation.SceneId;

    /// <summary>
    /// Seconds between decisions. Inference is far slower than a tick, so the last accepted
    /// decision is held and re-applied between decisions (motor-latency technique). The hold lives
    /// in <see cref="DecisionHold"/>; this interval only governs how often the controller is polled.
    /// </summary>
    [Export] public float DecisionInterval { get; set; } = 0.5f;

    [Export] public float MaxSpeed { get; set; } = 1.4f;

    // --- Controller wiring --------------------------------------------------------
    /// <summary>Attach the cognition that supplies decisions. May be null — the agent holds still.</summary>
    public void Attach(IAgentController controller)
    {
        _controller = controller;
        controller.Attach(AgentId);
    }

    /// <summary>
    /// Seed the observation this agent decides from. Called by the owner when surrounding state
    /// changes, so the model sees the world rather than a frozen first frame.
    /// </summary>
    public void Observe(Vector3 position, float[] needs, string sceneId)
    {
        _observation = new AgentObservation(AgentId, position, Velocity, needs, sceneId, _tick);
    }

    // --- Godot lifecycle ----------------------------------------------------------
    public override void _Ready()
    {
        AgentId = string.IsNullOrEmpty(Name) ? "avatar_0" : Name.ToString();
        _locomotion = new LocomotionController { MaxSpeed = MaxSpeed };

        // Grounded movement mode: walls/floors/ceilings are distinguished, slopes apply.
        MotionMode = MotionModeEnum.Grounded;
        UpDirection = Vector3.Up;
        FloorMaxAngle = Mathf.DegToRad(46f);
    }

    public override void _PhysicsProcess(double delta)
    {
        var dt = (float)delta;
        _tick++;

        // 1. Rebuild observation from the physics body's actual position.
        //    This closes the loop: the model sees where it physically is, not where math put it.
        _observation = new AgentObservation(
            _observation.AgentId,
            GlobalPosition,
            Velocity,
            _observation.Needs,
            _observation.SceneId,
            _tick);

        // 2. Decision phase — poll only at the configured interval, and hold the accepted
        //    decision in between. Both inference and this interval are slower than a physics tick,
        //    so the ticks that skip a poll must keep executing the previous decision. Resetting to
        //    Idle here instead would give one frame of acceleration per poll and cancel it on the
        //    next frame, leaving the agent creeping rather than walking.
        _sinceDecision += dt;
        if (_sinceDecision >= DecisionInterval)
        {
            _sinceDecision = 0f;
            if (_controller != null)
            {
                var proposed = _controller.Act(_observation);
                var problem = Validate(proposed);
                if (problem == null)
                    _decision.Accept(proposed);
                else
                {
                    _controller.OnActionRejected(_observation, proposed, problem);
                    Rejected?.Invoke(problem);
                }
            }
        }

        var action = _decision.Current;

        // 3. Compute desired XZ velocity via LocomotionController ramps (accel/decel/turn).
        //    We pass the current physics velocity in so the ramp starts from the correct speed.
        _locomotion.SyncFromPhysics(Velocity);
        _locomotion.Step(action, dt);

        // 4. Build final velocity: XZ from locomotion, Y from gravity (Jolt handles it).
        var newVelocity = new Vector3(
            _locomotion.Velocity.X,
            IsOnFloor() ? 0f : Velocity.Y - Gravity * dt,
            _locomotion.Velocity.Z);

        Velocity = newVelocity;

        // 5. Let Jolt resolve collisions.
        MoveAndSlide();

        Acted?.Invoke(action);
    }

    // --- Validation ---------------------------------------------------------------
    private static string? Validate(in AgentAction action)
    {
        var d = action.MoveDirection;
        if (!float.IsFinite(d.X) || !float.IsFinite(d.Y) || !float.IsFinite(d.Z))
            return "non-finite direction";
        if (d.Length() > 1.001f)
            return $"direction magnitude {d.Length():F2} exceeds 1 (effort is 0..1, not a speed)";
        if (Mathf.Abs(d.Y) > 0.001f)
            return "direction has a Y component (locomotion is XZ-only)";
        return null;
    }
}
