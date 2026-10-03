using Godot;
using NltWorldEngine.Feed;
using NltWorldEngine.Observer;

/// <summary>
/// Composition root. The world comes from <see cref="WorldView"/> (the open world, Phase B); the
/// observer is added on top of it (Phase D).
///
/// The two are deliberately separate systems talking one direction. <see cref="FeedTransport"/>
/// reads documents that already exist; it never writes to the world, never advances a clock Fusion
/// owns, and never derives a value it was not given.
/// </summary>
public partial class Main : NltWorldEngine.WorldView
{
    private FeedTransport _feed = null!;
    private ObserverRoot _observer = null!;

    public override void _Ready()
    {
        base._Ready();

        _feed = new FeedTransport { Name = "FeedTransport" };
        AddChild(_feed);

        _observer = new ObserverRoot { Name = "Observer" };
        AddChild(_observer);
        _observer.Attach(_feed, this);

        // Inert unless --capture is passed; see ObserverCapture.
        ObserverCapture.TryCreate(this);
        _observer.LevelChanged += ApplyRequestedLevel;
        ApplyRequestedLevel();
    }

    private void ApplyRequestedLevel()
    {
        if (_observer == null)
            return;
        var capture = GetNodeOrNull<ObserverCapture>("ObserverCapture");
        if (capture != null)
            _observer.SetReadingLevel(capture.RequestedLevel);
    }
}