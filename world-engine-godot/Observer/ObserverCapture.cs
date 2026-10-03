using System;
using System.Collections.Generic;
using Godot;

namespace NltWorldEngine.Observer;

/// <summary>
/// Offscreen capture, for evidence rather than for the app.
///
/// Phase D is a visual deliverable, and "the panels compile" is not verification — the plan's own
/// history is a run of claims that turned out to be untrue when someone actually looked. This node
/// makes looking cheap and repeatable: run the project with a capture flag, get a PNG of the real
/// rendered observer at a chosen reading level.
///
/// It is inert unless the flag is present, and it never runs in normal play:
///
/// <code>
/// Godot_v4.7.2-stable_mono_win64.exe --path world-engine-godot -- --capture out.png --level technical
/// </code>
///
/// Args are read from <c>OS.GetCmdlineUserArgs()</c>, i.e. after a bare <c>--</c>, so the engine's
/// own switches are untouched.
/// </summary>
public partial class ObserverCapture : Node
{
    private string _path = "";
    private ReadingLevel _level = ReadingLevel.Simple;
    private int _frames = 90;
    private int _seen;
    private bool _done;
    private bool _selfTest;

    public static ObserverCapture? TryCreate(Node parent)
    {
        var args = OS.GetCmdlineUserArgs();
        bool selfTest = System.Array.IndexOf(args, "--selftest") >= 0;
        if (System.Array.IndexOf(args, "--capture") < 0 && !selfTest)
            return null;

        var capture = new ObserverCapture { Name = "ObserverCapture", _selfTest = selfTest };
        int at = System.Array.IndexOf(args, "--capture");
        if (at + 1 < args.Length)
            capture._path = args[at + 1];

        int levelAt = System.Array.IndexOf(args, "--level");
        if (levelAt + 1 < args.Length
            && System.Enum.TryParse<ReadingLevel>(args[levelAt + 1], out var parsed))
            capture._level = parsed;

        int framesAt = System.Array.IndexOf(args, "--frames");
        if (framesAt + 1 < args.Length && int.TryParse(args[framesAt + 1], out int f))
            capture._frames = Math.Max(1, f);

        parent.AddChild(capture);
        return capture;
    }

    /// <summary>Reading level to show, applied once the observer exists.</summary>
    public ReadingLevel RequestedLevel => _level;

    public override void _Ready()
    {
        if (_path.Length == 0 && !_selfTest)
        {
            GD.PushWarning("ObserverCapture: --capture given with no path; ignoring.");
            QueueFree();
        }
    }

    public override void _Process(double delta)
    {
        if (_done)
            return;
        if (++_seen < _frames)
            return;

        _done = true;
        if (_selfTest)
            SelfTest();
        else
            Save();
    }

    /// <summary>
    /// Assert the observer's layout invariants and report which controls have a non-mouse path.
    ///
    /// <para>
    /// It deliberately does <b>not</b> claim to test clicking. Synthetic mouse events do not reach
    /// Godot's GUI in this environment: a bare probe <c>Button</c> added outside the observer is
    /// equally unclickable, which means a click-based result says nothing about the observer and
    /// would be a false negative. Click behaviour is verified by a person; what is checked here is
    /// everything a machine can check honestly.
    /// </para>
    /// </summary>
    private void SelfTest()
    {
        var buttons = new System.Collections.Generic.List<Button>();
        Collect(GetTree().Root, buttons);
        Vector2 viewport = GetViewport().GetVisibleRect().Size;

        int problems = 0;
        int withoutShortcut = 0;

        foreach (var b in buttons)
        {
            if (!b.IsVisibleInTree())
                continue;

            Rect2 r = b.GetGlobalRect();
            if (r.Size.X < 4f || r.Size.Y < 4f)
            {
                problems++;
                GD.Print($"[selftest] FAIL  '{b.Text}' has no usable size ({r.Size})");
            }
            else if (r.Position.X < -1f || r.Position.Y < -1f
                     || r.End.X > viewport.X + 1f || r.End.Y > viewport.Y + 1f)
            {
                problems++;
                GD.Print($"[selftest] FAIL  '{b.Text}' sits outside the window: {r} in {viewport}");
            }

            if (b.Shortcut == null)
            {
                withoutShortcut++;
                GD.Print($"[selftest] WARN  '{b.Text}' has no keyboard shortcut");
            }
        }

        // The popup bug this replaced: a panel "opened" with a negative height and was invisible,
        // which reads as a dead button.
        var observer = FindObserver(GetTree().Root);
        if (observer == null)
        {
            GD.Print("[selftest] FAIL  ObserverRoot not found in the tree");
            problems++;
        }
        else
        {
            problems += observer.CheckPopups(viewport);
        }

        GD.Print($"[selftest] {buttons.Count} control(s); {withoutShortcut} without a keyboard shortcut");
        GD.Print($"[selftest] {(problems == 0 ? "LAYOUT OK" : problems + " LAYOUT PROBLEM(S)")}");
        GetTree().Quit(problems == 0 ? 0 : 1);
    }

    private static ObserverRoot? FindObserver(Node n)
    {
        foreach (var c in n.GetChildren())
        {
            if (c is ObserverRoot o)
                return o;
            var found = FindObserver(c);
            if (found != null)
                return found;
        }
        return null;
    }

    private static void Collect(Node n, System.Collections.Generic.List<Button> into)
    {
        foreach (var c in n.GetChildren())
        {
            if (c is Button b)
                into.Add(b);
            Collect(c, into);
        }
    }

    private async void Save()
    {
        // Wait for the frame to reach the screen, otherwise the texture read comes back empty.
        await ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw);

        var viewport = GetViewport();
        if (viewport == null)
        {
            GD.PushError("ObserverCapture: no viewport to capture.");
            GetTree().Quit(1);
            return;
        }

        var image = viewport.GetTexture()?.GetImage();
        if (image == null)
        {
            GD.PushError("ObserverCapture: viewport has no image.");
            GetTree().Quit(1);
            return;
        }

        string target = ProjectSettings.GlobalizePath(_path);
        var err = image.SavePng(target);
        if (err != Error.Ok)
        {
            GD.PushError($"ObserverCapture: could not write {target}: {err}");
            GetTree().Quit(1);
            return;
        }

        GD.Print($"ObserverCapture: wrote {target} ({image.GetWidth()}x{image.GetHeight()}) "
                 + $"at reading level {_level}");
        GetTree().Quit(0);
    }
}