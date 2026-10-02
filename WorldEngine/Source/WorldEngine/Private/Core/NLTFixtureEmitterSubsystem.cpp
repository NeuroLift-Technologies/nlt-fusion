#include "Core/NLTFixtureEmitterSubsystem.h"
#include "Core/NLTSimulationStateSubsystem.h"
#include "Core/NLTSimulationStateHash.h"
#include "Core/NLTEventBus.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Agents/NLTAgentFragments.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "MassEntityQuery.h"
#include "MassExecutionContext.h"
#include "Misc/Paths.h"
#include "Misc/FileHelper.h"
#include "HAL/PlatformFileManager.h"
#include "Engine/World.h"

DEFINE_LOG_CATEGORY(LogNLTFixtureEmitter);

void UNLTFixtureEmitterSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixture emitter subsystem initialized"));
}

void UNLTFixtureEmitterSubsystem::Deinitialize()
{
	if (bCapturing)
	{
		EndCapture();
	}
	Super::Deinitialize();
}

void UNLTFixtureEmitterSubsystem::BeginCapture(int32 InSeed, int32 InMaxTicks)
{
	CaptureSeed = InSeed;
	CaptureMaxTicks = FMath::Max(1, InMaxTicks);
	CurrentCaptureTick = 0;
	bCapturing = true;

	// Clear any previous capture data
	PerTickCanonicalState.Reset();
	PerTickRngState.Reset();
	PerTickEventStream.Reset();
	PerTickStateHash.Reset();
	FinalCanonicalState.Reset();
	FinalRngState.Reset();
	FinalStateHash.Reset();
	FinalTick = 0;

	// Build output directory: Saved/Fixtures/seed{N}/
	OutputDirectory = FPaths::ProjectSavedDir() / TEXT("Fixtures") / FString::Printf(TEXT("seed%d"), CaptureSeed);

	// Ensure directory exists
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	PlatformFile.CreateDirectoryTree(*OutputDirectory);

	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixture capture started: seed=%d, maxTicks=%d, dir=%s"),
		CaptureSeed, CaptureMaxTicks, *OutputDirectory);
}

void UNLTFixtureEmitterSubsystem::EndCapture()
{
	if (!bCapturing)
	{
		return;
	}

	WriteFixturesToDisk();
	bCapturing = false;

	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixture capture complete: %d ticks written to %s"),
		CurrentCaptureTick, *OutputDirectory);
}

