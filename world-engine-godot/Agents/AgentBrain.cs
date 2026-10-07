using System;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// One agent whose position is owned by this engine rather than read from a feed.
///
/// This is the piece the renderer was missing. Before this existed, every resident's position came
/// out of a read-only <c>StateFeed</c> document, so a model could emit "move north" and there was
/// nothing to apply it to — moving the rendered node directly would only have made the model look
/// like it was playing. Here the authoritative position lives in <see cref="LocomotionController"/>,
/// the model supplies only <see cref="AgentAction"/>, and <see cref="Resident"/> renders the result.
/// </summary>
public partial class AgentBrain : Node3D
{
    private IAgentController? _controller;
    private LocomotionController _locomotion = null!;
    private AgentObservation _observation;
    private float _sinceDecision;
    private int _tick;

    /// <summary>Raised each tick with the action actually applied, for HUD/debug and the observer.</summary>
    public event Action<AgentAction>? Acted;

    /// <summary>Raised when a decision was rejected by validation, with the reason.</summary>
    public event Action<string>? Rejected;

    /// <summary>The authoritative state. The renderer reads this; nothing else writes it.</summary>
    public LocomotionController Locomotion => _locomotion;

    public string AgentId { get; private set; } = "";

    /// <summary>
    /// Seconds between decisions. The model is not asked to act every frame — local inference is
    /// far slower than a tick, so the last good decision is held and re-applied. This is the
    /// motor-latency technique noted in the addon assessment: decision at N applied over N..N+k.
    /// </summary>
    [Export] public float DecisionInterval { get; set; } = 0.5f;

    [Export] public float MaxSpeed { get; set; } = 1.4f;

    /// <summary>Attach the cognition that supplies decisions. May be null — the agent then holds still.</summary>
    public void Attach(IAgentController controller)
    {
        _controller = controller;
        controller.Attach(AgentId);
    }

    /// <summary>
    /// Seed the observation this agent decides from. Called by the owner each time the surrounding
    /// state changes, so the model sees the world rather than a frozen first frame.
    /// </summary>
    public void Observe(Vector3 position, float[] needs, string sceneId)
    {
        _observation = new AgentObservation(AgentId, position, _locomotion?.Velocity ?? Vector3.Zero,
            needs, sceneId, _tick);
    }

    public override void _Ready()
    {
        AgentId = string.IsNullOrEmpty(Name) ? "avatar_0" : Name.ToString();
        _locomotion = new LocomotionController { MaxSpeed = MaxSpeed };
    }

    public override void _PhysicsProcess(double delta)
    {
        var dt = (float)delta;
        _tick++;

        // The agent's own simulated position, not the last rendered frame's, feeds the observation.
        // This is what makes the loop closed: decide from where you are, not where you were drawn.
        // Rebuilt rather than mutated — AgentObservation is a readonly value type.
        _observation = new AgentObservation(_observation.AgentId, _locomotion.Position,
            _locomotion.Velocity, _observation.Needs, _observation.SceneId, _tick);

        var action = AgentAction.Idle;

        _sinceDecision += dt;
        if (_sinceDecision >= DecisionInterval)
        {
            _sinceDecision = 0f;
            if (_controller != null)
            {
                var proposed = _controller.Act(_observation);
                var problem = Validate(proposed);
                if (problem == null)
                    action = proposed;
                else
                {
                    // Rejected decisions are reported rather than silently dropped, so an LLM
                    // controller can be told why its output did not take.
                    _controller.OnActionRejected(_observation, proposed, problem);
                    Rejected?.Invoke(problem);
                }
            }
        }

        // Locomotion stays authoritative for every tick, including the ones between decisions.
        _locomotion.Step(action, dt);
        Acted?.Invoke(action);
    }

    /// <summary>
    /// The boundary check. Returns null when the action is acceptable, or a reason when it is not.
    ///
    /// The checks are deliberately shallow. Their job is to catch a malformed or out-of-range
    /// decision at the seam, not to re-litigate the controller's limits — those live in
    /// <see cref="LocomotionController"/> and are applied there regardless.
    /// </summary>
    private static string? Validate(in AgentAction action)
    {
        var d = action.MoveDirection;

        if (!float.IsFinite(d.X) || !float.IsFinite(d.Y) || !float.IsFinite(d.Z))
            return "non-finite direction";

        // A semantic direction may not carry unbounded magnitude. Effort above 1 is meaningless and
        // usually means the model tried to encode a position or a speed instead of a heading.
        if (d.Length() > 1.001f)
            return $"direction magnitude {d.Length():F2} exceeds 1 (effort is 0..1, not a speed)";

        // Guard the axis a model has no business addressing. Y is the controller's business.
        if (Mathf.Abs(d.Y) > 0.001f)
            return "direction has a Y component (locomotion is XZ-only)";

        return null;
    }
}