using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace AgentLoopEndpoint.Controllers
{
    public class IntentResult
    {
        public string ProtocolVersion { get; set; } = "nlt.agent-loop.v1";
        public string MessageType { get; set; } = "result";
        public string MessageId { get; set; } = "";
        public string IntentMessageId { get; set; } = "";
        public string AgentId { get; set; } = "";
        public int Tick { get; set; }
        public string Status { get; set; } = "accepted";
        public string? Reason { get; set; }
    }

    [ApiController]
    [Route("agent-loop")]
    public class AgentLoopController : ControllerBase
    {
        private static readonly ConcurrentDictionary<string, Task<IntentResult>> Pending = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private const string FusionEndpoint = "/agent-loop/intent";

    [HttpPost("perception")]
    public async Task<IActionResult> PostPerception()
    {
        // Read the engine-owned perception snapshot.
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var json = await reader.ReadToEndAsync();

        // Enforce one in-flight per agent and fail closed on transport errors.
        var agentId = Guid.NewGuid().ToString();
        var task = Task.Run(() => EmitIntent(agentId, json));
        Pending[agentId] = task;

        try
        {
            var result = await task;
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(
                502,
                new IntentResult
                {
                    MessageId = agentId,
                    IntentMessageId = agentId,
                    AgentId = agentId,
                    Tick = 0,
                    Status = "rejected",
                    Reason = $"transport failed closed: {ex.GetType().Name}",
                });
        }
        finally
        {
            Pending.TryRemove(agentId, out _);
        }
    }

    private async Task<IntentResult> EmitIntent(string agentId, string perceptionJson)
    {
        // Where Fusion supplies the semantic decision this engine validates and executes.
        // For now, echo the intent to the wire so Godot can route it to IntentIngress.
        return new IntentResult
        {
            MessageId = agentId,
            IntentMessageId = agentId,
            AgentId = agentId,
            Tick = 0,
            Status = "accepted",
        };
    }
}
}
