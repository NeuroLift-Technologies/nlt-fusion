using System;
using System.Collections.Generic;
using Godot;

namespace NltWorldEngine.Feed;

/// <summary>
/// Owns the state feed and the observer's transport controls: pause, resume, single-step, replay
/// and speed (RENDERER-PLAN.md D.4).
///
/// Two clocks, deliberately kept apart:
/// <list type="bullet">
/// <item><b>Feed time</b> — documents arriving from the source at the contract's ~1 Hz cadence.
/// This is the only clock that carries simulation truth.</item>
/// <item><b>Presentation</b> — this node's play state. Pausing or slowing the observer does not
/// change the feed; it changes how much of it the observer has chosen to look at. Stepping
/// backwards re-reads a document that already arrived; it never re-simulates anything.</item>
/// </list>
///
/// The renderer is not the source of truth for anything here. It reads documents and remembers
/// which ones it has seen.
/// </summary>
public partial class FeedTransport : Node
{
    public const float DefaultCadence = 1.0f;

    private IStateSource _source = new FixtureFeedSource();
    private readonly List<StateFeed> _frames = new();
    private readonly List<string> _warnings = new();
    private float _accum;
    private int _cursor = -1;
    private StateFeed? _raised;
    private int _raisedCursor = int.MinValue;

    /// <summary>Raised when the document being shown changes, for any reason.</summary>
    public event Action<StateFeed?>? DocumentChanged;

    /// <summary>Raised when a new document arrives, whether or not the cursor follows it.</summary>
    public event Action? DocumentReceived;

    /// <summary>Raised when the status line changes, e.g. at end of replay.</summary>
    public event Action? StatusChanged;

    public string Origin => _source.Origin;

    public string Kind => _source.Kind;

    public bool IsFixture => _source.IsFixture;

    /// <summary>Documents received this session, oldest first. The timeline's x-series.</summary>
    public IReadOnlyList<StateFeed> Documents => _frames;

    /// <summary>Diagnostics from reading and validating. Never fatal, always shown.</summary>
    public IReadOnlyList<string> Warnings => _warnings;

    /// <summary>Seconds between documents, before <see cref="Speed"/>.</summary>
    public float Cadence { get; set; } = DefaultCadence;

    /// <summary>Playback rate multiplier. 1 is the feed's own rate.</summary>
    public float Speed { get; set; } = 1f;

    public bool Paused { get; private set; }

    /// <summary>-1 follows the newest document. Otherwise an index into <see cref="Documents"/>.</summary>
    public int Cursor => _cursor;

    public bool Live => _cursor < 0;

    /// <summary>True once every document the source holds has been received.</summary>
    public bool AtEnd => _source.Count > 0 && _frames.Count >= _source.Count;

    public bool HasData => _frames.Count > 0;

    /// <summary>The document on show. Null before the first document arrives.</summary>
    public StateFeed? Current => Live
        ? (_frames.Count > 0 ? _frames[^1] : null)
        : (_cursor >= 0 && _cursor < _frames.Count ? _frames[_cursor] : null);

    /// <summary>The newest document received, whatever the cursor. "What is happening now."</summary>
    public StateFeed? Newest => _frames.Count > 0 ? _frames[^1] : null;

    /// <summary>True when the observer is showing a document other than the newest one.</summary>
    public bool ShowingHistory => !Live;

    public string Status
    {
        get
        {
            if (_source.Count == 0 && _warnings.Count > 0)
                return _warnings[0];
            if (!HasData)
                return "Waiting for state";
            string where = Live ? "live" : $"stepped to {_cursor + 1} of {_frames.Count}";
            string tail = AtEnd && Paused ? " · end of replay" : "";
            return $"{Origin} · {Kind} · {_frames.Count} document(s) · {where}{tail}";
        }
    }

    public void Load(string path)
    {
        _source = FixtureFeedSource.FromFile(path);
        _frames.Clear();
        _warnings.Clear();
        _warnings.AddRange(_source.LoadWarnings);
        _cursor = -1;
        _accum = 0f;
        Paused = false;
        _raised = null;
        Notify();
        StatusChanged?.Invoke();
    }