void UNLTFixtureEmitterSubsystem::CaptureTick()
{
	if (!bCapturing)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Get simulation state subsystem (for RNG and tick counter)
	UNLTSimulationStateSubsystem* StateSub = World->GetSubsystem<UNLTSimulationStateSubsystem>();
	if (!StateSub)
	{
		return;
	}

	const FNLTSimulationState& State = StateSub->GetCurrentState();
	const FNLTRandomStream& RNG = StateSub->GetRNG();

	// 1. Canonical state text v2 — build from Mass entities (authoritative sim state)
	//    The state subsystem is disconnected from Mass (SIM-001), so we read Mass directly.
	FNLTSimulationState MassState;
	MassState.SimulationTick = State.SimulationTick;
	MassState.WorldTime = State.WorldTime;
	MassState.TimeOfDay = State.TimeOfDay;
	MassState.Mode = State.Mode;
	MassState.RandomSeed = State.RandomSeed;

	// Query Mass entities for agent data
	if (UMassEntitySubsystem* EntitySub = World->GetSubsystem<UMassEntitySubsystem>())
	{
		if (EntitySub->GetInitializationState().bPostInitializeCalled)
		{
			FMassEntityManager& EntityManager = EntitySub->GetMutableEntityManager();
			FMassEntityQuery Query(EntityManager.AsShared());
			Query.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTAgentIntentFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTAgentCognitiveFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTAgentNeedsFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTAgentBehaviorFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTScenarioNeedsFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTScenarioConfigFragment>(EMassFragmentAccess::ReadOnly);
			Query.AddRequirement<FNLTScenarioBehaviorFragment>(EMassFragmentAccess::ReadOnly);
			Query.CacheArchetypes();

			FMassExecutionContext Context(EntityManager);
			Query.ForEachEntityChunk(Context, [&MassState](FMassExecutionContext& Ctx)
			{
				const int32 NumEntities = Ctx.GetNumEntities();
				TConstArrayView<FNLTAgentIdentityFragment> Identities = Ctx.GetFragmentView<FNLTAgentIdentityFragment>();
				TConstArrayView<FNLTAgentLocationFragment> Locations = Ctx.GetFragmentView<FNLTAgentLocationFragment>();
				TConstArrayView<FNLTAgentIntentFragment> Intents = Ctx.GetFragmentView<FNLTAgentIntentFragment>();
				TConstArrayView<FNLTAgentCognitiveFragment> Cognitives = Ctx.GetFragmentView<FNLTAgentCognitiveFragment>();
				TConstArrayView<FNLTAgentNeedsFragment> Needs = Ctx.GetFragmentView<FNLTAgentNeedsFragment>();
				TConstArrayView<FNLTAgentBehaviorFragment> Behaviors = Ctx.GetFragmentView<FNLTAgentBehaviorFragment>();
				TConstArrayView<FNLTScenarioNeedsFragment> ScenarioNeeds = Ctx.GetFragmentView<FNLTScenarioNeedsFragment>();
				TConstArrayView<FNLTScenarioConfigFragment> ScenarioConfigs = Ctx.GetFragmentView<FNLTScenarioConfigFragment>();
				TConstArrayView<FNLTScenarioBehaviorFragment> ScenarioBehaviors = Ctx.GetFragmentView<FNLTScenarioBehaviorFragment>();

				for (int32 i = 0; i < NumEntities; i++)
				{
					FNLTAgentState Agent;
					Agent.AgentId = Identities[i].AgentId;
					Agent.Role = Identities[i].Role;
					Agent.ProfileId = Identities[i].ProfileId;
					Agent.DisplayName = Identities[i].DisplayName;
					Agent.Position = Locations[i].Position;
					Agent.Intent = Intents[i].Intent;
					Agent.Focus = Cognitives[i].Focus;
					Agent.CognitiveLoad = Cognitives[i].CognitiveLoad;
					Agent.Stress = Cognitives[i].Stress;
					Agent.Burnout = Cognitives[i].Burnout;
					Agent.Independence = Cognitives[i].Independence;
					Agent.FusionReady = Cognitives[i].FusionReady;
					Agent.SuccessRate = Cognitives[i].SuccessRate;
					Agent.EmotionalState = Cognitives[i].EmotionalState;
					Agent.PrimaryNeed = Needs[i].PrimaryNeed;
					MassState.Agents.Add(Agent);
				}
			});
		}
	}

	const FString CanonicalV2 = FNLTDeterministicStateHash::BuildCanonicalStateTextV2(MassState, &RNG);
	PerTickCanonicalState.Add(CanonicalV2);

	// 2. RNG state: "initialSeed;seed;calls"
	const FString RngStateStr = FString::Printf(TEXT("%d;%d;%d"),
		RNG.InitialSeed, RNG.Seed, RNG.Calls);
	PerTickRngState.Add(RngStateStr);

	// 3. Ordered event stream: get events from the ring buffer matching current tick
	UNLTEventBus* EventBus = World->GetSubsystem<UNLTEventBus>();
	if (EventBus)
	{
		TArray<FNLTSimulationEvent> RecentEvents;
		EventBus->GetRecentEvents(256, RecentEvents);

		// Events come newest-first from GetRecentEvents; reverse for chronological order
		// Only include events matching the current simulation tick
		FString EventStreamStr;
		for (int32 i = RecentEvents.Num() - 1; i >= 0; --i)
		{
			const FNLTSimulationEvent& Ev = RecentEvents[i];
			if (Ev.Tick == State.SimulationTick)
			{
				EventStreamStr += FString::Printf(TEXT("%d;%s;%s;%s;%s;%.9g\n"),
					Ev.Tick,
					Ev.EventType == ENLTSimulationEventType::None ? TEXT("None") : *UEnum::GetValueAsString(Ev.EventType),
					*Ev.AgentId.ToString(),
					*Ev.Description,
					*Ev.TargetId.ToString(),
					Ev.Value);
			}
		}
		PerTickEventStream.Add(EventStreamStr);
	}
	else
	{
		PerTickEventStream.Add(TEXT(""));
	}

	// 4. State hash
	const FString StateHash = FNLTDeterministicStateHash::ComputeStateHashV2(MassState, &RNG);
	PerTickStateHash.Add(StateHash);

	// Store final state (updated on every tick, including early termination)
	FinalCanonicalState = CanonicalV2;
	FinalRngState = RngStateStr;
	FinalStateHash = StateHash;
	FinalTick = CurrentCaptureTick;

	CurrentCaptureTick++;

	// Stop collecting after CaptureMaxTicks is reached
	if (CurrentCaptureTick >= CaptureMaxTicks)
	{
		bCapturing = false;
	}
}

