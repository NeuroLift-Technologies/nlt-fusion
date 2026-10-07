using System;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// The seam a model is evaluated across — one per agent per tick.
///
/// This is the interface named in the migration plan's controller section, kept as the single
/// substitution point for cognition. It is deliberately synchronous and allocation-light: the
/// out-of-band LLM implementation satisfies it by returning the last decision it managed to
/// produce, because inference takes far longer than a tick.
/// </summary>
public interface IAgentController
{
    /// <summary>Called once at attach, before the first <see cref="Act"/>.</summary>
    void Attach(string agentId);

    /// <summary>Produce this tick's decision from what the model can see.</summary>
    AgentAction Act(AgentObservation observation);

    /// <summary>Called when a decision is rejected, so an LLM can be told why.</summary>
    void OnActionRejected(in AgentObservation observation, in AgentAction action, string reason);
}

/// <summary>
/// The movement authority. It is the <b>only</b> thing that writes position and velocity.
///
/// Locomotion realism lives here and nowhere else — acceleration and deceleration caps, turn-rate
/// limits, friction and inertia. A model can ask to go north; it cannot ask to be 40 m away next
/// tick. That is the entire point of keeping this separate from <see cref="IAgentController"/>.
/// </summary>
public sealed class LocomotionController
{
    /// <summary>Straight-line top speed, m/s. Matches the walk-cycle clip's nominal pace.</summary>
    public float MaxSpeed { get; set; } = 1.4f;

    /// <summary>Acceleration cap, m/s². This is what makes a direction change ramp instead of snap.</summary>
    public float Acceleration { get; set; } = 6f;

    /// <summary>Deceleration cap, m/s². Separate from acceleration so stopping settles cleanly.</summary>
    public float Deceleration { get; set; } = 8f;

    /// <summary>Turn rate cap, rad/s. Facing eases toward the heading instead of snapping.</summary>
    public float TurnRate { get; set; } = 6f;

    /// <summary>Speed below which the agent counts as standing still (drives the idle animation).</summary>
    public float StopSpeed { get; set; } = 0.05f;

    public Vector3 Position { get; private set; }

    public Vector3 Velocity { get; private set; }

    /// <summary>Heading in radians, eased toward the movement direction.</summary>
    public float Yaw { get; private set; }

    /// <summary>True while moving fast enough to animate a walk.</summary>
    public bool IsMoving => new Vector2(Velocity.X, Velocity.Z).Length() > StopSpeed;

    /// <summary>
    /// Advance one tick. <paramref name="dt"/> is seconds; callers own the clock.
    /// </summary>
    public void Step(in AgentAction action, float dt)
    {
        if (dt <= 0f)
            return;

        // 1. Derive a desired velocity from the semantic intent. Magnitude is clamped to MaxSpeed
        //    here — the model's effort value is advisory and never becomes a speed write.
        var heading = new Vector3(action.MoveDirection.X, 0f, action.MoveDirection.Z);
        var effort = Mathf.Clamp(heading.Length(), 0f, 1f);
        var desired = effort > 0f ? heading.Normalized() * (MaxSpeed * effort) : Vector3.Zero;

        // 2. Move actual velocity toward desired under the accel/decel caps. Exponential-free and
        //    frame-rate independent in the usual way: the cap is a rate, multiplied by dt.
        var flat = new Vector3(Velocity.X, 0f, Velocity.Z);
        var delta = desired - flat;
        var rate = (desired.Length() < flat.Length() ? Deceleration : Acceleration) * dt;
        var step = delta.Length() <= rate ? delta : delta.Normalized() * rate;
        var next = flat + step;
        if (next.Length() > MaxSpeed)
            next = next.Normalized() * MaxSpeed;

        Velocity = new Vector3(next.X, Velocity.Y, next.Z);
        Position += Velocity * dt;

        // 3. Ease facing toward the movement direction. Standing agents hold their heading, so a
        //    resident that stops does not spin to face the camera.
        if (Velocity.Length() > StopSpeed)
        {
            var want = Mathf.Atan2(Velocity.X, Velocity.Z);
            var maxTurn = TurnRate * dt;
            var diff = Mathf.Wrap(want - Yaw, -Mathf.Pi, Mathf.Pi);
            Yaw += Mathf.Clamp(diff, -maxTurn, maxTurn);
        }
    }

    /// <summary>Place the agent without going through the accel ramp (scene load, teleport, replay seek).</summary>
    public void Teleport(Vector3 position)
    {
        Position = position;
        Velocity = Vector3.Zero;
    }
}