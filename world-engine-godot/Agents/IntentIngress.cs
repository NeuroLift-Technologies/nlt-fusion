using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// Engine-side intent ingress: the unwired path from a Fusion <see cref="SemanticIntent"/>
/// to <see cref="AvatarCharacter.ApplyIntent"/>, in contract order:
/// protocol validation → ASFDK governance (explains denials) → execution re-check → apply.
/// The model moves around and interacts with the environment. It never writes the
/// physical layer: no coordinates, no velocity, no teleport, no object-state mutation.
/// Every physical effect is resolved and owned here.
/// </summary>
public sealed class IntentIngress
{
    private readonly IGovernanceGate _gate;
    private readonly Func<string, Vector3?> _resolveTarget;
    private readonly Func<string, IReadOnlyList<TaskAnchor>> _anchorsFor;

    /// <param name="gate">ASFDK-backed governance. Never null — pass
    /// <see cref="OpenGovernanceGate.Instance"/> only where the gate is unavailable.</param>
    /// <param name="resolveTarget">Engine scene lookup: target id → world position now.</param>
    /// <param name="anchorsFor">Task anchors in the agent's scene for affordance checks.</param>
    public IntentIngress(
        IGovernanceGate gate,
        Func<string, Vector3?>? resolveTarget = null,
        Func<string, IReadOnlyList<TaskAnchor>>? anchorsFor = null)
    {
        _gate = gate;
        _resolveTarget = resolveTarget ?? (_ => null);
        _anchorsFor = anchorsFor ?? (_ => Array.Empty<TaskAnchor>());
    }

    /// <summary>
    /// Submit one intent for one avatar. Runs the full ingress path and returns the
    /// result envelope. The engine is the "user" here: governance evaluates under the
    /// engine's TOI, physical checks run against the engine's live world, and the model
    /// only ever moves around and interacts — never writes physics.
    /// </summary>
    public async Task<IntentExecutionResult> SubmitAsync(
        AvatarCharacter avatar,
        AgentPerceptionSnapshot perception,
        SemanticIntent intent,
        int currentTick)
    {
        var reject = (string reason) => new IntentExecutionResult
        {
            MessageId = $"result-{intent.MessageId}",
            IntentMessageId = intent.MessageId,
            AgentId = intent.AgentId,
            Tick = currentTick,
            Status = "rejected",
            Reason = reason,
        };

        // 1. Protocol validation: correlation, verb allowlist, target-in-perception.
        var problem = AgentLoopProtocol.ValidateIntent(perception, intent);
        if (problem != null)
            return reject($"protocol: {problem}");

        // 2. Governance (ASFDK): explains denials with interventions, never bare-rejects.
        GovernanceDecision decision;
        try
        {
            decision = await _gate.EvaluateAsync(intent);
        }
        catch (Exception e)
        {
            decision = new GovernanceDecision
            {
                Allowed = true,
                Code = "gate-unavailable",
                Explanation = $"Governance gate errored ({e.GetType().Name}): " +
                    "intent allowed without ASFDK review. Physical validation still applies.",
            };
        }
        if (!decision.Allowed)
        {
            avatar.Attach(new IdleController());
            var reason = string.IsNullOrEmpty(decision.Explanation)
                ? $"governance denied ({decision.Code})"
                : $"governance denied ({decision.Code}): {decision.Explanation}";
            if (decision.RecommendedInterventions.Count > 0)
                reason += " Try instead: " + string.Join("; ", decision.RecommendedInterventions);
            return reject(reason);
        }

        // 3. Execution re-check against live world: visibility at decision time does not
        //    guarantee reachability now. Resolve the target fresh from the scene.
        Vector3? resolved = null;
        if (intent.TargetId != null)
        {
            resolved = _resolveTarget(intent.TargetId);
            if (resolved == null)
                return reject($"stale target '{intent.TargetId}': no longer in the scene");
            var recheck = RecheckTarget(avatar, intent, resolved.Value);
            if (recheck != null)
                return reject(recheck);
        }

        // 4. Apply: verb → locomotion only. Speed/accel/collision stay engine-owned.
        avatar.ApplyIntent(intent.Verb, resolved);

        var accepted = new IntentExecutionResult
        {
            MessageId = $"result-{intent.MessageId}",
            IntentMessageId = intent.MessageId,
            AgentId = intent.AgentId,
            Tick = currentTick,
            Status = "accepted",
        };
        if (!string.IsNullOrEmpty(decision.Explanation) && decision.Code != "clean")
            accepted = new IntentExecutionResult
            {
                MessageId = accepted.MessageId,
                IntentMessageId = accepted.IntentMessageId,
                AgentId = accepted.AgentId,
                Tick = accepted.Tick,
                Status = accepted.Status,
                Reason = $"governance note: {decision.Explanation}",
            };
        return accepted;
    }

    /// <summary>
    /// Execution-time re-check: range, affordance, occupancy. The perception snapshot
    /// said the target was visible; the live world decides if it is still usable.
    /// Returns null when execution may proceed, else the rejection reason.
    /// </summary>
    private string? RecheckTarget(AvatarCharacter avatar, SemanticIntent intent, Vector3 targetPos)
    {
        var toTarget = targetPos - avatar.GlobalPosition;
        toTarget.Y = 0f;
        var dist = toTarget.Length();

        const float ReachRadius = 30f;
        if (dist > ReachRadius)
            return $"target '{intent.TargetId}' out of reach ({dist:F1} m > {ReachRadius} m)";

        // use / sit need a live affordance + a free anchor; approach / look_at /
        // communicate only need the target to still exist (checked by resolve).
        if (intent.Verb is "use" or "sit")
        {
            TaskAnchor? anchor = null;
            foreach (var a in _anchorsFor(avatar.SceneId))
            {
                if (a.Id == intent.TargetId)
                {
                    anchor = a;
                    break;
                }
            }
            if (anchor == null)
                return $"target '{intent.TargetId}' offers no '{intent.Verb}' affordance here";
            if (!NeedsAffordance(anchor, intent.Verb))
                return $"target '{intent.TargetId}' does not afford '{intent.Verb}'";
            if (anchor.IsFull && !anchor.IsOccupiedBy(avatar.AgentId))
                return $"target '{intent.TargetId}' is occupied";
        }

        return null;
    }

    private static bool NeedsAffordance(TaskAnchor anchor, string verb) => verb switch
    {
        // Quiet/rest anchors afford sit; social/stimulation anchors afford use.
        // Mirrors TaskAnchor NeedMatching axes without importing need state.
        "sit" => anchor.Axes.Privacy > 0.5f,
        "use" => anchor.Axes.SocialDensity > 0.5f || anchor.Axes.NoiseLevel > 0.5f,
        _ => true,
    };
}
