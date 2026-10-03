using System;
using System.Collections.Generic;
using Godot;

namespace NltWorldEngine.Feed;

/// <summary>
/// Vocabulary of <c>nlt.state-feed.v1</c>: the names and permitted values the renderer validates
/// against. Mirrors <c>tools/validate_state_feed.py</c> and <c>docs/contracts/state-feed-v1.md</c>;
/// all three are edited together.
///
/// The model types themselves live in <c>StateFeedLoader.cs</c> (PR #80) and are not duplicated
/// here. This namespace adds only what Phase D needs and the loader does not have: reading a
/// *sequence* of documents, and reporting problems instead of throwing on them.
/// </summary>
public static class FeedVocabulary
{
    public const string Version = "nlt.state-feed.v1";

    /// <summary>Fixture-authoring wrapper, not a wire format.</summary>
    public const string ReplayBundleVersion = "nlt.state-feed.replay.v1";

    /// <summary>Agent needs, exactly four. Contract §4.3.</summary>
    public static readonly string[] Needs = { "quiet", "rest", "social", "stimulation" };

    /// <summary>Scalar projection, 0..1. Contract §4.</summary>
    public static readonly string[] Levels =
    {
        "attentionEnergy", "stressLevel", "confidence",
        "cognitiveLoad", "independenceScore", "supportNeedLevel",
    };

    public static readonly string[] NamedStates =
    {
        "settled", "drifting", "resisting", "hyperfocus", "overwhelmed", "recovering", "coached",
    };

    public static readonly string[] Roles = { "avatar", "aide", "advocate" };

    public static readonly string[] SceneKinds = { "open_world", "interior" };

    /// <summary>Fusion's six canonical readiness dimensions, in gate order.</summary>
    public static readonly string[] FusionDimensions =
    {
        "EXPERIENTIAL_DEPTH",
        "COACHING_EFFECTIVENESS",
        "INDEPENDENCE_LEVEL",
        "EMOTIONAL_RESILIENCE",
        "STRATEGY_INTERNALISATION",
        "BURNOUT_MANAGEMENT",
    };

    public static readonly string[] EventKinds =
    {
        "scene_enter", "scene_exit",
        "task_start", "task_complete", "task_failed",
        "struggle_detected", "aide_intervention", "strategy_internalised",
        "self_recognition", "burnout_entered", "burnout_recovered", "fusion_ready",
    };

    /// <summary>
    /// Recovery modes. The contract (§6) and the shipped fixture use <c>solo | rrt</c>, but the
    /// first draft of <c>tools/validate_state_feed.py</c> accepted <c>rt</c> and so failed its own
    /// fixture. Both spellings are accepted so a half-corrected producer is read rather than
    /// dropped; anything else is fatal. See
    /// docs/escalations/2026-10-03-state-feed-recovery-mode-spelling.md.
    /// </summary>
    public static readonly string[] RecoveryModes = { "solo", "rrt", "rt" };

    public const string ModeSolo = "solo";
    public const string ModeRrt = "rrt";

    public static readonly string[] SelfRecognitionOutcomes = { "prevented", "delayed", "ignored" };

    public static bool IsAssisted(string? mode) => mode == "rrt" || mode == "rt";

    public static string NormaliseRecoveryMode(string? mode) => IsAssisted(mode) ? ModeRrt : ModeSolo;
}

/// <summary>
/// Read-side conveniences for the model types in <c>StateFeedLoader.cs</c>.
///
/// Those types are deliberately plain immutable records — they are a projection of Fusion's data
/// and carry no behaviour. The observer needs behaviour (a level by name, a scene's human label,
/// an agent's ground speed), and putting it here keeps the records as the peer work left them.
/// </summary>
public static class FeedExtensions
{
    /// <summary>One of the six scalar levels by contract key. Unknown keys read as 0.</summary>
    public static float Level(this AgentState a, string key) => key switch
    {
        "attentionEnergy" => a.Levels.AttentionEnergy,
        "stressLevel" => a.Levels.StressLevel,
        "confidence" => a.Levels.Confidence,
        "cognitiveLoad" => a.Levels.CognitiveLoad,
        "independenceScore" => a.Levels.IndependenceScore,
        "supportNeedLevel" => a.Levels.SupportNeedLevel,
        _ => 0f,
    };