    public override void _Process(double delta)
    {
        if (Paused)
            return;

        _accum += (float)delta * MathF.Max(0.01f, Speed);
        float step = MathF.Max(0.016f, Cadence);
        int guard = 0;
        while (_accum >= step && guard++ < 512)
        {
            _accum -= step;
            if (!PullNext())
                break;
        }

        // Panels rebuild on a document change, not on every rendered frame: the feed is ~1 Hz and
        // the observer runs at display rate. Keeping that distinction in one place stops six panels
        // from each deciding for themselves.
        if (!ReferenceEquals(_raised, Current) || _raisedCursor != _cursor)
            Notify();
    }

    private void Notify()
    {
        _raised = Current;
        _raisedCursor = _cursor;
        DocumentChanged?.Invoke(_raised);
    }

    /// <summary>Receive the next document if there is one. False when the replay is exhausted.</summary>
    private bool PullNext()
    {
        if (AtEnd)
        {
            if (!Paused)
            {
                Paused = true;
                StatusChanged?.Invoke();
            }
            return false;
        }
        if (!_source.TryGet(_frames.Count, out var feed))
            return false;

        _frames.Add(feed);
        DocumentReceived?.Invoke();
        return true;
    }

    // ---- transport controls (D.4) ----

    public void TogglePlay()
    {
        // At the end of a replay, the play button restarts rather than sitting inert.
        if (AtEnd && Paused && Live)
        {
            Restart();
            return;
        }
        Paused = !Paused;
        StatusChanged?.Invoke();
    }

    public void SetPaused(bool paused)
    {
        Paused = paused;
        StatusChanged?.Invoke();
    }

    /// <summary>Advance one document. Pulls a new one only when the cursor was already live.</summary>
    public void StepForward()
    {
        Paused = true;

        // Scrubbed back into history: walk forward one document that has already arrived, rather
        // than pulling the next one off the source and jumping the cursor to it. Stepping forward
        // from history must land next door, not at the end of the recording.
        if (!Live)
        {
            _cursor = Math.Min(_cursor + 1, _frames.Count - 1);
            Notify();
            StatusChanged?.Invoke();
            return;
        }

        if (AtEnd)
        {
            Notify();
            return;
        }

        PullNext();
        _cursor = _frames.Count - 1;
        Notify();
        StatusChanged?.Invoke();
    }

    /// <summary>Go back one received document. Re-reads what already arrived; never re-simulates.</summary>
    public void StepBack()
    {
        Paused = true;
        if (_frames.Count == 0)
            return;
        int next = Live ? _frames.Count - 1 : _cursor - 1;
        _cursor = Math.Max(0, next);
        Notify();
        StatusChanged?.Invoke();
    }

    /// <summary>Scrub to an absolute index. Negative means follow the newest document.</summary>
    public void Seek(int index)
    {
        if (_frames.Count == 0)
            return;
        _cursor = index < 0 ? -1 : Math.Clamp(index, 0, _frames.Count - 1);
        Notify();
        StatusChanged?.Invoke();
    }

    /// <summary>Jump back to following the newest document.</summary>
    public void GoLive()
    {
        _cursor = -1;
        Notify();
        StatusChanged?.Invoke();
    }

    /// <summary>Replay from the first document.</summary>
    public void Restart()
    {
        _frames.Clear();
        _cursor = -1;
        _accum = 0f;
        Paused = false;
        _raised = null;
        Notify();
        StatusChanged?.Invoke();
    }

    // ---- convenience for the panels ----

    /// <summary>The avatar this observer is following: the first avatar in the document.</summary>
    public static AgentState? PrimaryAvatar(StateFeed? feed)
    {
        if (feed == null)
            return null;
        foreach (var a in feed.Agents)
            if (a.IsAvatar())
                return a;
        return feed.Agents.Count > 0 ? feed.Agents[0] : null;
    }

    public static AgentState? AideOf(StateFeed? feed, AgentState? avatar)
    {
        if (feed == null)
            return null;
        foreach (var a in feed.Agents)
            if (a.IsAide())
                return a;
        // Fall back to the pair's aideId so the log still has an owner if roles are ever odd.
        if (avatar != null)
        {
            var pair = feed.PairFor(avatar.Id);
            if (pair != null)
                return feed.Agent(pair.AideId);
        }
        return null;
    }

    public static PairState? PrimaryPair(StateFeed? feed, AgentState? avatar)
    {
        if (feed == null)
            return null;
        if (avatar != null)
        {
            var p = feed.PairFor(avatar.Id);
            if (p != null)
                return p;
        }
        return feed.Pairs.Count > 0 ? feed.Pairs[0] : null;
    }
}