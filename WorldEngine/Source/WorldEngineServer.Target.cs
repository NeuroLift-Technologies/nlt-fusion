using UnrealBuildTool;

public class WorldEngineServerTarget : TargetRules
{
    public WorldEngineServerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        bOverrideBuildEnvironment = true;
        bBuildWithEditorOnlyData = false;
        bCompileAgainstEditor = false;
        bUsesSlate = false;
        bBuildDeveloperTools = false;
        ExtraModuleNames.Add("WorldEngine");
    }
}
