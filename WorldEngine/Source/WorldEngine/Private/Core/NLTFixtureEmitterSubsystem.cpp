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

void UNLTFixtureEmitterSubsystem::BeginCapture(int32 InSeed, int32 InMaxTicks, const FString& InLabel)
{
	CaptureSeed = InSeed;
	CaptureMaxTicks = FMath::Max(1, InMaxTicks);
	CaptureLabel = InLabel;
	CurrentCaptureTick = 0;
	bCapturing = true;

	// Clear any previous capture data
	PerTickCanonicalState.Reset();
	PerTickRngState.Reset();
	PerTickEventStream.Reset();
	PerTickStateHash.Reset();
	PerTickAgentPositions.Reset();
	FinalCanonicalState.Reset();
	FinalRngState.Reset();
	FinalStateHash.Reset();
	FinalTick = 0;

	// Build output directory: Saved/Fixtures/seed{N}[_{Label}]/
	// The label keeps concurrent or successive scenario captures from clobbering
	// each other — plan item 1.3 wants several scenarios at the same seed.
	OutputDirectory = FPaths::ProjectSavedDir() / TEXT("Fixtures") / FString::Printf(TEXT("seed%d"), CaptureSeed);
	if (!InLabel.IsEmpty())
	{
		OutputDirectory += FString::Printf(TEXT("_%s"), *InLabel);
	}

	// Ensure directory exists
	IPlatformFile& PlatformFile = FPlatformFileManager::Get().GetPlatformFile();
	PlatformFile.CreateDirectoryTree(*OutputDirectory);

	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixture capture started: seed=%d, maxTicks=%d, label=%s, dir=%s"),
		CaptureSeed, CaptureMaxTicks, *InLabel, *OutputDirectory);
}

