using System;
using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Panel 5 of 6: <b>Independence Meter</b>.
///
/// Objective 1 of the four the renderer has to make visible: <i>independence rising across
/// attempts</i>. One scalar at the current tick is not evidence of a trend, so this panel plots the
/// series the observer has actually observed and reports its direction.
///
/// What it must not do is score anything. <c>independenceScore</c> is Fusion's
/// (<c>readiness_assessor.py</c>: independence·0.7 + independent_ratio·0.3) and crosses the boundary
/// only for display (contract §2). The renderer draws the values it was given, and the trend word
/// describes the shape of those delivered values — it is not a claim about the person.
/// </summary>
public partial class IndependenceMeterPanel : ObserverPanel
{
    public override string PanelTitle => "Independence";

    protected override string Subtitle()
    {
        var avatar = Avatar;
        if (Doc == null || avatar == null)
            return "no document yet";
        return $"{avatar.Level("independenceScore") * 100f:0}% · {Trend(Series()).Label}";
    }

    protected override void Populate(VBoxContainer body)
    {
        var avatar = Avatar;
        if (Doc == null || avatar == null)
        {
            body.AddChild(Ui.Text("Waiting for a state feed.", Ui.BodyFont, P.TextDim));
            return;
        }

        var series = Series();
        float now = avatar.Level("independenceScore");
        var trend = Trend(series);

        var head = Ui.Row(6);
        head.AddChild(Chip(PlainLanguage.Magnitude(now), trend.Glyph, trend.Colour(P),
            A11y.Font(Ui.BaseFont)));
        head.AddChild(Ui.Inline($"support needed: {PlainLanguage.Magnitude(avatar.Level("supportNeedLevel"))}",
            A11y.Font(Ui.SmallFont), P.TextDim));
        body.AddChild(head);

        // The number and its trend are the story; the bar is a third detail level.
        if (Level >= ReadingLevel.Coach)
            body.AddChild(Meter("Independence", now, "", P.Accent));

        body.AddChild(Ui.Paragraph(trend.Sentence, A11y.Font(Ui.SmallFont), P.TextDim));

        if (Level >= ReadingLevel.Technical && series.Count > 1)
        {
            var docs = Feed.Documents;
            string caption = docs.Count > 0
                ? $"tick {docs[0].Tick} → {docs[docs.Count - 1].Tick} · {docs.Count} observed document(s)"
                : $"{series.Count} value(s)";
            var plot = new Sparkline
            {
                Values = series,
                Line = P.Accent,
                Grid = P.Border,
                TextColour = P.TextMuted,
                FontSize = A11y.Font(Ui.TinyFont),
                Caption = caption,
                CustomMinimumSize = new Vector2(0, A11y.Font(Ui.BodyFont) * 3),
            };
            plot.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            body.AddChild(plot);
        }

        body.AddChild(Ui.Text(
            "independenceScore is Fusion's value, passed for display. The renderer does not compute it.",
            A11y.Font(Ui.TinyFont), P.TextMuted));
    }

    /// <summary>The delivered values, oldest first, one per document observed this session.</summary>
    private List<float> Series()
    {
        var list = new List<float>();
        foreach (var doc in Feed.Documents)
        {
            var a = FeedTransport.PrimaryAvatar(doc);
            if (a != null)
                list.Add(a.Level("independenceScore"));
        }
        if (list.Count == 0 && Doc != null)
        {
            var a = Avatar;
            if (a != null)
                list.Add(a.Level("independenceScore"));
        }
        return list;
    }

    private readonly record struct TrendInfo(string Label, Glyph Glyph, string Sentence)
    {
        public Color Colour(Palette p) => Glyph switch
        {
            Glyph.TriangleUp => p.Pass,
            Glyph.TriangleDown => p.Warn,
            _ => p.Accent,
        };
    }

    /// <summary>
    /// Direction of the observed series. A single observation is not a trend, and saying "flat" is
    /// more honest than implying stability from one point.
    /// </summary>
    private static TrendInfo Trend(List<float> series)
    {
        if (series.Count < 4)
            return new TrendInfo("too early to tell", Glyph.Bar, "Not enough of the run yet.");

        // Half the series, so the opening and closing windows cannot share samples. Overlapping
        // windows made first == last for any short series, and a strictly rising 0.1, 0.5, 0.9
        // reported itself as "steady".
        int window = Math.Max(2, Math.Min(6, series.Count / 2));

        float first = 0f, last = 0f;
        for (int i = 0; i < window; i++)
        {
            first += series[i];
            last += series[series.Count - 1 - i];
        }
        float delta = (last - first) / window;

        // 0.01 over the window is inside the noise of a 0..1 scalar shown to two decimals.
        if (delta > 0.012f)
            return new TrendInfo("rising", Glyph.TriangleUp,
                $"Up about {delta * 100f:0} points over {window} documents.");
        if (delta < -0.012f)
            return new TrendInfo("falling", Glyph.TriangleDown,
                $"Down about {MathF.Abs(delta) * 100f:0} points over {window} documents.");

        return new TrendInfo("steady", Glyph.Hexagon, $"Steady over {window} documents.");
    }
}

/// <summary>A one-series plot. Values only, no axes machinery — the caption carries the range.</summary>
public partial class Sparkline : Control
{
    public List<float> Values { get; set; } = new();

    public Color Line { get; set; } = Colors.White;

    public Color Grid { get; set; } = Colors.Gray;

    public Color TextColour { get; set; } = Colors.Gray;

    public int FontSize { get; set; } = 11;

    public string Caption { get; set; } = "";

    public override void _Draw()
    {
        var font = ThemeDB.FallbackFont;
        DrawString(font, new Vector2(0, FontSize), Caption, HorizontalAlignment.Left, -1, FontSize, TextColour);
        if (Values.Count < 2 || Size.X <= 1)
            return;

        float top = FontSize + 4f;
        float height = Size.Y - top;
        if (height <= 4f)
            return;

        // A fixed 0..1 frame: an auto-scaled sparkline exaggerates noise into apparent trend.
        DrawLine(new Vector2(0, top), new Vector2(Size.X, top), Grid, 1f);
        DrawLine(new Vector2(0, top + height * 0.5f), new Vector2(Size.X, top + height * 0.5f), Grid, 1f);
        DrawLine(new Vector2(0, top + height), new Vector2(Size.X, top + height), Grid, 1f);

        var pts = new Vector2[Values.Count];
        for (int i = 0; i < Values.Count; i++)
        {
            float x = Size.X * i / (Values.Count - 1f);
            float y = top + height * (1f - Math.Clamp(Values[i], 0f, 1f));
            pts[i] = new Vector2(x, y);
        }
        DrawPolyline(pts, Line, 2f, true);

        // Mark the value on show, so a scrubbed cursor and the line agree.
        var last = pts[^1];
        DrawCircle(last, 3.5f, Line);
    }
}