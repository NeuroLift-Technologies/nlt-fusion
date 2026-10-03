using System;
using Godot;

namespace NltWorldEngine.Observer;

/// <summary>
/// Words for values. The audience is people with ADHD, and the contract requires events to be
/// plain-language by design (§8) — so the numbers get names, not just digits.
///
/// Everything here is presentation. No method invents, infers or adjusts a value: each one restates
/// something Fusion or the feed already decided, using language a person can read at a glance.
/// </summary>
public static class PlainLanguage
{
    /// <summary>Feed ticks are ~1 Hz (contract §3), so a tick delta reads as seconds.</summary>
    public static string Duration(long ticks)
    {
        if (ticks <= 0)
            return "just started";
        if (ticks < 15)
            return $"for about {ticks} seconds";
        if (ticks < 60)
            return $"for about {ticks} seconds";
        double mins = ticks / 60.0;
        return mins < 10
            ? $"for about {mins:0.#} minutes"
            : $"for about {Math.Round(mins):0} minutes";
    }

    public static string StateWord(string state) => state switch
    {
        "settled" => "Settled",
        "drifting" => "Drifting",
        "resisting" => "Resisting",
        "hyperfocus" => "Locked in",
        "overwhelmed" => "Overwhelmed",
        "recovering" => "Recovering",
        "coached" => "Being coached",
        _ => state.Length == 0 ? "Unknown" : char.ToUpperInvariant(state[0]) + state[1..],
    };

    /// <summary>The state vocabulary's shape, so the meaning survives without colour.</summary>
    public static Glyph StateGlyph(string state) => state switch
    {
        "settled" => Glyph.Circle,
        "drifting" => Glyph.TriangleDown,
        "resisting" => Glyph.Square,
        "hyperfocus" => Glyph.Diamond,
        "overwhelmed" => Glyph.TriangleUp,
        "recovering" => Glyph.Chevron,
        "coached" => Glyph.Hexagon,
        _ => Glyph.Bar,
    };

    public static Color StateColour(Palette p, string state) => state switch
    {
        "settled" => p.Pass,
        "drifting" => p.Warn,
        "resisting" => p.Alert,
        "hyperfocus" => p.Cool,
        "overwhelmed" => p.Focus,
        "recovering" => p.Accent,
        "coached" => p.Warn.Lerp(Color.FromHtml("f0e442"), 0.55f),
        _ => p.TextMuted,
    };

    /// <summary>
    /// The Simple-level sentence for a named state.
    ///
    /// Deliberately short. A label in this Godot build does not reliably wrap, and one that does not
    /// gets clipped at the panel edge — so a long sentence here reads as a truncated one, which is
    /// worse than a short one. Duration is shown on its own line instead of being welded into the
    /// sentence.
    /// </summary>
    public static string StateReading(string state) => state switch
    {
        "settled" => "Settled — managing the task",
        "drifting" => "Drifting — hasn't really started",
        "resisting" => "Resisting — aware of it, not starting",
        "hyperfocus" => "Locked in — attention on one thing",
        "overwhelmed" => "Overwhelmed — more than they can hold",
        "recovering" => "Recovering — working their way back",
        "coached" => "Being coached — the Aide is stepping in",
        _ => StateWord(state),
    };

    /// <summary>How long the state has held, on its own line. Kept apart from the sentence above.</summary>
    public static string StateDuration(long ticksInState) => Duration(ticksInState);

    /// <summary>Magnitude band for a 0..1 level. Deliberately descriptive, never evaluative:
    /// "stress: high" states a fact, where "stress: bad" would editorialise about the person watching.</summary>
    public static string Magnitude(float v) => v < 0.35f ? "low" : v < 0.65f ? "mid" : "high";

    /// <summary>For needs, where 1.0 means satisfied (contract §4.3).</summary>
    public static string NeedWord(float v) => v < 0.35f ? "not met" : v < 0.65f ? "partly met" : "met";

    public static string NeedLabel(string key) => key switch
    {
        "quiet" => "Quiet",
        "rest" => "Rest",
        "social" => "Company",
        "stimulation" => "Stimulation",
        _ => char.ToUpperInvariant(key.Length == 0 ? '?' : key[0]) + key[1..],
    };

    public static string LevelLabel(string key) => key switch
    {
        "attentionEnergy" => "Attention",
        "stressLevel" => "Stress",
        "confidence" => "Confidence",
        "cognitiveLoad" => "Mental load",
        "independenceScore" => "Independence",
        "supportNeedLevel" => "Support wanted",
        _ => key,
    };

    public static string RoleWord(string role) => role switch
    {
        "avatar" => "Avatar",
        "aide" => "Aide",
        "advocate" => "Advocate",
        _ => role,
    };

    /// <summary>Readable strategy names. The feed sends identifiers; the panel shows both at Coach
    /// and Technical so nothing is hidden, only translated.</summary>
    public static string StrategyName(string id) => id switch
    {
        "body_doubling" => "working alongside someone",
        "time_box_25" => "25-minute time box",
        "reset_prompt" => "reset prompt",
        "task_chunking" => "breaking it into steps",
        "environmental_simplification" => "tidying the space first",
        _ => id.Replace('_', ' '),
    };

    public static string SignalName(string id) => id switch
    {
        "sustained_attention_dip" => "attention keeps slipping",
        "task_drift" => "drifting off the task",
        "time_pressure" => "under time pressure",
        "overload" => "more than they can hold",
        _ => id.Replace('_', ' '),
    };

    public static string EventWord(string kind) => kind switch
    {
        "scene_enter" => "arrived",
        "scene_exit" => "left",
        "task_start" => "started a task",
        "task_complete" => "finished a task",
        "task_failed" => "task did not get done",
        "struggle_detected" => "got stuck",
        "aide_intervention" => "the Aide stepped in",
        "strategy_internalised" => "kept a strategy",
        "self_recognition" => "noticed their own state",
        "burnout_entered" => "burnout",
        "burnout_recovered" => "recovered",
        "fusion_ready" => "ready to fuse",
        _ => kind.Replace('_', ' '),
    };

    /// <summary>
    /// Glyph for an event in the timeline's event lane. Grouped by what the event means to the
    /// narrative, not by kind, so the lane reads at a glance.
    /// </summary>
    public static Glyph EventGlyph(string kind) => kind switch
    {
        "burnout_entered" => Glyph.TriangleUp,
        "burnout_recovered" => Glyph.Chevron,
        "self_recognition" => Glyph.Diamond,
        "aide_intervention" => Glyph.Hexagon,
        "strategy_internalised" => Glyph.Circle,
        "task_failed" => Glyph.OpenSquare,
        "task_complete" => Glyph.Circle,
        "task_start" => Glyph.Bar,
        "struggle_detected" => Glyph.Square,
        "fusion_ready" => Glyph.Hexagon,
        _ => Glyph.Bar,
    };

    /// <summary>Colour for an event lane mark. Redundant with the glyph by design.</summary>
    public static Color EventColour(Palette p, string kind) => kind switch
    {
        "burnout_entered" => p.Alert,
        "burnout_recovered" => p.Accent,
        "self_recognition" => p.Focus,
        "aide_intervention" => p.Warn,
        "strategy_internalised" => p.Pass,
        "task_failed" => p.Alert,
        "task_complete" => p.Pass,
        "fusion_ready" => p.Cool,
        _ => p.TextMuted,
    };

    /// <summary>Did an intervention land? Three states, never two: "not recorded" is not "no".</summary>
    public static string OutcomeWord(bool? helped) => helped switch
    {
        true => "helped",
        false => "did not help",
        null => "not recorded",
    };
}