void UNLTFixtureEmitterSubsystem::WriteFixturesToDisk()
{
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();

	// Write per-tick canonical state text
	{
		FString FilePath = OutputDirectory / TEXT("canonical_state_v2.txt");
		FString Content;
		for (int32 i = 0; i < PerTickCanonicalState.Num(); ++i)
		{
			Content += FString::Printf(TEXT("=== tick %d ===\n%s\n"), i, *PerTickCanonicalState[i]);
		}
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	// Write per-tick RNG state
	{
		FString FilePath = OutputDirectory / TEXT("rng_state.txt");
		FString Content;
		for (int32 i = 0; i < PerTickRngState.Num(); ++i)
		{
			Content += FString::Printf(TEXT("tick %d: %s\n"), i, *PerTickRngState[i]);
		}
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	// Write per-tick event stream
	{
		FString FilePath = OutputDirectory / TEXT("event_stream.txt");
		FString Content;
		for (int32 i = 0; i < PerTickEventStream.Num(); ++i)
		{
			Content += FString::Printf(TEXT("=== tick %d ===\n%s\n"), i, *PerTickEventStream[i]);
		}
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	// Write per-tick state hash
	{
		FString FilePath = OutputDirectory / TEXT("state_hash.txt");
		FString Content;
		for (int32 i = 0; i < PerTickStateHash.Num(); ++i)
		{
			Content += FString::Printf(TEXT("tick %d: %s\n"), i, *PerTickStateHash[i]);
		}
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	// Write final state summary
	{
		FString FilePath = OutputDirectory / TEXT("final_state.txt");
		FString Content;
		Content += FString::Printf(TEXT("seed: %d\n"), CaptureSeed);
		Content += FString::Printf(TEXT("max_ticks: %d\n"), CaptureMaxTicks);
		Content += FString::Printf(TEXT("final_tick: %d\n"), FinalTick);
		Content += FString::Printf(TEXT("final_state_hash: %s\n"), *FinalStateHash);
		Content += FString::Printf(TEXT("final_rng_state: %s\n"), *FinalRngState);
		Content += FString::Printf(TEXT("\n=== final_canonical_state_v2 ===\n%s\n"), *FinalCanonicalState);
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	// Write PROVENANCE.md
	{
		FString FilePath = OutputDirectory / TEXT("PROVENANCE.md");
		FString Content;
		Content += TEXT("# Fixture Provenance\n\n");
		Content += FString::Printf(TEXT("- **Seed:** %d\n"), CaptureSeed);
		Content += FString::Printf(TEXT("- **Max Ticks:** %d\n"), CaptureMaxTicks);
		Content += FString::Printf(TEXT("- **UE Build:** WorldEngineEditor Win64 Development\n"));
		Content += FString::Printf(TEXT("- **Commit:** (see git log)\n"));
		Content += FString::Printf(TEXT("- **Date:** %s\n"), *FDateTime::Now().ToString());
		Content += FString::Printf(TEXT("- **Command:** WorldEngine.exe -game -nullrhi -seed=%d -ticks=%d\n"), CaptureSeed, CaptureMaxTicks);
		Content += TEXT("\n## Files\n\n");
		Content += TEXT("- `canonical_state_v2.txt` — Per-tick canonical state text (v2, bit-exact IEEE-754 hex)\n");
		Content += TEXT("- `rng_state.txt` — Per-tick RNG state (initialSeed;seed;calls)\n");
		Content += TEXT("- `event_stream.txt` — Per-tick ordered event stream\n");
		Content += TEXT("- `state_hash.txt` — Per-tick BLAKE3 state hash\n");
		Content += TEXT("- `final_state.txt` — Final state summary\n");
		FFileHelper::SaveStringToFile(Content, *FilePath);
	}

	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixtures written to %s"), *OutputDirectory);
}