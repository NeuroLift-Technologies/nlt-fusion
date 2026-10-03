using System;
using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Panel 4 of 6: <b>Learning Timeline</b> — D.2, and the panel the plan calls the most valuable one.
///
/// Fifty experiences is the fusion target, and fifty repetitions are not comprehensible in real time.
/// That is the problem this panel exists to solve: not a chart of the present, but a way to read a
/// training history. It therefore draws the <i>arcs</i>, not the instants — how deep each burnout
/// went, how long it took to come back up, and whether the Avatar got there alone or the Aide's RRT
/// core did.
///
/// Lane layout, top to bottom:
/// <list type="number">
/// <item>levels — Technical only;</item>
/// <item>burnout episodes — depth is severity, span is duration, the right cap says who recovered it;</item>
/// <item>self-recognitions — the metacognition track, which no fusion dimension measures;</item>
/// <item>events, then a key for the kinds present, then the tick axis.</item>
/// </list>
///
/// Accessibility: every mark is a shape as well as a colour, nothing blinks, scrubbing is available
/// by mouse and the same range by the keyboard-reachable transport buttons in
/// <see cref="ObserverRoot"/>, and under reduced motion the axis snaps instead of easing.
/// </summary>
public partial class LearningTimelinePanel : ObserverPanel
{
    public override string PanelTitle => "Learning timeline";

    protected override string Subtitle()
    {
        if (Doc == null)
            return "no document yet";
        string where = Feed.ShowingHistory ? $"tick {Doc.Tick} (history)" : $"tick {Doc.Tick} (live)";
        // The "one tick is about a second" note lives here rather than drawn under the plot: at
        // narrow window widths a note beside the axis collides with the last tick label.
        return $"{Doc.BurnoutEpisodes.Count} episode(s) · {Doc.SelfRecognitions.Count} self-recognition(s)"
               + $" · {where} · 1 tick ≈ 1s";
    }

    protected override void Populate(VBoxContainer body)
    {
        var plot = new TimelinePlot
        {
            Feed = Feed,
            A11y = A11y,
            Level = Level,
            CustomMinimumSize = new Vector2(0, 196),
        };
        plot.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        body.AddChild(plot);

        // No separate legend row: the event lane carries its own key beneath it, and a second legend
        // repeating the same five items was the single biggest source of clutter in the panel.
        if (Level >= ReadingLevel.Coach)
        {
            body.AddChild(Ui.Paragraph(
                "A burnout whose arc ends in a filled cap came back on its own; one that ends in a "
                + "hollow square needed the Aide's RRT core. Drag anywhere on the timeline to scrub.",
                A11y.Font(Ui.TinyFont), P.TextMuted));
        }
    }
}

/// <summary>
/// The timeline's drawing surface. A top-level node rather than a nested type so Godot can register it
/// as a script, and separate from the panel so it owns its own input handling: scrubbing is a gesture
/// on the plot, not a button on the panel.
/// </summary>
public partial class TimelinePlot : Control
{
    private const float LeftGutter = 92f;
    private const float RightPad = 14f;
    private const float TopPad = 6f;

    private FeedTransport _feed = null!;
    private AccessibilitySettings _a11y = null!;
    private ReadingLevel _level;

    private int _lo;
    private int _hi = 1;
    private bool _dragging;

    public FeedTransport Feed
    {
        get => _feed;
        set
        {
            _feed = value;
            QueueRedraw();
        }
    }

    public AccessibilitySettings A11y
    {
        get => _a11y;
        set
        {
            _a11y = value;
            QueueRedraw();
        }
    }

    public ReadingLevel Level
    {
        get => _level;
        set
        {
            _level = value;
            QueueRedraw();
        }
    }

    public override void _Draw()
    {
        if (_feed == null || _a11y == null)
            return;

        var p = _a11y.Palette;
        var font = ThemeDB.FallbackFont;
        var doc = _feed.Current;

        DrawRect(new Rect2(Vector2.Zero, Size), p.PanelRaised);

        if (doc == null)
        {
            DrawString(font, new Vector2(LeftGutter, Size.Y * 0.5f), "Waiting for a state feed.",
                HorizontalAlignment.Left, -1, _a11y.Font(Ui.BodyFont), p.TextDim);
            return;
        }

        ComputeRange();
        float x0 = LeftGutter;
        float x1 = Math.Max(x0 + 40f, Size.X - RightPad);

        var lanes = Layout();
        DrawLanes(p, font, lanes);
        DrawEpisodes(p, font, x0, x1, lanes.BurnoutY, lanes.BurnoutH, doc);
        DrawRecognitions(p, font, x0, x1, lanes.RecognY, doc);
        DrawEvents(p, font, x0, x1, lanes.EventY, lanes.LegendY, doc);
        if (lanes.Technical)
            DrawLevels(p, font, x0, x1, lanes.LevelY, lanes.LevelH);

        DrawCursor(p, font, x0, x1);
    }

