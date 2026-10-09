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
    private Button _focusButton = null!;
    private OptionButton _followTargetPicker = null!;
    private HBoxContainer _speedRow = null!;
    private HBoxContainer _levelRow = null!;
    private PanelContainer _settingsPanel = null!;
    private PanelContainer _diagnosticsPanel = null!;
    private VBoxContainer _diagnosticsList = null!;
    private Button _diagnosticsButton = null!;

    // Held so the reading level can decide how much of the observer exists at once. The world view is
    // the middle of the window (see the layout note above), so it is the only region that grows when
    // panels step aside — which is the point of the arrangement.
    private AvatarStatePanel _avatarState = null!;
    private IndependenceMeterPanel _independence = null!;
    private FusionGatePanel _fusionGate = null!;
    private AideLogPanel _aideLog = null!;
    private LearningTimelinePanel _timeline = null!;
    private VBoxContainer _leftRail = null!;
    private VBoxContainer _rightRail = null!;

    // The three regions are split containers rather than fixed columns, so the observer can be
    // resized by dragging an edge. Nested two-child splits because a SplitContainer only tracks one
    // offset of its own; with three children the second divider would be pinned to the middle child's
    // minimum size and could not be dragged independently.
    private VSplitContainer _vSplit = null!;
    private HSplitContainer _leftSplit = null!;
    private HSplitContainer _rightSplit = null!;

    // What the reading level asked for, kept apart from what the dividers currently are, so a resize
    // and a level change are the same kind of operation.
    private int _railTarget = 392;
    private int _timelineTarget = 116;

    // A floor, not a fixed width, is what makes the drag possible: the reading level picks a starting
    // size and the observer is free to disagree with it. These are the limits a drag cannot pass.
    private const float RailFloor = 224f;
    private const int RailStep = 24;
    private const float TimelineFloor = 72f;
    private const float TimelineCeiling = 420f;
    private const int TimelineStep = 16;

    /// <summary>Raised when the reading level changes, so panels can rebuild.</summary>
    public event System.Action? LevelChanged;

    /// <summary>Raised when reduced motion changes, so the world can honour it too.</summary>
    public event System.Action<bool>? ReducedMotionChanged;

    /// <summary>
    /// Raised when the observer asks the camera to focus/follow the agent on show. The observer reads
    /// the world, it never drives it (see <see cref="WorldView.Camera"/>), so this only raises the
    /// request; the composition root decides and reports back through <see cref="SetFocusActive"/>.
    /// </summary>
    public event System.Action? FocusRequested;

    /// <summary>Raised when the selected camera-follow target changes; empty means the default feed avatar.</summary>
    public event System.Action<string>? FollowTargetChanged;

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

        // Apply the world-side accessibility state up front, not only on the first change. PR #80
        // gave WorldView a SkyPaused seam for reduced motion; if the setting starts on, the sky has
        // to be paused before anything can toggle it.
        if (_world != null)
        {
            _world.SkyPaused = _a11y.ReducedMotion;
            _world.ReducedMotion = _a11y.ReducedMotion;
        }

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

        // Avatar State gets the larger share: it is the panel an observer reads first.
        _avatarState = new AvatarStatePanel();
        _independence = new IndependenceMeterPanel();
        _leftRail = Ui.Col(10);
        _leftRail.AddChild(Wire(_avatarState, 0, 0, 1.8f));
        _leftRail.AddChild(Wire(_independence, 0, 0, 1.0f));

        _fusionGate = new FusionGatePanel();
        _aideLog = new AideLogPanel();
        _rightRail = Ui.Col(10);
        _rightRail.AddChild(Wire(_fusionGate, 0, 0, 1.15f));
        _rightRail.AddChild(Wire(_aideLog, 0, 0, 1.0f));

        // The world shows through the middle of this, so the camera still works. Click-through.
        var spacer = new Control { SizeFlagsHorizontal = ControlSizeFlags.ExpandFill, MouseFilter = ControlMouseFilter.Ignore };

        _rightSplit = new HSplitContainer
        {
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            SizeFlagsVertical = ControlSizeFlags.ExpandFill,
        };
        _rightSplit.AddChild(spacer);
        _rightSplit.AddChild(_rightRail);

        _leftSplit = new HSplitContainer
        {
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            SizeFlagsVertical = ControlSizeFlags.ExpandFill,
        };
        _leftSplit.AddChild(_leftRail);
        _leftSplit.AddChild(_rightSplit);

        _vSplit = new VSplitContainer
        {
            SizeFlagsHorizontal = ControlSizeFlags.ExpandFill,
            SizeFlagsVertical = ControlSizeFlags.ExpandFill,
        };
        _vSplit.AddChild(_leftSplit);
        _vSplit.AddChild(BuildTimeline());

        column.AddChild(_vSplit);
        column.AddChild(BuildTransport());

        _root.AddChild(BuildHud());
        _root.AddChild(BuildSettings());
        _root.AddChild(BuildDiagnostics());

        ApplyDensity();
    }

    /// <summary>
    /// Resize from the keyboard, because a drag handle is a small target and the mouse is not the only
    /// way in — the same rule every shortcut in this observer already follows.
    ///
    /// <c>,</c> and <c>.</c> move the left rail; Up and Down move the timeline. The arrow keys for the
    /// feed are Left and Right, so these two are free.
    /// </summary>
    public override void _UnhandledKeyInput(InputEvent @event)
    {
        if (_vSplit == null || @event is not InputEventKey { Pressed: true, Echo: false } k)
            return;

        switch (k.Keycode)
        {
            case Key.Comma:
                SetRailWidth(_railTarget - RailStep);
                break;
            case Key.Period:
                SetRailWidth(_railTarget + RailStep);
                break;
            case Key.Up:
                SetTimelineHeight(_timelineTarget + TimelineStep);
                break;
            case Key.Down:
                SetTimelineHeight(_timelineTarget - TimelineStep);
                break;
            default:
                return;
        }
        AcceptEvent();
    }

    // Deferred passes left to converge the dividers (see RequestSplits).
    private int _splitsSettle;

    /// <summary>
    /// Place a two-child split's divider so its first child is <paramref name="target"/> pixels along
    /// the split axis.
    ///
    /// <para>
    /// <c>SplitOffsets</c> is not an absolute divider position in this build, whatever the name
    /// suggests: the first child moves 1:1 with the offset, but the offset is measured from the
    /// container's middle (<c>first = size/2 − halfSeparation + offset</c>). Writing the raw target is
    /// what put the Avatar State rail at 962px where 392 was asked for, leaving the world a 178px
    /// sliver. Rather than bake that formula in, nudge the current offset by however far the child is
    /// from where it should be; the 1:1 relationship lands it on the target whatever the container's
    /// size, and it settles in a frame.
    /// </para>
    /// </summary>
    private static void SetSplit(SplitContainer split, int target, bool horizontal)
    {
        var offsets = split.SplitOffsets;
        if (offsets.Length == 0)
            return;
        var first = split.GetChild(0) as Control;
        float current = first == null ? 0f : horizontal ? first.Size.X : first.Size.Y;
        offsets[0] += (int)Math.Round(target - current);
        split.SplitOffsets = offsets;
    }

    /// <summary>
    /// Re-place the dividers over the next few frames.
    ///
    /// More than one pass because the first can run before the splits are laid out, when every first
    /// child still reads zero and the delta is meaningless. Once the children reach their targets the
    /// delta is zero, so the extra passes cost nothing.
    /// </summary>
    private void RequestSplits()
    {
        _splitsSettle = 6;
        CallDeferred(nameof(ApplySplits));
    }

    /// <summary>Widen or narrow the left rail, holding the floor and the world view's share.</summary>
    private void SetRailWidth(int width)
    {
        int ceiling = (int)Mathf.Max(RailFloor, Size.X * 0.5f);
        _railTarget = (int)Mathf.Clamp(width, (int)RailFloor, ceiling);
        RequestSplits();
    }

    /// <summary>
    /// Grow or shrink the timeline. Up makes it taller, which is the direction the divider travels.
    /// </summary>
    private void SetTimelineHeight(int height)
    {
        int ceiling = (int)Mathf.Min(TimelineCeiling, Size.Y * 0.6f);
        _timelineTarget = (int)Mathf.Clamp(height, (int)TimelineFloor, ceiling);
        RequestSplits();
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
        _timeline = new LearningTimelinePanel();
        _timeline.Bind(_feed, _a11y, _level);
        _panels.Add(_timeline);
        _timeline.CustomMinimumSize = new Vector2(0, 240);
        _timeline.SizeFlagsHorizontal = ControlSizeFlags.ExpandFill;
        return _timeline;
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
        // "Latest", not "Live": the badge beside it uses LIVE to mean a real simulation rather than a
        // replay, so a button called "Live" sat next to the words "NOT A LIVE SIMULATION".
        AddTransportButton(row, "Latest", "Jump to the newest document (End)", () =>
        {
            _feed.GoLive();
            RefreshStatus();
        }, Key.End);
        AddTransportButton(row, "⟲  Replay", "Start the feed again from the first document (R)", () =>
        {
            _feed.Restart();
            RefreshStatus();
        }, Key.R);

        // Focus: keep the camera on the agent the feed is showing. The World View is otherwise pinned
        // on the settlement and the agent walks off-frame, so the region that should answer "where is
        // the agent" shows none of it. A toggle, so the pressed state and the wording both say whether
        // following is on — colour is never the only channel.
        _focusButton = Ui.Toggle("◎  Focus", false, _a11y.Font(Ui.SmallFont), _a11y.Palette.Text);
        _focusButton.TooltipText = "Follow the selected target (F). Pan with WASD or arrow keys.";
        _focusButton.WithShortcut(Key.F);
        _focusButton.Pressed += () => FocusRequested?.Invoke();
        row.AddChild(_focusButton);

        _followTargetPicker = new OptionButton
        {
            CustomMinimumSize = new Vector2(130, 0),
            SizeFlagsHorizontal = ControlSizeFlags.ShrinkBegin,
        };
        _followTargetPicker.TooltipText = "Choose which resident or live avatar the camera follows";
        _followTargetPicker.ItemSelected += OnFollowTargetSelected;
        row.AddChild(_followTargetPicker);

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
        col.AddChild(Ui.Inline("Panels resize: drag an edge, or use , . and Up Down.",
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
        ApplyDensity();
        RefreshAll();
    }

    /// <summary>
    /// Reading level decides how much of the observer is on screen at once, not only how deep the
    /// wording goes.
    ///
    /// Every panel already re-renders its text per level. This decides which of them *exist*. Six
    /// panels either side of the world view plus a four-lane timeline is a lot of simultaneous
    /// information for the audience this is built for, and it left the world view — the only surface
    /// showing *where* the agent is and *what* surrounds it — about a quarter of the window.
    ///
    /// Stepping panels aside as the level drops gives that region the room, and it is the largest
    /// region at every level. Widths run the other way from depth on purpose: <c>Simple</c> keeps one
    /// panel at full width, while <c>Technical</c> tightens the rails to fit everything, because the
    /// level asking for everything is the one that has already accepted density.
    /// </summary>
    private void ApplyDensity()
    {
        if (_leftSplit == null)
            return;

        int leftWidth, timelineHeight;
        bool full = _level > ReadingLevel.Simple;

        // Widths run the other way from depth on purpose: Simple keeps one panel generously sized,
        // while Technical tightens the rails to fit everything, because the level asking for
        // everything is the one that has already accepted density.
        if (_level == ReadingLevel.Simple)
        {
            leftWidth = 392;
            timelineHeight = 116;
        }
        else if (_level == ReadingLevel.Coach)
        {
            leftWidth = 300;
            timelineHeight = 208;
        }
        else
        {
            leftWidth = 336;
            timelineHeight = 288;
        }

        _independence.Visible = full;
        _fusionGate.Visible = full;
        _aideLog.Visible = full;
        _rightRail.Visible = full;

        // Floors, not widths: the split offsets below are what actually size the regions, so a drag
        // can move them freely. Setting a panel's minimum to its target width would pin the divider
        // shut and make the whole arrangement unresizable.
        int floor = full ? (int)RailFloor : (int)RailFloor + 144;
        _avatarState.CustomMinimumSize = new Vector2(floor, 0);
        _independence.CustomMinimumSize = new Vector2(floor, 0);
        _fusionGate.CustomMinimumSize = new Vector2(RailFloor, 0);
        _aideLog.CustomMinimumSize = new Vector2(RailFloor, 0);
        _leftRail.CustomMinimumSize = new Vector2(floor + 24, 0);
        _rightRail.CustomMinimumSize = new Vector2(RailFloor + 24, 0);

        _railTarget = leftWidth;
        _timelineTarget = timelineHeight;

        // Deferred, not immediate: the reading level is set during Build, before the control has a
        // laid-out size. Dividers are computed from Size, so asking for them here clamps everything
        // against a zero rectangle and the layout collapses on the first frame.
        RequestSplits();
    }

    /// <summary>
    /// Place the three dividers from the control's current size.
    ///
    /// Runs deferred after Build and again whenever the window resizes, because both split offsets are
    /// derived from <see cref="Control.Size"/>: the rails are a share of the width, and the world band
    /// is whatever is left after the timeline takes its height.
    /// </summary>
    private void ApplySplits()
    {
        if (_leftSplit == null || Size.X < 1f || Size.Y < 1f)
            return;

        // Clamped and placed directly rather than through SetRailWidth: that setter calls back into
        // here, and the two calling each other recursed until the stack overflowed.
        int railCeiling = (int)Mathf.Max(RailFloor, Size.X * 0.5f);
        SetSplit(_leftSplit, (int)Mathf.Clamp(_railTarget, (int)RailFloor, railCeiling), true);

        SetSplit(_rightSplit, _level > ReadingLevel.Simple
            ? Mathf.Max((int)RailFloor, (int)Size.X - _railTarget - (int)RailFloor - 72)
            : Mathf.Max(200, (int)Size.X - _railTarget - 24), true);

        // The world band is the *first* child of the vertical split, so its offset is the band itself.
        // Asking for "timeline height" here would size the world view to that number instead.
        SetSplit(_vSplit, (int)Size.Y - _timelineTarget, false);

        // Re-run for a few frames until the children stop moving (see RequestSplits).
        if (_splitsSettle-- > 0)
            CallDeferred(nameof(ApplySplits));
    }

    public override void _Notification(int what)
    {
        // 34 is NOTIFICATION_RESIZED. Re-place the dividers when the window changes size, or the
        // rails keep the width they had at the old size and the world view absorbs the difference.
        if (what == 34 && _leftSplit != null)
            RequestSplits();
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

    private void OnFollowTargetSelected(long index)
    {
        if (_followTargetPicker == null || index < 0 || index >= _followTargetPicker.ItemCount)
            return;
        FollowTargetChanged?.Invoke(_followTargetPicker.GetItemMetadata((int)index).AsString());
    }

    /// <summary>Rebuild the follow selector from the currently displayed document.</summary>
    public void SetFollowTargets(IReadOnlyList<AgentState> agents, string selectedId, bool includeLocalAvatar)
    {
        if (_followTargetPicker == null)
            return;

        _followTargetPicker.ItemSelected -= OnFollowTargetSelected;
        _followTargetPicker.Clear();
        if (includeLocalAvatar)
        {
            _followTargetPicker.AddItem("Local avatar");
            _followTargetPicker.SetItemMetadata(_followTargetPicker.ItemCount - 1, "__local_avatar__");
        }
        foreach (AgentState agent in agents)
        {
            _followTargetPicker.AddItem(agent.Name);
            _followTargetPicker.SetItemMetadata(_followTargetPicker.ItemCount - 1, agent.Id);
        }
        _followTargetPicker.AddItem("World view (no follow)");
        _followTargetPicker.SetItemMetadata(_followTargetPicker.ItemCount - 1, "__none__");

        string lookupId = string.IsNullOrEmpty(selectedId) ? "__none__" : selectedId;
        int selectedIndex = 0;
        for (int i = 0; i < _followTargetPicker.ItemCount; i++)
        {
            if (_followTargetPicker.GetItemMetadata(i).AsString() == lookupId)
            {
                selectedIndex = i;
                break;
            }
        }
        if (_followTargetPicker.ItemCount > 0)
            _followTargetPicker.Select(selectedIndex);
        _followTargetPicker.Disabled = _followTargetPicker.ItemCount == 0;
        _followTargetPicker.ItemSelected += OnFollowTargetSelected;
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

    /// <summary>
    /// Reflect the world's follow state on the Focus button. Called by the composition root once it has
    /// acted on <see cref="FocusRequested"/> — the observer does not move the camera itself.
    /// </summary>
    public void SetFocusTarget(string selectedId)
    {
        if (_followTargetPicker == null)
            return;
        for (int i = 0; i < _followTargetPicker.ItemCount; i++)
        {
            if (_followTargetPicker.GetItemMetadata(i).AsString() == selectedId)
            {
                _followTargetPicker.Select(i);
                return;
            }
        }
    }

    public void SetFocusActive(bool on)
    {
        if (_focusButton == null)
            return;
        _focusButton.SetPressedNoSignal(on);
        _focusButton.Text = on ? "◎  Following" : "◎  Focus";
    }

    private void OnAccessibilityChanged()
    {
        _root.Theme = BuildTheme();
        foreach (var p in _panels)
            p.Bind(_feed, _a11y, _level);

        // The sky is the one thing in the world that animates on its own. PR #80 gave WorldView a
        // SkyPaused seam for exactly this, so reduced motion is honoured outside the observer too.
        if (_world != null)
        {
            _world.SkyPaused = _a11y.ReducedMotion;
            _world.ReducedMotion = _a11y.ReducedMotion;
        }

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