void UNLTFixtureEmitterSubsystem::EndCapture()
{
	// Guard on captured data, NOT on bCapturing. CaptureTick flips bCapturing off
	// once the tick cap is reached, so when max ticks equals the requested tick
	// count -- the normal case -- bCapturing is already false here and a guard on
	// it silently discards everything collected in memory.
	if (PerTickCanonicalState.Num() == 0)
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

	// Position trace for the item 1.7 non-degeneracy check. Captured from the same
	// MassState that produced the canonical text, so it cannot drift from it.
	PerTickAgentPositions.Add(BuildAgentPositionTrace(MassState.Agents));

	// Record the capture context. Mass processors only run when a game loop is
	// active, so an editor-world capture can never produce live state -- which is
	// the failure item 1.7 exists to catch. Recording it makes that visible in
	// PROVENANCE.md rather than something you have to infer.
	{
		const UWorld* CaptureWorld = GetWorld();
		bCapturedInPIE = CaptureWorld && CaptureWorld->WorldType == EWorldType::PIE;
	}

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

FString UNLTFixtureEmitterSubsystem::BuildAgentPositionTrace(const TArray<FNLTAgentState>& Agents)
{
	FString Trace;
	for (const FNLTAgentState& Agent : Agents)
	{
		// Same %.17g double formatting the v1 canonical text uses for WorldTime, so
		// the trace is a faithful, lossless projection of agent position.
		Trace += FString::Printf(TEXT("%.17g;%.17g;%.17g;"),
			Agent.Position.X, Agent.Position.Y, Agent.Position.Z);
	}
	return Trace;
}

FNLTFixtureNonDegeneracyResult UNLTFixtureEmitterSubsystem::ValidateCaptureNonDegeneracy() const
{
	return ValidateNonDegeneracy(PerTickCanonicalState, PerTickEventStream, PerTickAgentPositions);
}

FNLTFixtureNonDegeneracyResult UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy(
	const TArray<FString>& InCanonicalState,
	const TArray<FString>& InEventStream,
	const TArray<FString>& InAgentPositions)
{
	FNLTFixtureNonDegeneracyResult Result;
	Result.TickCount = InCanonicalState.Num();

	// --- Signal 1: enough distinct samples to compare ---
	// Three is the minimum that lets us assert first != middle != last; with one or
	// two ticks the assertion is vacuous and would pass a static capture.
	Result.bHasEnoughTicks = Result.TickCount >= 3;
	if (!Result.bHasEnoughTicks)
	{
		Result.FailureReason = FString::Printf(
			TEXT("only %d tick(s) captured; need >= 3 to compare first/middle/last"),
			Result.TickCount);
		return Result;
	}

	const int32 FirstIdx = 0;
	const int32 MidIdx = Result.TickCount / 2;
	const int32 LastIdx = Result.TickCount - 1;

	// --- Signal 2: canonical text varies ---
	// NOTE: this is a *weak* signal on its own. SimulationTick and WorldTime are
	// part of the canonical text and advance every tick, so this passes even when
	// no agent moves. That is exactly why signal 4 exists.
	Result.bCanonicalVaries =
		InCanonicalState[FirstIdx] != InCanonicalState[MidIdx] &&
		InCanonicalState[MidIdx] != InCanonicalState[LastIdx] &&
		InCanonicalState[FirstIdx] != InCanonicalState[LastIdx];

	// --- Signal 3: event stream carries at least one event ---
	for (const FString& Events : InEventStream)
	{
		if (!Events.TrimStartAndEnd().IsEmpty())
		{
			++Result.TicksWithEvents;
		}
	}
	Result.bEventStreamNonEmpty = Result.TicksWithEvents > 0;

	// --- Signal 4: at least one agent actually moved ---
	// The strong signal. If the position trace is unchanged the capture is static
	// regardless of what the tick counter did.
	Result.bAgentsMove = false;
	if (InAgentPositions.Num() >= 3)
	{
		Result.bAgentsMove =
			InAgentPositions[FirstIdx] != InAgentPositions[LastIdx] ||
			InAgentPositions[FirstIdx] != InAgentPositions[MidIdx] ||
			InAgentPositions[MidIdx] != InAgentPositions[LastIdx];
	}

	// Report the first failed check so the failure names the collapsed property.
	if (!Result.bCanonicalVaries)
	{
		Result.FailureReason = FString::Printf(
			TEXT("canonical state text is identical at ticks %d, %d and %d"),
			FirstIdx, MidIdx, LastIdx);
	}
	else if (!Result.bEventStreamNonEmpty)
	{
		Result.FailureReason = FString::Printf(
			TEXT("event stream is empty across all %d captured ticks"), Result.TickCount);
	}
	else if (!Result.bAgentsMove)
	{
		Result.FailureReason = InAgentPositions.Num() < 3
			? FString::Printf(
				TEXT("no agent position trace recorded (%d entries); capture has no agent data"),
				InAgentPositions.Num())
			: FString::Printf(
				TEXT("no agent position changed between ticks %d and %d — capture is static"),
				FirstIdx, LastIdx);
	}

	return Result;
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
		const FNLTFixtureNonDegeneracyResult NonDegeneracy = ValidateCaptureNonDegeneracy();

		FString FilePath = OutputDirectory / TEXT("PROVENANCE.md");
		FString Content;
		Content += TEXT("# Fixture Provenance\n\n");
		Content += TEXT("> Generated by UNLTFixtureEmitterSubsystem. Every field below is read at\n");
		Content += TEXT("> capture time from the running build -- none of it is hand-maintained.\n\n");

		// --- Build identity (item 1.5: "the exact UE build") ---
		Content += FString::Printf(TEXT("- **UE Version:** %s\n"), *FEngineVersion::Current().ToString());
		Content += FString::Printf(TEXT("- **Engine Changelist:** %d\n"), FEngineVersion::Current().GetChangelist());
		Content += FString::Printf(TEXT("- **Platform:** %s\n"), ANSI_TO_TCHAR(FPlatformProperties::PlatformName()));
		Content += FString::Printf(TEXT("- **Build Config:** %s\n"),
#if UE_BUILD_SHIPPING
			TEXT("Shipping")
#elif UE_BUILD_TEST
			TEXT("Test")
#elif UE_BUILD_DEBUG
			TEXT("Debug")
#elif UE_BUILD_DEVELOPMENT
			TEXT("Development")
#else
			TEXT("Unknown")
#endif
			);
		Content += FString::Printf(TEXT("- **Editor Build:** %s\n"),
#if WITH_EDITOR
			TEXT("yes")
#else
			TEXT("no")
#endif
			);

		// --- Source commit ---
		// UE has no git access at runtime, so the commit is passed in by the caller.
		FString CaptureCommit;
		FParse::Value(FCommandLine::Get(), TEXT("NltFixtureCommit="), CaptureCommit);
		Content += FString::Printf(TEXT("- **Source Commit:** %s\n"),
			CaptureCommit.IsEmpty() ? TEXT("(not supplied -- pass -NltFixtureCommit=<sha>)") : *CaptureCommit);

		// --- Capture context ---
		Content += FString::Printf(TEXT("- **Seed:** %d\n"), CaptureSeed);
		Content += FString::Printf(TEXT("- **Max Ticks:** %d\n"), CaptureMaxTicks);
		if (!CaptureLabel.IsEmpty())
		{
			Content += FString::Printf(TEXT("- **Scenario:** %s\n"), *CaptureLabel);
		}
		Content += FString::Printf(TEXT("- **Capture Context:** %s"),
			bCapturedInPIE ? TEXT("Play-In-Editor (game loop active, Mass processors running)")
		                  : TEXT("Editor world (no game loop -- Mass processors do NOT run)"));
		Content += FString::Printf(TEXT(", headless=%s, unattended=%s\n"),
			FParse::Param(FCommandLine::Get(), TEXT("unattended")) ? TEXT("yes") : TEXT("no"),
			FParse::Param(FCommandLine::Get(), TEXT("unattended")) ? TEXT("yes") : TEXT("no"));
		Content += FString::Printf(TEXT("- **World:** %s\n"), *GetWorldNameForProvenance());

		// --- Command line actually used (item 1.5: "the command line used") ---
		Content += FString::Printf(TEXT("- **Command Line:** `%s`\n"), FCommandLine::Get());
		Content += FString::Printf(TEXT("- **Captured At:** %s\n"), *FDateTime::Now().ToIso8601());

		// Item 1.7: record the verdict inline. A fixture whose verdict is FAIL must
		// not be committed as a golden vector — Tier 2 would pass against nothing.
		Content += TEXT("\n## Non-degeneracy (plan item 1.7)\n\n");
		Content += FString::Printf(TEXT("- **Verdict:** %s\n"), NonDegeneracy.Passed() ? TEXT("PASS") : TEXT("FAIL"));
		Content += FString::Printf(TEXT("- **Ticks captured:** %d\n"), NonDegeneracy.TickCount);
		Content += FString::Printf(TEXT("- **Canonical text varies:** %s\n"), NonDegeneracy.bCanonicalVaries ? TEXT("yes") : TEXT("no"));
		Content += FString::Printf(TEXT("- **Event stream non-empty:** %s (%d tick(s) with events)\n"),
			NonDegeneracy.bEventStreamNonEmpty ? TEXT("yes") : TEXT("no"), NonDegeneracy.TicksWithEvents);
		Content += FString::Printf(TEXT("- **Agents move:** %s\n"), NonDegeneracy.bAgentsMove ? TEXT("yes") : TEXT("no"));
		if (!NonDegeneracy.FailureReason.IsEmpty())
		{
			Content += FString::Printf(TEXT("- **Failure:** %s\n"), *NonDegeneracy.FailureReason);
		}

		Content += TEXT("\n## Files\n\n");
		Content += TEXT("- `canonical_state_v2.txt` — Per-tick canonical state text (v2, bit-exact IEEE-754 hex)\n");
		Content += TEXT("- `rng_state.txt` — Per-tick RNG state (initialSeed;seed;calls)\n");
		Content += TEXT("- `event_stream.txt` — Per-tick ordered event stream\n");
		Content += TEXT("- `state_hash.txt` — Per-tick BLAKE3 state hash\n");
		Content += TEXT("- `final_state.txt` — Final state summary\n");
		FFileHelper::SaveStringToFile(Content, *FilePath);

		if (!NonDegeneracy.Passed())
		{
			UE_LOG(LogNLTFixtureEmitter, Error,
				TEXT("Fixture capture is DEGENERATE (item 1.7): %s — do not commit as a golden vector"),
				*NonDegeneracy.FailureReason);
		}
	}

	UE_LOG(LogNLTFixtureEmitter, Log, TEXT("Fixtures written to %s"), *OutputDirectory);
}