using System;
using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// Base for the observer's six panels.
///
/// A panel rebuilds its body when the document changes rather than mutating controls in place. The
/// feed arrives at ~1 Hz and the observer renders at display rate, so a document change is the only
/// thing worth reacting to, and rebuilding at that rate is cheap and removes a whole class of
/// stale-label bugs. Reading level and accessibility changes rebuild too — they change what there
/// is to say, not just how it looks.
/// </summary>
public abstract partial class ObserverPanel : PanelContainer
{
    private Label _title = null!;
    private Label _note = null!;
    private VBoxContainer _body = null!;
    private Control _host = null!;

    protected FeedTransport Feed = null!;
    protected AccessibilitySettings A11y = null!;
    protected ReadingLevel Level = ReadingLevel.Simple;

    protected Palette P => A11y.Palette;

    protected StateFeed? Doc => Feed.Current;

    /// <summary>The avatar this observer follows, from the document on show.</summary>
    protected AgentState? Avatar => FeedTransport.PrimaryAvatar(Doc);

    protected AgentState? Aide => FeedTransport.AideOf(Doc, Avatar);

    protected PairState? Pair => FeedTransport.PrimaryPair(Doc, Avatar);

    public virtual string PanelTitle => "";

    /// <summary>Whether this panel has anything to show at the current reading level.</summary>
    public virtual bool Applies => true;

    /// <summary>
    /// Point the panel at the current feed, accessibility settings and reading level.
    ///
    /// Builds the chrome only once. Re-binding must not build again: adding a second header and a
    /// second body to a live panel stacks the old content under the new, which reads as garbled
    /// overlapping text rather than as the obvious double-node bug it is.
    /// </summary>
    public void Bind(FeedTransport feed, AccessibilitySettings a11y, ReadingLevel level)
    {
        Feed = feed;
        A11y = a11y;
        Level = level;
        if (_body == null)
            Build();
    }

    private void Build()
    {
        MouseFilter = MouseFilterEnum.Ignore;
        AddThemeStyleboxOverride("panel", Ui.Box(P.Panel, P.Border, P.BorderWidth, 10, 12, 10));

        var root = Ui.Col(8);
        root.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        root.SizeFlagsVertical = SizeFlags.ExpandFill;
        AddChild(root);

        var header = Ui.Row(8);
        header.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _title = Ui.Heading(PanelTitle, P.TextDim);
        _note = Ui.Text("", Ui.SmallFont, P.TextMuted);
        _note.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _note.HorizontalAlignment = HorizontalAlignment.Right;
        header.AddChild(_title);
        header.AddChild(_note);
        root.AddChild(header);
        root.AddChild(Ui.Rule(P.Border));

        // The scroll host is a plain Control, not a Container. That is the whole trick: a
        // ScrollContainer inside a BoxContainer reports its child's full height as a minimum, which
        // makes the rail demand more height than the window has and pushes it out of the layout. A
        // plain Control has a zero minimum, clips its overflow, and lets the panel be sized by the
        // space its parent actually has.
        _host = new Control
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill,
            ClipContents = true,
            MouseFilter = MouseFilterEnum.Pass,
        };
        root.AddChild(_host);

        var scroll = new ScrollContainer
        {
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
            VerticalScrollMode = ScrollContainer.ScrollMode.Auto,
        };
        scroll.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        _host.AddChild(scroll);

