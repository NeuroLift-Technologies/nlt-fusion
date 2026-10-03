using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace NltWorldEngine.Feed;

/// <summary>One document read: either a validated feed or a list of reasons why there isn't one.</summary>
public sealed class FeedReadResult
{
    public StateFeed? Feed;
    public readonly List<string> Errors = new();
    public readonly List<string> Warnings = new();

    public bool Ok => Feed != null && Errors.Count == 0;

    public string Message
    {
        get
        {
            var all = new List<string>(Errors);
            if (all.Count == 0)
                all.AddRange(Warnings);
            return string.Join("; ", all);
        }
    }
}

/// <summary>
/// Reads <c>nlt.state-feed.v1</c> documents into the model types from PR #80
/// (<c>StateFeedLoader.cs</c>), reporting problems rather than throwing.
///
/// Why this exists alongside <see cref="StateFeedLoader"/>: that loader is the right answer for one
/// document at startup, and it correctly refuses to render a malformed feed. Phase D needs two
/// things it does not do. It needs to read a *sequence* — a replay bundle, or a live feed that
/// appends — and it needs to keep going and show the operator what is wrong when one document in a
/// hundred is bad, instead of taking the renderer down. Both are Phase D's problem; the model and
/// the parsing rules are Phase A's, and they are reused unchanged.
///
/// Parsing is strict about *presence* and lenient about *addition*: a missing required key is an
/// error, because a silently-defaulted needs map would make burnout undetectable (contract §9),
/// while an unknown key is ignored, because Fusion may legitimately add fields.
/// </summary>
public static class FeedReader
{
    public static FeedReadResult Read(string json, string origin = "")
    {
        var r = new FeedReadResult();
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json);
        }
        catch (JsonException e)
        {
            r.Errors.Add($"not valid JSON: {e.Message}");
            return r;
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add("top level must be an object");
                return r;
            }

            string version = Str(root, "schemaVersion", r) ?? "";
            if (version != FeedVocabulary.Version)
            {
                r.Errors.Add($"'schemaVersion' must be '{FeedVocabulary.Version}', got '{version}'");
                return r;
            }
            if (!Int(root, "tick", r, out int tick))
                return r;
            string iso = Str(root, "simTimeIso", r) ?? "";

            var scene = ReadScene(Root(root, "scene", r), r);
            var agents = ReadAgents(Root(root, "agents", r), r);
            if (r.Errors.Count > 0)
                return r;

            var feed = new StateFeed
            {
                SchemaVersion = version,
                Tick = tick,
                SimTimeIso = iso,
                Scene = scene,
                Agents = agents,
                Pairs = ReadPairs(Opt(root, "pairs", r), r),
                BurnoutEpisodes = ReadEpisodes(Opt(root, "burnoutEpisodes", r), r),
                SelfRecognitions = ReadRecognitions(Opt(root, "selfRecognitions", r), r),
                Events = ReadEvents(Opt(root, "events", r), r, tick),
            };

            Validate(feed, r);
            if (r.Errors.Count == 0)
                r.Feed = feed;
            return r;
        }
    }

    // ------------------------------------------------------------------ read

    private static SceneRef ReadScene(JsonElement el, FeedReadResult r)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            r.Errors.Add("'scene' must be an object");
            return new SceneRef();
        }
        string id = Str(el, "id", r) ?? "";
        string kind = Str(el, "kind", r) ?? "";
        if (System.Array.IndexOf(FeedVocabulary.SceneKinds, kind) < 0)
            r.Errors.Add($"scene.kind must be one of {Join(FeedVocabulary.SceneKinds)}, got '{kind}'");
        return new SceneRef { Id = id, Kind = kind };
    }

    private static List<AgentState> ReadAgents(JsonElement arr, FeedReadResult r)
    {
        var list = new List<AgentState>();
        if (arr.ValueKind != JsonValueKind.Array)
        {
            r.Errors.Add("'agents' must be an array");
            return list;
        }

        var seen = new HashSet<string>();
        int i = 0;
        foreach (var el in arr.EnumerateArray())
        {
            string w = $"agents[{i++}]";
            if (el.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add($"{w} must be an object");
                continue;
            }

            string id = Str(el, "id", r) ?? "";
            if (id.Length == 0)
                r.Errors.Add($"{w}.id must be a non-empty string");
            else if (!seen.Add(id))
                r.Errors.Add($"agent id '{id}' is duplicated");

            int since = 0;
            Int(el, "stateSince", r, out since);

            list.Add(new AgentState
            {
                Id = id,
                Name = Str(el, "name", r) ?? "",
                Role = Str(el, "role", r) ?? "",
                Scene = Str(el, "scene", r) ?? "",
                Position = Vec(el, "position", r),
                Velocity = Vec(el, "velocity", r),
                Appearance = ReadAppearance(Opt(el, "appearance", r), r),
                Levels = ReadLevels(Opt(el, "levels", r), r),
                Needs = ReadNeeds(Opt(el, "needs", r), r, w),
                State = Str(el, "state", r) ?? "",
                StateSince = since,
                CurrentGoal = OptStr(el, "currentGoal"),
                CurrentTask = OptStr(el, "currentTask"),
                StruggleSignals = StrList(el, "struggleSignals", r),
                LearnedStrategies = StrList(el, "learnedStrategies", r),
                Burnout = Bool(el, "burnout", r),
                SupportIndex = OptInt(el, "supportIndex"),
            });
        }
        return list;
    }

    private static AgentAppearance ReadAppearance(JsonElement el, FeedReadResult r)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            r.Errors.Add("'appearance' must be an object");
            return new AgentAppearance();
        }
        return new AgentAppearance
        {
            Body = Str(el, "body", r, required: false) ?? "",
            WalkPhase = Num(el, "walkPhase", r, required: false) ?? 0f,
        };
    }

    private static AgentLevels ReadLevels(JsonElement el, FeedReadResult r)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            r.Errors.Add("'levels' must be an object");
            return new AgentLevels();
        }
        return new AgentLevels
        {
            AttentionEnergy = Num(el, "attentionEnergy", r) ?? 0f,
            StressLevel = Num(el, "stressLevel", r) ?? 0f,
            Confidence = Num(el, "confidence", r) ?? 0f,
            CognitiveLoad = Num(el, "cognitiveLoad", r) ?? 0f,
            IndependenceScore = Num(el, "independenceScore", r) ?? 0f,
            SupportNeedLevel = Num(el, "supportNeedLevel", r) ?? 0f,
        };
    }

    /// <summary>
    /// The four canonical needs. A fifth key is not fatal — Fusion may add needs — but naming it is
    /// worth doing, because <c>privacy</c> is the specific trap contract §4.3 records: UE's enum has
    /// it, the needs fragment never held it, and reading the enum is how a five-need model gets
    /// invented by accident.
    /// </summary>
    private static AgentNeeds ReadNeeds(JsonElement el, FeedReadResult r, string where)
    {
        if (el.ValueKind != JsonValueKind.Object)
        {
            r.Errors.Add($"{where}.needs must be an object");
            return new AgentNeeds();
        }
        foreach (var prop in el.EnumerateObject())
        {
            if (System.Array.IndexOf(FeedVocabulary.Needs, prop.Name) < 0)
                r.Warnings.Add($"{where}.needs has non-agent-need key '{prop.Name}' — the agent model "
                             + $"holds only {Join(FeedVocabulary.Needs)}; privacy is a location "
                             + "affordance axis, not an agent need (contract §4.3)");
        }
        return new AgentNeeds
        {
            Quiet = Num(el, "quiet", r) ?? 0f,
            Rest = Num(el, "rest", r) ?? 0f,
            Social = Num(el, "social", r) ?? 0f,
            Stimulation = Num(el, "stimulation", r) ?? 0f,
        };
    }

    private static List<PairState> ReadPairs(JsonElement arr, FeedReadResult r)
    {
        var list = new List<PairState>();
        if (arr.ValueKind != JsonValueKind.Array)
            return list;
        foreach (var el in arr.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add("pairs[] entries must be objects");
                continue;
            }
            var dims = new Dictionary<string, DimensionScore>();
            var dimOpt = Opt(el, "dimensions", r);
            if (dimOpt.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in dimOpt.EnumerateObject())
                {
                    dims[prop.Name] = new DimensionScore
                    {
                        Score = Num(prop.Value, "score", r) ?? 0f,
                        Passes = Prop(prop.Value, "passes")?.ValueKind == JsonValueKind.True,
                    };
                }
            }
            list.Add(new PairState
            {
                AvatarId = Str(el, "avatarId", r) ?? "",
                AideId = Str(el, "aideId", r) ?? "",
                Ready = Prop(el, "ready")?.ValueKind == JsonValueKind.True,
                OverallScore = Num(el, "overallScore", r) ?? 0f,
                BlockingDimensions = StrList(el, "blockingDimensions", r),
                Dimensions = dims,
                Recommendations = StrList(el, "recommendations", r),
            });
        }
        return list;
    }

    private static List<BurnoutEpisode> ReadEpisodes(JsonElement arr, FeedReadResult r)
    {
        var list = new List<BurnoutEpisode>();
        if (arr.ValueKind != JsonValueKind.Array)
            return list;
        int i = 0;
        foreach (var el in arr.EnumerateArray())
        {
            string w = $"burnoutEpisodes[{i++}]";
            if (el.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add($"{w} must be an object");
                continue;
            }
            Int(el, "startTick", r, out int start);
            int? recovered = OptInt(el, "recoveredTick");
            string? mode = OptStr(el, "recoveryMode");

            if (recovered != null && recovered < start)
                r.Errors.Add($"{w}.recoveredTick {recovered} must be >= startTick {start}");
            if (recovered != null)
            {
                if (mode == null)
                    r.Errors.Add($"{w} is recovered but carries no recoveryMode");
                else if (System.Array.IndexOf(FeedVocabulary.RecoveryModes, mode) < 0)
                    r.Errors.Add($"{w}.recoveryMode must be solo|rrt, got '{mode}'");
                else if (mode != FeedVocabulary.ModeRrt && mode != FeedVocabulary.ModeSolo)
                    r.Warnings.Add($"{w}.recoveryMode is '{mode}' — the contract (§6) and the shipped "
                                 + "fixture both spell assisted recovery 'rrt'. Accepted and read as "
                                 + "assisted; see docs/escalations/2026-10-03-state-feed-recovery-mode-spelling.md");
            }
            else if (mode != null)
                r.Errors.Add($"{w} is open but carries recoveryMode; omit the field instead of nulling it");

            list.Add(new BurnoutEpisode
            {
                StartTick = start,
                Severity = Num(el, "severity", r) ?? 0f,
                PeakBelow = Num(el, "peakBelow", r) ?? 0f,
                RecoveredTick = recovered,
                RecoveryMode = mode,
            });
        }
        return list;
    }

    private static List<SelfRecognition> ReadRecognitions(JsonElement arr, FeedReadResult r)
    {
        var list = new List<SelfRecognition>();
        if (arr.ValueKind != JsonValueKind.Array)
            return list;
        foreach (var el in arr.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add("selfRecognitions[] entries must be objects");
                continue;
            }
            Int(el, "tick", r, out int tick);
            string ledTo = Str(el, "ledTo", r) ?? "";
            if (System.Array.IndexOf(FeedVocabulary.SelfRecognitionOutcomes, ledTo) < 0)
                r.Errors.Add($"selfRecognitions[{tick}].ledTo must be one of "
                             + $"{Join(FeedVocabulary.SelfRecognitionOutcomes)}, got '{ledTo}'");
            list.Add(new SelfRecognition
            {
                Tick = tick,
                RiskAtRecognition = Num(el, "riskAtRecognition", r) ?? 0f,
                ActedOn = Prop(el, "actedOn")?.ValueKind == JsonValueKind.True,
                LedTo = ledTo,
            });
        }
        return list;
    }

    private static List<FeedEvent> ReadEvents(JsonElement arr, FeedReadResult r, int envelopeTick)
    {
        var list = new List<FeedEvent>();
        if (arr.ValueKind != JsonValueKind.Array)
            return list;
        foreach (var el in arr.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                r.Errors.Add("events[] entries must be objects");
                continue;
            }
            Int(el, "tick", r, out int tick);
            string kind = Str(el, "kind", r) ?? "";
            if (System.Array.IndexOf(FeedVocabulary.EventKinds, kind) < 0)
                r.Errors.Add($"events[{tick}].kind '{kind}' is not in {Join(FeedVocabulary.EventKinds)}");
            string text = Str(el, "text", r) ?? "";
            if (string.IsNullOrWhiteSpace(text))
                r.Errors.Add($"events[{tick}].text is required and must be non-empty — a feed that "
                             + "emits only kind has failed this contract (§8)");
            if (tick > envelopeTick)
                r.Errors.Add($"events[{tick}].tick must be <= envelope tick {envelopeTick}");

            list.Add(new FeedEvent
            {
                Tick = tick,
                AgentId = Str(el, "agentId", r, required: false) ?? "",
                Kind = kind,
                Text = text,
                Severity = Str(el, "severity", r, required: false),
                Strategy = OptStr(el, "strategy"),
                Helped = Prop(el, "helped") is { } h && h.ValueKind != JsonValueKind.Null
                    ? h.ValueKind == JsonValueKind.True
                    : (bool?)null,
            });
        }
        return list;
    }

    // --------------------------------------------------------------- validate

    private static void Validate(StateFeed feed, FeedReadResult r)
    {
        if (feed.Agents.Count == 0)
            r.Errors.Add("agents is empty — permitted only during a scene transition");

        foreach (var a in feed.Agents)
        {
            string w = $"agents[{a.Id}]";
            if (System.Array.IndexOf(FeedVocabulary.Roles, a.Role) < 0)
                r.Errors.Add($"{w}.role must be one of {Join(FeedVocabulary.Roles)}, got '{a.Role}'");
            if (System.Array.IndexOf(FeedVocabulary.NamedStates, a.State) < 0)
                r.Errors.Add($"{w}.state '{a.State}' is not in {Join(FeedVocabulary.NamedStates)}");
            if (a.Scene != feed.Scene.Id)
                r.Errors.Add($"{w}.scene '{a.Scene}' disagrees with envelope scene.id '{feed.Scene.Id}'");

            foreach (var key in FeedVocabulary.Levels)
                Range(r, w, key, a.Level(key));
            foreach (var key in FeedVocabulary.Needs)
                Range(r, w, key, a.Need(key));

            float speed = a.Speed();
            if (speed > 12f)
                r.Warnings.Add($"{w}.velocity implies {speed:F1} m/s, which is faster than residents walk");
        }

        var ids = new HashSet<string>(feed.Agents.Select(a => a.Id));
        foreach (var p in feed.Pairs)
        {
            if (!ids.Contains(p.AvatarId))
                r.Errors.Add($"pairs[].avatarId '{p.AvatarId}' does not match any agent id");
            if (!ids.Contains(p.AideId))
                r.Errors.Add($"pairs[].aideId '{p.AideId}' does not match any agent id");
            Range(r, "pairs[]", "overallScore", p.OverallScore);

            foreach (var key in p.Dimensions.Keys)
                if (System.Array.IndexOf(FeedVocabulary.FusionDimensions, key) < 0)
                    r.Warnings.Add($"pairs[].dimensions has unknown dimension '{key}' — shown verbatim, not hidden");

            foreach (var blocking in p.BlockingDimensions)
                if (!p.Dimensions.ContainsKey(blocking))
                    r.Errors.Add($"pairs[].blockingDimensions names '{blocking}', which is not in dimensions");

            if (p.Ready && p.BlockingDimensions.Count > 0)
                r.Warnings.Add("pairs[].ready is true but blockingDimensions is non-empty — showing as not ready");
        }

        foreach (var e in feed.Events)
            if (e.AgentId.Length > 0 && !ids.Contains(e.AgentId))
                r.Warnings.Add($"events[{e.Tick}].agentId '{e.AgentId}' matches no agent in this envelope");
    }

    private static void Range(FeedReadResult r, string where, string field, float v)
    {
        if (float.IsNaN(v) || float.IsInfinity(v))
            r.Errors.Add($"{where}.{field} must be a finite number");
        else if (v < 0f || v > 1f)
            r.Errors.Add($"{where}.{field} must be a number in 0..1, got {v:0.###}");
    }

    // -------------------------------------------------------------- primitives

    private static JsonElement? Prop(JsonElement el, string key)
        => el.ValueKind == JsonValueKind.Object && el.TryGetProperty(key, out var v) ? v : null;

    private static JsonElement Root(JsonElement el, string key, FeedReadResult r)
    {
        var v = Prop(el, key);
        if (v is null)
        {
            r.Errors.Add($"missing required key '{key}'");
            return default;
        }
        return v.Value;
    }

    /// <summary>An optional block or array. Absent is fine; present-but-wrong-type is not.</summary>
    private static JsonElement Opt(JsonElement el, string key, FeedReadResult r)
    {
        var v = Prop(el, key);
        return v ?? default;
    }

    private static string? Str(JsonElement el, string key, FeedReadResult r, bool required = true)
    {
        var v = Prop(el, key);
        if (v is null)
        {
            if (required)
                r.Errors.Add($"missing required key '{key}'");
            return null;
        }
        if (v.Value.ValueKind != JsonValueKind.String)
        {
            r.Errors.Add($"'{key}' must be a string");
            return null;
        }
        return v.Value.GetString() ?? "";
    }

    private static string? OptStr(JsonElement el, string key)
    {
        var v = Prop(el, key);
        if (v is null || v.Value.ValueKind == JsonValueKind.Null)
            return null;
        return v.Value.ValueKind == JsonValueKind.String ? v.Value.GetString() : null;
    }

    private static int? OptInt(JsonElement el, string key)
    {
        var v = Prop(el, key);
        return v is { ValueKind: JsonValueKind.Number } && v.Value.TryGetInt32(out int i) ? i : null;
    }

    private static bool Int(JsonElement el, string key, FeedReadResult r, out int into)
    {
        into = 0;
        var v = Prop(el, key);
        if (v is null)
        {
            r.Errors.Add($"missing required key '{key}'");
            return false;
        }
        if (v.Value.ValueKind != JsonValueKind.Number || !v.Value.TryGetInt32(out into))
        {
            r.Errors.Add($"'{key}' must be an integer");
            return false;
        }
        return true;
    }

    /// <summary>
    /// A required numeric field. Absent is an error, not a zero: a silently-defaulted needs map
    /// would make burnout undetectable, which is the whole reason the contract fails loudly
    /// (§9). Optional fields pass <paramref name="required: false"/>.
    /// </summary>
    private static float? Num(JsonElement el, string key, FeedReadResult r, bool required = true)
    {
        var v = Prop(el, key);
        if (v is null)
        {
            if (required)
                r.Errors.Add($"missing required key '{key}'");
            return null;
        }
        return NumAt(v.Value, key, r);
    }

    private static float? NumAt(JsonElement el, string where, FeedReadResult r)
    {
        if (el.ValueKind != JsonValueKind.Number || !el.TryGetSingle(out float f))
        {
            r.Errors.Add($"'{where}' must be a number");
            return null;
        }
        return f;
    }

    private static bool Bool(JsonElement el, string key, FeedReadResult r)
    {
        var v = Prop(el, key);
        if (v is null)
        {
            r.Errors.Add($"missing required key '{key}'");
            return false;
        }
        if (v.Value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            r.Errors.Add($"'{key}' must be a boolean");
            return false;
        }
        return v.Value.ValueKind == JsonValueKind.True;
    }

    private static Vec3 Vec(JsonElement el, string key, FeedReadResult r)
    {
        var v = Prop(el, key);
        if (v is null || v.Value.ValueKind != JsonValueKind.Object)
        {
            r.Errors.Add($"'{key}' must be an object with x, y and z");
            return new Vec3();
        }
        float x = 0, y = 0, z = 0;
        foreach (var axis in new[] { "x", "y", "z" })
        {
            var av = Prop(v.Value, axis);
            if (av is null || av.Value.ValueKind != JsonValueKind.Number || !av.Value.TryGetSingle(out float a))
            {
                r.Errors.Add($"'{key}' must have x, y and z");
                return new Vec3();
            }
            if (axis == "x") x = a;
            else if (axis == "y") y = a;
            else z = a;
        }
        return new Vec3 { X = x, Y = y, Z = z };
    }

    private static List<string> StrList(JsonElement el, string key, FeedReadResult r)
    {
        var list = new List<string>();
        var v = Prop(el, key);
        if (v is null || v.Value.ValueKind == JsonValueKind.Null)
            return list;
        if (v.Value.ValueKind != JsonValueKind.Array)
        {
            r.Errors.Add($"'{key}' must be an array of strings");
            return list;
        }
        foreach (var item in v.Value.EnumerateArray())
            list.Add(item.ValueKind == JsonValueKind.String ? item.GetString() ?? "" : item.ToString());
        return list;
    }

    private static string Join(string[] xs) => string.Join(", ", xs);
}