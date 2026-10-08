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
        // "sit" / "use" → move to target then interact (simple: same as approach for now).
        // "look_at" / "communicate" → face target, don't move.
        //
        // A richer implementation will swap in a GoToTarget controller; this is the minimal
        // wiring that proves the seam works before that layer is built.

        if (resolvedTargetPosition.HasValue)
        {
            var toTarget = (resolvedTargetPosition.Value - GlobalPosition);
            toTarget.Y = 0f;
            if (toTarget.LengthSquared() > 0.01f)
            {
                var dir = toTarget.Normalized();
                // Inject a one-shot move command via a simple wrapper controller.
                Attach(new IntentMoveController(dir, verb));
                return;
            }
        }

        // Non-targeted or already-at-target: hold still.
        Attach(new IdleController());
    }
}

/// <summary>
/// Minimal controller that produces a fixed move direction for one decision interval,
/// then returns to idle. Used by <see cref="AvatarCharacter.ApplyIntent"/> for targeted verbs.
/// </summary>
internal sealed class IntentMoveController : IAgentController
{
    private readonly Vector3 _direction;
    private readonly string _verb;

    public IntentMoveController(Vector3 direction, string verb)
    {
        _direction = direction;
        _verb = verb;
    }

    public void Attach(string agentId) { }

    public AgentAction Act(AgentObservation observation)
        => AgentAction.Move(_direction, 1f);

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
