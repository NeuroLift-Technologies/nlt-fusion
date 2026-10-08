using System.Collections.Generic;
using System;
using System.Threading.Tasks;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// Drives the async HTTP loop for live avatars: builds a perception per avatar at
/// the decision cadence, POSTs it via <see cref="FusionHttpLink"/>, and applies the
/// correlated intent through <see cref="IntentIngress"/> (protocol → ASFDK governance
/// → live-world re-check → locomotion). Off by default; enable alongside
/// Main.EnableLiveAvatars. Physics/render threads never block on inference.
/// </summary>
public partial class AgentLoopDriver : Node
{
    private FusionHttpLink _link = null!;
    private IntentIngress _ingress = null!;
    private readonly Dictionary<string, float> _sincePost = new();
    private int _tick;
    private int _messageSeq;

    /// <summary>Seconds between perception posts per avatar. Matches the low-frequency cycle.</summary>
    [Export] public float DecisionCadenceSeconds { get; set; } = 2f;

    /// <summary>When false the driver posts nothing; avatars keep their local controllers.</summary>
    [Export] public bool Enabled { get; set; } = false;

    /// <summary>Only this avatar receives decisions; defaults to the dedicated local test avatar.</summary>
    [Export] public string TargetAgentId { get; set; } = "__local_avatar__";

    /// <summary>Fusion endpoint; may be overridden from the composition root for local testing.</summary>
    [Export] public string FusionEndpoint
    {
        get => _fusionEndpoint;
        set
        {
            _fusionEndpoint = value;
            if (_link != null)
                _link.FusionEndpoint = value;
        }
    }

    private string _fusionEndpoint = "http://127.0.0.1:8001/agent-loop/perception";

    /// <summary>Task anchors in the current scene, for perception + affordance checks.</summary>
    public IReadOnlyList<TaskAnchor> Anchors { get; set; } = System.Array.Empty<TaskAnchor>();

    public override void _Ready()
    {
        _link = new FusionHttpLink { Name = "FusionHttpLink" };
        _link.FusionEndpoint = _fusionEndpoint;
        AddChild(_link);
        _ingress = new IntentIngress(
            new AsfdkGovernanceGate(),
            ResolveTarget,
            _ => Anchors,
            RunOnMainThreadAsync);
    }

    private static Task<IntentExecutionResult> RunOnMainThreadAsync(
        Func<IntentExecutionResult> action)
    {
        var completion = new TaskCompletionSource<IntentExecutionResult>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        Callable.From(() =>
        {
            try
            {
                completion.TrySetResult(action());
            }
            catch (Exception e)
            {
                completion.TrySetException(e);
            }
        }).CallDeferred();
        return completion.Task;
    }

    public override void _Process(double delta)
    {
        if (!Enabled)
            return;
        _tick++;
        var avatars = GetAvatars();
        foreach (var avatar in avatars)
        {
            if (!string.Equals(avatar.AgentId, TargetAgentId, StringComparison.Ordinal))
                continue;
            if (!_sincePost.TryGetValue(avatar.AgentId, out var t))
                t = DecisionCadenceSeconds;
            t += (float)delta;
            if (t < DecisionCadenceSeconds)
            {
                _sincePost[avatar.AgentId] = t;
                continue;
            }
            _sincePost[avatar.AgentId] = 0f;
            var perception = PerceptionBuilder.Build(
                avatar, _tick, $"obs-{_tick}-{avatar.AgentId}-{_messageSeq++}",
                Anchors, avatars);
            GD.Print($"[AgentLoopDriver] perception tick={_tick}, agent={avatar.AgentId}, " +
                $"position={avatar.GlobalPosition}, visible={perception.VisibleEntities.Count}");
            _link.RequestDecision(avatar, perception, _ingress, _tick);
        }
    }

    private List<AvatarCharacter> GetAvatars()
    {
        var list = new List<AvatarCharacter>();
        var root = GetTree().CurrentScene ?? GetTree().Root;
        CollectAvatars(root, list);
        return list;
    }

    private static void CollectAvatars(Node node, List<AvatarCharacter> into)
    {
        foreach (var child in node.GetChildren())
        {
            if (child is AvatarCharacter avatar)
                into.Add(avatar);
            CollectAvatars(child, into);
        }
    }

    private Vector3? ResolveTarget(string targetId)
    {
        var root = GetTree().CurrentScene ?? GetTree().Root;
        var node = FindByName(root, targetId);
        if (node is Node3D n3)
            return n3.GlobalPosition;
        foreach (var anchor in Anchors)
            if (anchor.Id == targetId)
                return anchor.Position;
        var avatars = GetAvatars();
        foreach (var avatar in avatars)
            if (avatar.AgentId == targetId)
                return avatar.GlobalPosition;
        return null;
    }

    private static Node? FindByName(Node node, string name)
    {
        if (node.Name == name)
            return node;
        foreach (var child in node.GetChildren())
        {
            var found = FindByName(child, name);
            if (found != null)
                return found;
        }
        return null;
    }
}
