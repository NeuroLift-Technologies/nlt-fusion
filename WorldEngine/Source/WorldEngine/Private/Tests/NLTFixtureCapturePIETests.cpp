#include "Misc/AutomationTest.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Scenarios/UScenarioDataAsset.h"
#include "Core/NLTFixtureEmitterSubsystem.h"
#include "Core/NLTSimulationStateSubsystem.h"
#include "Core/NLTSimulationStateHash.h"
#include "Core/NLTEventBus.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "UObject/SoftObjectPath.h"

#if WITH_DEV_AUTOMATION_TESTS

#if WITH_EDITOR
#include "Editor.h"
#include "PlayInEditorDataTypes.h"
#endif

/**
 * Resolves a scenario by short asset name across the four category folders, e.g.
 * "Wor_wp_1" -> /Game/Scenarios/Workplace/Wor_wp_1. Returns null when not found.
 */
static UScenarioDataAsset* ResolveScenarioAsset(const FString& ShortName)
{
	if (ShortName.IsEmpty())
	{
		return nullptr;
	}

	// Allow an explicit full object path to bypass the search.
	if (ShortName.Contains(TEXT("/")) || ShortName.Contains(TEXT(".")))
	{
		return LoadObject<UScenarioDataAsset>(nullptr, *ShortName);
	}

	static const TCHAR* CategoryFolders[] = {
		TEXT("Workplace"), TEXT("Personal"), TEXT("Social"), TEXT("Academic")
	};
	for (const TCHAR* Folder : CategoryFolders)
	{
		const FString Path = FString::Printf(
			TEXT("/Game/Scenarios/%s/%s.%s"), Folder, *ShortName, *ShortName);
		if (UScenarioDataAsset* Asset = LoadObject<UScenarioDataAsset>(nullptr, *Path))
		{
			return Asset;
		}
	}
	return nullptr;
}

/** Lists the 13 known scenario asset names, for diagnostics on a failed lookup. */
static FString ListKnownScenarios()
{
	static const TCHAR* Names[] = {
		TEXT("Wor_wp_1"), TEXT("Wor_wp_2"), TEXT("Wor_wp_3"), TEXT("Wor_wp_4"), TEXT("Wor_wp_5"),
		TEXT("Per_pers_1"), TEXT("Per_pers_2"), TEXT("Per_pers_3"), TEXT("Per_pers_4"),
		TEXT("Soc_soc_1"), TEXT("Soc_soc_2"),
		TEXT("Aca_acad_1"), TEXT("Aca_acad_2")
	};
	FString Out;
	for (const TCHAR* Name : Names)
	{
		Out += FString::Printf(TEXT("%s "), Name);
	}
	return Out;
}

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
	FNLTFixturePIECaptureCommand(int32 InSeed, int32 InNumTicks, int32 InNumAgents, UScenarioDataAsset* InScenario, FAutomationTestBase* InTest)
		: Seed(InSeed), TargetTicks(InNumTicks), NumAgents(InNumAgents), Scenario(InScenario), Test(InTest),
		  Phase(EPhase::WaitingForPIE), ElapsedTime(0.0f), TimeoutSeconds(1800.0f),
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
			Test->TestTrue(TEXT("Scenario started in PIE"),
				Scenario
					? ScenarioManager->StartScenarioWithAsset(Params, Scenario)
					: ScenarioManager->StartScenario(Params));
		}

		// Label the capture with the scenario so several can be captured at the
		// same seed without overwriting each other (plan item 1.3).
		const FString Label = Scenario ? Scenario->ScenarioId.ToString() : FString();
		FixtureEmitter->BeginCapture(Seed, TargetTicks, Label);
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
	UScenarioDataAsset* Scenario;
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
 * Automation `Parameters` cannot be supplied via -ExecCmds (verified: UE splits
 * filters on '+', and the test still receives an empty parameter string), so the
 * knobs are read from the process command line instead:
 *
 *   -NltFixtureTicks=2000        tick budget (default 600)
 *   -NltFixtureAgents=10         agent count (default 10)
 *   -NltFixtureSeed=42           RNG seed (default 42)
 *   -NltFixtureScenario=Wor_wp_1 one of the 13 scenario assets by short name
 *                                (Wor_wp_*, Per_pers_*, Soc_soc_*, Aca_acad_*),
 *                                or a full object path
 *
 * Usage: Automation RunTests NLT.FixtureCapture.PIE
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

	// Command-line overrides are the only scriptable route for these knobs;
	// inline Parameters still work for manual console use.
	FParse::Value(FCommandLine::Get(), TEXT("NltFixtureTicks="), NumTicks);
	FParse::Value(FCommandLine::Get(), TEXT("NltFixtureAgents="), NumAgents);
	FParse::Value(FCommandLine::Get(), TEXT("NltFixtureSeed="), Seed);

	// Scenario selection (plan item 1.3 needs several scenarios at one seed).
	UScenarioDataAsset* Scenario = nullptr;
	FString ScenarioName;
	if (FParse::Value(FCommandLine::Get(), TEXT("NltFixtureScenario="), ScenarioName))
	{
		Scenario = ResolveScenarioAsset(ScenarioName);
		if (!Scenario)
		{
			AddError(FString::Printf(
				TEXT("Could not resolve scenario '%s'. Known assets: %s"),
				*ScenarioName, *ListKnownScenarios()));
			return false;
		}
		AddInfo(FString::Printf(TEXT("Capturing scenario %s (category %d, aversiveness %.2f, demand %.2f)"),
			*Scenario->ScenarioId.ToString(), static_cast<int32>(Scenario->Category),
			Scenario->Aversiveness, Scenario->CognitiveDemand));
	}

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
	ADD_LATENT_AUTOMATION_COMMAND(FNLTFixturePIECaptureCommand(Seed, NumTicks, NumAgents, Scenario, this));

	return true;
}

#endif // WITH_EDITOR — this test is editor-only; GEditor does not exist in game targets

#endif // WITH_DEV_AUTOMATION_TESTS