        _body = Ui.Col(8);
        _body.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        scroll.AddChild(_body);
    }

    /// <summary>Rebuild the body for the document on show. Called once per document change.</summary>
    public virtual void Refresh()
    {
        if (_body == null)
            return;

        _title.AddThemeColorOverride("font_color", P.TextDim);
        _title.AddThemeFontSizeOverride("font_size", A11y.Font(Ui.SmallFont));
        _note.AddThemeColorOverride("font_color", P.TextMuted);
        _note.AddThemeFontSizeOverride("font_size", A11y.Font(Ui.SmallFont));
        _note.Text = Subtitle();
        AddThemeStyleboxOverride("panel", Ui.Box(P.Panel, P.Border, P.BorderWidth, 10, 12, 10));

        Clear(_body);
        Populate(_body);
        TuneLayout();
        QueueRedraw();
    }

    /// <summary>Layout probe. Off unless NLT_OBSERVER_DEBUG=1.</summary>
    private void DumpRects()
    {
        GD.Print($"[layout] {PanelTitle}: panel={Size} host={_host.Size} body={_body.Size} level={Level}");
        Dump(_body, 1);
    }

    private void Dump(Node n, int depth)
    {
        foreach (var child in n.GetChildren())
        {
            if (child is not Control c)
                continue;
            string extra = c is Label l
                ? $" wrap={l.AutowrapMode} min={l.CustomMinimumSize} text='{Trim(l.Text)}'"
                : $" children={c.GetChildCount()} min={c.GetCombinedMinimumSize()}";
            GD.Print($"[layout] {new string(' ', depth * 2)}{c.GetType().Name} size={c.Size}"
                     + $" flags={c.SizeFlagsHorizontal}{extra}");
            if (depth < 4)
                Dump(c, depth + 1);
        }
    }

    private static string Trim(string s) => s.Length <= 28 ? s : s[..28] + "...";

    /// <summary>Right-aligned context in the header: the panel's own one-line status.</summary>
    protected virtual string Subtitle() => "";

    /// <summary>Panel content. <paramref name="body"/> is cleared first.</summary>
    protected abstract void Populate(VBoxContainer body);

    /// <summary>Called after Populate so a panel can size itself to its content.</summary>
    protected virtual void TuneLayout()
    {
    }

    /// <summary>
    /// Remove every child. Snapshots the child list first: <c>GetChildren()</c> is a live view, so
    /// removing while enumerating it aborts the loop and leaves half the old body behind.
    /// </summary>
    protected static void Clear(Node n)
    {
        var doomed = new System.Collections.Generic.List<Node>();
        foreach (var child in n.GetChildren())
            doomed.Add(child);
        foreach (var child in doomed)
        {
            n.RemoveChild(child);
            child.QueueFree();
        }
    }

    protected VBoxContainer Section(string title)
    {
        var box = Ui.Col(4);
        box.AddChild(Ui.Heading(title, P.TextMuted, Ui.TinyFont));
        return box;
    }

    protected Control Spacer(float h) => new Control { CustomMinimumSize = new Vector2(0, h) };

    /// <summary>Word plus glyph, the standard indicator. Colour is redundant here by design.</summary>
    protected Control Chip(string word, Glyph glyph, Color colour, int fontSize = Ui.BodyFont)
    {
        var chip = new ChipNode
        {
            Glyph = glyph,
            Colour = colour,
            Text = word,
            FontSize = fontSize,
            Outline = P.Panel,
        };
        chip.SizeFlagsHorizontal = SizeFlags.ShrinkBegin;
        return chip;
    }

    /// <summary>
    /// An indicator: a shape and a word, drawn rather than composed from a Label.
    ///
    /// Drawn because a <c>Label</c> here was intermittently wrapping one character per line. Godot
    /// computes a wrapping label's line breaks against whatever width it currently has, and inside a
    /// freshly rebuilt panel that width can still be a pixel — so the single most important thing on
    /// the panel, the Avatar's state, was the thing most likely to render as a column of letters.
    /// A custom <c>_Draw</c> has no layout pass to get wrong, and it is cheaper besides.
    /// </summary>
    public partial class ChipNode : Control
    {
        public Glyph Glyph { get; set; } = Observer.Glyph.Circle;

        public Color Colour { get; set; } = Colors.White;

        public Color Outline { get; set; } = Colors.Black;

        public string Text { get; set; } = "";

        public int FontSize { get; set; } = Ui.BodyFont;

        public float DotSize { get; set; } = 18f;

        public override Vector2 _GetMinimumSize()
        {
            var font = ThemeDB.FallbackFont;
            var s = font.GetStringSize(Text, HorizontalAlignment.Left, -1, FontSize);
            return new Vector2(DotSize + 7f + s.X, Math.Max(DotSize, s.Y));
        }

        public override void _Draw()
        {
            var font = ThemeDB.FallbackFont;
            var s = font.GetStringSize(Text, HorizontalAlignment.Left, -1, FontSize);
            float cy = Size.Y * 0.5f;
            Ui.DrawGlyph(this, Glyph, new Vector2(DotSize * 0.5f, cy), DotSize * 0.34f, Colour, Outline);
            DrawString(font, new Vector2(DotSize + 7f, cy + s.Y * 0.35f), Text,
                HorizontalAlignment.Left, -1, FontSize, Colour);
        }

        public void Refresh() => QueueRedraw();
    }

    /// <summary>A bare indicator glyph, for rows that carry their own labels.</summary>
    protected GlyphDot GlyphNode(Glyph glyph, Color colour, float size = 14f)
    {
        var dot = new GlyphDot
        {
            Glyph = glyph,
            Colour = colour,
            Outline = P.Panel,
            CustomMinimumSize = new Vector2(size, size),
            Radius = size * 0.36f,
        };
        dot.SizeFlagsVertical = SizeFlags.ShrinkCenter;
        return dot;
    }

    /// <summary>A 0..1 bar with its value in text. Never a bare bar.</summary>
    protected Control Meter(string label, float value, string word, Color colour)
    {
        var bar = new LevelBar
        {
            Value = value,
            Colour = colour,
            Track = P.PanelRaised,
            Border = P.Border,
            Caption = Level >= ReadingLevel.Coach
                ? (word.Length > 0 ? $"{label} — {word}  {value * 100f:0}%" : $"{label}  {value * 100f:0}%")
                : (word.Length > 0 ? $"{label} — {word}" : label),
            FontSize = A11y.Font(Ui.SmallFont),
            TextColour = P.TextDim,
            CustomMinimumSize = new Vector2(0, A11y.Font(Ui.BodyFont) + 10),
        };
        bar.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        return bar;
    }
}

