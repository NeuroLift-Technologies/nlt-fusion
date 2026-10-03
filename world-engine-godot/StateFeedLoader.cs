using Godot;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NltWorldEngine;

// ---------------------------------------------------------------------------
// StateFeedLoader — Phase A.5
//
// Loads the static fixture at fixtures/state-feed.sample.json and validates it
// against the nlt.state-feed.v1 contract (docs/contracts/state-feed-v1.md).
//
// Validation rules (§9 of the contract):
//   • Unknown keys are silently ignored — forward-compatible.
//   • Missing required keys fail loudly (exception).
//   • needs[] must carry exactly the four canonical keys quiet/rest/social/stimulation
//     in the [0,1] range; any extra key (e.g. privacy) raises a warning.
//   • agents[] may be empty only during a scene transition; we warn but do not fail.
//   • A non-fatal warning is GD.PushWarning; a fatal error is an Exception that
//     prevents _Ready() from completing, so the operator sees it immediately.
//
// Usage:
//   StateFeedLoader.Load();           // called from WorldView._Ready()
//   var feed = StateFeedLoader.Current;
//   GD.Print(feed.Tick);
// ---------------------------------------------------------------------------

/// <summary>Parsed and validated state-feed envelope.</summary>
public sealed class StateFeed
{
    public string SchemaVersion { get; init; } = "";
    public int Tick { get; init; }
    public string SimTimeIso { get; init; } = "";
    public SceneRef Scene { get; init; } = new();
    public IReadOnlyList<AgentState> Agents { get; init; } = Array.Empty<AgentState>();
    public IReadOnlyList<PairState> Pairs { get; init; } = Array.Empty<PairState>();
    public IReadOnlyList<BurnoutEpisode> BurnoutEpisodes { get; init; } = Array.Empty<BurnoutEpisode>();
    public IReadOnlyList<SelfRecognition> SelfRecognitions { get; init; } = Array.Empty<SelfRecognition>();
    public IReadOnlyList<FeedEvent> Events { get; init; } = Array.Empty<FeedEvent>();
}

public sealed class SceneRef
{
    public string Id { get; init; } = "";
    public string Kind { get; init; } = "";     // open_world | interior
}

public sealed class AgentState
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Role { get; init; } = "";     // avatar | aide | advocate
    public string Scene { get; init; } = "";
    public Vec3 Position { get; init; } = new();
    public Vec3 Velocity { get; init; } = new();
    public AgentAppearance Appearance { get; init; } = new();
    public AgentLevels Levels { get; init; } = new();
    public AgentNeeds Needs { get; init; } = new();
    public string State { get; init; } = "";
    public int StateSince { get; init; }
    public string? CurrentGoal { get; init; }
    public string? CurrentTask { get; init; }
    public IReadOnlyList<string> StruggleSignals { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> LearnedStrategies { get; init; } = Array.Empty<string>();
    public bool Burnout { get; init; }
    public int? SupportIndex { get; init; }
}

public sealed class Vec3
{
    public float X { get; init; }
    public float Y { get; init; }
    public float Z { get; init; }

    public Vector3 ToGodot() => new(X, Y, Z);
}

public sealed class AgentAppearance
{
    public string Body { get; init; } = "";
    public float WalkPhase { get; init; }
}

public sealed class AgentLevels
{
    public float AttentionEnergy { get; init; }
    public float StressLevel { get; init; }
    public float Confidence { get; init; }
    public float CognitiveLoad { get; init; }
    public float IndependenceScore { get; init; }   // Fusion-owned; display only
    public float SupportNeedLevel { get; init; }
}

/// <summary>
/// The four canonical agent needs: quiet, rest, social, stimulation (0..1).
/// See contract §4.3 — privacy is a location affordance axis, not an agent need.
/// </summary>
public sealed class AgentNeeds
{
    public float Quiet { get; init; }
    public float Rest { get; init; }
    public float Social { get; init; }
    public float Stimulation { get; init; }
}

