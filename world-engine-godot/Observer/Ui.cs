using System;
using Godot;
using ControlSizeFlags = Godot.Control.SizeFlags;

namespace NltWorldEngine.Observer;

/// <summary>How much detail the observer is shown. RENDERER-PLAN.md §6, the three-level table.</summary>
public enum ReadingLevel
{
    /// <summary>Named state and plain-language events. Behaviour is the primary channel.</summary>
    Simple = 0,

    /// <summary>Simple, plus what the Aide did and whether it helped.</summary>
    Coach = 1,

    /// <summary>Numbers, graphs, timelines.</summary>
    Technical = 2,
}

/// <summary>Shape vocabulary for indicators. Colour is never the only channel (contract §4.1).</summary>
public enum Glyph
{
    Circle,
    TriangleDown,
    Square,
    Diamond,
    TriangleUp,
    Chevron,
    Hexagon,
    OpenSquare,
    HalfCircle,
    Bar,
}

/// <summary>
/// The observer's colours.
///
/// Hues are the Okabe–Ito colour-safe set. That is a deliberate constraint rather than taste: a
/// meaningful fraction of the audience has a colour vision deficiency, and the contract already
/// forbids leaning on colour alone (§4.1). Every coloured indicator in this observer ships with a
/// distinct shape and a text label, so the colour is redundant reinforcement.
/// </summary>
public sealed class Palette
{
    public Color Backdrop { get; private init; }
    public Color Panel { get; private init; }
    public Color PanelRaised { get; private init; }
    public Color Border { get; private init; }
    public Color Text { get; private init; }
    public Color TextDim { get; private init; }
    public Color TextMuted { get; private init; }
    public Color Accent { get; private init; }
    public Color Pass { get; private init; }
    public Color Warn { get; private init; }
    public Color Alert { get; private init; }
    public Color Focus { get; private init; }
    public Color Cool { get; private init; }

    public static Palette Default { get; } = new()
    {
        Backdrop = new Color("0e1116"),
        Panel = new Color("161b22"),
        PanelRaised = new Color("1c2430"),
        Border = new Color("2f3b49"),
        Text = new Color("e6edf3"),
        TextDim = new Color("a3b1c0"),
        TextMuted = new Color("74838f"),
        Accent = new Color("56b4e9"),
        Pass = new Color("009e73"),
        Warn = new Color("e69f00"),
        Alert = new Color("d55e00"),
        Focus = new Color("cc79a7"),
        Cool = new Color("0072b2"),
    };

    /// <summary>Brighter foregrounds and heavier borders: no dim grey is asked to carry meaning.</summary>
    public static Palette HighContrast { get; } = new()
    {
        Backdrop = new Color("000000"),
        Panel = new Color("0a0a0a"),
        PanelRaised = new Color("141414"),
        Border = new Color("9aa7b4"),
        Text = new Color("ffffff"),
        TextDim = new Color("e6edf3"),
        TextMuted = new Color("c3ccd6"),
        Accent = new Color("7fd0ff"),
        Pass = new Color("00c896"),
        Warn = new Color("ffc247"),
        Alert = new Color("ff8c42"),
        Focus = new Color("ffa8d0"),
        Cool = new Color("4aa8ff"),
    };

    public int BorderWidth => this == HighContrast ? 2 : 1;
}

/// <summary>Small helpers so every panel builds its controls the same way.</summary>
public static class Ui
{
    public const int BaseFont = 15;
    public const int BodyFont = 14;
    public const int SmallFont = 12;
    public const int TinyFont = 11;

    /// <summary>
    /// Wrap width a paragraph is measured against. Comfortably under every panel's inner width, and
    /// wide enough that a wrapping <c>Label</c> reserves a sensible minimum height.
    /// </summary>
    public const float ParagraphWrapWidth = 196f;