/// <summary>A single indicator glyph. Its own node so panels can lay indicators out inline.</summary>
public partial class GlyphDot : Control
{
    public Glyph Glyph { get; set; } = Observer.Glyph.Circle;

    public Color Colour { get; set; } = Colors.White;

    /// <summary>Outline colour, used by the open shapes so they read against any background.</summary>
    public Color Outline { get; set; } = Colors.Black;

    public float Radius { get; set; } = 6f;

    public override void _Draw() => Ui.DrawGlyph(this, Glyph, Size * 0.5f, Radius, Colour, Outline);

    public void Refresh() => QueueRedraw();
}

/// <summary>A labelled 0..1 bar. The caption carries the number, so the bar is never the only channel.</summary>
public partial class LevelBar : Control
{
    public float Value { get; set; }

    public Color Colour { get; set; } = Colors.White;

    public Color Track { get; set; } = Colors.Black;

    public Color Border { get; set; } = Colors.Gray;

    public string Caption { get; set; } = "";

    public int FontSize { get; set; } = 12;

    public Color TextColour { get; set; } = Colors.White;

    public override void _Draw()
    {
        var font = ThemeDB.FallbackFont;
        var textSize = font.GetStringSize(Caption, HorizontalAlignment.Left, -1, FontSize);
        float barTop = (textSize.Y + 4f) * 0.5f;
        float barHeight = Mathf.Max(6f, Size.Y - textSize.Y - 6f);
        DrawString(font, new Vector2(0, textSize.Y * 0.5f + FontSize * 0.36f), Caption,
            HorizontalAlignment.Left, -1, FontSize, TextColour);

        var area = new Rect2(new Vector2(0, barTop + textSize.Y * 0.5f),
            new Vector2(Size.X, barHeight));
        Ui.DrawMeter(this, area, Value, Colour, Track, Border, "", font, FontSize, TextColour);
    }

    public void Refresh() => QueueRedraw();
}