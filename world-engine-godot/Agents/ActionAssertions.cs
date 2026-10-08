using System;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// The behavioural checks, as plain static methods with no engine base class.
///
/// Deliberately separated from <see cref="ActionSelfTest"/>: extending <c>SceneTree</c> makes a
/// type unloadable outside a running Godot instance, so these assertions could then only ever be
/// checked by launching the editor. As static methods on a non-<c>GodotObject</c> type they can be
/// driven from any harness — which is how they are verified here.
/// </summary>
public static class ActionAssertions
{
    private static int _passed;
    private static int _failed;

    /// <summary>Run every check. Returns true when all passed.</summary>
    public static bool RunAll()
    {
        _passed = 0;
        _failed = 0;

        Console.WriteLine("=== NLT action-interface self-test ===");

        ParseMovesAgent();
        NoTeleport();
        SpeedCap();
        GarbageDegradesToIdle();
        SemanticOnly();
        AgentLoopContract();
        ControlConditionMoves();

        Console.WriteLine($"\n=== {_passed} passed, {_failed} failed ===");
        return _failed == 0;
    }

    private static void Check(bool condition, string what)
    {
        if (condition)
        {
            _passed++;
            Console.WriteLine($"  PASS  {what}");
        }
        else
        {
            _failed++;
            Console.WriteLine($"  FAIL  {what}");
        }
    }

    /// <summary>A model saying "go north" must produce real displacement over time.</summary>
    private static void ParseMovesAgent()
    {
        Console.WriteLine("\n[parse -> authoritative position]");

        if (!DecisionParser.TryParse("{\"move_x\": 0.0, \"move_z\": -1.0, \"act\": \"none\"}",
                out var action, out var error))
        {
            _failed++;
            Console.WriteLine($"  FAIL  well-formed JSON rejected: {error}");
            return;
        }

        var loco = new LocomotionController { MaxSpeed = 1.4f, Acceleration = 6f };
        var start = loco.Position;

        for (var i = 0; i < 120; i++)
            loco.Step(action, 1f / 60f);

        var moved = loco.Position - start;
        Console.WriteLine($"  info  travelled {moved.Length():F2} m, speed {loco.Velocity.Length():F2} m/s");

        Check(moved.Z < -1f, "a north-facing decision moves the agent north (z decreased)");
        Check(Math.Abs(moved.X) < 0.01f, "and does not drift sideways");
    }

    /// <summary>
    /// The core safety property: a huge intent cannot teleport. Displacement per tick is bounded by
    /// the acceleration cap, so a model asking to cross the world in one step just accelerates.
    /// </summary>
    private static void NoTeleport()
    {
        Console.WriteLine("\n[no teleport from the model]");

        var loco = new LocomotionController { MaxSpeed = 1.4f, Acceleration = 6f };
        var start = loco.Position;

        loco.Step(AgentAction.Move(new Vector3(1f, 0f, 1f), 1f), 1f / 60f);
        var oneTick = (loco.Position - start).Length();

        Console.WriteLine($"  info  max-intent single tick moved {oneTick:F4} m");
        Check(oneTick < 0.05f, "one tick of full intent moves < 5 cm (cannot teleport)");
    }

    /// <summary>Sustained max intent converges to MaxSpeed and never exceeds it.</summary>
    private static void SpeedCap()
    {
        Console.WriteLine("\n[speed cap enforced by the controller]");

        var loco = new LocomotionController { MaxSpeed = 1.4f, Acceleration = 6f };
        var peak = 0f;

        for (var i = 0; i < 600; i++)
        {
            loco.Step(AgentAction.Move(new Vector3(1f, 0f, 0f), 5f), 1f / 60f);
            peak = Math.Max(peak, loco.Velocity.Length());
        }

        Console.WriteLine($"  info  peak speed {peak:F3} m/s (cap 1.400)");
        Check(peak <= 1.4f + 1e-3f, "peak speed never exceeds MaxSpeed despite effort=5.0");
        Check(peak > 1.3f, "and it does actually reach walking pace");
    }

    /// <summary>Real model output is often malformed. It must degrade, never throw.</summary>
    private static void GarbageDegradesToIdle()
    {
        Console.WriteLine("\n[malformed model output degrades]");

        var garbage = new[]
        {
            "",
            "   ",
            "I'm sorry, I can't help with that.",
            "{ this is not json at all",
            "{\"move_x\": \"north\"}",
            "```json\n{\"move_x\": 0.5, \"move_z\": 0.5, \"act\": \"observe\"}\n```",
        };

        var survived = true;
        foreach (var g in garbage)
        {
            try
            {
                DecisionParser.TryParse(g, out _, out _);
            }
            catch (Exception e)
            {
                survived = false;
                Console.WriteLine($"  FAIL  threw on {g.Length} chars: {e.GetType().Name}");
            }
        }

        Check(survived, "no input throws out of the parser");

        // A fenced block with a valid body should still parse — a model wrapping its answer in
        // ```json is common and must not be treated as unusable.
        DecisionParser.TryParse(garbage[5], out var fenced, out _);
        Check(Math.Abs(fenced.MoveDirection.X - 0.5f) < 1e-3f, "a fenced JSON block still parses");
        Check(fenced.Interaction == AgentInteraction.Observe, "and its action survives");
    }