    /// <summary>
    /// A short label. Does not wrap.
    ///
    /// Wrapping is opt-in here for a specific reason: a Godot <c>Label</c> with autowrap computes its
    /// minimum height by laying the text out at its <i>current</i> width, and inside a container that
    /// width can still be one pixel. The result is a minimum height in the hundreds of pixels, which
    /// starves the layout — the first version of this observer wrapped one character per line and
    /// pushed the panels off the bottom of the window. Short strings therefore never wrap; long ones
    /// use <see cref="Paragraph"/>, which declares a real wrap width.
    /// </summary>
    public static Label Text(string s, int size = BodyFont, Color? colour = null)
    {
        var l = new Label
        {
            Text = s,
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            // Same reason as Inline: a wrapping label with no declared width gets measured at one
            // character. Short labels take their natural width and stay on one line; anything longer
            // than the panel will be clipped rather than stacked.
            CustomMinimumSize = new Vector2(MeasuredWidth(s, size), 0),
        };
        NoWrap(l);
        l.AddThemeFontSizeOverride("font_size", size);
        if (colour.HasValue)
            l.AddThemeColorOverride("font_color", colour.Value);
        return l;
    }

    /// <summary>
    /// A wrapping sentence. The declared wrap width is what the minimum height gets measured
    /// against, so it has to be a real width — otherwise the label reserves height for a
    /// one-character column.
    /// </summary>
    public static Label Paragraph(string s, int size = SmallFont, Color? colour = null)
    {
        var l = new Label
        {
            Text = s,
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            CustomMinimumSize = new Vector2(ParagraphWrapWidth, 0),
        };
        l.Set("autowrap_mode", (int)TextServer.AutowrapMode.WordSmart);
        l.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        l.AddThemeFontSizeOverride("font_size", size);
        if (colour.HasValue)
            l.AddThemeColorOverride("font_color", colour.Value);
        return l;
    }

    /// <summary>
    /// A tag or chip label: never wraps, never expands. Breaking "Independence" into
    /// "Independ / ence" is worse than letting it sit at its natural width.
    /// </summary>
    /// <summary>
    /// A tag or chip label: one line, at its natural width.
    ///
    /// <para>
    /// The explicit minimum width is the whole point. In this Godot build every <c>Label</c> wraps —
    /// the property reads back as <c>WordSmart</c> however it is set — and a wrapping label renders
    /// against whatever width it currently has. Inside a container that width is the declared minimum,
    /// so a label without one is measured at roughly one character and draws "Never" as a column of
    /// five letters. Pinning the width to the measured text width makes the behaviour deterministic
    /// instead of dependent on which layout pass happens to have run.
    /// </para>
    /// </summary>
    public static Label Inline(string s, int size = SmallFont, Color? colour = null)
    {
        var l = new Label
        {
            Text = s,
            SizeFlagsHorizontal = ControlSizeFlags.ShrinkBegin,
            SizeFlagsVertical = ControlSizeFlags.ShrinkCenter,
            CustomMinimumSize = new Vector2(MeasuredWidth(s, size), 0),
        };
        NoWrap(l);
        l.AddThemeFontSizeOverride("font_size", size);
        if (colour.HasValue)
            l.AddThemeColorOverride("font_color", colour.Value);
        return l;
    }

    /// <summary>Width of <paramref name="s"/> in the fallback font, plus a hair of slack.</summary>
    public static float MeasuredWidth(string s, int size)
    {
        if (string.IsNullOrEmpty(s))
            return 1f;
        return ThemeDB.FallbackFont.GetStringSize(s, HorizontalAlignment.Left, -1, size).X + 2f;
    }

    /// <summary>
    /// Force wrapping off after construction.
    ///
    /// Assigned as a statement rather than in an object initialiser on purpose: a Label whose width
    /// has not been laid out yet renders a wrapped string one character per line, and a single-line
    /// chip is the one place that looks broken rather than merely cramped. Setting it here, on the
    /// finished node, is what the renderer observes.
    /// </summary>
    public static Label NoWrap(Label l)
    {
        // Through Set(), not the C# property: with the property, the engine keeps reporting and
        // rendering these labels as wrapped (Godot 4.7.2, .NET bindings). Set() writes the engine
        // property directly, and a wrapping Label inside a container renders one character per line.
        l.Set("autowrap_mode", (int)TextServer.AutowrapMode.Off);
        l.AutowrapMode = TextServer.AutowrapMode.Off;
        return l;
    }

    /// <summary>Wrapping sentence text, set the same way as <see cref="NoWrap"/>.</summary>
    public static Label WrapWords(Label l)
    {
        l.Set("autowrap_mode", (int)TextServer.AutowrapMode.WordSmart);
        l.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        return l;
    }

