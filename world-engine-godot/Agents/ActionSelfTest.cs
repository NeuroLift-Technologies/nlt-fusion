using System;
using Godot;
using NltWorldEngine.Agents;

namespace NltWorldEngine.Agents;

/// <summary>
/// Thin Godot entry point for the action-interface checks.
///
/// The checks themselves live in <see cref="ActionAssertions"/> as static methods. This type exists
/// only so they can be run from inside the engine, where a <c>SceneTree</c> script is the supported
/// headless entry point:
///
/// <code>
/// Godot --headless --script res://Agents/ActionSelfTest.cs
/// </code>
///
/// Keeping it separate is not cosmetic: a type deriving from <c>SceneTree</c> cannot be loaded
/// outside a running engine, so folding the assertions in would make them testable only by
/// launching Godot.
/// </summary>
public partial class ActionSelfTest : SceneTree
{
    public override void _Initialize()
    {
        var ok = ActionAssertions.RunAll();
        Quit(ok ? 0 : 1);
    }
}
