namespace NltWorldEngine.Agents;

/// <summary>
/// Holds the last accepted decision so it can be re-applied on ticks where the controller was
/// not polled.
/// </summary>
/// <remarks>
/// <para>
/// Both the poll interval (<see cref="AgentBrain.DecisionInterval"/>) and model inference are
/// slower than a physics tick, so between polls the agent has to keep executing the decision it
/// already made. That is the motor-latency technique: hold, re-apply, replace only on a new
/// accepted decision.
/// </para>
/// <para>
/// Resetting to <see cref="AgentAction.Idle"/> on non-poll ticks instead grants exactly one frame
/// of acceleration per poll — <see cref="LocomotionController"/> then cancels that velocity on the
/// following frame because desired velocity is zero. The agent then creeps roughly
/// <c>acceleration * dt * dt</c> metres per poll instead of walking, which is invisible to the
/// harness path and only shows up as an avatar that barely moves.
/// </para>
/// <para>
/// A <c>readonly struct</c> rather than a class so the zero value is meaningful:
/// <c>default(AgentAction)</c> has a zero <see cref="AgentAction.MoveDirection"/> and therefore
/// behaves exactly like <see cref="AgentAction.Idle"/>.
/// </para>
/// </remarks>
internal struct DecisionHold
{
	private AgentAction _action;

	/// <summary>
	/// The decision to execute this tick. Equal to <see cref="AgentAction.Idle"/> until the first
	/// decision is accepted, so an agent that has never polled holds still.
	/// </summary>
	public AgentAction Current => _action;

	/// <summary>
	/// Record an accepted decision. Rejected proposals must never be passed here — a rejected
	/// action has to leave the previous decision in force.
	/// </summary>
	public void Accept(in AgentAction action) => _action = action;
}