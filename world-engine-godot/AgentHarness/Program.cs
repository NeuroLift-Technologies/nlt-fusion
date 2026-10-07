using System;
using NltWorldEngine.Agents;

// Out-of-engine driver for the action-interface assertions. ActionAssertions is a plain static
// class precisely so it can be driven from here rather than only from inside a Godot instance.
//
// Run with:  dotnet run --project AgentHarness/AgentHarness.csproj
// (from world-engine-godot/, after `dotnet build world-engine-godot.csproj`)
internal static class Program
{
    private static int Main()
    {
        var ok = ActionAssertions.RunAll();
        Console.WriteLine(ok ? "RESULT: all assertions passed" : "RESULT: FAILURES present");
        return ok ? 0 : 1;
    }
}