    /// <summary>
    /// A model that tries to encode a position in the direction field is clamped, not obeyed. This
    /// is the semantic-only invariant from AvatarAIController.h:40-45 expressed as a test.
    /// </summary>
    private static void SemanticOnly()
    {
        Console.WriteLine("\n[semantic-only: magnitude clamped, not honoured]");

        DecisionParser.TryParse("{\"move_x\": 400.0, \"move_z\": 0.0, \"act\": \"none\"}",
            out var action, out _);

        var magnitude = action.MoveDirection.Length();
        Console.WriteLine($"  info  requested 400.0, clamped to {magnitude:F3}");
        Check(magnitude <= 1.001f, "an absurd magnitude is clamped to unit, not honoured");

        var loco = new LocomotionController { MaxSpeed = 1.4f };
        for (var i = 0; i < 60; i++)
            loco.Step(action, 1f / 60f);

        Check(loco.Position.Length() < 5f, "60 ticks of it still cannot leave the neighbourhood");
    }

    private static void AgentLoopContract()
    {
        Console.WriteLine("\n[physical perception -> semantic intent boundary]");

        var observation = new AgentPerceptionSnapshot
        {
            MessageId = "obs-42-avatar-1",
            AgentId = "avatar_1",
            Tick = 42,
            Scene = new AgentLoopScene { Id = "workplace_1", Kind = "interior" },
            Self = new AgentPhysicalState
            {
                Position = new PhysicalVector3 { X = 1f, Y = 0f, Z = 2f },
                Velocity = new PhysicalVector3 { X = 0f, Y = 0f, Z = 0f },
            },
            VisibleEntities = new[]
            {
                new VisibleEntity
                {
                    Id = "desk_1",
                    Kind = "object",
                    Position = new PhysicalVector3 { X = 2f, Y = 0f, Z = 2f },
                    Affordances = new[] { "use", "sit" },
                },
            },
        };
        var intent = new SemanticIntent
        {
            MessageId = "intent-42-avatar-1",
            AgentId = "avatar_1",
            ObservedTick = 42,
            Verb = "approach",
            TargetId = "desk_1",
        };

        Check(AgentLoopProtocol.ValidatePerception(observation) == null,
            "engine perception snapshot is valid");
        Check(AgentLoopProtocol.ValidateIntent(observation, intent) == null,
            "Fusion intent is correlated and targets a visible entity");
        var observationJson = System.Text.Json.JsonSerializer.Serialize(observation);
        Check(AgentLoopProtocol.TryParsePerception(observationJson, out var parsedObservation, out _)
            && parsedObservation != null,
            "perception DTO round-trips through JSON");
        var intentJson = System.Text.Json.JsonSerializer.Serialize(intent);
        Check(AgentLoopProtocol.TryParseIntent(intentJson, observation, out var parsedIntent, out _)
            && parsedIntent?.TargetId == "desk_1",
            "intent DTO round-trips through JSON");
        var missingProtocolVersion = System.Text.Json.Nodes.JsonNode.Parse(observationJson)!.AsObject();
        missingProtocolVersion.Remove("protocolVersion");
        Check(!AgentLoopProtocol.TryParsePerception(missingProtocolVersion.ToJsonString(), out _, out _),
            "perception with a missing required envelope field is rejected");
        var missingOccupied = System.Text.Json.Nodes.JsonNode.Parse(observationJson)!.AsObject();
        missingOccupied["visibleEntities"]![0]!.AsObject().Remove("occupied");
        Check(!AgentLoopProtocol.TryParsePerception(missingOccupied.ToJsonString(), out _, out _),
            "visible entity with a missing required field is rejected");
        var missingObservedTick = System.Text.Json.Nodes.JsonNode.Parse(intentJson)!.AsObject();
        missingObservedTick.Remove("observedTick");
        Check(!AgentLoopProtocol.TryParseIntent(missingObservedTick.ToJsonString(), observation, out _, out _),
            "intent with a missing observedTick is rejected");
        var waitIntent = new SemanticIntent
        {
            MessageId = "intent-42-wait",
            AgentId = "avatar_1",
            ObservedTick = 42,
            Verb = "wait",
        };
        var waitIntentJson = System.Text.Json.JsonSerializer.Serialize(waitIntent);
        Check(AgentLoopProtocol.TryParseIntent(waitIntentJson, observation, out _, out _),
            "wait intent may omit its optional target");
        var nullTargetIntent = System.Text.Json.Nodes.JsonNode.Parse(waitIntentJson)!.AsObject();
        nullTargetIntent["targetId"] = null;
        Check(!AgentLoopProtocol.TryParseIntent(nullTargetIntent.ToJsonString(), observation, out _, out _),
            "intent with an explicit null target is rejected");
        var physicalWriteJson = intentJson[..^1] + ",\"position\":{\"x\":9,\"y\":0,\"z\":0}}";
        Check(!AgentLoopProtocol.TryParseIntent(physicalWriteJson, observation, out _, out _),
            "wire intent with an extra physical-write field is rejected");
        Check(!AgentLoopProtocol.TryParseIntent(null!, observation, out _, out _),
            "missing intent JSON is reported");
        Check(AgentLoopProtocol.ValidateResult(new IntentExecutionResult
            {
                MessageId = "result-42-avatar-1",
                IntentMessageId = intent.MessageId,
                AgentId = intent.AgentId,
                Tick = 42,
                Status = "rejected",
                Reason = "target is occupied",
            }, intent) == null,
            "explicit engine rejection result is valid and correlated");
        Check(AgentLoopProtocol.ValidateResult(new IntentExecutionResult
            {
                MessageId = "result-42-avatar-1",
                IntentMessageId = intent.MessageId,
                AgentId = intent.AgentId,
                Tick = 42,
                Status = "rejected",
            }, intent) != null,
            "engine rejection without a reason is invalid");
        Check(AgentLoopProtocol.ValidateResult(new IntentExecutionResult
            {
                MessageId = "result-42-avatar-1",
                IntentMessageId = intent.MessageId,
                AgentId = intent.AgentId,
                Tick = 42,
                Status = "accepted",
            }, new SemanticIntent
            {
                ProtocolVersion = "nlt.agent-loop.v0",
                MessageId = intent.MessageId,
                AgentId = intent.AgentId,
                ObservedTick = intent.ObservedTick,
                Verb = intent.Verb,
                TargetId = intent.TargetId,
            }) != null,
            "result cannot validate against an unsupported intent protocol");
        Check(AgentLoopProtocol.ValidateIntent(observation, new SemanticIntent
            {
                MessageId = "stale",
                AgentId = "avatar_1",
                ObservedTick = 41,
                Verb = "approach",
                TargetId = "desk_1",
            }) != null,
            "stale intent is rejected");
        Check(AgentLoopProtocol.ValidateIntent(observation, new SemanticIntent
            {
                MessageId = "hidden-target",
                AgentId = "avatar_1",
                ObservedTick = 42,
                Verb = "use",
                TargetId = "hidden_object",
            }) != null,
            "intent targeting an entity outside perception is rejected");
        Check(AgentLoopProtocol.ValidateIntent(observation, new SemanticIntent
            {
                MessageId = "missing-target",
                AgentId = "avatar_1",
                ObservedTick = 42,
                Verb = "communicate",
            }) != null,
            "targeted semantic action without a target is rejected");
        Check(AgentLoopProtocol.ValidateIntent(observation, new SemanticIntent
            {
                MessageId = "physical-write",
                AgentId = "avatar_1",
                ObservedTick = 42,
                Verb = "teleport",
            }) != null,
            "unknown or physical-write action is rejected");
    }

