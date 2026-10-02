#include "Misc/AutomationTest.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Core/NLTFixtureEmitterSubsystem.h"
#include "Core/NLTSimulationStateSubsystem.h"
#include "Core/NLTSimulationStateHash.h"
#include "Core/NLTEventBus.h"
#include "Engine/World.h"
#include "GameFramework/GameModeBase.h"

#if WITH_DEV_AUTOMATION_TESTS

/**
 * Automation test that runs a headless simulation and captures golden fixtures.
 * This is the Phase 1 fixture capture mechanism — it runs in the editor
 * but drives the simulation deterministically via StepTick().
 *
 * Usage: Automation RunTests NLT.FixtureCapture
 * The test reads seed and tick count from the test parameters string: "seed=42,ticks=600,agents=10"
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureCaptureTest,
	"NLT.FixtureCapture",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FNLTFixtureCaptureTest::RunTest(const FString& Parameters)
{
	// Parse parameters: "seed=42,ticks=600,agents=10"
	int32 Seed = 42;
	int32 NumTicks = 600;
	int32 NumAgents = 10;

	if (!Parameters.IsEmpty())
	{
		// Simple key=value parser
		TArray<FString> Pairs;
		Parameters.ParseIntoArray(Pairs, TEXT(","), true);
		for (const FString& Pair : Pairs)
		{
			FString Key, Value;
			if (Pair.Split(TEXT("="), &Key, &Value))
			{
				if (Key == TEXT("seed")) Seed = FCString::Atoi(*Value);
				else if (Key == TEXT("ticks")) NumTicks = FCString::Atoi(*Value);
				else if (Key == TEXT("agents")) NumAgents = FCString::Atoi(*Value);
			}
		}
	}

	// Get the editor world via GEngine world contexts (no UnrealEd dependency)
	UWorld* World = nullptr;
	for (const FWorldContext& Context : GEngine->GetWorldContexts())
	{
		if (Context.WorldType == EWorldType::Editor && Context.World())
		{
			World = Context.World();
			break;
		}
	}
	if (!World)
	{
		AddError(TEXT("No editor world available"));
		return false;
	}

	// Get subsystems
	UNLTScenarioManagerSubsystem* ScenarioManager = World->GetSubsystem<UNLTScenarioManagerSubsystem>();
	UNLTFixtureEmitterSubsystem* FixtureEmitter = World->GetSubsystem<UNLTFixtureEmitterSubsystem>();
	UNLTSimulationStateSubsystem* StateSub = World->GetSubsystem<UNLTSimulationStateSubsystem>();
	UNLTEventBus* EventBus = World->GetSubsystem<UNLTEventBus>();

	if (!ScenarioManager)
	{
		AddError(TEXT("ScenarioManager subsystem not available"));
		return false;
	}
	if (!FixtureEmitter)
	{
		AddError(TEXT("FixtureEmitter subsystem not available"));
		return false;
	}
	if (!StateSub)
	{
		AddError(TEXT("SimulationState subsystem not available"));
		return false;
	}

	// Start scenario
	FNLTScenarioParams Params;
	Params.NumAgents = NumAgents;
	Params.Seed = Seed;
	Params.SpawnOrigin = FVector(0.0f, 0.0f, 100.0f);
	Params.SpawnRadius = 2000.0f;
	Params.bAutoStartSimulation = true;

	TestTrue(TEXT("Scenario started"), ScenarioManager->StartScenario(Params));

	// Begin fixture capture
	FixtureEmitter->BeginCapture(Seed, NumTicks);

	// Step the simulation — TickScenarioManager drives Sim->StepTick() and CaptureTick() internally
	for (int32 Tick = 0; Tick < NumTicks; ++Tick)
	{
		ScenarioManager->TickScenarioManager(0.0f);
	}

	// End capture and write to disk
	FixtureEmitter->EndCapture();

	// Verify fixtures were written
	TestTrue(TEXT("Fixture capture completed"), !FixtureEmitter->IsCapturing());

	// Verify the output directory exists and has files
	const FString OutputDir = FixtureEmitter->GetOutputDirectory();
	TestTrue(TEXT("Output directory is set"), !OutputDir.IsEmpty());

	// Verify final state hash is non-zero
	TestTrue(TEXT("Final state hash is non-zero"), ScenarioManager->ComputeAgentStateHash() != 0);

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS