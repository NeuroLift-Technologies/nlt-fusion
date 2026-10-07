using System.Collections.Generic;
using Godot;
using NltWorldEngine.Feed;
using NltWorldEngine.Observer;

namespace NltWorldEngine;

/// <summary>
/// Keeps one <see cref="Resident"/> per agent in the document on show. It sits under the world root,
/// not under either scene, because the feed's positions are already in the shown scene's space and
/// residents must appear in both the open world and interiors.
/// </summary>
public partial class ResidentLayer : Node3D
{
    private readonly Dictionary<string, Resident> _byId = new();
    private readonly List<string> _present = new();

    public void Sync(StateFeed? doc, bool reducedMotion)
    {
        _present.Clear();
        if (doc != null)
        {
            foreach (var agent in doc.Agents)
            {
                _present.Add(agent.Id);
                if (!_byId.TryGetValue(agent.Id, out var resident))
                {
                    resident = new Resident { Name = agent.Id };
                    AddChild(resident);
                    _byId[agent.Id] = resident;
                }
                resident.Sync(agent.Position3(), agent.Velocity3(), agent.Name,
                    PlainLanguage.StateWord(agent.State), reducedMotion);
            }
        }

        if (_byId.Count == _present.Count)
            return;

        var gone = new List<string>();
        foreach (var id in _byId.Keys)
            if (!_present.Contains(id))
                gone.Add(id);
        foreach (var id in gone)
        {
            _byId[id].QueueFree();
            _byId.Remove(id);
        }
    }
}