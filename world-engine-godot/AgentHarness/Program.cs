using System;
using NltWorldEngine.Agents;

// Out-of-engine driver for the action-interface assertions. ActionAssertions is a plain static
// class precisely so it can be driven from here rather than only from inside a Godot instance.
//
// Run with:  dotnet run --project AgentHarness/AgentHarness.csproj
// (from world-engine-godot/, after `dotnet build world-engine-godot.csproj`)
/// <summary>
/// Out-of-engine driver that runs the 12 action-interface assertions.
/// References the Godot build's assemblies and exits with 0 on pass, 1 on failure.
/// </summary>
internal static class Program
{
    /// <summary>
    /// Runs ActionAssertions.RunAll() and writes the result.
    /// Returns 0 when all assertions pass, 1 when any fail.
    /// </summary>
    private static int Main()
    {
        var ok = ActionAssertions.RunAll();
        Console.WriteLine(ok ? "RESULT: all assertions passed" : "RESULT: FAILURES present");
        return ok ? 0 : 1;
    }
}