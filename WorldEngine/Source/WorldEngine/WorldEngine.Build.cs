using UnrealBuildTool;
using System.IO;

public class WorldEngine : ModuleRules
{
    public WorldEngine(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core",
            "CoreUObject",
            "Engine",
            "InputCore",
            "EnhancedInput",
            "UMG",
            "Slate",
            "SlateCore",
            "AIModule",
            "MassEntity",
            "MassCore",
            "MassSignals",
            "MassEngine",
            "MassCommon",
            "MassSimulation",
            "MassMovement",
            "MassCrowd",
            "MassActors",
            "MassRepresentation",
            "MassSpawner",
            "MassSmartObjects",
            "MassLOD",
            "MassReplication",
            "MassAIBehavior",
            "StateTreeModule",
            "SmartObjectsModule",
            "GameplayTasks",
            "PCG",
            "Json",
            "JsonUtilities",
            "WebSockets",
            "WebSocketNetworking",
            "Networking",
            "Sockets",
            "Niagara",
            "NiagaraCore",
            "AnimGraphRuntime",
            "Water",
            "Landscape",
            "LearningAgents",
            "LearningAgentsTraining",
            "Learning",
            "LearningTraining"
        });

        PrivateDependencyModuleNames.AddRange(new string[] {
            "Projects",
            "NavigationSystem",
            "Navmesh",
            "AudioMixer",
            "AudioMixerCore",
            "HTTPServer",
            "HTTP",
            "Sockets",
            "NLTGovernanceSubsystem"
        });

        // Item 1.7: the PIE fixture-capture automation test starts a play session
        // itself, which needs GEditor (UEditorEngine) and lives in UnrealEd. Editor
        // only, so the game and server targets never gain an editor dependency.
        if (Target.bBuildEditor)
        {
            PrivateDependencyModuleNames.Add("UnrealEd");
        }
    }
}
