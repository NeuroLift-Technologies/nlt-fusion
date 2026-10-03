using System.Collections.Generic;
using System.Linq;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Panel 6 of 6: <b>Fusion Gate</b>.
///
/// D.3: a pure render of <c>FusionReadiness.to_dict()</c>. No world data, no thresholds, no
/// arithmetic. Every number here arrives over the wire and is drawn as it arrived. The renderer has
/// no authority over fusion readiness and does not pretend to (contract §2).
///
/// The one thing this panel adds is tone. <c>BURNOUT_MANAGEMENT</c> carries a permanent,
/// never-decaying penalty for every Aide crisis intervention, so a pair with a hard life is
/// structurally disadvantaged however well it eventually does. The plan and the contract both make
/// the presenter responsible for that: a blocked pair is "not ready yet", never "failed". The
/// audience for this tool has ADHD and will recognise themselves in the struggling Avatar, and a
/// panel that says "failed" teaches them that struggling is a character defect.
/// </summary>
public partial class FusionGatePanel : ObserverPanel
{
    public override string PanelTitle => "Fusion gate";

    protected override string Subtitle()
    {
        if (Doc == null)
            return "no document yet";
        var pair = Pair;
        if (pair == null)
            return "no pair in this document";
        return pair.Ready ? "ready" : "not ready yet";
    }

    protected override void Populate(VBoxContainer body)
    {
        var pair = Pair;
        if (Doc == null || pair == null)
        {
            body.AddChild(Ui.Paragraph(
                "Fusion reports readiness per Avatar+Aide pair. This document has no pair in it.",
                A11y.Font(Ui.SmallFont), P.TextDim));
            return;
        }

        PopulateVerdict(body, pair);
        body.AddChild(Ui.Rule(P.Border));

        var dims = Section(Level == ReadingLevel.Simple ? "How the pair is doing" : "Dimensions");
        foreach (var key in DimensionOrder(pair))
        {
            var d = pair.Dimensions[key];
            bool blocking = pair.BlockingDimensions.Contains(key);
            var colour = blocking ? P.Warn : P.Pass;

            if (Level == ReadingLevel.Simple)
            {
                // Glyph, word, dimension — three pieces of one row. Built here rather than with Chip()
                // because Chip expands to the panel width, which would push the dimension's name off
                // the right edge.
                var row = Ui.Row(6);
                row.AddChild(GlyphNode(d.Passes ? Glyph.Circle : Glyph.OpenSquare, colour));
                row.AddChild(Ui.Inline(d.Passes ? "met" : "not yet", A11y.Font(Ui.SmallFont), colour));
                row.AddChild(Ui.Inline(key.PlainName(), A11y.Font(Ui.SmallFont), P.TextDim));
                dims.AddChild(row);
            }
            else
            {
                dims.AddChild(Meter(key.PlainName(), d.Score, d.Passes ? "met" : "not yet", colour));
            }
        }
        body.AddChild(dims);

        if (pair.Recommendations.Count > 0 && Level >= ReadingLevel.Coach)
        {
            var rec = Section("What Fusion suggests next");
            foreach (var r in pair.Recommendations)
                rec.AddChild(Ui.Paragraph("· " + r, A11y.Font(Ui.SmallFont), P.TextDim));
            body.AddChild(rec);
        }

        body.AddChild(Ui.Paragraph(
            "Every value here is Fusion's. The renderer draws it and computes none of it.",
            A11y.Font(Ui.TinyFont), P.TextMuted));
    }

    /// <summary>
    /// Ready or not. The blocked wording is deliberate and load-bearing: this is the sentence the
    /// audience is most likely to take away, and it is the one that must not say "failed".
    /// </summary>
    private void PopulateVerdict(VBoxContainer body, PairState pair)
    {
        var box = Ui.Col(4);

        if (pair.Ready)
        {
            box.AddChild(Chip("Ready to fuse", Glyph.Hexagon, P.Pass, A11y.Font(Ui.BaseFont)));
            box.AddChild(Ui.Paragraph("Every dimension is met. Fusion has opened the gate.",
                A11y.Font(Ui.SmallFont), P.TextDim));
        }
        else
        {
            box.AddChild(Chip("Not ready yet", Glyph.OpenSquare, P.Warn, A11y.Font(Ui.BaseFont)));
            box.AddChild(Ui.Paragraph(
                pair.BlockingDimensions.Count == 0
                    ? "Fusion is still deciding. Nothing is wrong; it is not finished."
                    : $"{pair.BlockingDimensions.Count} of {pair.Dimensions.Count} dimension(s) still "
                      + "growing. This is a stage, not a verdict — the pair has not failed anything.",
                A11y.Font(Ui.SmallFont), P.TextDim));
        }

        if (Level >= ReadingLevel.Technical)
            box.AddChild(Meter("Overall", pair.OverallScore, $"{pair.OverallScore * 100f:0}%", P.Accent));

        if (pair.BlockingDimensions.Count > 0)
        {
            // A paragraph, not a row of tags: five dimension names do not fit on one line in a rail,
            // and a clipped "Own strate…" tells the observer less than a wrapped list does.
            var names = new List<string>();
            foreach (var b in pair.BlockingDimensions)
                names.Add(b.PlainName());
            box.AddChild(Ui.Paragraph("still growing: " + string.Join(", ", names),
                A11y.Font(Ui.TinyFont), P.Warn));
        }

        body.AddChild(box);
    }

    /// <summary>Canonical gate order first, then anything Fusion added that we don't know about.</summary>
    private static List<string> DimensionOrder(PairState pair)
    {
        var order = new List<string>();
        foreach (var key in FeedVocabulary.FusionDimensions)
            if (pair.Dimensions.ContainsKey(key))
                order.Add(key);
        foreach (var key in pair.Dimensions.Keys)
            if (!order.Contains(key))
                order.Add(key);
        return order;
    }
}