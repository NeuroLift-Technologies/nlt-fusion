using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Panel 2 of 6: <b>Avatar State</b>.
///
/// This is the panel that answers "how is Jamie doing" without asking anyone to read a chart. It
/// leads with the burnout reading rather than burying it under meters, because that reading is the
/// one with a moral weight attached to it — a pair with a hard life must be told "not ready yet",
/// and that framing has to arrive before the numbers do.
///
/// Level gating: named state, plain reading, goal, task, signals and strategies are always shown.
/// Numbers appear only at <see cref="ReadingLevel.Technical"/>.
/// </summary>
public partial class AvatarStatePanel : ObserverPanel
{
    public override string PanelTitle => "Avatar state";

    protected override string Subtitle()
        => Doc == null ? "no document yet" : Avatar?.Name ?? "no avatar";

    protected override void Populate(VBoxContainer body)
    {
        var avatar = Avatar;
        if (Doc == null || avatar == null)
        {
            body.AddChild(Ui.Text("Waiting for a state feed.", Ui.BodyFont, P.TextDim));
            return;
        }

        PopulateBurnout(body);
        body.AddChild(Ui.Rule(P.Border));

        // The named state, as a word and a shape, plus the sentence a person can act on.
        var stateColour = PlainLanguage.StateColour(P, avatar.State);
        body.AddChild(Chip(PlainLanguage.StateWord(avatar.State), PlainLanguage.StateGlyph(avatar.State),
            stateColour, A11y.Font(Ui.BaseFont)));

        // Sentence, then duration on its own line: labels here do not reliably wrap, so a sentence
        // with the duration welded into it would be clipped mid-word at the panel edge.
        body.AddChild(Ui.Paragraph(PlainLanguage.StateReading(avatar.State), A11y.Font(Ui.BodyFont), P.Text));
        body.AddChild(Ui.Inline(PlainLanguage.StateDuration(avatar.TicksInState(Doc.Tick)),
            A11y.Font(Ui.TinyFont), P.TextMuted));

        if (avatar.Burnout)
        {
            var alert = Ui.Row(6);
            alert.AddChild(Chip("In burnout", Glyph.TriangleUp, P.Alert, A11y.Font(Ui.SmallFont)));
            alert.AddChild(Ui.Inline("Fusion reports burnout right now.", A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(alert);
        }

        PopulateGoalAndTask(body, avatar);

        if (avatar.StruggleSignals.Count > 0)
        {
            var signals = Section("Signals Fusion is seeing");
            foreach (var s in avatar.StruggleSignals)
                signals.AddChild(Ui.Paragraph("· " + PlainLanguage.SignalName(s), A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(signals);
        }

        if (avatar.LearnedStrategies.Count > 0)
        {
            var strategies = Section("Strategies in hand");
            foreach (var s in avatar.LearnedStrategies)
                strategies.AddChild(Ui.Paragraph("· " + PlainLanguage.StrategyName(s), A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(strategies);
        }

        PopulateNeeds(body, avatar);
        PopulateLevels(body, avatar);
        PopulateRecentEvents(body, avatar);
    }

    /// <summary>
    /// D.5: the four-way reading, stated in the order a person needs it — what happened, what it
    /// means, and why it is not a verdict.
    /// </summary>
    private void PopulateBurnout(VBoxContainer body)
    {
        var reading = BurnoutNarrative.Read(Doc);
        var colour = BurnoutNarrative.Colour(P, reading);

        var box = Section("Burnout so far");
        box.AddChild(Chip(reading.Heading, reading.Glyph, colour, A11y.Font(Ui.BodyFont)));
        box.AddChild(Ui.Inline(reading.Verdict, A11y.Font(Ui.BodyFont), colour));

        // The explanation is what keeps the verdict from reading as a judgement, so it is never
        // dropped entirely — but at Simple it is one line, and the rest is for the levels that have
        // room for it.
        if (Level >= ReadingLevel.Coach)
        {
            box.AddChild(Ui.Paragraph(reading.Why, A11y.Font(Ui.SmallFont), P.TextDim));
            box.AddChild(Ui.Inline(BurnoutNarrative.Summary(reading), A11y.Font(Ui.TinyFont), P.TextMuted));
        }
        body.AddChild(box);
    }

    private void PopulateGoalAndTask(VBoxContainer body, AgentState avatar)
    {
        if (string.IsNullOrWhiteSpace(avatar.CurrentGoal) && string.IsNullOrWhiteSpace(avatar.CurrentTask))
            return;

        var box = Section("Working on");
        if (!string.IsNullOrWhiteSpace(avatar.CurrentGoal))
        {
            var row = Ui.Row(6);
            row.AddChild(Ui.Inline("Goal", A11y.Font(Ui.TinyFont), P.TextMuted));
            row.AddChild(Ui.Paragraph(avatar.CurrentGoal!, A11y.Font(Ui.SmallFont), P.TextDim));
            box.AddChild(row);
        }
        if (!string.IsNullOrWhiteSpace(avatar.CurrentTask))
        {
            var row = Ui.Row(6);
            row.AddChild(Ui.Inline("Now", A11y.Font(Ui.TinyFont), P.TextMuted));
            row.AddChild(Ui.Paragraph(avatar.CurrentTask!, A11y.Font(Ui.SmallFont), P.Text));
            box.AddChild(row);
        }
        body.AddChild(box);
    }

    /// <summary>
    /// The four needs (contract §4.3). Simple reads them as words; Coach and Technical add bars.
    /// This is also the panel that makes a deliberate walk to the quiet corner legible: need values
    /// changing while a location's affordance axes stay put is the whole of C.4's argument.
    /// </summary>
    private void PopulateNeeds(VBoxContainer body, AgentState avatar)
    {
        int met = 0;
        foreach (var key in FeedVocabulary.Needs)
            if (avatar.Need(key) >= 0.65f)
                met++;

        var box = Section("Needs");

        if (Level == ReadingLevel.Simple)
        {
            var row = Ui.Row(6);
            row.AddChild(Chip($"{met} of 4 met", Glyph.Circle, met >= 3 ? P.Pass : P.Warn,
                A11y.Font(Ui.SmallFont)));
            row.AddChild(Ui.Inline(ShortNeedSummary(avatar), A11y.Font(Ui.TinyFont), P.TextMuted));
            box.AddChild(row);
            body.AddChild(box);
            return;
        }

        foreach (var key in FeedVocabulary.Needs)
        {
            float v = avatar.Need(key);
            Color colour = v < 0.35f ? P.Alert : v < 0.65f ? P.Warn : P.Pass;
            box.AddChild(Meter(PlainLanguage.NeedLabel(key), v, PlainLanguage.NeedWord(v), colour));
        }
        body.AddChild(box);
    }

    /// <summary>
    /// Names the needs that are short, so Simple says <i>which</i>, not only how many. Four separate
    /// rows for four numbers is the dense-dashboard shape this view is meant not to have.
    /// </summary>
    private static string ShortNeedSummary(AgentState avatar)
    {
        var unmet = new List<string>();
        foreach (var key in FeedVocabulary.Needs)
            if (avatar.Need(key) < 0.65f)
                unmet.Add(PlainLanguage.NeedLabel(key).ToLowerInvariant());
        return unmet.Count == 0 ? "all four met" : "short: " + string.Join(", ", unmet);
    }

    /// <summary>Numbers live here and only here. Behaviour is the primary channel; this is the third.</summary>
    private void PopulateLevels(VBoxContainer body, AgentState avatar)
    {
        if (Level < ReadingLevel.Technical)
            return;

        var box = Section("Levels");
        foreach (var key in FeedVocabulary.Levels)
        {
            float v = avatar.Level(key);
            Color colour = key switch
            {
                "stressLevel" or "cognitiveLoad" => v > 0.65f ? P.Alert : v > 0.35f ? P.Warn : P.Pass,
                "independenceScore" => P.Accent,
                _ => v < 0.35f ? P.Warn : P.Pass,
            };
            box.AddChild(Meter(PlainLanguage.LevelLabel(key), v, PlainLanguage.Magnitude(v), colour));
        }
        body.AddChild(Ui.Text(
            "independenceScore, fusion readiness and burnout are Fusion's values. Shown, not computed.",
            A11y.Font(Ui.TinyFont), P.TextMuted));
        body.AddChild(box);
    }

    /// <summary>Recent plain-language events. The contract requires text on every event (§8).</summary>
    private void PopulateRecentEvents(VBoxContainer body, AgentState avatar)
    {
        var events = avatar.Events(Doc!, 3);
        if (events.Count == 0)
            return;

        var box = Section("Just happened");
        foreach (var e in events)
        {
            var row = Ui.Row(6);
            var dot = new GlyphDot
            {
                Glyph = PlainLanguage.EventGlyph(e.Kind),
                Colour = PlainLanguage.EventColour(P, e.Kind),
                Outline = P.Panel,
                CustomMinimumSize = new Vector2(14, 14),
            };
            dot.SizeFlagsVertical = SizeFlags.ShrinkCenter;
            row.AddChild(dot);
            row.AddChild(Ui.Paragraph(e.Text, A11y.Font(Ui.SmallFont), P.TextDim));
            box.AddChild(row);
        }
        body.AddChild(box);
    }

    protected override void TuneLayout()
    {
        // Nothing to tune: Ui.Text / Ui.Paragraph / Ui.Inline each declare their own width, so
        // sentences wrap and tags do not without the panel second-guessing them.
    }
}