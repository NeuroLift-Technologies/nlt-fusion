using Godot;
using NltWorldEngine.Agents;

namespace NltWorldEngine;

/// <summary>
/// The live avatar: a Jolt-backed <see cref="CharacterBody3D"/> (via <see cref="AgentBrain"/>)
/// with a <see cref="Resident"/> visual body attached.
///
/// Responsibilities:
/// <list type="bullet">
///   <item>Own the collision capsule (added as a child in the scene).</item>
///   <item>Wire <see cref="Resident"/> so the visual follows the physics body every frame.</item>
///   <item>Wire the default <see cref="UtilityAgentController"/> so the avatar walks on spawn.</item>
///   <item>Expose <see cref="ApplyIntent"/> as the engine-side entry point for
///     <c>nlt.agent-loop.v1</c> semantic intents — this is where a validated Fusion intent
///     translates into an <see cref="IAgentController"/> command.
///   </item>
/// </list>
///
/// Scene structure (built in avatar.tscn):
/// <code>
///   AvatarCharacter (CharacterBody3D) &lt;— this script (extends AgentBrain)
///     CollisionShape3D  (CapsuleShape3D, 0.4 r × 1.8 h)
///     Resident          (visual + walk animation + name label)
/// </code>
///
/// This scene is instantiated into a level. The level must have at least one <c>StaticBody3D</c>
/// with collision so gravity gives Jolt something to stand on.
public partial class AvatarCharacter : AgentBrain
{
    private Resident _resident = null!;

    [Export] public string DisplayName { get; set; } = "Avatar";
    [Export] public bool ReducedMotion { get; set; } = false;

    public override void _Ready()
    {
        base._Ready();

        // Locate children wired in the scene.
        _resident = GetNode<Resident>("Resident");
        _resident.Name = $"{Name}_Visual";

        // Default controller: deterministic wandering so the avatar moves immediately.
        // Fusion (or LLM) can replace this at runtime via Attach().
        Attach(new UtilityAgentController(WorldConstants.Seed, AgentId));
    }

    public override void _Process(double delta)
    {
        // Sync the visual to the physics body's authoritative position and velocity.
        // Resident is a child so it already inherits position — Sync drives walk
        // animation, facing, and label, not placement.
        _resident.Sync(
            Vector3.Zero,
            Velocity,
            DisplayName,
            "active",
            ReducedMotion);
    }

    /// <summary>
    /// Engine-side entry point for a validated <c>nlt.agent-loop.v1</c> semantic intent.
    ///
    /// This is the translation layer from Fusion's vocabulary (approach / sit / rest …) into
    /// the locomotion system. It is intentionally thin — the heavy validation lives in
    /// <see cref="AgentLoopProtocol"/> before this is called; here we only map verb → action.
    ///
    /// Targeted verbs (approach, look_at, use, sit, communicate) need a resolved world position
    /// from the engine's perception snapshot. Pass <paramref name="resolvedTargetPosition"/> when
    /// the target was found in the scene; leave it null for non-targeted verbs.
    /// </summary>
    public void ApplyIntent(string verb, Vector3? resolvedTargetPosition = null)
    {
        // Map semantic verbs to locomotion directions.
        // "approach" → move toward the resolved target.
        // "rest" / "wait" → hold still (Idle).
        // "sit" / "use" → move to target; interaction is not implemented yet.
        // "look_at" / "communicate" → hold still; facing is not implemented yet.
        //
        // A richer implementation will swap in a GoToTarget controller; this is the minimal
        // wiring that proves the seam works before that layer is built.

        if (resolvedTargetPosition.HasValue && (verb is "approach" or "use" or "sit"))
        {
            var toTarget = (resolvedTargetPosition.Value - GlobalPosition);
            toTarget.Y = 0f;
            const float ArrivalRadius = 1f;
            if (toTarget.LengthSquared() > ArrivalRadius * ArrivalRadius)
            {
                Attach(new IntentMoveController(
                    resolvedTargetPosition.Value, verb, ArrivalRadius));
                return;
            }
        }

        // Non-targeted or already-at-target: hold still.
        Attach(new IdleController());
    }
}

/// <summary>
/// Controller that moves toward a resolved target and idles on arrival.
/// </summary>
internal sealed class IntentMoveController : IAgentController
{
    private readonly Vector3 _targetPosition;
    private readonly string _verb;
    private readonly float _arrivalRadius;

    public IntentMoveController(Vector3 targetPosition, string verb, float arrivalRadius)
    {
        _targetPosition = targetPosition;
        _verb = verb;
        _arrivalRadius = arrivalRadius;
    }

    public void Attach(string agentId) { }

    public AgentAction Act(AgentObservation observation)
    {
        var toTarget = _targetPosition - observation.Position;
        toTarget.Y = 0f;
        if (toTarget.LengthSquared() <= _arrivalRadius * _arrivalRadius)
            return AgentAction.Idle;
        return AgentAction.Move(toTarget.Normalized(), 1f);
    }

    public void OnActionRejected(in AgentObservation observation, in AgentAction action, string reason)
        => GD.PushWarning($"[IntentMoveController:{_verb}] rejected: {reason}");
}

/// <summary>Controller that keeps the agent still. Used when a non-targeted intent arrives.</summary>
internal sealed class IdleController : IAgentController
{
    public void Attach(string agentId) { }
    public AgentAction Act(AgentObservation observation) => AgentAction.Idle;
    public void OnActionRejected(in AgentObservation observation, in AgentAction action, string reason) { }
}
