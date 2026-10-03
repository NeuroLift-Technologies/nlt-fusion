using System;
using System.Collections.Generic;
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
/// The viewport itself belongs to <c>WorldView</c>; this is the observer's reading of it — a HUD
/// that names the scene, pins each agent where the feed says it is, and shows what state that
/// agent is in. It adds no geometry to the 3D scene.
///
/// The reason the pins are drawn here rather than as <c>Label3D</c> in the world is sequencing:
/// RENDERER-PLAN.md B.2 and B.4 (articulated residents, <c>Label3D</c> name labels) are blocked
/// behind GRAPH-001's G1 decisions on character assets, so building them now would either guess at
/// an art pipeline or stall. Screen-space pins need nothing but a camera and the position already
/// on the feed, and they leave B.2/B.4 free to land on its own terms.
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
    /// Vertical extent of the free middle band, mirrored from <see cref="ObserverRoot"/>: below the
    /// top bar, above the timeline. Pins are kept inside it so a tag never lands on top of a panel
    /// and reads as part of that panel's data.
    /// </summary>
    private const float TopBarHeight = 44f;
    private const float BottomBandHeight = 300f;

    private const float LeftRailWidth = 392f;
    private const float RightRailWidth = 408f;

    public override void _Draw()
    {
        if (_a11y == null || _feed == null)
            return;

        var p = _a11y.Palette;
        var font = ThemeDB.FallbackFont;
        var doc = _feed.Current;
        var camera = _world?.Camera;
        var viewport = GetViewportRect().Size;

        DrawSceneStrip(font, p, doc, viewport);
        if (doc == null || camera == null)
            return;

        // Agents stand a metre or two apart and the camera is tens of metres out, so two pins
        // routinely project onto the same few pixels. Nudge overlapping pins apart vertically
        // instead of dropping one: a missing pin reads as "there is no agent there".
        var placed = new List<Rect2>();
        foreach (var agent in doc.Agents)
            DrawAgent(font, p, camera, agent, doc.Tick, viewport, placed);
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

    private void DrawAgent(Font font, Palette p, Camera3D camera, AgentState agent, int tick,
                           Vector2 viewport, List<Rect2> placed)
    {
        var world = agent.Position3();
        if (camera.IsPositionBehind(world))
            return;

        Vector2 screen = camera.UnprojectPosition(world);
        if (screen.X < -80 || screen.Y < -40 || screen.X > viewport.X + 80 || screen.Y > viewport.Y + 40)
            return;

        var colour = PlainLanguage.StateColour(p, agent.State);
        int nameSize = _a11y.Font(Ui.BodyFont);
        int stateSize = _a11y.Font(Ui.TinyFont);

        string name = agent.Name;
        string state = PlainLanguage.StateWord(agent.State);
        string held = $"{agent.TicksInState(tick)}s in state";
        var nameSizeV = font.GetStringSize(name, HorizontalAlignment.Left, -1, nameSize);
        var stateSizeV = font.GetStringSize(state, HorizontalAlignment.Left, -1, stateSize);
        var heldSizeV = font.GetStringSize(held, HorizontalAlignment.Left, -1, stateSize);

        float boxW = Math.Max(Math.Max(nameSizeV.X, stateSizeV.X + 14f + heldSizeV.X), 110f) + 34f;
        float boxH = nameSizeV.Y + stateSizeV.Y + 12f;
        var anchor = new Vector2(screen.X - boxW * 0.5f, screen.Y - boxH - 18f);
        float minX = Math.Min(LeftRailWidth + 8f, Math.Max(8f, viewport.X * 0.5f));
        float maxX = Math.Max(minX, viewport.X - RightRailWidth - boxW - 8f);
        anchor.X = Math.Clamp(anchor.X, minX, maxX);
        float minY = TopBarHeight + 44f;
        float maxY = Math.Max(minY, viewport.Y - BottomBandHeight - boxH - 8f);
        anchor.Y = Math.Clamp(anchor.Y, minY, maxY);

        var box = new Rect2(anchor, new Vector2(boxW, boxH));
        foreach (var other in placed)
        {
            if (!box.Intersects(other))
                continue;

            // Two agents a metre apart project to the same few pixels from this distance. Prefer
            // stacking; if there is no vertical room left inside the free band, step sideways rather
            // than let one tag sit on top of another.
            if (other.End.Y + 5f + boxH <= maxY)
            {
                anchor.Y = other.End.Y + 5f;
            }
            else
            {
                anchor.X = Math.Clamp(other.End.X + 6f, minX, maxX);
                anchor.Y = Math.Min(anchor.Y, other.Position.Y - boxH - 5f);
            }
            box = new Rect2(anchor, box.Size);
        }
        placed.Add(box);

        DrawCircle(new Vector2(screen.X, screen.Y), 3f, colour);
        DrawLine(new Vector2(screen.X, screen.Y), box.Position + new Vector2(boxW * 0.5f, boxH),
            colour with { A = 0.55f }, 1f);

        DrawRect(box, p.Backdrop with { A = 0.82f });
        DrawRect(box, colour, false, 1f);

        Ui.DrawGlyph(this, PlainLanguage.StateGlyph(agent.State),
            box.Position + new Vector2(11f, nameSizeV.Y * 0.5f + 5f), 5f, colour, p.Backdrop);
        DrawString(font, box.Position + new Vector2(22f, nameSizeV.Y * 0.5f + 5f + nameSizeV.Y * 0.35f),
            name, HorizontalAlignment.Left, -1, nameSize, p.Text);
        DrawString(font, box.Position + new Vector2(22f, nameSizeV.Y + stateSizeV.Y * 0.95f),
            state, HorizontalAlignment.Left, -1, stateSize, colour);
        DrawString(font, box.Position + new Vector2(boxW - heldSizeV.X - 7f,
            nameSizeV.Y + stateSizeV.Y * 0.95f), held, HorizontalAlignment.Left, -1, stateSize, p.TextMuted);

        if (agent.Burnout)
        {
            DrawString(font, box.Position + new Vector2(22f + stateSizeV.X + 8f,
                nameSizeV.Y + stateSizeV.Y * 0.95f), "/ in burnout", HorizontalAlignment.Left, -1,
                stateSize, p.Alert);
        }
    }
}