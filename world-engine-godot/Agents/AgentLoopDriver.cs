using System.Collections.Generic;
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

    /// <summary>Task anchors in the current scene, for perception + affordance checks.</summary>
    public IReadOnlyList<TaskAnchor> Anchors { get; set; } = System.Array.Empty<TaskAnchor>();

    public override void _Ready()
    {
        _link = new FusionHttpLink { Name = "FusionHttpLink" };
        AddChild(_link);
        _ingress = new IntentIngress(
            new AsfdkGovernanceGate("engine"),
            ResolveTarget,
            _ => Anchors);
    }

    public override void _Process(double delta)
    {
        if (!Enabled)
            return;
        _tick++;
        var avatars = GetAvatars();
        foreach (var avatar in avatars)
        {
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
