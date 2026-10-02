#include "Misc/AutomationTest.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Core/NLTFixtureEmitterSubsystem.h"
#include "Core/NLTSimulationStateSubsystem.h"
#include "Core/NLTSimulationStateHash.h"
#include "Core/NLTEventBus.h"
#include "Engine/World.h"
#include "Engine/Engine.h"

#if WITH_DEV_AUTOMATION_TESTS

/**
 * Latent command that waits for the simulation to reach a target tick count,
 * then ends fixture capture and writes to disk.
 */
class FWaitForTicksAndEndCaptureCommand : public IAutomationLatentCommand
{
public:
	FWaitForTicksAndEndCaptureCommand(int32 InTargetTicks, TWeakObjectPtr<UNLTScenarioManagerSubsystem> InScenarioManager, TWeakObjectPtr<UNLTFixtureEmitterSubsystem> InFixtureEmitter)
		: TargetTicks(InTargetTicks), ScenarioManagerWeak(InScenarioManager), FixtureEmitterWeak(InFixtureEmitter), ElapsedTime(0.0f), TimeoutSeconds(300.0f) {}

	virtual bool Update() override
	{
		ElapsedTime += FApp::GetDeltaTime();

		if (ElapsedTime >= TimeoutSeconds)
		{
			UE_LOG(LogNLTScenarioManager, Error, TEXT("FWaitForTicksAndEndCaptureCommand: timed out after %.0f seconds"), TimeoutSeconds);
			return true;
		}

		UNLTScenarioManagerSubsystem* ScenarioManager = ScenarioManagerWeak.Get();
		UNLTFixtureEmitterSubsystem* FixtureEmitter = FixtureEmitterWeak.Get();

		if (!ScenarioManager || !FixtureEmitter)
		{
			UE_LOG(LogNLTScenarioManager, Error, TEXT("FWaitForTicksAndEndCaptureCommand: subsystem became invalid"));
			return true;
		}

		if (ScenarioManager->GetScenarioTick() >= TargetTicks)
		{
			FixtureEmitter->EndCapture();
			return true;
		}
		return false;
	}

private:
	int32 TargetTicks;
	TWeakObjectPtr<UNLTScenarioManagerSubsystem> ScenarioManagerWeak;
	TWeakObjectPtr<UNLTFixtureEmitterSubsystem> FixtureEmitterWeak;
	float ElapsedTime;
	float TimeoutSeconds;
};

/**
 * PIE-context fixture capture test.
 * Runs in a PIE client where the game loop is active and Mass processors execute.
 * Uses latent commands to wait for the simulation to progress.
 *
 * Usage: Automation RunTests NLT.FixtureCapture.PIE
 * Parameters: "seed=42,ticks=600,agents=10"
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FNLTFixtureCapturePIETest,
	"NLT.FixtureCapture.PIE",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)

bool FNLTFixtureCapturePIETest::RunTest(const FString& Parameters)
{
	// Parse parameters: "seed=42,ticks=600,agents=10"
	int32 Seed = 42;
	int32 NumTicks = 600;
	int32 NumAgents = 10;

	if (!Parameters.IsEmpty())
	{
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

	// Get the PIE world
	UWorld* World = nullptr;
	for (const FWorldContext& Context : GEngine->GetWorldContexts())
	{
		if (Context.WorldType == EWorldType::PIE && Context.World())
		{
			World = Context.World();
			break;
		}
	}
	if (!World)
	{
		AddError(TEXT("No PIE world available"));
		return false;
	}

	// Get subsystems
	UNLTScenarioManagerSubsystem* ScenarioManager = World->GetSubsystem<UNLTScenarioManagerSubsystem>();
	UNLTFixtureEmitterSubsystem* FixtureEmitter = World->GetSubsystem<UNLTFixtureEmitterSubsystem>();
	UNLTSimulationStateSubsystem* StateSub = World->GetSubsystem<UNLTSimulationStateSubsystem>();

	if (!ScenarioManager)
	{
		AddError(TEXT("ScenarioManager subsystem not available in PIE world"));
		return false;
	}
	if (!FixtureEmitter)
	{
		AddError(TEXT("FixtureEmitter subsystem not available in PIE world"));
		return false;
	}
	if (!StateSub)
	{
		AddError(TEXT("SimulationState subsystem not available in PIE world"));
		return false;
	}

	// Start scenario
	FNLTScenarioParams Params;
	Params.NumAgents = NumAgents;
	Params.Seed = Seed;
	Params.SpawnOrigin = FVector(0.0f, 0.0f, 100.0f);
	Params.SpawnRadius = 2000.0f;
	Params.bAutoStartSimulation = true;

	TestTrue(TEXT("Scenario started in PIE"), ScenarioManager->StartScenario(Params));

	// Begin fixture capture
	FixtureEmitter->BeginCapture(Seed, NumTicks);

	// Use latent command to wait for N ticks, then end capture
	ADD_LATENT_AUTOMATION_COMMAND(FWaitForTicksAndEndCaptureCommand(NumTicks, TWeakObjectPtr<UNLTScenarioManagerSubsystem>(ScenarioManager), TWeakObjectPtr<UNLTFixtureEmitterSubsystem>(FixtureEmitter)));

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS