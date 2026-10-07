using System;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// An <see cref="IAgentController"/> backed by a local GGUF model through NobodyWho.
///
/// Out-of-band by construction, and that is the whole design. Local inference on a 0.6B model takes
/// on the order of seconds, while the sim ticks at 60 Hz. So this controller never blocks the tick:
/// it <i>kicks</i> a request, and <see cref="Act"/> returns whatever the last completed decision was.
/// The model therefore drives at whatever rate it can actually sustain, and
/// <see cref="AgentBrain.DecisionInterval"/> decides how often it is polled.
///
/// The model is given a grammar (<see cref="DecisionParser.ActionGrammar"/>) so the only reachable
/// outputs are well-formed, and its text is then parsed and validated at the seam. A rejected
/// decision is fed back via <see cref="OnActionRejected"/> so the next prompt can correct it.
/// </summary>
public sealed class LlmAgentController : IAgentController
{
    /// <summary>The default model in this project.</summary>
    public const string DefaultModelPath = "res://ml-MODELS/Qwen3-0.6B-Q8_0.gguf";

    private readonly string _modelPath;
    private readonly Action<string> _log;

    // Held across ticks. This is the "last decision" the plan's out-of-band controller describes.
    private AgentAction _current = AgentAction.Idle;
    private AgentObservation _lastSeen;
    private string? _pendingRejection;
    private int _inFlight;

    /// <summary>True once a decision has come back. False means the agent holds still.</summary>
    public bool HasDecision { get; private set; }

    /// <summary>The most recent raw model text, for the HUD and for diagnosing a confused model.</summary>
    public string LastRawResponse { get; private set; } = "";

    /// <summary>Number of responses rejected by the seam. Non-zero means the grammar is being bypassed.</summary>
    public int Rejections { get; private set; }

    public LlmAgentController(string modelPath = DefaultModelPath, Action<string>? log = null)
    {
        _modelPath = modelPath;
        _log = log ?? (static _ => { });
    }

    public void Attach(string agentId)
    {
        _log($"[llm] controller attached to {agentId}");
    }

    public AgentAction Act(AgentObservation observation)
    {
        _lastSeen = observation;

        // Deliberately does not wait. Returning the held decision is what keeps the frame budget
        // intact; a blocking call here would stall physics and the camera with it.
        return _current;
    }

    public void OnActionRejected(in AgentObservation observation, in AgentAction action, string reason)
    {
        Rejections++;
        _pendingRejection = reason;
        _log($"[llm] decision rejected: {reason}");
    }

    /// <summary>
    /// Fold a completed model response into the held decision.
    ///
    /// Called by the owner when the inference callback fires — not by <see cref="Act"/>. Keeping
    /// this a separate entry point is what allows the same controller to be driven by NobodyWho, by
    /// an OpenAI-compatible endpoint, or by a replayed fixture, with no change here.
    /// </summary>
    public void ApplyResponse(string raw)
    {
        LastRawResponse = raw;
        _inFlight = 0;

        if (!DecisionParser.TryParse(raw, out var action, out var error))
        {
            _log($"[llm] unusable response ({error}): {Truncate(raw)}");
            return; // keep the previous decision rather than snapping to a halt on one bad token
        }

        _current = action;
        HasDecision = true;
    }

    /// <summary>Build the prompt describing the agent's situation, in the grammar's vocabulary.</summary>
    public string BuildPrompt()
    {
        var o = _lastSeen;
        var needs = o.Needs != null && o.Needs.Length >= 4
            ? $"quiet={o.Needs[0]:F2} rest={o.Needs[1]:F2} social={o.Needs[2]:F2} stimulation={o.Needs[3]:F2}"
            : "needs unknown";

        var rejection = string.IsNullOrEmpty(_pendingRejection)
            ? ""
            : $"\nYour previous answer was rejected ({_pendingRejection}). Emit only the JSON object.\n";

        return $"You are {o.AgentId} in {o.SceneId}. " +
               $"Position x={o.Position.X:F1} z={o.Position.Z:F1}. {needs}. " +
               "Decide where to move next (move_x and move_z are -1..1) and one action.\n" + rejection;
    }

    /// <summary>Whether a request is outstanding, so the owner knows when to poll.</summary>
    public bool InFlight => _inFlight > 0;

    /// <summary>Mark a request as started. The owner calls this when it dispatches to the model.</summary>
    public void BeginRequest() => _inFlight++;

    public void ClearRejection() => _pendingRejection = null;

    private static string Truncate(string s) =>
        s.Length <= 120 ? s : s[..120] + "…";
}