using UnrealBuildTool;

public class WorldEngineTarget : TargetRules
{
    public WorldEngineTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V7;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
        bOverrideBuildEnvironment = true;
        ExtraModuleNames.AddRange(new string[] { "WorldEngine", "UnrealGame", "Launch" });
        if (Target.Configuration != UnrealTargetConfiguration.Shipping)
        {
            GlobalDefinitions.Add("WITH_DEV_AUTOMATION_TESTS=1");
        }
    }
}
