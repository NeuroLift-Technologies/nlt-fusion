using System;
using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;
using ControlLayoutPreset = Godot.Control.LayoutPreset;
using ControlMouseFilter = Godot.Control.MouseFilterEnum;
using ControlSizeFlags = Godot.Control.SizeFlags;

namespace NltWorldEngine.Observer;

/// <summary>
/// The observer: layout, reading level, transport controls and the accessibility surface.
///
/// Assembly, not policy. Every judgement about wording lives in the panels or in
/// <see cref="BurnoutNarrative"/>; every judgement about a value belongs to Fusion. This class owns
/// three things and nothing else — where the six panels sit, which reading level is active, and how
/// the observer scrubs through what it has already been shown.
///
/// Layout note: the 3D viewport is deliberately *not* a panel. It is the middle of the window with
/// the rails over it, and the spacer in the middle is click-through, so the camera keeps its
/// drag-to-orbit and wheel-to-zoom while the observer UI sits on top.
///
/// This is a <see cref="Control"/> rather than a <see cref="CanvasLayer"/>. The CanvasLayer version
/// laid out correctly and looked correct, but its buttons received no clicks at all — verified with
/// <c>--selftest</c>, which drives synthetic mouse events through the real hit-testing path and
/// counts the resulting <c>pressed</c> emissions. A full-rect Control in the ordinary canvas tree is
/// picked up without that question arising.
/// </summary>
public partial class ObserverRoot : Control
{
    public const string ReplayFixture = "res://fixtures/replay/stayalert-day.json";

    private readonly AccessibilitySettings _a11y = new();
    private readonly List<ObserverPanel> _panels = new();
    private readonly List<Control> _popups = new();

    private FeedTransport _feed = null!;
    private WorldView? _world;

    private ReadingLevel _level = ReadingLevel.Simple;

    private Control _root = null!;
    private Label _status = null!;
    private Label _position = null!;
    private Label _fixtureBadge = null!;
    private Button _playButton = null!;
    private HBoxContainer _speedRow = null!;
    private HBoxContainer _levelRow = null!;
    private PanelContainer _settingsPanel = null!;
    private PanelContainer _diagnosticsPanel = null!;
    private VBoxContainer _diagnosticsList = null!;
    private Button _diagnosticsButton = null!;

    /// <summary>Raised when the reading level changes, so panels can rebuild.</summary>
    public event System.Action? LevelChanged;

    /// <summary>Raised when reduced motion changes, so the world can honour it too.</summary>
    public event System.Action<bool>? ReducedMotionChanged;

    public AccessibilitySettings A11y => _a11y;

    public ReadingLevel Level => _level;

    public FeedTransport Feed => _feed;

    /// <summary>Attach the observer to a transport node and, optionally, the world it watches.</summary>
    public override void _Ready()
    {
        SetAnchorsAndOffsetsPreset(ControlLayoutPreset.FullRect);
        MouseFilter = ControlMouseFilter.Pass;
        if (_feed != null)
            Build();
    }

    /// <summary>Attach the observer to a transport node and, optionally, the world it watches.</summary>
    public void Attach(FeedTransport feed, WorldView? world)
    {
        _feed = feed;
        _world = world;
        if (IsInsideTree())
            Build();

        _feed.DocumentChanged += _ => RefreshAll();
        _feed.StatusChanged += RefreshStatus;
        _a11y.Changed += OnAccessibilityChanged;
        _feed.Load(ReplayFixture);
        RefreshAll();
        RefreshStatus();
    }

    // ------------------------------------------------------------------ layout

    private bool _built;