public sealed class PairState
{
    public string AvatarId { get; init; } = "";
    public string AideId { get; init; } = "";
    public bool Ready { get; init; }
    public float OverallScore { get; init; }
    public IReadOnlyList<string> BlockingDimensions { get; init; } = Array.Empty<string>();
    public IReadOnlyDictionary<string, DimensionScore> Dimensions { get; init; } =
        new Dictionary<string, DimensionScore>();
    public IReadOnlyList<string> Recommendations { get; init; } = Array.Empty<string>();
}

public sealed class DimensionScore
{
    public float Score { get; init; }
    public bool Passes { get; init; }
}

public sealed class BurnoutEpisode
{
    public int StartTick { get; init; }
    public float Severity { get; init; }
    public float PeakBelow { get; init; }
    public int? RecoveredTick { get; init; }        // null if episode is still open
    public string? RecoveryMode { get; init; }      // solo | rrt; null if open
}

public sealed class SelfRecognition
{
    public int Tick { get; init; }
    public float RiskAtRecognition { get; init; }
    public bool ActedOn { get; init; }
    public string LedTo { get; init; } = "";        // prevented | delayed | ignored
}

public sealed class FeedEvent
{
    public int Tick { get; init; }
    public string AgentId { get; init; } = "";
    public string Kind { get; init; } = "";
    public string Text { get; init; } = "";         // required — plain language
    public string? Strategy { get; init; }
    public bool? Helped { get; init; }
    public string? Severity { get; init; }
}

// ---------------------------------------------------------------------------

public static class StateFeedLoader
{
    // Set of canonical agent-need keys (contract §4.3)
    private static readonly HashSet<string> CanonicalNeedKeys =
        new(StringComparer.OrdinalIgnoreCase) { "quiet", "rest", "social", "stimulation" };

    // Valid kind values for scene.kind
    private static readonly HashSet<string> ValidSceneKinds =
        new(StringComparer.OrdinalIgnoreCase) { "open_world", "interior" };

    // Expected schema version string
    private const string ExpectedSchema = "nlt.state-feed.v1";

    // Path relative to the res:// root of the Godot project
    private const string FixturePath = "res://fixtures/state-feed.sample.json";

    /// <summary>The loaded and validated feed, or null if not yet loaded.</summary>
    public static StateFeed? Current { get; private set; }

    /// <summary>
    /// Load and validate the fixture. Throws on any required-key absence or
    /// fatal schema violation. Call once from WorldView._Ready().
    /// </summary>
    public static void Load()
    {
        var json = ReadFile(FixturePath);
        var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // ---- top-level required keys ----
        var schemaVersion = RequireString(root, "schemaVersion");
        if (schemaVersion != ExpectedSchema)
            throw new InvalidOperationException(
                $"StateFeedLoader: schemaVersion mismatch — got '{schemaVersion}', expected '{ExpectedSchema}'");

        var tick = RequireInt(root, "tick");
        var simTimeIso = RequireString(root, "simTimeIso");
        var scene = ParseScene(RequireObject(root, "scene"));
        var agents = ParseAgents(RequireArray(root, "agents"));
        var pairs = ParsePairs(root.TryGetProperty("pairs", out var pairsEl) ? pairsEl : default);
        var burnoutEpisodes = ParseBurnoutEpisodes(root.TryGetProperty("burnoutEpisodes", out var beEl) ? beEl : default);
        var selfRecognitions = ParseSelfRecognitions(root.TryGetProperty("selfRecognitions", out var srEl) ? srEl : default);
        var events = ParseEvents(root.TryGetProperty("events", out var evEl) ? evEl : default);

        // Warn if agents is empty outside a known scene transition
        if (agents.Count == 0)
            GD.PushWarning("StateFeedLoader: agents[] is empty. This is only expected during a scene transition.");

        Current = new StateFeed
        {
            SchemaVersion = schemaVersion,
            Tick = tick,
            SimTimeIso = simTimeIso,
            Scene = scene,
            Agents = agents,
            Pairs = pairs,
            BurnoutEpisodes = burnoutEpisodes,
            SelfRecognitions = selfRecognitions,
            Events = events,
        };

        GD.Print($"StateFeedLoader: loaded {FixturePath} — tick {tick}, {agents.Count} agent(s), schema {schemaVersion}");
    }