    /// <summary>
    /// Lane geometry for one frame, computed top-down. Kept in one place because the first version
    /// derived the axis from the burnout lane alone and drew it straight through the other lanes.
    /// </summary>
    private struct Lanes
    {
        public float LevelY, LevelH;
        public float BurnoutY, BurnoutH;
        public float RecognY;
        public float EventY;
        public float LegendY;
        public float AxisY;
        public bool Technical;
    }

    private Lanes Layout()
    {
        bool technical = _level >= ReadingLevel.Technical;
        float y = TopPad;
        var l = new Lanes { Technical = technical };

        if (technical)
        {
            l.LevelY = y;
            l.LevelH = 34f;
            y += l.LevelH + 8f;
        }

        l.BurnoutY = y;
        l.BurnoutH = technical ? 42f : 50f;
        y += l.BurnoutH + 14f;

        l.RecognY = y;
        y += 18f + 12f;

        l.EventY = y;
        y += 16f + 10f;

        l.LegendY = y;
        y += 14f + 6f;

        l.AxisY = y;
        return l;
    }

    private void ComputeRange()
    {
        int lo = int.MaxValue, hi = int.MinValue;

        void Consider(int tick)
        {
            if (tick < lo) lo = tick;
            if (tick > hi) hi = tick;
        }

        foreach (var d in _feed.Documents)
        {
            Consider(d.Tick);
            foreach (var ep in d.BurnoutEpisodes)
            {
                Consider(ep.StartTick);
                Consider(ep.EndTick(d.Tick));
            }
            foreach (var sr in d.SelfRecognitions)
                Consider(sr.Tick);
        }

        if (lo == int.MaxValue)
        {
            lo = 0;
            hi = 1;
        }
        if (hi - lo < 10)
            hi = lo + 10;

        // Ease toward the target so the axis grows smoothly — unless reduced motion is on, when it
        // snaps, because an animated axis is exactly the motion that setting exists to remove.
        float ease = _a11y.ReducedMotion ? 1f : 0.25f;
        _lo = Mathf.RoundToInt(Mathf.Lerp(_lo == 0 ? lo : _lo, lo, ease));
        _hi = Mathf.RoundToInt(Mathf.Lerp(_hi <= 1 ? hi : _hi, hi, ease));
        if (_hi <= _lo)
            _hi = _lo + 1;
    }

    private float TickToX(int tick, float x0, float x1)
        => x0 + (x1 - x0) * Math.Clamp((tick - _lo) / (float)(_hi - _lo), 0f, 1f);

    private int XToTick(float x, float x0, float x1)
        => _lo + (int)Math.Round(Math.Clamp((x - x0) / Math.Max(1f, x1 - x0), 0f, 1f) * (_hi - _lo));

    private void DrawLanes(Palette p, Font font, Lanes lanes)
    {
        int labelSize = _a11y.Font(Ui.TinyFont);
        float plotW = Size.X - LeftGutter - RightPad;

        void Lane(string name, float y, float h)
        {
            DrawRect(new Rect2(LeftGutter, y, plotW, h), p.Panel);
            Caption(font, p, name, LeftGutter - 8f, y + labelSize + 2f, labelSize, HorizontalAlignment.Right);
        }

        if (lanes.Technical)
            Lane("levels", lanes.LevelY, lanes.LevelH);
        Lane("burnout", lanes.BurnoutY, lanes.BurnoutH);
        Lane("self-recog", lanes.RecognY, 18f);
        Lane("events", lanes.EventY, 16f);

        float axisY = lanes.AxisY;
        DrawLine(new Vector2(LeftGutter, axisY), new Vector2(LeftGutter + plotW, axisY), p.Border, 1f);
        int steps = 6;
        for (int i = 0; i <= steps; i++)
        {
            float t = i / (float)steps;
            float x = LeftGutter + plotW * t;
            int tick = _lo + (int)Math.Round((_hi - _lo) * t);
            DrawLine(new Vector2(x, axisY), new Vector2(x, axisY + 4f), p.Border, 1f);
            var s = font.GetStringSize($"tick {tick}", HorizontalAlignment.Left, -1, labelSize);
            float lx = Math.Clamp(x - s.X * 0.5f, LeftGutter, LeftGutter + plotW - s.X);
            Caption(font, p, $"tick {tick}", lx, axisY + 4f + labelSize, labelSize, HorizontalAlignment.Left);
        }
    }