    private void Build()
    {
        if (_built)
            return;
        _built = true;

        // MouseFilter on these two matters more than it looks. MOUSE_FILTER_IGNORE does not merely
        // hide a control from the mouse — Godot skips its entire subtree during hit-testing, so an
        // IGNORE on the root or the column silently kills every button in the observer. PASS keeps
        // the containers clickable-through while still letting an unclaimed click reach the 3D
        // camera's own drag-to-orbit handling.
        _root = new Control { Name = "Surface", MouseFilter = ControlMouseFilter.Pass };
        _root.SetAnchorsAndOffsetsPreset(ControlLayoutPreset.FullRect);
        _root.Theme = BuildTheme();
        AddChild(_root);

        // A calm backdrop. The open world is a bright blockout, and a saturated sky behind dense text
        // is exactly the "analytics dashboard" the audience is meant not to have to parse.
        _root.AddChild(new ViewportScrim { Colour = _a11y.Palette.Backdrop with { A = 0.34f } });

        var column = Ui.Col(0);
        column.SetAnchorsAndOffsetsPreset(ControlLayoutPreset.FullRect);
        column.MouseFilter = ControlMouseFilter.Pass;
        _root.AddChild(column);

        column.AddChild(BuildTopBar());

        var middle = Ui.Row(10);
        middle.SizeFlagsVertical = ControlSizeFlags.ExpandFill;
        middle.MouseFilter = ControlMouseFilter.Pass;
        column.AddChild(middle);

        // Avatar State gets the larger share: it is the panel an observer reads first.
        var left = Ui.Col(10);
        left.CustomMinimumSize = new Vector2(392, 0);
        left.AddChild(Wire(new AvatarStatePanel(), 368, 0, 1.8f));
        left.AddChild(Wire(new IndependenceMeterPanel(), 368, 0, 1.0f));
        middle.AddChild(left);

        // The world shows through here. Click-through so the camera still works.
        var spacer = new Control { SizeFlagsHorizontal = ControlSizeFlags.ExpandFill, MouseFilter = ControlMouseFilter.Ignore };
        middle.AddChild(spacer);

        var right = Ui.Col(10);
        right.CustomMinimumSize = new Vector2(408, 0);
        right.AddChild(Wire(new FusionGatePanel(), 384, 0, 1.15f));
        right.AddChild(Wire(new AideLogPanel(), 384, 0, 1.0f));
        middle.AddChild(right);

        column.AddChild(BuildTimeline());
        column.AddChild(BuildTransport());

        _root.AddChild(BuildHud());
        _root.AddChild(BuildSettings());
        _root.AddChild(BuildDiagnostics());
    }

    private Theme BuildTheme()
    {
        var theme = new Theme();
        theme.DefaultFontSize = _a11y.Font(Ui.BodyFont);
        return theme;
    }