    // -- scene --

    /// <summary>Parse the scene reference block (kind, name, time-of-day).</summary>
    private static SceneRef ParseScene(JsonElement el)
    {
        var id = RequireString(el, "id");
        var kind = RequireString(el, "kind");
        if (!ValidSceneKinds.Contains(kind))
            GD.PushWarning($"StateFeedLoader: scene.kind '{kind}' is not a recognised value (open_world | interior)");
        return new SceneRef { Id = id, Kind = kind };
    }

    // -- agents --

    /// <summary>Parse the agents array into a validated list of AgentState records.</summary>
    private static List<AgentState> ParseAgents(JsonElement arr)
    {
        var list = new List<AgentState>();
        foreach (var el in arr.EnumerateArray())
            list.Add(ParseAgent(el));
        return list;
    }

    /// <summary>Parse and validate a single agent entry.</summary>
    private static AgentState ParseAgent(JsonElement el)
    {
        return new AgentState
        {
            Id = RequireString(el, "id"),
            Name = RequireString(el, "name"),
            Role = RequireString(el, "role"),
            Scene = RequireString(el, "scene"),
            Position = ParseVec3(RequireObject(el, "position")),
            Velocity = ParseVec3(RequireObject(el, "velocity")),
            Appearance = ParseAppearance(RequireObject(el, "appearance")),
            Levels = ParseLevels(RequireObject(el, "levels")),
            Needs = ParseNeeds(RequireObject(el, "needs")),
            State = RequireString(el, "state"),
            StateSince = RequireInt(el, "stateSince"),
            CurrentGoal = el.TryGetProperty("currentGoal", out var g) && g.ValueKind != JsonValueKind.Null ? g.GetString() : null,
            CurrentTask = el.TryGetProperty("currentTask", out var t) && t.ValueKind != JsonValueKind.Null ? t.GetString() : null,
            StruggleSignals = ParseStringArray(el, "struggleSignals"),
            LearnedStrategies = ParseStringArray(el, "learnedStrategies"),
            Burnout = RequireBool(el, "burnout"),
            SupportIndex = el.TryGetProperty("supportIndex", out var si) && si.ValueKind != JsonValueKind.Null ? si.GetInt32() : null,
        };
    }

    /// <summary>Parse a {x,y,z} object into a Vec3.</summary>
    private static Vec3 ParseVec3(JsonElement el) => new()
    {
        X = (float)RequireDouble(el, "x"),
        Y = (float)RequireDouble(el, "y"),
        Z = (float)RequireDouble(el, "z"),
    };

    /// <summary>Parse agent appearance fields; walkPhase defaults to 0 when absent.</summary>
    private static AgentAppearance ParseAppearance(JsonElement el) => new()
    {
        Body = RequireString(el, "body"),
        WalkPhase = el.TryGetProperty("walkPhase", out var wp) ? (float)wp.GetDouble() : 0f,
    };

    /// <summary>Parse the stress/support level block.</summary>
    private static AgentLevels ParseLevels(JsonElement el) => new()
    {
        AttentionEnergy = (float)RequireDouble(el, "attentionEnergy"),
        StressLevel = (float)RequireDouble(el, "stressLevel"),
        Confidence = (float)RequireDouble(el, "confidence"),
        CognitiveLoad = (float)RequireDouble(el, "cognitiveLoad"),
        IndependenceScore = (float)RequireDouble(el, "independenceScore"),
        SupportNeedLevel = (float)RequireDouble(el, "supportNeedLevel"),
    };

