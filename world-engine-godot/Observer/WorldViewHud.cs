using Godot;
using NltWorldEngine.Feed;

namespace NltWorldEngine.Observer;

/// <summary>
/// A flat wash over the 3D view. Drawn first, so the panels sit on top of it and the world recedes.
/// The open world is procedurally bright, and unreadable text over a saturated sky is exactly the
/// dense-dashboard feel the observer is meant to avoid.
/// </summary>
public partial class ViewportScrim : Control
{
    public Color Colour { get; set; } = new(0, 0, 0, 0.3f);

    public override void _Ready()
    {
        MouseFilter = MouseFilterEnum.Ignore;
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
    }

    public override void _Draw() => DrawRect(new Rect2(Vector2.Zero, Size), Colour);
}

/// <summary>
/// Panel 1 of 6: <b>World View</b>.
///
/// The viewport itself belongs to <c>WorldView</c>; this is the observer's reading of it, and it now
/// draws only what the 3D scene cannot — the strip naming the room on show. The agents are rendered in
/// the world itself: one articulated resident per agent, with a name and named-state label
/// (RENDERER-PLAN.md B.2/B.4, <c>Resident</c> / <c>ResidentLayer</c>). Those were exactly why this HUD
/// once drew screen-space pins — a stopgap while B.2/B.4 were blocked behind GRAPH-001's G1. Now that
/// they have landed the pins are gone: drawing them too would put a tag on top of every resident.
/// </summary>
public partial class WorldViewHud : Control
{
    private FeedTransport _feed = null!;
    private AccessibilitySettings _a11y = null!;
    private WorldView? _world;

    public FeedTransport Feed
    {
        get => _feed;
        set => _feed = value;
    }

    public AccessibilitySettings A11y
    {
        set => _a11y = value;
    }

    /// <summary>The world being observed. Optional: the HUD simply stays quiet without a camera.</summary>
    public WorldView? World
    {
        get => _world;
        set => _world = value;
    }

    public override void _Ready()
    {
        // The HUD must never intercept the camera's drag-to-orbit or wheel-to-zoom.
        MouseFilter = MouseFilterEnum.Ignore;
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
    }

    public override void _Process(double delta) => QueueRedraw();

    /// <summary>
    /// Height of the observer's top bar, mirrored from <see cref="ObserverRoot"/>: the strip is kept
    /// below it so it never reads as part of the bar.
    /// </summary>
    private const float TopBarHeight = 44f;

    public override void _Draw()
    {
        if (_a11y == null || _feed == null || _world == null)
            return;

        DrawSceneStrip(ThemeDB.FallbackFont, _a11y.Palette, _feed.Current, GetViewportRect().Size);
    }

    private void DrawSceneStrip(Font font, Palette p, StateFeed? doc, Vector2 viewport)
    {
        int size = _a11y.Font(Ui.SmallFont);
        string scene = doc?.Scene.SceneLabel() ?? "-";
        string tick = doc == null ? "-" : $"tick {doc.Tick}";

        var text = $"WORLD VIEW / {scene} / {tick}";
        var s = font.GetStringSize(text, HorizontalAlignment.Left, -1, size);

        // Centred in the window rather than pinned left, because the left third of the screen
        // belongs to the Avatar State rail.
        var bg = new Rect2(new Vector2((viewport.X - s.X - 16f) * 0.5f, TopBarHeight + 8f), s + new Vector2(16, 10));
        DrawRect(bg, p.Backdrop with { A = 0.78f });
        DrawRect(bg, p.Border, false, 1f);
        DrawString(font, new Vector2(bg.Position.X + 8, bg.Position.Y + s.Y + 1), text,
            HorizontalAlignment.Left, -1, size, p.Text);
    }
}