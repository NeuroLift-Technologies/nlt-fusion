using UnrealBuildTool;

public class WorldEngineEditorTarget : TargetRules
{
    public WorldEngineEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        bOverrideBuildEnvironment = true;
        ExtraModuleNames.AddRange(new string[] { "WorldEngine" });
        GlobalDefinitions.Add("WITH_DEV_AUTOMATION_TESTS=1");
    }
}