    /// <summary>
    /// Burnout arcs. Depth below the lane is severity, the horizontal span is how long it lasted, and
    /// the cap at each end says whether it opened and whether it closed on its own.
    /// </summary>
    private void DrawEpisodes(Palette p, Font font, float x0, float x1, float y, float h, StateFeed doc)
    {
        float baseline = y + h - 8f;
        int size = _a11y.Font(Ui.TinyFont);

        if (doc.BurnoutEpisodes.Count == 0)
        {
            Caption(font, p, "no burnout episodes yet", x0 + 8f, y + h * 0.5f, _a11y.Font(Ui.SmallFont),
                HorizontalAlignment.Left, p.TextDim);
            return;
        }

        foreach (var ep in doc.BurnoutEpisodes)
        {
            float sx = TickToX(ep.StartTick, x0, x1);
            float ex = TickToX(ep.EndTick(doc.Tick), x0, x1);
            float depth = Math.Clamp(ep.Severity, 0f, 1f) * (h - 18f);
            var colour = ep.IsOpen() ? p.Alert : ep.WasAssisted() ? p.Warn : p.Pass;
            var bar = new Rect2(new Vector2(sx, baseline - depth), new Vector2(Math.Max(2f, ex - sx), depth));

            DrawRect(bar, new Color(colour, ep.IsOpen() ? 0.4f : 0.8f));
            DrawRect(bar, colour, false, 1f);

            // Left cap: the collapse happened, at a recorded tick.
            Ui.DrawGlyph(this, Glyph.TriangleUp, new Vector2(sx, baseline - depth - 7f), 4.5f, colour, colour);

            // Right cap: filled = recovered alone; hollow square = the RRT core brought them back;
            // no cap and a word = still open.
            if (ep.IsOpen())
            {
                Caption(font, p, "open", ex + 7f, baseline - depth * 0.5f, size, HorizontalAlignment.Left,
                    colour);
            }
            else if (ep.WasAssisted())
            {
                Ui.DrawGlyph(this, Glyph.OpenSquare, new Vector2(ex, baseline - depth - 7f), 4.5f,
                    p.PanelRaised, colour);
                Caption(font, p, "RRT", ex + 7f, baseline - depth * 0.5f, size, HorizontalAlignment.Left,
                    colour);
            }
            else
            {
                Ui.DrawGlyph(this, Glyph.Circle, new Vector2(ex, baseline - depth - 7f), 4.5f, colour, colour);
                Caption(font, p, "solo", ex + 7f, baseline - depth * 0.5f, size, HorizontalAlignment.Left,
                    colour);
            }

            Caption(font, p, $"{ep.Severity * 100f:0}% under", sx, baseline + size, size,
                HorizontalAlignment.Left, p.TextMuted);
        }
    }

    /// <summary>
    /// Self-recognitions. <c>actedOn: false</c> gets its own shape, because that is the failure
    /// signal: it separates self-awareness from self-report (contract §7).
    /// </summary>
    private void DrawRecognitions(Palette p, Font font, float x0, float x1, float y, StateFeed doc)
    {
        int size = _a11y.Font(Ui.TinyFont);
        if (doc.SelfRecognitions.Count == 0)
        {
            Caption(font, p, "none recorded", x0 + 8f, y + 4f, size, HorizontalAlignment.Left, p.TextDim);
            return;
        }

        foreach (var sr in doc.SelfRecognitions)
        {
            float x = TickToX(sr.Tick, x0, x1);
            var colour = sr.ActedOn ? p.Focus : p.Alert;
            Ui.DrawGlyph(this, sr.ActedOn ? Glyph.Diamond : Glyph.OpenSquare, new Vector2(x, y + 6f), 5f,
                colour, colour);

            if (!sr.ActedOn)
                Caption(font, p, "noticed, didn't act", x + 9f, y + size + 1f, size,
                    HorizontalAlignment.Left, colour);
            else if (sr.LedTo == "delayed")
                Caption(font, p, "delayed", x + 9f, y + size + 1f, size, HorizontalAlignment.Left, p.TextDim);
        }
    }

    private void DrawEvents(Palette p, Font font, float x0, float x1, float y, float legendY, StateFeed doc)
    {
        DrawLine(new Vector2(x0, y + 8f), new Vector2(x1, y + 8f), p.Border, 1f);
        int size = _a11y.Font(Ui.TinyFont);

        foreach (var e in doc.Events)
        {
            float x = TickToX(e.Tick, x0, x1);
            var colour = PlainLanguage.EventColour(p, e.Kind);
            Ui.DrawGlyph(this, PlainLanguage.EventGlyph(e.Kind), new Vector2(x, y + 8f), 4f, colour, colour);
        }

        // One key entry per event kind present, so the lane is decodable without hovering.
        var seen = new HashSet<string>();
        float lx = x0 + 4f;
        foreach (var e in doc.Events)
        {
            if (!seen.Add(e.Kind))
                continue;
            var colour = PlainLanguage.EventColour(p, e.Kind);
            Ui.DrawGlyph(this, PlainLanguage.EventGlyph(e.Kind), new Vector2(lx + 4f, legendY + 5f), 3.5f,
                colour, colour);
            var text = PlainLanguage.EventWord(e.Kind);
            var s = font.GetStringSize(text, HorizontalAlignment.Left, -1, size);
            Caption(font, p, text, lx + 11f, legendY + size * 0.9f, size, HorizontalAlignment.Left, p.TextDim);
            lx += 11f + s.X + 14f;
            if (lx > x1)
                break;
        }
    }