    /// <summary>A section heading. Small caps read as structure without shouting.</summary>
    public static Label Heading(string s, Color colour, int size = SmallFont)
    {
        var text = s.ToUpperInvariant();
        var l = new Label
        {
            Text = text,
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            CustomMinimumSize = new Vector2(MeasuredWidth(text, size), 0),
        };
        NoWrap(l);
        l.AddThemeFontSizeOverride("font_size", size);
        l.AddThemeColorOverride("font_color", colour);
        return l;
    }

    public static StyleBoxFlat Box(Color fill, Color border, int width = 1, int radius = 6,
                                    int padH = 10, int padV = 8)
    {
        var sb = new StyleBoxFlat
        {
            BgColor = fill,
            BorderColor = border,
            CornerRadiusTopLeft = radius,
            CornerRadiusTopRight = radius,
            CornerRadiusBottomLeft = radius,
            CornerRadiusBottomRight = radius,
            ContentMarginLeft = padH,
            ContentMarginRight = padH,
            ContentMarginTop = padV,
            ContentMarginBottom = padV,
        };
        sb.SetBorderWidthAll(width);
        return sb;
    }

    public static PanelContainer Card(Color fill, Color border, int radius = 8, int pad = 10)
    {
        var p = new PanelContainer();
        p.AddThemeStyleboxOverride("panel", Box(fill, border, 1, radius, pad, pad));
        return p;
    }

    /// <summary>
    /// A row. Deliberately left at Godot's default size flags: in a column it fills the width, and
    /// nested in another row it takes only the width it needs. Expanding here would push the second
    /// item of every two-item row off the panel.
    /// </summary>
    /// <summary>
    /// A row or block that fills the width its parent offers.
    ///
    /// The ExpandFill is not decoration. Godot hands a container child its <i>minimum</i> size unless
    /// the child asks to expand, so a nested row left at the default flags collapses to the width of
    /// its widest word — which is how the first version of this observer ended up rendering
    /// "Never" one letter per line.
    /// </summary>
    public static HBoxContainer Row(int separation = 6)
    {
        var h = new HBoxContainer();
        h.AddThemeConstantOverride("separation", separation);
        h.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        return h;
    }

    /// <summary>
    /// A row that takes only the width it needs: tags, toggles, legends. Use this when the row is
    /// itself an item in a <see cref="Row"/> — an expanding row there would push its neighbours off
    /// the panel.
    /// </summary>
    public static HBoxContainer InlineRow(int separation = 6)
    {
        var h = new HBoxContainer();
        h.AddThemeConstantOverride("separation", separation);
        h.SizeFlagsHorizontal = ControlSizeFlags.ShrinkBegin;
        h.SizeFlagsVertical = ControlSizeFlags.ShrinkCenter;
        return h;
    }

    public static VBoxContainer Col(int separation = 6)
    {
        var v = new VBoxContainer();
        v.AddThemeConstantOverride("separation", separation);
        v.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        return v;
    }

    public static MarginContainer Pad(int all) => Pad(all, all, all, all);

    public static MarginContainer Pad(int top, int right, int bottom, int left)
    {
        var m = new MarginContainer();
        m.AddThemeConstantOverride("margin_top", top);
        m.AddThemeConstantOverride("margin_right", right);
        m.AddThemeConstantOverride("margin_bottom", bottom);
        m.AddThemeConstantOverride("margin_left", left);
        return m;
    }

    public static Button Flat(string label, int fontSize = SmallFont, Color? tint = null)
    {
        var b = new Button
        {
            Text = label,
            FocusMode = Godot.Control.FocusModeEnum.All,
            MouseDefaultCursorShape = Godot.Control.CursorShape.PointingHand,
        };
        b.AddThemeFontSizeOverride("font_size", fontSize);
        if (tint.HasValue)
            b.AddThemeColorOverride("font_color", tint.Value);
        return b;
    }

    public static Button Toggle(string label, bool on, int fontSize = SmallFont, Color? tint = null)
    {
        var b = Flat(label, fontSize, tint);
        b.ToggleMode = true;
        b.ButtonPressed = on;
        return b;
    }

    /// <summary>
    /// Attach a keyboard shortcut, rendered as a hint on the button.
    ///
    /// Every control in the observer has one. It is the accessibility answer to "the mouse is not the
    /// only way in", and it is also the reason the reading level can be changed without hunting for
    /// a small target in a crowded bar.
    /// </summary>
    public static T WithShortcut<T>(this T button, Key key) where T : BaseButton
    {
        var events = new Godot.Collections.Array();
        events.Add(new InputEventKey { Keycode = key, PhysicalKeycode = key });
        button.Shortcut = new Shortcut { Events = events };
        return button;
    }

