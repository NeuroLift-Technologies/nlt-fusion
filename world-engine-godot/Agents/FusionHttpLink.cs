using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// Async HTTP loopback: Godot POSTs each perception to a Fusion endpoint; Fusion
/// returns a correlated intent. Single-avatar, low-frequency decision cycle —
/// one in-flight request per avatar, enforced timeouts, stale ticks rejected,
/// fail closed on transport errors. Model inference never touches the Godot
/// physics/render thread: HTTP runs on background tasks, results marshal back
/// through IntentIngress on the caller's context.
/// </summary>
public partial class FusionHttpLink : Node
{
    private readonly System.Net.Http.HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly Dictionary<string, Task> _inFlight = new();
    private readonly object _lock = new();

    /// <summary>Fusion endpoint, e.g. http://127.0.0.1:8001/agent-loop/perception (matches
    /// neurolift-ai-fusion/src/fusion/agent_loop_http.py).</summary>
    [Export] public string FusionEndpoint { get; set; } = "http://127.0.0.1:8001/agent-loop/perception";

    /// <summary>Seconds before a request is abandoned. Fail closed: no intent applied.</summary>
    [Export] public float RequestTimeoutSeconds { get; set; } = 5f;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// POST one perception; on correlated intent, run it through ingress.
    /// Fire-and-forget safe: drops when one request per avatar is already in flight,
    /// rejects stale ticks, fails closed (no movement) on any transport error.
    /// </summary>
    public void RequestDecision(
        AvatarCharacter avatar,
        AgentPerceptionSnapshot perception,
        IntentIngress ingress,
        int currentTick)
    {
        lock (_lock)
        {
            if (_inFlight.TryGetValue(avatar.AgentId, out var existing)
                && !existing.IsCompleted)
                return;
            _inFlight[avatar.AgentId] = FetchAndApplyAsync(avatar, perception, ingress, currentTick);
        }
    }

    private async Task FetchAndApplyAsync(
        AvatarCharacter avatar,
        AgentPerceptionSnapshot perception,
        IntentIngress ingress,
        int currentTick)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(RequestTimeoutSeconds));
            var body = JsonSerializer.Serialize(perception, JsonOptions);
            using var content = new StringContent(body, Encoding.UTF8, "application/json");
            using var response = await _http.PostAsync(FusionEndpoint, content, cts.Token);
            if (!response.IsSuccessStatusCode)
                return;
            var json = await response.Content.ReadAsStringAsync(cts.Token);
            if (!AgentLoopProtocol.TryParseIntent(json, perception, out var intent, out _)
                || intent == null)
                return;
            if (intent.ObservedTick != perception.Tick)
                return;
            if (!IsInstanceValid(avatar))
                return;
            await ingress.SubmitAsync(avatar, perception, intent, currentTick);
        }
        catch (Exception e) when (e is System.Net.Http.HttpRequestException
            or TaskCanceledException or OperationCanceledException or JsonException)
        {
            GD.PushWarning($"[FusionHttpLink] transport failed closed for {perception.AgentId}: {e.GetType().Name}");
        }
        finally
        {
            lock (_lock) { _inFlight.Remove(perception.AgentId); }
        }
    }

    public override void _ExitTree()
    {
        _http.Dispose();
        base._ExitTree();
    }
}
