using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Godot;

namespace NltWorldEngine.Feed;

/// <summary>
/// A read-only, randomly-addressable sequence of validated state-feed documents.
///
/// Random access rather than a pull stream, because the observer needs step-through and replay
/// (D.4): addressing by index makes "go to frame N" a lookup instead of a rewind.
///
/// Transport is deliberately undecided (contract §10). The fixture source is what exists today;
/// a live socket or file-polled source implements this same interface and nothing downstream
/// changes. The renderer only ever reads.
/// </summary>
public interface IStateSource
{
    /// <summary>Short provenance label for the observer's status strip, e.g. a file name.</summary>
    string Origin { get; }

    /// <summary>Documents available. A live source may report 0 and grow.</summary>
    int Count { get; }

    /// <summary>True when the documents are authored stand-ins rather than a live simulation.</summary>
    bool IsFixture { get; }

    /// <summary>What kind of thing this is: "replay", "snapshot", "live" or "missing".</summary>
    string Kind { get; }

    /// <summary>Problems found at load. Non-empty means some data could not be shown.</summary>
    IReadOnlyList<string> LoadWarnings { get; }

    bool TryGet(int index, out StateFeed feed);
}

/// <summary>
/// Reads state-feed JSON from disk — Plan A.5's fixture provider, so the whole chain works before
/// the bridge exists.
///
/// Accepts either a single <c>nlt.state-feed.v1</c> document (a snapshot: one state, no history)
/// or a <c>nlt.state-feed.replay.v1</c> bundle whose <c>frames[]</c> are complete documents of
/// their own. Nothing is derived at runtime: every frame the observer shows was authored in the
/// file, so the renderer never becomes a source of truth for a value it displays.
/// </summary>
public sealed class FixtureFeedSource : IStateSource
{
    private readonly List<StateFeed> _frames = new();
    private readonly List<string> _warnings = new();

    /// <summary>An empty source. Used before a feed path has been chosen.</summary>
    public FixtureFeedSource(string origin = "", string kind = "none")
    {
        Origin = origin;
        Kind = kind;
    }

    public string Origin { get; }

    public string Kind { get; private set; }

    public bool IsFixture => true;

    public int Count => _frames.Count;

    public IReadOnlyList<string> LoadWarnings => _warnings;

    public bool TryGet(int index, out StateFeed feed)
    {
        if (index >= 0 && index < _frames.Count)
        {
            feed = _frames[index];
            return true;
        }
        feed = null!;
        return false;
    }

    /// <summary>
    /// Read a fixture from a <c>res://</c> path or an ordinary filesystem path.
    ///
    /// <para>
    /// Goes through Godot's <see cref="FileAccess"/> rather than <c>System.IO.File</c>.
    /// <c>ProjectSettings.GlobalizePath</c> maps <c>res://</c> to a native path, but in an exported
    /// build the file lives inside the PCK and <c>System.IO.File</c> cannot see it — so the
    /// filesystem route silently returns nothing once the project is exported. <c>FileAccess</c>
    /// reads the real virtual filesystem in the editor, at runtime and in an export, and falls back to
    /// native paths for paths that are not <c>res://</c>.
    /// </para>
    /// </summary>
    public static FixtureFeedSource FromFile(string path)
    {
        string origin = Path.GetFileName(path);
        var src = new FixtureFeedSource(origin, "snapshot");

        string text;
        if (path.StartsWith("res://", StringComparison.Ordinal))
        {
            using var f = Godot.FileAccess.Open(path, Godot.FileAccess.ModeFlags.Read);
            if (f == null)
            {
                src.Kind = "missing";
                src._warnings.Add($"cannot open {path}: {Godot.FileAccess.GetOpenError()}");
                return src;
            }
            text = f.GetAsText();
        }
        else
        {
            if (!File.Exists(path))
            {
                src.Kind = "missing";
                src._warnings.Add($"no such file: {path}");
                return src;
            }
            text = File.ReadAllText(path);
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(text);
        }
        catch (JsonException e)
        {
            src._warnings.Add($"{origin}: not valid JSON: {e.Message}");
            return src;
        }

        using (doc)
        {
            var root = doc.RootElement;
            string version = root.ValueKind == JsonValueKind.Object
                             && root.TryGetProperty("schemaVersion", out var sv)
                             && sv.ValueKind == JsonValueKind.String
                ? sv.GetString() ?? ""
                : "";

            if (version == FeedVocabulary.ReplayBundleVersion)
            {
                src.Kind = "replay";
                if (!root.TryGetProperty("frames", out var frames) || frames.ValueKind != JsonValueKind.Array)
                {
                    src._warnings.Add($"{origin}: replay bundle has no frames[] array");
                    return src;
                }
                // Labelled by position in the bundle, not by how many frames were accepted: if frame 0
                // is rejected, counting successes shifts every later label and the Diagnostics panel
                // then points the operator at the wrong frame.
                int index = 0;
                foreach (var frame in frames.EnumerateArray())
                    Accept(src, frame.GetRawText(), $"{origin}#{index++}");
                return src;
            }

            Accept(src, text, origin);
            return src;
        }
    }

    /// <summary>Read and validate, and only then keep. A frame that fails is dropped, loudly —
    /// rendering a document the contract rejects would be a plausible-looking lie.</summary>
    private static bool Accept(FixtureFeedSource src, string json, string label)
    {
        var read = FeedReader.Read(json, label);
        foreach (var warn in read.Warnings)
            src._warnings.Add($"{label}: {warn}");
        if (!read.Ok)
        {
            src._warnings.Add($"{label}: rejected — {read.Message}");
            return false;
        }
        src._frames.Add(read.Feed!);
        return true;
    }
}