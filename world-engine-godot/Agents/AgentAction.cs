using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// What the model is allowed to ask for. Deliberately <b>semantic</b> — never a position, never a
/// velocity, never a teleport.
///
/// This preserves the invariant carried verbatim from
/// <c>WorldEngine/Source/WorldEngine/Public/Agents/AvatarAIController.h:40-45</c>:
///
/// <para><i>"The model issues high-level semantic commands. Physical locomotion still runs through
/// the controller, which remains the movement authority — no raw velocity writes from the model."</i></para>
///
/// <para>UE enforced this by keeping the movement component authoritative under the AIController.
/// The same structure is kept here: <see cref="AgentAction"/> is what the model produces,
/// <see cref="IAgentController"/> is the seam it is evaluated across, and
/// <see cref="LocomotionController"/> is the only thing that ever turns an intent into motion.
/// A model that hallucinates a position has nowhere to put it.</para>
/// </summary>
public enum AgentInteraction
{
    /// <summary>Do nothing this tick.</summary>
    None = 0,

    /// <summary>Look at / attend to something. Affects facing, not position.</summary>
    Observe = 1,

    /// <summary>Use whatever is at the current location (a desk, a seat, a fixture).</summary>
    Interact = 2,

    /// <summary>Rest at the current location.</summary>
    Rest = 3,
}

/// <summary>
/// One decision, in one frame. A pure value — no engine types beyond <see cref="Vector3"/> for the
/// desired heading, and that is clamped by the controller rather than trusted.
/// </summary>
public readonly struct AgentAction
{
    public AgentAction(Vector3 moveDirection, AgentInteraction interaction = AgentInteraction.None,
        string? targetId = null)
    {
        MoveDirection = moveDirection;
        Interaction = interaction;
        TargetId = targetId;
    }

    /// <summary>
    /// Desired heading in the XZ plane. <b>Not</b> a velocity and <b>not</b> a target point:
    /// magnitude is advisory, and <see cref="LocomotionController"/> re-derives speed from its own
    /// limits. A zero vector means "hold still".
    /// </summary>
    public Vector3 MoveDirection { get; }

    /// <summary>What to do on arrival / in place. Never writes state directly.</summary>
    public AgentInteraction Interaction { get; }

    /// <summary>Optional id of an agent or object this action concerns. Advisory for labelling.</summary>
    public string? TargetId { get; }

    /// <summary>The still action.</summary>
    public static AgentAction Idle => new(Vector3.Zero);

    /// <summary>A move toward <paramref name="heading"/>, scaled by <paramref name="effort"/> in 0..1.</summary>
    public static AgentAction Move(Vector3 heading, float effort = 1f)
    {
        var flat = new Vector3(heading.X, 0f, heading.Z);
        return new AgentAction(effort <= 0f ? Vector3.Zero : flat.Normalized() * effort);
    }
}

/// <summary>
/// What the model gets to see. Everything the model is allowed to condition on, and nothing else.
/// </summary>
public readonly struct AgentObservation
{
    public AgentObservation(string agentId, Vector3 position, Vector3 velocity, float[] needs,
        string sceneId, int tick)
    {
        AgentId = agentId;
        Position = position;
        Velocity = velocity;
        Needs = needs;
        SceneId = sceneId;
        Tick = tick;
    }

    public string AgentId { get; }

    public Vector3 Position { get; }

    public Vector3 Velocity { get; }

    /// <summary>Need levels keyed as in <c>FeedVocabulary.Needs</c>: quiet, rest, social, stimulation.</summary>
    public float[] Needs { get; }

    public string SceneId { get; }

    public int Tick { get; }

    public float Speed => new Vector2(Velocity.X, Velocity.Z).Length();
}