    /// <summary>A one-pixel divider in the palette's border colour.</summary>
    public static ColorRect Rule(Color c) => new()
    {
        CustomMinimumSize = new Vector2(0, 1),
        Color = c,
        MouseFilter = Godot.Control.MouseFilterEnum.Ignore,
    };

    /// <summary>
    /// Draws <paramref name="glyph"/> at <paramref name="centre"/>. Shape, not colour, is what
    /// distinguishes indicators when colour is unavailable.
    /// </summary>
    public static void DrawGlyph(CanvasItem ci, Glyph glyph, Vector2 centre, float size, Color fill,
                                 Color outline)
    {
        float r = size;
        switch (glyph)
        {
            case Glyph.Circle:
                ci.DrawCircle(centre, r, fill);
                break;
            case Glyph.OpenSquare:
                ci.DrawRect(new Rect2(centre - new Vector2(r, r), new Vector2(r * 2, r * 2)), outline, false, 2f);
                break;
            case Glyph.Square:
                ci.DrawRect(new Rect2(centre - new Vector2(r * 0.85f, r * 0.85f),
                    new Vector2(r * 1.7f, r * 1.7f)), fill);
                break;
            case Glyph.Diamond:
                ci.DrawColoredPolygon(new[]
                {
                    centre + new Vector2(0, -r), centre + new Vector2(r, 0),
                    centre + new Vector2(0, r), centre + new Vector2(-r, 0),
                }, fill);
                break;
            case Glyph.TriangleUp:
                ci.DrawColoredPolygon(new[]
                {
                    centre + new Vector2(0, -r), centre + new Vector2(r * 0.92f, r * 0.72f),
                    centre + new Vector2(-r * 0.92f, r * 0.72f),
                }, fill);
                break;
            case Glyph.TriangleDown:
                ci.DrawColoredPolygon(new[]
                {
                    centre + new Vector2(0, r), centre + new Vector2(r * 0.92f, -r * 0.72f),
                    centre + new Vector2(-r * 0.92f, -r * 0.72f),
                }, fill);
                break;
            case Glyph.Chevron:
                for (int i = 0; i < 2; i++)
                    ci.DrawLine(centre + new Vector2(-r * 0.8f, (i - 1) * r * 0.7f),
                        centre + new Vector2(r * 0.2f, -r + (i - 1) * r * 0.7f + r),
                        fill, 2.5f, true);
                break;
            case Glyph.HalfCircle:
                ci.DrawCircle(centre, r, outline);
                ci.DrawRect(new Rect2(centre - new Vector2(r, 0), new Vector2(r * 2, r)), fill);
                break;
            case Glyph.Bar:
                ci.DrawRect(new Rect2(centre - new Vector2(r * 0.35f, r), new Vector2(r * 0.7f, r * 2)), fill);
                break;
            case Glyph.Hexagon:
            {
                var pts = new Vector2[6];
                for (int i = 0; i < 6; i++)
                {
                    float a = Mathf.Pi / 6f + i * Mathf.Pi / 3f;
                    pts[i] = centre + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r;
                }
                ci.DrawColoredPolygon(pts, fill);
                break;
            }
        }
    }

    /// <summary>
    /// A 0..1 meter that always carries its number in text. A bar on its own is unreadable to a screen
    /// reader and imprecise to everyone else.
    /// </summary>
    public static void DrawMeter(CanvasItem ci, Rect2 area, float value, Color fill, Color track,
                                 Color border, string label, Font font, int fontSize, Color textColour)
    {
        ci.DrawRect(area, track);
        float w = area.Size.X * Math.Clamp(value, 0f, 1f);
        if (w > 0.5f)
            ci.DrawRect(new Rect2(area.Position, new Vector2(w, area.Size.Y)), fill);
        ci.DrawRect(area, border, false, 1f);
        if (label.Length > 0)
        {
            var size = font.GetStringSize(label, HorizontalAlignment.Left, -1, fontSize);
            ci.DrawString(font,
                area.Position + new Vector2(area.Size.X - size.X - 4,
                    Math.Max(0, (area.Size.Y - size.Y) * 0.5f)),
                label, HorizontalAlignment.Left, -1, fontSize, textColour);
        }
    }
}