#include "Misc/AutomationTest.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Core/NLTFixtureEmitterSubsystem.h"
#include "Core/NLTSimulationStateSubsystem.h"
#include "Core/NLTSimulationStateHash.h"
#include "Core/NLTEventBus.h"
#include "Engine/World.h"
#include "Engine/Engine.h"

#if WITH_DEV_AUTOMATION_TESTS

#if WITH_EDITOR
#include "Editor.h"
#include "PlayInEditorDataTypes.h"
#endif

#if WITH_EDITOR

/** Finds an existing PIE world, or null when no play session is active. */
static UWorld* FindActivePIEWorld()
{
	if (!GEngine)
	{
		return nullptr;
	}
	for (const FWorldContext& Context : GEngine->GetWorldContexts())
	{
		if (Context.WorldType == EWorldType::PIE && Context.World())
		{
			return Context.World();
		}
	}
	return nullptr;
}

/**
 * Drives the whole item 1.7 fixture capture as one latent state machine:
 * ensure a PIE session exists, start the scenario, begin capture, wait for the
 * target tick count, assert non-degeneracy, write fixtures, then tear down.
 *
 * Previously this required a human to press Play first, which is why the test
 * failed with "No PIE world available" whenever it was run cold — including
 * headlessly. Starting the session here removes that external precondition. The
 * test only stops a play session it started itself, so a PIE session the user
 * opened beforehand is left running.
 *
 * Implemented as a single command with internal phases rather than a chain of
 * commands, because queueing further latent commands from inside a running one
 * is not reliable.
 */
class FNLTFixturePIECaptureCommand : public IAutomationLatentCommand
{
public:
	FNLTFixturePIECaptureCommand(int32 InSeed, int32 InNumTicks, int32 InNumAgents, FAutomationTestBase* InTest)
		: Seed(InSeed), TargetTicks(InNumTicks), NumAgents(InNumAgents), Test(InTest),
		  Phase(EPhase::WaitingForPIE), ElapsedTime(0.0f), TimeoutSeconds(300.0f),
		  bRequestedPlaySession(false), bOwnsPlaySession(false)
	{
	}

	virtual bool Update() override
	{
		ElapsedTime += FApp::GetDeltaTime();

		if (ElapsedTime >= TimeoutSeconds)
		{
			if (Test)
			{
				Test->AddError(FString::Printf(
					TEXT("Fixture capture timed out after %.0f seconds (phase %d)"),
					TimeoutSeconds, static_cast<int32>(Phase)));
			}
			StopOwnedPlaySession();
			return true;
		}

		switch (Phase)
		{
		case EPhase::WaitingForPIE:
			return TickWaitingForPIE();
		case EPhase::Running:
			return TickRunning();
		default:
			return true;
		}
	}

private:
	enum class EPhase : uint8
	{
		WaitingForPIE,
		Running,
		Done
	};

	bool TickWaitingForPIE()
	{
		UWorld* World = FindActivePIEWorld();

		if (!World)
		{
			// No play session. Start one, once, then keep waiting for it to come up.
			if (!bRequestedPlaySession)
			{
				bRequestedPlaySession = true;
				if (!GEditor)
				{
					if (Test)
					{
						Test->AddError(TEXT("GEditor is unavailable; cannot start a play session"));
					}
					return true;
				}
				FRequestPlaySessionParams PlayParams;
				PlayParams.WorldType = EPlaySessionWorldType::PlayInEditor;
				GEditor->RequestPlaySession(PlayParams);
				bOwnsPlaySession = true;
				if (Test)
				{
					Test->AddInfo(TEXT("No PIE world found — requesting a play session"));
				}
			}
			return false;
		}

		UNLTScenarioManagerSubsystem* ScenarioManager = World->GetSubsystem<UNLTScenarioManagerSubsystem>();
		UNLTFixtureEmitterSubsystem* FixtureEmitter = World->GetSubsystem<UNLTFixtureEmitterSubsystem>();

		if (!ScenarioManager || !FixtureEmitter)
		{
			if (Test)
			{
				Test->AddError(FString::Printf(
					TEXT("ScenarioManager=%s FixtureEmitter=%s in PIE world"),
					ScenarioManager ? TEXT("ok") : TEXT("null"),
					FixtureEmitter ? TEXT("ok") : TEXT("null")));
			}
			StopOwnedPlaySession();
			return true;
		}

		FNLTScenarioParams Params;
		Params.NumAgents = NumAgents;
		Params.Seed = Seed;
		Params.SpawnOrigin = FVector(0.0f, 0.0f, 100.0f);
		Params.SpawnRadius = 2000.0f;
		Params.bAutoStartSimulation = true;

		if (Test)
		{
			Test->TestTrue(TEXT("Scenario started in PIE"), ScenarioManager->StartScenario(Params));
		}

		FixtureEmitter->BeginCapture(Seed, TargetTicks);
		ScenarioManagerWeak = ScenarioManager;
		FixtureEmitterWeak = FixtureEmitter;

		Phase = EPhase::Running;
		return false;
	}