    /// <summary>
    /// Technical only. Three levels, not six: attention, stress and mental load are the ones a run's
    /// shape is legible from. Confidence and independence already have panels of their own.
    /// </summary>
    private void DrawLevels(Palette p, Font font, float x0, float x1, float y, float h)
    {
        if (h <= 8f)
            return;
        var docs = _feed.Documents;
        if (docs.Count < 2)
        {
            Caption(font, p, "levels appear once a few documents have been observed", x0 + 8f, y + 12f,
                _a11y.Font(Ui.TinyFont), HorizontalAlignment.Left, p.TextDim);
            return;
        }

        var keys = new[] { "attentionEnergy", "stressLevel", "cognitiveLoad" };
        var colours = new[] { p.Cool, p.Warn, p.Focus };

        for (int k = 0; k < keys.Length; k++)
        {
            var pts = new List<Vector2>();
            for (int i = 0; i < docs.Count; i++)
            {
                var a = FeedTransport.PrimaryAvatar(docs[i]);
                if (a == null)
                    continue;
                pts.Add(new Vector2(
                    TickToX(docs[i].Tick, x0, x1),
                    y + h * (1f - Math.Clamp(a.Level(keys[k]), 0f, 1f))));
            }
            if (pts.Count < 2)
                continue;
            DrawPolyline(pts.ToArray(), colours[k], 1.6f, true);
            Caption(font, p, PlainLanguage.LevelLabel(keys[k]), x0 + 4f + k * 104f, y + 10f,
                _a11y.Font(Ui.TinyFont), HorizontalAlignment.Left, colours[k]);
        }
    }

    private void DrawCursor(Palette p, Font font, float x0, float x1)
    {
        var doc = _feed.Current;
        if (doc == null)
            return;
        float x = TickToX(doc.Tick, x0, x1);
        DrawLine(new Vector2(x, TopPad), new Vector2(x, Size.Y - 8f), p.Accent, 1.5f);

        string tag = $"tick {doc.Tick}";
        if (_feed.ShowingHistory)
            tag += " / history";
        int size = _a11y.Font(Ui.TinyFont);
        var s = font.GetStringSize(tag, HorizontalAlignment.Left, -1, size);
        float bx = Math.Clamp(x - s.X * 0.5f, x0, Math.Max(x0, x1 - s.X));
        var bg = new Rect2(new Vector2(bx - 4f, Size.Y - s.Y - 5f), new Vector2(s.X + 8f, s.Y + 6f));
        DrawRect(bg, p.Backdrop);
        DrawRect(bg, p.Accent, false, 1f);
        Caption(font, p, tag, bx, Size.Y - 6f, size, HorizontalAlignment.Left, p.Accent);
    }

    private void Caption(Font font, Palette p, string text, float x, float y, int size,
                          HorizontalAlignment align, Color? colour = null)
    {
        float dx = align == HorizontalAlignment.Right
            ? -font.GetStringSize(text, align, -1, size).X
            : 0f;
        DrawString(font, new Vector2(x + dx, y), text, align, -1, size, colour ?? p.TextDim);
    }

    // ---- scrubbing ----

    public override void _GuiInput(InputEvent @event)
    {
        if (@event is InputEventMouseButton mb && mb.ButtonIndex == MouseButton.Left)
        {
            _dragging = mb.Pressed;
            if (mb.Pressed)
                SeekFromX(mb.Position.X);
            AcceptEvent();
        }
        else if (@event is InputEventMouseMotion mm && _dragging)
        {
            SeekFromX(mm.Position.X);
            AcceptEvent();
        }
    }

    private void SeekFromX(float x)
    {
        var docs = _feed.Documents;
        if (docs.Count == 0)
            return;
        int tick = XToTick(x, LeftGutter, Math.Max(LeftGutter + 40f, Size.X - RightPad));

        // Land on the nearest received document. Scrubbing never invents a position between
        // documents: there is nothing delivered there to show.
        int best = 0;
        int bestDistance = int.MaxValue;
        for (int i = 0; i < docs.Count; i++)
        {
            int d = Math.Abs(docs[i].Tick - tick);
            if (d < bestDistance)
            {
                bestDistance = d;
                best = i;
            }
        }
        _feed.Seek(best);
    }
}