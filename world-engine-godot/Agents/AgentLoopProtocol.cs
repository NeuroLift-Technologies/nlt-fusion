using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NltWorldEngine.Agents;

public static class AgentLoopVocabulary
{
    public const string Version = "nlt.agent-loop.v1";

    private static readonly HashSet<string> SupportedIntentVerbs = new(StringComparer.Ordinal)
    {
        "approach", "look_at", "use", "sit", "rest", "communicate", "wait",
    };

    private static readonly HashSet<string> TargetRequiredVerbs = new(StringComparer.Ordinal)
    {
        "approach", "look_at", "use", "sit", "communicate",
    };

    public static bool IsSupportedVerb(string verb) => SupportedIntentVerbs.Contains(verb);

    public static bool RequiresTarget(string verb) => TargetRequiredVerbs.Contains(verb);
}

public sealed class PhysicalVector3
{
    [JsonPropertyName("x")]
    public float X { get; init; }

    [JsonPropertyName("y")]
    public float Y { get; init; }

    [JsonPropertyName("z")]
    public float Z { get; init; }
}

public sealed class AgentLoopScene
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("kind")]
    public string Kind { get; init; } = "";
}

public sealed class VisibleEntity
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("kind")]
    public string Kind { get; init; } = "";

    [JsonPropertyName("position")]
    public PhysicalVector3 Position { get; init; } = new();

    [JsonPropertyName("affordances")]
    public IReadOnlyList<string> Affordances { get; init; } = Array.Empty<string>();

    [JsonPropertyName("occupied")]
    public bool Occupied { get; init; }
}

/// <summary>Engine-owned physical facts visible to one agent at one tick.</summary>
public sealed class AgentPerceptionSnapshot
{
    [JsonPropertyName("protocolVersion")]
    public string ProtocolVersion { get; init; } = AgentLoopVocabulary.Version;

    [JsonPropertyName("messageType")]
    public string MessageType { get; init; } = "perception";

    [JsonPropertyName("messageId")]
    public string MessageId { get; init; } = "";

    [JsonPropertyName("agentId")]
    public string AgentId { get; init; } = "";

    [JsonPropertyName("tick")]
    public int Tick { get; init; }

    [JsonPropertyName("scene")]
    public AgentLoopScene Scene { get; init; } = new();

    [JsonPropertyName("self")]
    public AgentPhysicalState Self { get; init; } = new();

    [JsonPropertyName("visibleEntities")]
    public IReadOnlyList<VisibleEntity> VisibleEntities { get; init; } = Array.Empty<VisibleEntity>();
}

public sealed class AgentPhysicalState
{
    [JsonPropertyName("position")]
    public PhysicalVector3 Position { get; init; } = new();

    [JsonPropertyName("velocity")]
    public PhysicalVector3 Velocity { get; init; } = new();
}

/// <summary>
/// Fusion-owned request to act. It intentionally has no position, velocity, or physical-state
/// mutation field; the engine resolves and validates the intent against current world state.
/// </summary>
public sealed class SemanticIntent
{
    [JsonPropertyName("protocolVersion")]
    public string ProtocolVersion { get; init; } = AgentLoopVocabulary.Version;

    [JsonPropertyName("messageType")]
    public string MessageType { get; init; } = "intent";

    [JsonPropertyName("messageId")]
    public string MessageId { get; init; } = "";

    [JsonPropertyName("agentId")]
    public string AgentId { get; init; } = "";

    [JsonPropertyName("observedTick")]
    public int ObservedTick { get; init; }

    [JsonPropertyName("verb")]
    public string Verb { get; init; } = "";