	bool TickRunning()
	{
		UNLTScenarioManagerSubsystem* ScenarioManager = ScenarioManagerWeak.Get();
		UNLTFixtureEmitterSubsystem* FixtureEmitter = FixtureEmitterWeak.Get();

		if (!ScenarioManager || !FixtureEmitter)
		{
			if (Test)
			{
				Test->AddError(TEXT("Subsystem became invalid during capture"));
			}
			Phase = EPhase::Done;
			StopOwnedPlaySession();
			return true;
		}

		if (ScenarioManager->GetScenarioTick() < TargetTicks)
		{
			return false;
		}

		// Item 1.7: assert the capture is non-degenerate BEFORE writing it to disk,
		// so a static capture is reported as a test failure rather than quietly
		// landing on disk to be mistaken for a golden vector.
		const FNLTFixtureNonDegeneracyResult Result = FixtureEmitter->ValidateCaptureNonDegeneracy();
		if (Test)
		{
			if (Result.Passed())
			{
				Test->AddInfo(FString::Printf(
					TEXT("Non-degeneracy PASS: %d ticks, %d tick(s) with events, agents moving"),
					Result.TickCount, Result.TicksWithEvents));
			}
			else
			{
				Test->AddError(FString::Printf(
					TEXT("Fixture capture is DEGENERATE (plan item 1.7) — do not commit: %s"),
					*Result.FailureReason));
			}
		}

		FixtureEmitter->EndCapture();
		Phase = EPhase::Done;
		StopOwnedPlaySession();
		return true;
	}

	/** Only tears down a session this command started, never a user's own. */
	void StopOwnedPlaySession()
	{
		if (bOwnsPlaySession && GEditor && GEditor->PlayWorld)
		{
			GEditor->RequestEndPlayMap();
		}
		bOwnsPlaySession = false;
	}

	int32 Seed;
	int32 TargetTicks;
	int32 NumAgents;
	FAutomationTestBase* Test;
	EPhase Phase;
	float ElapsedTime;
	float TimeoutSeconds;
	bool bRequestedPlaySession;
	bool bOwnsPlaySession;
	TWeakObjectPtr<UNLTScenarioManagerSubsystem> ScenarioManagerWeak;
	TWeakObjectPtr<UNLTFixtureEmitterSubsystem> FixtureEmitterWeak;
};

/**
 * PIE-context fixture capture test.
 *
 * Starts (or reuses) a PIE session, runs the simulation, and captures a golden
 * fixture. The session is started by the test itself, so this can be run cold
 * from a console or CI without a human pressing Play first.
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

	if (NumTicks < 3)
	{
		AddError(FString::Printf(
			TEXT("ticks=%d cannot satisfy the item 1.7 non-degeneracy check; need >= 3"), NumTicks));
		return false;
	}

	// All PIE setup, scenario start, capture and the item 1.7 assertion happen in
	// the latent command, which starts a play session if none is running.
	ADD_LATENT_AUTOMATION_COMMAND(FNLTFixturePIECaptureCommand(Seed, NumTicks, NumAgents, this));

	return true;
}

#endif // WITH_EDITOR — this test is editor-only; GEditor does not exist in game targets

#endif // WITH_DEV_AUTOMATION_TESTS