    /// <summary>
    /// The control condition. Without this there is no way to tell an LLM-driven agent from one
    /// that is merely drifting, because a wander loop looks the same on screen.
    /// </summary>
    private static void ControlConditionMoves()
    {
        Console.WriteLine("\n[deterministic control condition]");

        var controller = new UtilityAgentController(WorldConstants.Seed, "avatar_0");
        var loco = new LocomotionController { MaxSpeed = 1.4f };
        var needs = new[] { 0.1f, 0.1f, 0.95f, 0.1f }; // social is pressing
        var start = loco.Position;

        for (var tick = 1; tick <= 600; tick++)
        {
            var obs = new AgentObservation("avatar_0", loco.Position, loco.Velocity, needs,
                "open_world", tick);
            loco.Step(controller.Act(obs), 1f / 60f);
        }

        var moved = loco.Position - start;
        Console.WriteLine($"  info  control condition travelled {moved.Length():F2} m");
        Check(moved.Length() > 2f, "the deterministic controller also produces real movement");

        // Rest-dominant needs must produce a stationary agent — proves needs actually gate motion.
        //
        // A SEPARATE controller, deliberately. UtilityAgentController holds its decision across
        // re-decide boundaries, so reusing the instance above measures the leftover "walk +X" still
        // being carried out rather than the rest behaviour. (First reported as a failure here: the
        // reused instance travelled 1.34 m. A fresh one travels 0.00 m.) Carrying state between runs
        // is not a bug at this layer, but it does mean there is no episode reset yet — see the
        // missing ResetAgentEpisode in MIGRATION-PLAN.md 2.6d/2.6e.
        var resting = new[] { 0.0f, 0.95f, 0.0f, 0.0f };
        var restController = new UtilityAgentController(WorldConstants.Seed, "avatar_0");
        var restLoco = new LocomotionController { MaxSpeed = 1.4f };
        for (var tick = 1; tick <= 300; tick++)
        {
            var obs = new AgentObservation("avatar_0", restLoco.Position, restLoco.Velocity, resting,
                "open_world", tick);
            restLoco.Step(restController.Act(obs), 1f / 60f);
        }

        Console.WriteLine($"  info  pressing 'rest' travelled {restLoco.Position.Length():F3} m");
        Check(restLoco.Position.Length() < 0.5f, "a pressing 'rest' need holds the agent still");
    }
}