    private Control BuildTopBar()
    {
        var bar = Ui.Card(_a11y.Palette.Panel, _a11y.Palette.Border, 0, 8);
        bar.MouseFilter = ControlMouseFilter.Stop;

        var row = Ui.Row(10);

        var title = Ui.Heading("NLT World Engine — observer", _a11y.Palette.TextDim);
        title.VerticalAlignment = VerticalAlignment.Center;
        row.AddChild(title);

        _fixtureBadge = Ui.Heading("", _a11y.Palette.Warn);
        _fixtureBadge.VerticalAlignment = VerticalAlignment.Center;
        row.AddChild(_fixtureBadge);

        row.AddChild(new Control { SizeFlagsHorizontal = ControlSizeFlags.ExpandFill });

        // Reading level. Three states, always visible: the plan makes this the primary control.
        // Keys 1/2/3 as well, so it can be changed without aiming at a small target.
        _levelRow = Ui.InlineRow(2);
        var levelKeys = new[] { Key.Key1, Key.Key2, Key.Key3 };
        int levelIndex = 0;
        foreach (ReadingLevel lv in new[] { ReadingLevel.Simple, ReadingLevel.Coach, ReadingLevel.Technical })
        {
            var b = Ui.Toggle(lv.ToString(), lv == _level, _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
            var captured = lv;
            b.Pressed += () => SetLevel(captured);
            b.WithShortcut(levelKeys[levelIndex++]);
            _levelRow.AddChild(b);
        }
        row.AddChild(_levelRow);

        var settings = Ui.Flat("Options", _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        settings.TooltipText = "Display options — reduced motion, contrast, text size";
        settings.WithShortcut(Key.O);
        settings.Pressed += () => ToggleSettings();
        row.AddChild(settings);

        bar.AddChild(row);
        return bar;
    }

    /// <summary>
    /// Register a panel and give it the rail's width and a share of the height.
    ///
    /// No wrapper container: the panel scrolls its own body (see ObserverPanel.Build), so wrapping
    /// it again would make the panel's content height become the rail's minimum height and push the
    /// whole layout off the bottom of the window.
    /// </summary>
    private Control Wire(ObserverPanel panel, float width, float minHeight, float stretch = 1f)
    {
        panel.Bind(_feed, _a11y, _level);
        _panels.Add(panel);
        panel.CustomMinimumSize = new Vector2(width, minHeight);
        panel.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        panel.SizeFlagsVertical = ControlSizeFlags.ExpandFill;
        panel.SizeFlagsStretchRatio = stretch;
        return panel;
    }
    private Control BuildTimeline()
    {
        var panel = new LearningTimelinePanel();
        panel.Bind(_feed, _a11y, _level);
        _panels.Add(panel);
        panel.CustomMinimumSize = new Vector2(0, 240);
        panel.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        return panel;
    }

    private Control BuildTransport()
    {
        var bar = Ui.Card(_a11y.Palette.Panel, _a11y.Palette.Border, 0, 6);
        bar.MouseFilter = ControlMouseFilter.Stop;

        var row = Ui.Row(8);

        _playButton = Ui.Flat("❚❚  Pause", _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        _playButton.WithShortcut(Key.Space);
        _playButton.TooltipText = "Pause or resume the feed (Space)";
        _playButton.Pressed += () =>
        {
            _feed.TogglePlay();
            RefreshStatus();
        };
        row.AddChild(_playButton);

        AddTransportButton(row, "◀  Back", "Step back one document (Left arrow)", () =>
        {
            _feed.StepBack();
            RefreshStatus();
        }, Key.Left);
        AddTransportButton(row, "Next  ▶", "Step forward one document (Right arrow)", () =>
        {
            _feed.StepForward();
            RefreshStatus();
        }, Key.Right);
        AddTransportButton(row, "Live", "Follow the newest document (End)", () =>
        {
            _feed.GoLive();
            RefreshStatus();
        }, Key.End);
        AddTransportButton(row, "⟲  Replay", "Start the feed again from the first document (R)", () =>
        {
            _feed.Restart();
            RefreshStatus();
        }, Key.R);

        row.AddChild(Ui.Heading("speed", _a11y.Palette.TextMuted));
        _speedRow = Ui.InlineRow(2);
        var speedKeys = new[] { Key.F1, Key.F2, Key.F3, Key.F4 };
        int speedIndex = 0;
        foreach (float s in new[] { 0.5f, 1f, 2f, 4f })
        {
            float captured = s;
            var b = Ui.Toggle($"{s:0.#}×", Mathf.IsEqualApprox(s, _feed.Speed), _a11y.Font(Ui.TinyFont),
                _a11y.Palette.Text);
            b.TooltipText = $"Play the feed at {s:0.#}× its own rate";
            b.Pressed += () =>
            {
                _feed.Speed = captured;
                RefreshStatus();
            };
            b.WithShortcut(speedKeys[speedIndex++]);
            _speedRow.AddChild(b);
        }
        row.AddChild(_speedRow);

        row.AddChild(new Control { SizeFlagsHorizontal = ControlSizeFlags.ExpandFill });

        _position = Ui.Text("", _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        _position.VerticalAlignment = VerticalAlignment.Center;
        row.AddChild(_position);

        _status = Ui.Text("", _a11y.Font(Ui.TinyFont), _a11y.Palette.TextMuted);
        _status.VerticalAlignment = VerticalAlignment.Center;
        row.AddChild(_status);

        _diagnosticsButton = Ui.Flat("Diagnostics", _a11y.Font(Ui.TinyFont), _a11y.Palette.Warn);
        _diagnosticsButton.WithShortcut(Key.D);
        _diagnosticsButton.Pressed += () => ToggleDiagnostics();
        row.AddChild(_diagnosticsButton);

        bar.AddChild(row);
        return bar;
    }

    private void AddTransportButton(Container parent, string label, string tooltip, System.Action action,
                                   Key? shortcut = null)
    {
        var b = Ui.Flat(label, _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        b.TooltipText = tooltip;
        b.Pressed += action;
        if (shortcut.HasValue)
            b.WithShortcut(shortcut.Value);
        parent.AddChild(b);
    }

    private Control BuildHud()
    {
        var hud = new WorldViewHud
        {
            Feed = _feed,
            A11y = _a11y,
            World = _world,
        };
        return hud;
    }

    private Control BuildSettings()
    {
        _settingsPanel = Ui.Card(_a11y.Palette.PanelRaised, _a11y.Palette.Accent, 8, 14);
        _settingsPanel.Visible = false;
        _settingsPanel.MouseFilter = ControlMouseFilter.Stop;
        _settingsPanel.SetAnchorsPreset(ControlLayoutPreset.TopRight);
        _popups.Add(_settingsPanel);

        var col = Ui.Col(8);
        _settingsPanel.AddChild(col);

        col.AddChild(Ui.Heading("Display options", _a11y.Palette.Text));
        // Short lines on purpose: a Label here reports its full text width as a minimum, so a long
        // sentence makes the whole popup wider than the window and it opens off-screen — which looks
        // exactly like a dead button.
        col.AddChild(Ui.Inline("Motion, contrast and text size.",
            _a11y.Font(Ui.TinyFont), _a11y.Palette.TextDim));
        col.AddChild(Ui.Inline("Shapes and plain words are always on.",
            _a11y.Font(Ui.TinyFont), _a11y.Palette.TextMuted));

        var motion = Ui.Toggle("Reduced motion", _a11y.ReducedMotion, _a11y.Font(Ui.BodyFont), _a11y.Palette.Text);
        motion.Pressed += () =>
        {
            _a11y.ReducedMotion = motion.ButtonPressed;
            OnAccessibilityChanged();
        };
        col.AddChild(motion);

        var contrast = Ui.Toggle("High contrast", _a11y.HighContrast, _a11y.Font(Ui.BodyFont), _a11y.Palette.Text);
        contrast.Pressed += () =>
        {
            _a11y.HighContrast = contrast.ButtonPressed;
            OnAccessibilityChanged();
        };
        col.AddChild(contrast);

        var sizeRow = Ui.Row(8);
        sizeRow.AddChild(Ui.Text("Text size", _a11y.Font(Ui.BodyFont), _a11y.Palette.Text));
        var slider = new HSlider
        {
            MinValue = 0.85,
            MaxValue = 1.6,
            Step = 0.05,
            Value = _a11y.TextScale,
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            CustomMinimumSize = new Vector2(150, 20),
            FocusMode = Control.FocusModeEnum.All,
        };
        slider.ValueChanged += v => _a11y.TextScale = (float)v;
        sizeRow.AddChild(slider);
        col.AddChild(sizeRow);

        var close = Ui.Flat("Close", _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        close.Pressed += () => _settingsPanel.Visible = false;
        col.AddChild(close);

        return _settingsPanel;
    }

    private Control BuildDiagnostics()
    {
        _diagnosticsPanel = Ui.Card(_a11y.Palette.PanelRaised, _a11y.Palette.Warn, 8, 14);
        _diagnosticsPanel.Visible = false;
        _diagnosticsPanel.MouseFilter = ControlMouseFilter.Stop;
        _diagnosticsPanel.SetAnchorsPreset(ControlLayoutPreset.TopRight);
        _popups.Add(_diagnosticsPanel);

        var col = Ui.Col(6);
        _diagnosticsPanel.AddChild(col);
        col.AddChild(Ui.Heading("Feed diagnostics", _a11y.Palette.Warn));
        col.AddChild(Ui.Inline("Rejected documents are never rendered.",
            _a11y.Font(Ui.TinyFont), _a11y.Palette.TextDim));

        var scroll = new ScrollContainer
        {
            CustomMinimumSize = new Vector2(380, 120),
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
        };
        _diagnosticsList = Ui.Col(3);
        _diagnosticsList.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        scroll.AddChild(_diagnosticsList);
        col.AddChild(scroll);

        var close = Ui.Flat("Close", _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        close.Pressed += () => _diagnosticsPanel.Visible = false;
        col.AddChild(close);

        return _diagnosticsPanel;
    }

    // ----------------------------------------------------------------- behaviour

    /// <summary>Reading level, set programmatically (capture tooling) or by the top bar.</summary>
    public void SetReadingLevel(ReadingLevel level)
    {
        if (_levelRow == null || level == _level)
        {
            _level = level;
            return;
        }
        SetLevel(level);
    }

    private void SetLevel(ReadingLevel level)
    {
        _level = level;
        foreach (var child in _levelRow.GetChildren())
            if (child is Button b && b.ToggleMode)
                b.SetPressedNoSignal(b.Text == level.ToString());
        LevelChanged?.Invoke();

        // Panels hold their own copy of the reading level, handed to them at Bind time. Changing the
        // root's field is not enough — the first version set it and every panel kept rendering the
        // previous level.
        foreach (var p in _panels)
            p.Bind(_feed, _a11y, _level);
        RefreshAll();
    }

    private void ToggleSettings()
    {
        _settingsPanel.Visible = !_settingsPanel.Visible;
        if (_settingsPanel.Visible)
        {
            _diagnosticsPanel.Visible = false;
            CallDeferred(nameof(PlacePopups));
        }
    }

    private void ToggleDiagnostics()
    {
        _diagnosticsPanel.Visible = !_diagnosticsPanel.Visible;
        if (!_diagnosticsPanel.Visible)
            return;

        _settingsPanel.Visible = false;
        ClearChildren(_diagnosticsList);
        var warnings = _feed.Warnings;
        if (warnings.Count == 0)
        {
            _diagnosticsList.AddChild(Ui.Inline("No problems found while reading the feed.",
                A11y.Font(Ui.SmallFont), _a11y.Palette.TextDim));
        }
        foreach (var w in warnings)
            _diagnosticsList.AddChild(Ui.Paragraph(w, A11y.Font(Ui.TinyFont), _a11y.Palette.TextDim));
        _diagnosticsButton.Text = $"Diagnostics ({warnings.Count})";
        CallDeferred(nameof(PlacePopups));
    }

    /// <summary>
    /// Place a popup from its measured content size.
    ///
    /// They used to be positioned with a bare <c>Position</c> against a top-right anchor, which left
    /// them with a negative height: the panel "opened" and nothing appeared, which reads exactly like
    /// a dead button. Offsets are derived from the size the content actually needs.
    /// </summary>
    private void PlacePopup(Control panel, float top)
    {
        if (panel == null || !panel.IsVisibleInTree())
            return;
        // Fixed width rather than the content's minimum: a popup as wide as the window it sits in is
        // a popup that has swallowed the view it was meant to annotate.
        const float width = 420f;
        Vector2 s = panel.GetCombinedMinimumSize();
        float height = Math.Max(80f, Math.Min(s.Y, 320f));
        panel.OffsetLeft = -(width + 16f);
        panel.OffsetRight = -16f;
        panel.OffsetTop = top;
        panel.OffsetBottom = top + height;
    }

    private void PlacePopups()
    {
        if (_settingsPanel != null && _settingsPanel.Visible)
            PlacePopup(_settingsPanel, 52f);
        if (_diagnosticsPanel != null && _diagnosticsPanel.Visible)
            PlacePopup(_diagnosticsPanel, 52f);
    }

    /// <summary>
    /// Open both popups and report whether each lands on screen with a usable size. Verification
    /// hook for the observer self-test; it catches the "panel opens and shows nothing" class of bug,
    /// which is indistinguishable from a dead button to anyone clicking.
    /// </summary>
    public int CheckPopups(Vector2 viewport)
    {
        int problems = 0;
        foreach (var panel in _popups)
        {
            bool wasVisible = panel.Visible;
            panel.Visible = true;
            PlacePopup(panel, 52f);

            Vector2 s = panel.Size;
            if (s.X < 8f || s.Y < 8f)
            {
                GD.Print($"[selftest] FAIL  popup '{Name}' has size {s} — it would open invisible");
                problems++;
            }
            else if (panel.Position.X < 0f || panel.Position.X + s.X > viewport.X + 1f
                     || panel.Position.Y < 0f || panel.Position.Y + s.Y > viewport.Y + 1f)
            {
                GD.Print($"[selftest] FAIL  popup at {panel.Position} size {s} is off-screen "
                         + $"in a {viewport} window");
                problems++;
            }
            else
            {
                GD.Print($"[selftest] OK    popup at {panel.Position} size {s}");
            }

            panel.Visible = wasVisible;
        }
        return problems;
    }

    private void RefreshAll()
    {
        foreach (var p in _panels)
            p.Refresh();
        RefreshStatus();
    }

    private void RefreshStatus()
    {
        if (_status == null)
            return;

        _status.Text = _feed.Status;

        int total = _feed.Documents.Count;
        int at = _feed.Live ? total : _feed.Cursor + 1;
        _position.Text = total == 0 ? "no documents" : $"document {at} of {total}";

        bool fixture = _feed.IsFixture;
        _fixtureBadge.Text = fixture ? $"{_feed.Kind.ToUpperInvariant()} — NOT A LIVE SIMULATION" : "LIVE";
        _fixtureBadge.AddThemeColorOverride("font_color",
            fixture ? _a11y.Palette.Warn : _a11y.Palette.Pass);

        _playButton.Text = _feed.Paused ? "▶  Play" : "❚❚  Pause";
        foreach (var child in _speedRow.GetChildren())
            if (child is Button b && b.ToggleMode)
                b.SetPressedNoSignal(b.Text == $"{_feed.Speed:0.#}×");

        int warnings = _feed.Warnings.Count;
        _diagnosticsButton.Visible = warnings > 0 || _diagnosticsPanel.Visible;
        if (!_diagnosticsPanel.Visible)
            _diagnosticsButton.Text = warnings > 0 ? $"Diagnostics ({warnings})" : "Diagnostics";
    }

    private void OnAccessibilityChanged()
    {
        _root.Theme = BuildTheme();
        foreach (var p in _panels)
            p.Bind(_feed, _a11y, _level);

        // The sky is the one thing in the world that animates on its own. PR #80 gave WorldView a
        // SkyPaused seam for exactly this, so reduced motion is honoured outside the observer too.
        if (_world != null)
            _world.SkyPaused = _a11y.ReducedMotion;

        ReducedMotionChanged?.Invoke(_a11y.ReducedMotion);
        RefreshAll();
        RefreshStatus();
    }

    private static void ClearChildren(Node n)
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
}
