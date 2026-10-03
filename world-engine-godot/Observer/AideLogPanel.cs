using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Panel 3 of 6: <b>Aide Intervention Log</b>.
///
/// D.1 asks for four things per entry — when, which strategy, why it was chosen, and whether it
/// helped. Three of those are on the wire; "why chosen" is not. The feed carries the Aide's reason
/// inside the event's required plain-language <c>text</c> (contract §8), so this panel shows that
/// text as the why, and says so, rather than inventing a rationale field or leaving the question
/// unasked. When the live bridge lands, a real <c>why</c> field can be added without a layout change.
///
/// "Whether it helped" is tri-state throughout: <c>helped: true</c>, <c>helped: false</c> and
/// "not recorded" are three different claims, and collapsing the third into the second would
/// invent evidence about whether coaching works.
/// </summary>
public partial class AideLogPanel : ObserverPanel
{
    public override string PanelTitle => "Aide intervention log";

    protected override string Subtitle()
    {
        var aide = Aide;
        if (Doc == null)
            return "no document yet";
        if (aide == null)
            return "no Aide in this scene";
        int n = Doc.EventsFor(aide.Id, "aide_intervention").Count;
        return n == 0 ? $"{aide.Name} · nothing yet" : $"{aide.Name} · {n} this window";
    }

    protected override void Populate(VBoxContainer body)
    {
        var aide = Aide;
        if (Doc == null || aide == null)
        {
            body.AddChild(Ui.Text("No Aide in this scene.", Ui.BodyFont, P.TextDim));
            return;
        }

        if (Level >= ReadingLevel.Coach && !string.IsNullOrWhiteSpace(aide.CurrentTask))
        {
            body.AddChild(Ui.Paragraph("Focus Aide is on: " + aide.CurrentTask, A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(Ui.Rule(P.Border));
        }

        // Interventions the Aide took, plus the recognitions the Avatar acted on with them.
        var interventions = Doc.EventsFor(aide.Id, "aide_intervention");
        if (interventions.Count == 0)
        {
            body.AddChild(Ui.Text(
                Level == ReadingLevel.Simple
                    ? "Focus Aide has not stepped in yet."
                    : "No interventions in the current event window. Burnout episodes and their "
                      + "recovery modes in the Learning Timeline are the longer record.",
                A11y.Font(Ui.SmallFont), P.TextDim));
        }
        else
        {
            var box = Section("Stepped in");
            foreach (var e in interventions)
                box.AddChild(Level == ReadingLevel.Simple ? SimpleEntry(e) : FullEntry(e));
            body.AddChild(box);
        }

        var kept = new List<FeedEvent>();
        foreach (var e in Doc.Events)
            if (e.Kind == "strategy_internalised")
                kept.Add(e);
        if (kept.Count > 0)
        {
            var box = Section("Strategies Jamie kept");
            foreach (var e in kept)
                box.AddChild(Ui.Paragraph("· " + e.Text, A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(box);
        }
    }

    /// <summary>Simple level: one sentence, no columns.</summary>
    private Control SimpleEntry(FeedEvent e)
    {
        var row = Ui.Row(6);
        var dot = new GlyphDot
        {
            Glyph = Glyph.Hexagon,
            Colour = e.Helped == true ? P.Pass : e.Helped == false ? P.Alert : P.TextMuted,
            Outline = P.Panel,
            CustomMinimumSize = new Vector2(14, 14),
        };
        dot.SizeFlagsVertical = SizeFlags.ShrinkCenter;
        row.AddChild(dot);
        row.AddChild(Ui.Paragraph($"{e.Text} It {PlainLanguage.OutcomeWord(e.Helped)}.",
            A11y.Font(Ui.SmallFont), P.TextDim));
        return row;
    }

    /// <summary>Coach and Technical: the four questions D.1 names, one row each.</summary>
    private Control FullEntry(FeedEvent e)
    {
        var box = Ui.Col(2);

        var head = Ui.Row(6);
        var dot = new GlyphDot
        {
            Glyph = Glyph.Hexagon,
            Colour = e.Helped == true ? P.Pass : e.Helped == false ? P.Alert : P.TextMuted,
            Outline = P.Panel,
            CustomMinimumSize = new Vector2(14, 14),
        };
        dot.SizeFlagsVertical = SizeFlags.ShrinkCenter;
        head.AddChild(dot);
        head.AddChild(Ui.Text($"Focus Aide — {PlainLanguage.OutcomeWord(e.Helped)}",
            A11y.Font(Ui.SmallFont), e.Helped == true ? P.Pass : P.Text));
        head.AddChild(Ui.Text(Level >= ReadingLevel.Technical ? $"tick {e.Tick}" : "",
            A11y.Font(Ui.TinyFont), P.TextMuted));
        box.AddChild(head);

        // What the Aide did, and why, are both in the event's required text.
        box.AddChild(Ui.Paragraph(e.Text, A11y.Font(Ui.SmallFont), P.TextDim));

        if (!string.IsNullOrEmpty(e.Strategy))
        {
            var row = Ui.Row(6);
            row.AddChild(Ui.Inline("strategy", A11y.Font(Ui.TinyFont), P.TextMuted));
            var name = Ui.Inline(PlainLanguage.StrategyName(e.Strategy!), A11y.Font(Ui.SmallFont), P.Accent);
            if (Level >= ReadingLevel.Technical)
                name.Text += $"  ({e.Strategy})";
            row.AddChild(name);
            box.AddChild(row);
        }
        return box;
    }
}