    /// <summary>One of the four needs by contract key. Unknown keys read as 0.</summary>
    public static float Need(this AgentState a, string key) => key switch
    {
        "quiet" => a.Needs.Quiet,
        "rest" => a.Needs.Rest,
        "social" => a.Needs.Social,
        "stimulation" => a.Needs.Stimulation,
        _ => 0f,
    };

    public static Vector3 Position3(this AgentState a) => a.Position.ToGodot();

    public static Vector3 Velocity3(this AgentState a) => a.Velocity.ToGodot();

    /// <summary>Ground speed in m/s. Zero means idle, and an idle agent must not animate
    /// (contract §4.4).</summary>
    public static float Speed(this AgentState a)
    {
        var v = a.Velocity.ToGodot();
        return new Vector2(v.X, v.Z).Length();
    }

    public static int TicksInState(this AgentState a, int tick) => Math.Max(0, tick - a.StateSince);

    public static bool IsAvatar(this AgentState a) => a.Role == "avatar";

    public static bool IsAide(this AgentState a) => a.Role == "aide";

    public static bool IsOpen(this BurnoutEpisode e) => e.RecoveredTick == null;

    public static bool WasAssisted(this BurnoutEpisode e) => !e.IsOpen() && FeedVocabulary.IsAssisted(e.RecoveryMode);

    public static int EndTick(this BurnoutEpisode e, int upTo) => e.RecoveredTick ?? upTo;

    /// <summary>Human label for the scene strip. Interior ids are <c>workplace_1</c> and friends.</summary>
    public static string SceneLabel(this SceneRef s)
    {
        if (s.Kind != "interior")
            return "Open world";
        int u = s.Id.LastIndexOf('_');
        string baseName = u > 0 ? s.Id[..u] : s.Id;
        return baseName switch
        {
            "workplace" => "Workplace",
            "personal" => "Home",
            "social" => "Social",
            "academic" => "Academic",
            _ => baseName,
        };
    }

    public static AgentState? Agent(this StateFeed f, string id)
    {
        foreach (var a in f.Agents)
            if (a.Id == id)
                return a;
        return null;
    }

    public static PairState? PairFor(this StateFeed f, string avatarId)
    {
        foreach (var p in f.Pairs)
            if (p.AvatarId == avatarId)
                return p;
        return null;
    }

    /// <summary>Plain-language name for a fusion dimension acronym.</summary>
    public static string PlainName(this string dimensionKey) => dimensionKey switch
    {
        "EXPERIENTIAL_DEPTH" => "Experience",
        "COACHING_EFFECTIVENESS" => "Coaching",
        "INDEPENDENCE_LEVEL" => "Independence",
        "EMOTIONAL_RESILIENCE" => "Resilience",
        "STRATEGY_INTERNALISATION" => "Own strategies",
        "BURNOUT_MANAGEMENT" => "Burnout care",
        _ => dimensionKey,
    };

    /// <summary>Events for one agent, newest first.</summary>
    public static List<FeedEvent> EventsFor(this StateFeed f, string agentId, string? kind = null)
    {
        var outv = new List<FeedEvent>();
        for (int i = f.Events.Count - 1; i >= 0; i--)
        {
            var e = f.Events[i];
            if (e.AgentId != agentId)
                continue;
            if (kind != null && e.Kind != kind)
                continue;
            outv.Add(e);
        }
        return outv;
    }

    /// <summary>This agent's own events, newest first, optionally capped.</summary>
    public static List<FeedEvent> Events(this AgentState a, StateFeed f, int limit = int.MaxValue)
    {
        var all = f.EventsFor(a.Id);
        if (all.Count <= limit)
            return all;
        all.RemoveRange(limit, all.Count - limit);
        return all;
    }

    public static BurnoutEpisode? OpenEpisode(this StateFeed f)
    {
        foreach (var ep in f.BurnoutEpisodes)
            if (ep.IsOpen())
                return ep;
        return null;
    }
}