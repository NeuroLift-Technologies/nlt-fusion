using System.Collections.Generic;
using System.Linq;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>The ways a pair's burnout history can read. RENDERER-PLAN.md §6 D.5.</summary>
public enum BurnoutPattern
{
    NeverApproached,
    SelfRecovered,
    NeededRescue,
    RepeatedCollapse,

    /// <summary>
    /// One episode, still open. Not one of the plan's four endings — the plan describes how a
    /// history *ends*, and this is a history still running. Added because labelling it
    /// <see cref="RepeatedCollapse"/> would tell someone mid-episode that they had collapsed
    /// repeatedly, which is both untrue and needlessly bleak.
    /// </summary>
    StillOut,
}

/// <summary>One panel's obligation, resolved to words.</summary>
public sealed record BurnoutReading(
    BurnoutPattern Pattern,
    string Heading,
    string Verdict,
    string Why,
    Glyph Glyph,
    int Episodes,
    int Unresolved,
    int Assisted,
    float WorstSeverity);

/// <summary>
/// The four-way reading of burnout (D.5), computed from the episodes the feed delivers.
///
/// This is presentation, not assessment. Burnout itself is Fusion's call — the feed says so in
/// <c>burnout: true</c> and in each episode. What this class does is choose which of four sentences
/// to show, from history Fusion already reported. It never infers that an episode happened, and it
/// never scores the Avatar.
///
/// The wording is the part that matters. <c>BURNOUT_MANAGEMENT</c> carries a permanent, never-decaying
/// penalty for every Aide crisis intervention, so a pair with a hard life is structurally
/// disadvantaged at the gate. A panel that says "failed" teaches the audience that struggling is a
/// character defect. Every verdict below is phrased as a stage, never as a judgment — and the
/// Fusion Gate panel carries the same obligation for its blocked state.
/// </summary>
public static class BurnoutNarrative
{
    /// <summary>Resolve the reading from a feed's episode history, newest episode first.</summary>
    public static BurnoutReading Read(StateFeed? feed)
    {
        var episodes = feed?.BurnoutEpisodes ?? new List<BurnoutEpisode>();
        int unresolved = episodes.Count(e => e.IsOpen());
        int assisted = episodes.Count(e => e.WasAssisted());
        float worst = episodes.Count == 0 ? 0f : episodes.Max(e => e.Severity);
        Glyph glyph;

        BurnoutPattern pattern;
        string heading, verdict, why;

        if (episodes.Count == 0)
        {
            pattern = BurnoutPattern.NeverApproached;
            heading = "Never approached burnout";
            verdict = "Strong — but possibly untested";
            why = "No burnout episode yet. That is a good sign — and it can also mean nothing hard has happened.";
            glyph = Glyph.Circle;
        }
        else if (unresolved > 0)
        {
            // "Repeated" has to mean repeated. One open episode on its own is not a collapse
            // pattern, it is a collapse in progress — and telling someone who is mid-episode that
            // they have collapsed repeatedly is both wrong and needlessly bleak. The plan's table
            // describes four *endings*; an episode with no ending yet is not one of them, so it gets
            // its own wording.
            bool repeated = unresolved >= 2 || episodes.Count > 1;
            pattern = repeated ? BurnoutPattern.RepeatedCollapse : BurnoutPattern.StillOut;
            heading = repeated
                ? (unresolved >= 2 ? "Collapsed repeatedly" : "Collapsed again before recovering")
                : "Burnt out, and not out of it yet";
            verdict = repeated ? "Still struggling" : "Mid-episode";
            why = repeated
                ? (unresolved >= 2
                    ? $"{unresolved} episodes open at once: recovery never got to finish. A hard run, "
                      + "not a verdict on the pair."
                    : "A new collapse started before the last one finished. That is a hard run, "
                      + "not a verdict on the pair.")
                : "One episode is open. It may well resolve — a stage, not an ending.";
            glyph = Glyph.TriangleUp;
        }
        else
        {
            // Most recent resolved episode decides where the pair stands now. An older assisted
            // recovery still matters — it is reported in the summary — but the present tense is
            // what the observer is watching.
            var latest = episodes.OrderByDescending(e => e.StartTick).First();
            if (latest.WasAssisted())
            {
                pattern = BurnoutPattern.NeededRescue;
                heading = "Approached burnout, and needed the RRT core";
                verdict = "Needed rescue — legitimate, costs readiness";
                why = assisted == 1
                    ? "The Aide's core stepped in. Asking for rescue is a skill; the gate charges "
                      + "for it anyway."
                    : $"{assisted} recoveries needed the Aide. Each lowers BURNOUT_MANAGEMENT for "
                      + "good — a property of the scoring, not the pair.";
                glyph = Glyph.Hexagon;
            }
            else
            {
                pattern = BurnoutPattern.SelfRecovered;
                heading = "Approached burnout, and recovered on their own";
                verdict = "The goal";
                why = episodes.Count == 1
                    ? "One episode, and they came back up on their own."
                    : $"{episodes.Count} episodes, every one recovered solo. This is the pattern the "
                      + "method is trying to install.";
                glyph = Glyph.Chevron;
            }
        }

        return new BurnoutReading(pattern, heading, verdict, why, glyph, episodes.Count,
            unresolved, assisted, worst);
    }

    /// <summary>Colour for the reading. Always paired with the heading text and the glyph.</summary>
    public static Color Colour(Palette p, BurnoutReading reading) => reading.Pattern switch
    {
        BurnoutPattern.NeverApproached => p.Cool,
        BurnoutPattern.SelfRecovered => p.Pass,
        BurnoutPattern.NeededRescue => p.Warn,
        BurnoutPattern.StillOut => p.Alert,
        _ => p.Alert,
    };

    /// <summary>Counts line for the technical level. Restates the episodes; scores nothing.</summary>
    public static string Summary(BurnoutReading reading)
    {
        if (reading.Episodes == 0)
            return "0 episodes recorded";
        string solo = $"{reading.Episodes - reading.Assisted} solo";
        string rrt = reading.Assisted == 0 ? "no assisted" : $"{reading.Assisted} assisted";
        string open = reading.Unresolved == 0 ? "" : $", {reading.Unresolved} open";
        return $"{reading.Episodes} episode(s) · {solo} · {rrt}{open} · "
               + $"deepest {reading.WorstSeverity * 100f:0}% below the floor";
    }
}