    /// <summary>
    /// Validates the four canonical need keys and range. Unknown keys get a warning
    /// rather than a failure — Fusion may add needs in future, but silently accepting
    /// 'privacy' (a location affordance axis) would repeat the mistake the contract §4.3
    /// explicitly records.
    /// </summary>
    /// <summary>Parse and range-validate the four canonical need values.</summary>
    private static AgentNeeds ParseNeeds(JsonElement el)
    {
        // Warn on any extra key that is not in the canonical set
        foreach (var prop in el.EnumerateObject())
        {
            if (!CanonicalNeedKeys.Contains(prop.Name))
                GD.PushWarning($"StateFeedLoader: needs contains unexpected key '{prop.Name}'. " +
                               "If this is 'privacy', see contract §4.3 — it is a location affordance axis, not an agent need.");
        }

        var quiet = (float)RequireDouble(el, "quiet");
        var rest = (float)RequireDouble(el, "rest");
        var social = (float)RequireDouble(el, "social");
        var stimulation = (float)RequireDouble(el, "stimulation");

        ValidateRange(quiet, "needs.quiet");
        ValidateRange(rest, "needs.rest");
        ValidateRange(social, "needs.social");
        ValidateRange(stimulation, "needs.stimulation");

        return new AgentNeeds
        {
            Quiet = quiet, Rest = rest, Social = social, Stimulation = stimulation,
        };
    }

    /// <summary>Throw when a 0..1 need value falls outside [0,1].</summary>
    private static void ValidateRange(float v, string field)
    {
        if (v < 0f || v > 1f)
            throw new InvalidOperationException(
                $"StateFeedLoader: {field} = {v} is out of range [0,1]");
    }

    // -- pairs --

    /// <summary>Parse optional agent pair states.</summary>
    private static List<PairState> ParsePairs(JsonElement el)
    {
        var list = new List<PairState>();
        if (el.ValueKind != JsonValueKind.Array) return list;
        foreach (var item in el.EnumerateArray())
        {
            var dims = new Dictionary<string, DimensionScore>();
            if (item.TryGetProperty("dimensions", out var dimsEl))
                foreach (var dim in dimsEl.EnumerateObject())
                    dims[dim.Name] = new DimensionScore
                    {
                        Score = (float)dim.Value.GetProperty("score").GetDouble(),
                        Passes = dim.Value.GetProperty("passes").GetBoolean(),
                    };

            list.Add(new PairState
            {
                AvatarId = RequireString(item, "avatarId"),
                AideId = RequireString(item, "aideId"),
                Ready = RequireBool(item, "ready"),
                OverallScore = (float)RequireDouble(item, "overallScore"),
                BlockingDimensions = ParseStringArray(item, "blockingDimensions"),
                Dimensions = dims,
                Recommendations = ParseStringArray(item, "recommendations"),
            });
        }
        return list;
    }

    // -- burnout episodes --

    /// <summary>Parse optional burnout episode records.</summary>
    private static List<BurnoutEpisode> ParseBurnoutEpisodes(JsonElement el)
    {
        var list = new List<BurnoutEpisode>();
        if (el.ValueKind != JsonValueKind.Array) return list;
        foreach (var item in el.EnumerateArray())
            list.Add(new BurnoutEpisode
            {
                StartTick = RequireInt(item, "startTick"),
                Severity = (float)RequireDouble(item, "severity"),
                PeakBelow = (float)RequireDouble(item, "peakBelow"),
                RecoveredTick = item.TryGetProperty("recoveredTick", out var rt) && rt.ValueKind != JsonValueKind.Null ? rt.GetInt32() : null,
                RecoveryMode = item.TryGetProperty("recoveryMode", out var rm) && rm.ValueKind != JsonValueKind.Null ? rm.GetString() : null,
            });
        return list;
    }

    // -- self-recognitions --