    [JsonPropertyName("targetId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetId { get; init; }
}

/// <summary>Engine report of an intent being accepted for execution or explicitly rejected.</summary>
public sealed class IntentExecutionResult
{
    [JsonPropertyName("protocolVersion")]
    public string ProtocolVersion { get; init; } = AgentLoopVocabulary.Version;

    [JsonPropertyName("messageType")]
    public string MessageType { get; init; } = "result";

    [JsonPropertyName("messageId")]
    public string MessageId { get; init; } = "";

    [JsonPropertyName("intentMessageId")]
    public string IntentMessageId { get; init; } = "";

    [JsonPropertyName("agentId")]
    public string AgentId { get; init; } = "";

    [JsonPropertyName("tick")]
    public int Tick { get; init; }

    [JsonPropertyName("status")]
    public string Status { get; init; } = "";

    [JsonPropertyName("reason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Reason { get; init; }
}

public static class AgentLoopProtocol
{
    private static readonly JsonSerializerOptions StrictJsonOptions = new()
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public static bool TryParsePerception(
        string json,
        out AgentPerceptionSnapshot? observation,
        out string? error)
    {
        if (json == null)
        {
            observation = null;
            error = "perception JSON is missing";
            return false;
        }
        try
        {
            observation = JsonSerializer.Deserialize<AgentPerceptionSnapshot>(json, StrictJsonOptions);
        }
        catch (JsonException exception)
        {
            observation = null;
            error = exception.Message;
            return false;
        }

        error = observation == null ? "perception must be a JSON object" : ValidatePerception(observation);
        return error == null;
    }

    public static bool TryParseIntent(
        string json,
        AgentPerceptionSnapshot observation,
        out SemanticIntent? intent,
        out string? error)
    {
        if (json == null)
        {
            intent = null;
            error = "intent JSON is missing";
            return false;
        }
        try
        {
            intent = JsonSerializer.Deserialize<SemanticIntent>(json, StrictJsonOptions);
        }
        catch (JsonException exception)
        {
            intent = null;
            error = exception.Message;
            return false;
        }

        error = intent == null ? "intent must be a JSON object" : ValidateIntent(observation, intent);
        return error == null;
    }

    public static string? ValidateResult(IntentExecutionResult result, SemanticIntent intent)
    {
        if (result == null)
            return "result is missing";
        if (intent == null)
            return "intent is missing";
        if (intent.ProtocolVersion != AgentLoopVocabulary.Version || intent.MessageType != "intent")
            return "unsupported intent protocol";
        if (intent.ObservedTick < 0)
            return "intent observedTick must be non-negative";
        if (result.ProtocolVersion != AgentLoopVocabulary.Version || result.MessageType != "result")
            return "unsupported result protocol";
        if (string.IsNullOrWhiteSpace(result.MessageId)
            || string.IsNullOrWhiteSpace(result.IntentMessageId)
            || string.IsNullOrWhiteSpace(result.AgentId))
            return "result messageId, intentMessageId, and agentId are required";
        if (result.IntentMessageId != intent.MessageId || result.AgentId != intent.AgentId)
            return "result does not match intent";
        if (result.Tick < intent.ObservedTick)
            return "result tick precedes intent";
        if (result.Status == "rejected" && string.IsNullOrWhiteSpace(result.Reason))
            return "rejected result requires a reason";
        if (result.Status is not ("accepted" or "rejected"))
            return "result status must be accepted or rejected";
        return null;
    }

    /// <summary>
    /// Returns null for a well-correlated intent, or a diagnostic reason for rejection.
    /// Physical affordances and reachability must be rechecked by the executor at application time.
    /// </summary>
    public static string? ValidateIntent(
        AgentPerceptionSnapshot observation,
        SemanticIntent intent)
    {
        if (intent == null)
            return "intent is missing";
        var observationProblem = ValidatePerception(observation);
        if (observationProblem != null)
            return $"invalid observation: {observationProblem}";
        if (intent.ProtocolVersion != AgentLoopVocabulary.Version || intent.MessageType != "intent")
            return "unsupported intent protocol";
        if (string.IsNullOrWhiteSpace(intent.MessageId))
            return "intent messageId is required";
        if (string.IsNullOrWhiteSpace(intent.AgentId) || intent.AgentId != observation.AgentId)
            return "intent agentId does not match observation";
        if (intent.ObservedTick != observation.Tick)
            return "intent observedTick is stale or does not match observation";
        if (!AgentLoopVocabulary.IsSupportedVerb(intent.Verb))
            return $"unsupported intent verb '{intent.Verb}'";

        if (AgentLoopVocabulary.RequiresTarget(intent.Verb)
            && string.IsNullOrWhiteSpace(intent.TargetId))
            return $"intent verb '{intent.Verb}' requires targetId";

        if (intent.TargetId != null)
        {
            bool targetVisible = false;
            foreach (var entity in observation.VisibleEntities)
            {
                if (entity.Id == intent.TargetId)
                {
                    targetVisible = true;
                    break;
                }
            }
            if (!targetVisible)
                return $"intent target '{intent.TargetId}' was not in the observation";
        }

        return null;
    }

    /// <summary>Checks the core envelope and uniqueness constraints on a physical snapshot.</summary>
    public static string? ValidatePerception(AgentPerceptionSnapshot observation)
    {
        if (observation == null)
            return "perception is missing";
        if (observation.Scene == null || observation.Self == null
            || observation.Self.Position == null || observation.Self.Velocity == null
            || observation.VisibleEntities == null)
            return "perception is missing scene, self state, or visibleEntities";
        if (observation.ProtocolVersion != AgentLoopVocabulary.Version
            || observation.MessageType != "perception")
            return "unsupported perception protocol";
        if (string.IsNullOrWhiteSpace(observation.MessageId)
            || string.IsNullOrWhiteSpace(observation.AgentId))
            return "perception messageId and agentId are required";
        if (observation.Tick < 0)
            return "perception tick must be non-negative";
        if (string.IsNullOrWhiteSpace(observation.Scene.Id)
            || observation.Scene.Kind is not ("open_world" or "interior"))
            return "perception scene is invalid";
        if (!IsFinite(observation.Self.Position) || !IsFinite(observation.Self.Velocity))
            return "perception self state contains non-finite coordinates";

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entity in observation.VisibleEntities)
        {
            if (entity == null || entity.Position == null || entity.Affordances == null)
                return "visible entity is missing required fields";
            if (string.IsNullOrWhiteSpace(entity.Id) || !ids.Add(entity.Id))
                return "visible entity ids must be non-empty and unique";
            if (entity.Kind is not ("agent" or "object" or "place"))
                return $"visible entity '{entity.Id}' has unsupported kind";
            if (!IsFinite(entity.Position))
                return $"visible entity '{entity.Id}' has non-finite coordinates";
            var affordances = new HashSet<string>(StringComparer.Ordinal);
            foreach (var affordance in entity.Affordances)
            {
                if (string.IsNullOrWhiteSpace(affordance) || !affordances.Add(affordance))
                    return $"visible entity '{entity.Id}' has invalid affordances";
            }
        }

        return null;
    }

    private static bool IsFinite(PhysicalVector3 vector) =>
        float.IsFinite(vector.X) && float.IsFinite(vector.Y) && float.IsFinite(vector.Z);
}