    /// <summary>Parse optional self-recognition events.</summary>
    private static List<SelfRecognition> ParseSelfRecognitions(JsonElement el)
    {
        var list = new List<SelfRecognition>();
        if (el.ValueKind != JsonValueKind.Array) return list;
        foreach (var item in el.EnumerateArray())
            list.Add(new SelfRecognition
            {
                Tick = RequireInt(item, "tick"),
                RiskAtRecognition = (float)RequireDouble(item, "riskAtRecognition"),
                ActedOn = RequireBool(item, "actedOn"),
                LedTo = RequireString(item, "ledTo"),
            });
        return list;
    }

    // -- events --

    /// <summary>Parse the feed events array.</summary>
    private static List<FeedEvent> ParseEvents(JsonElement el)
    {
        var list = new List<FeedEvent>();
        if (el.ValueKind != JsonValueKind.Array) return list;
        foreach (var item in el.EnumerateArray())
        {
            // text is required (§8: "A feed that emits only kind has failed this contract")
            var text = RequireString(item, "text");
            list.Add(new FeedEvent
            {
                Tick = RequireInt(item, "tick"),
                AgentId = RequireString(item, "agentId"),
                Kind = RequireString(item, "kind"),
                Text = text,
                Strategy = item.TryGetProperty("strategy", out var strat) && strat.ValueKind != JsonValueKind.Null ? strat.GetString() : null,
                Helped = item.TryGetProperty("helped", out var helped) && helped.ValueKind != JsonValueKind.Null ? helped.GetBoolean() : null,
                Severity = item.TryGetProperty("severity", out var sev) && sev.ValueKind != JsonValueKind.Null ? sev.GetString() : null,
            });
        }
        return list;
    }

    // -- helpers --

    /// <summary>Read the fixture JSON from disk, failing loudly when missing.</summary>
    private static string ReadFile(string path)
    {
        if (!FileAccess.FileExists(path))
            throw new InvalidOperationException(
                $"StateFeedLoader: fixture not found at '{path}'. " +
                "Place fixtures/state-feed.sample.json inside the Godot project root.");

        using var file = FileAccess.Open(path, FileAccess.ModeFlags.Read);
        if (file == null)
            throw new InvalidOperationException(
                $"StateFeedLoader: could not open '{path}' — FileAccess error {FileAccess.GetOpenError()}");

        return file.GetAsText();
    }

    /// <summary>Require a string property and return it.</summary>
    private static string RequireString(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val) || val.ValueKind == JsonValueKind.Null)
            throw new InvalidOperationException($"StateFeedLoader: required field '{key}' is missing or null");
        return val.GetString() ?? throw new InvalidOperationException(
            $"StateFeedLoader: required field '{key}' has a null string value");
    }

    /// <summary>Require an integer property and return its value.</summary>
    private static int RequireInt(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val))
            throw new InvalidOperationException($"StateFeedLoader: required field '{key}' is missing");
        return val.GetInt32();
    }

    /// <summary>Require a numeric property and return it as double.</summary>
    private static double RequireDouble(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val))
            throw new InvalidOperationException($"StateFeedLoader: required field '{key}' is missing");
        return val.GetDouble();
    }

    /// <summary>Require a boolean property and return its value.</summary>
    private static bool RequireBool(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val))
            throw new InvalidOperationException($"StateFeedLoader: required field '{key}' is missing");
        return val.GetBoolean();
    }

    /// <summary>Require an object property and return it.</summary>
    private static JsonElement RequireObject(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val) || val.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException(
                $"StateFeedLoader: required object field '{key}' is missing or not an object");
        return val;
    }

    /// <summary>Require an array property and return it.</summary>
    private static JsonElement RequireArray(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var val) || val.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException(
                $"StateFeedLoader: required array field '{key}' is missing or not an array");
        return val;
    }

    /// <summary>Parse an array of strings into a read-only list.</summary>
    private static IReadOnlyList<string> ParseStringArray(JsonElement el, string key)
    {
        if (!el.TryGetProperty(key, out var arr) || arr.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        var list = new List<string>();
        foreach (var item in arr.EnumerateArray())
        {
            var s = item.GetString();
            if (s != null) list.Add(s);
        }
        return list;
    }
}
