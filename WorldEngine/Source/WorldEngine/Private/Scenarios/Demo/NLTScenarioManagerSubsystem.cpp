#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/UScenarioDataAsset.h"
#include "Agents/NLTAgentSpawnerSubsystem.h"
#include "Agents/NLTAgentFragments.h"
#include "Simulation/NLTSimulationSubsystem.h"
#include "Audio/NLTSoundscapeSubsystem.h"
#include "World/NLTEnvironmentVariation.h"
#include "MassEntityManager.h"
#include "MassEntityQuery.h"
#include "MassEntitySubsystem.h"
#include "MassExecutionContext.h"
#include "GenericPlatform/GenericPlatformMisc.h"

DEFINE_LOG_CATEGORY(LogNLTScenarioManager);

namespace
{
    /**
     * Scenario difficulty -> need-growth multiplier (deterministic mapping):
     *   pleasant + low demand  -> 1.0 (baseline pace)
     *   aversive + high demand -> 2.0 (needs climb twice as fast)
     */
    float ScenarioGrowthMultiplier(const UScenarioDataAsset* Scenario)
    {
        if (!Scenario)
        {
            return 1.0f;
        }
        return 1.0f + FMath::Clamp(Scenario->Aversiveness, 0.0f, 1.0f) * 0.5f
                   + FMath::Clamp(Scenario->CognitiveDemand, 0.0f, 1.0f) * 0.5f;
    }
}

bool UNLTScenarioManagerSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
    if (!Super::ShouldCreateSubsystem(Outer))
    {
        return false;
    }
    const UWorld* World = Cast<UWorld>(Outer);
    return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE);
}

void UNLTScenarioManagerSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogNLTScenarioManager, Log, TEXT("Scenario manager initialized"));

    // Cache the soundscape subsystem for audio control
    SoundscapeSubsystem = GetWorld()->GetSubsystem<UNLTSoundscapeSubsystem>();
}

void UNLTScenarioManagerSubsystem::Deinitialize()
{
    StopScenario();
    Super::Deinitialize();
}

bool UNLTScenarioManagerSubsystem::StartScenario(const FNLTScenarioParams& Params)
{
    return StartScenarioInternal(Params, nullptr, 1.0f);
}

bool UNLTScenarioManagerSubsystem::StartScenarioWithAsset(const FNLTScenarioParams& Params, UScenarioDataAsset* Scenario)
{
    return StartScenarioInternal(Params, Scenario, ScenarioGrowthMultiplier(Scenario));
}

bool UNLTScenarioManagerSubsystem::StartScenarioInternal(const FNLTScenarioParams& Params, UScenarioDataAsset* Scenario, float NeedGrowthMultiplier)
{
    UWorld* World = GetWorld();
    UNLTAgentSpawnerSubsystem* Spawner = World ? World->GetSubsystem<UNLTAgentSpawnerSubsystem>() : nullptr;
    if (!Spawner)
    {
        UE_LOG(LogNLTScenarioManager, Error, TEXT("StartScenario failed: spawner subsystem unavailable"));
        return false;
    }

    // Fresh run: drop any previous agents
    StopScenario();

    Spawner->SetNeedGrowthMultiplier(NeedGrowthMultiplier);
    Spawner->SpawnAgentsDeterministic(Params.NumAgents, Params.SpawnOrigin, Params.SpawnRadius, Params.Seed);

    ActiveParams = Params;
    ActiveScenario = Scenario;
    ScenarioTick = 0;
    bScenarioActive = true;

    // Apply seeded micro-variation for environment dressing
    if (UNLTEnvironmentVariationSubsystem* EnvVar = GetEnvironmentVariationSubsystem())
    {
        const FName ScenarioId = Scenario ? Scenario->ScenarioId : NAME_None;
        EnvVar->ApplyEnvironmentVariation(ScenarioId, Params.Seed);
    }

    if (Params.bAutoStartSimulation)
    {
        if (UNLTSimulationSubsystem* Sim = World->GetSubsystem<UNLTSimulationSubsystem>())
        {
            Sim->StartSimulation();
        }
    }

    // Activate soundscape (occupied world) — stress-driven audio
    if (SoundscapeSubsystem)
    {
        SoundscapeSubsystem->SetOrigin(Params.SpawnOrigin);
        SoundscapeSubsystem->Activate();
        // Initial stress from scenario aversiveness
        const float InitialStress = Scenario ? (Scenario->Aversiveness * 0.5f + Scenario->CognitiveDemand * 0.5f) : 0.3f;
        SoundscapeSubsystem->SetStressLevel(InitialStress);
    }

    UE_LOG(LogNLTScenarioManager, Log, TEXT("Scenario started: %d agents, seed %d, radius %.0f, scenario=%s, needGrowth=%.2f"),
        Params.NumAgents, Params.Seed, Params.SpawnRadius,
        Scenario ? *Scenario->ScenarioId.ToString() : TEXT("<none>"), NeedGrowthMultiplier);
    LogCheckpoint(TEXT("ScenarioStart"));
    return true;
}

void UNLTScenarioManagerSubsystem::StopScenario()
{
    UWorld* World = GetWorld();
    UNLTAgentSpawnerSubsystem* Spawner = World ? World->GetSubsystem<UNLTAgentSpawnerSubsystem>() : nullptr;
    if (Spawner)
    {
        Spawner->DespawnAllAgents();
    }
    bScenarioActive = false;
    bHeadlessSelfTest = false;
    ActiveScenario = nullptr;
    ScenarioTick = 0;

    // Deactivate soundscape (dead world)
    if (SoundscapeSubsystem)
    {
        SoundscapeSubsystem->Deactivate();
    }
}

UNLTEnvironmentVariationSubsystem* UNLTScenarioManagerSubsystem::GetEnvironmentVariationSubsystem() const
{
    UWorld* World = GetWorld();
    return World ? World->GetSubsystem<UNLTEnvironmentVariationSubsystem>() : nullptr;
}

void UNLTScenarioManagerSubsystem::TickScenarioManager(float DeltaTime)
{
    if (!bScenarioActive)
    {
        return;
    }

    UWorld* World = GetWorld();
    UNLTSimulationSubsystem* Sim = World ? World->GetSubsystem<UNLTSimulationSubsystem>() : nullptr;
    if (!Sim || !Sim->IsRunning())
    {
        return;
    }

    // One fixed simulation tick per manager tick (drives the decision processor's clock)
    Sim->StepTick();
    ScenarioTick++;

    // Update soundscape stress based on scenario difficulty
    if (SoundscapeSubsystem && ActiveScenario)
    {
        const float BaseStress = (ActiveScenario->Aversiveness + ActiveScenario->CognitiveDemand) * 0.5f;
        const float TimeStress = FMath::Clamp(static_cast<float>(ScenarioTick) / 3600.0f, 0.0f, 0.3f);
        SoundscapeSubsystem->SetStressLevel(BaseStress + TimeStress);
        SoundscapeSubsystem->TickSoundscape(DeltaTime);
    }

    if (bHeadlessSelfTest)
    {
        if (ScenarioTick >= NextCheckpointTick)
        {
            LogCheckpoint(TEXT("Checkpoint"));
            NextCheckpointTick += 100;
        }
        if (ScenarioTick >= HeadlessMaxTicks)
        {
            FinishHeadlessSelfTest();
        }
    }
}
uint32 UNLTScenarioManagerSubsystem::ComputeAgentStateHash() const
{
    UWorld* World = GetWorld();
            UMassEntitySubsystem* EntitySub = World ? World->GetSubsystem<UMassEntitySubsystem>() : nullptr;
    if (!EntitySub || !EntitySub->GetInitializationState().bPostInitializeCalled)
    {
        return 0;
    }


    FMassEntityManager& EntityManager = EntitySub->GetMutableEntityManager();

        FMassEntityQuery Query(EntityManager.AsShared());
    Query.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly);
    Query.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadOnly);
    Query.CacheArchetypes();

    // Collect (AgentIdString, Position) pairs, then sort by id for a stable hash.
    TArray<TPair<FString, FVector>> AgentStates;
    FMassExecutionContext Context(EntityManager);
    Query.ForEachEntityChunk(Context, [&AgentStates](FMassExecutionContext& Ctx)
    {
        const int32 NumEntities = Ctx.GetNumEntities();
        TConstArrayView<FNLTAgentIdentityFragment> Identities = Ctx.GetFragmentView<FNLTAgentIdentityFragment>();
        TConstArrayView<FNLTAgentLocationFragment> Locations = Ctx.GetFragmentView<FNLTAgentLocationFragment>();
        for (int32 i = 0; i < NumEntities; i++)
        {
            AgentStates.Emplace(Identities[i].AgentId.ToString(), Locations[i].Position);
        }
    });

    AgentStates.Sort([](const TPair<FString, FVector>& A, const TPair<FString, FVector>& B)
    {
        return A.Key < B.Key;
    });

    uint32 Hash = 2166136261u;
    for (const TPair<FString, FVector>& State : AgentStates)
    {
        const FTCHARToUTF8 IdBytes(*State.Key);
        for (int32 i = 0; i < IdBytes.Length(); i++)
        {
            Hash = (Hash ^ static_cast<uint8>(IdBytes.Get()[i])) * 16777619u;
        }
        const FVector& P = State.Value;
        const float Components[3] = { P.X, P.Y, P.Z };
        for (const float RawComponent : Components)
        {
            // Quantize to micrometers so float noise cannot flip the hash.
            const float Quantized = FMath::RoundToFloat(RawComponent * 1000.0f) / 1000.0f;
            uint32 Bits = 0;
            FMemory::Memcpy(&Bits, &Quantized, sizeof(uint32));
            Hash = (Hash ^ Bits) * 16777619u;
        }
    }
    return Hash;
}

void UNLTScenarioManagerSubsystem::BeginHeadlessSelfTest(int32 InMaxTicks)
{
    bHeadlessSelfTest = true;
    HeadlessMaxTicks = FMath::Max(1, InMaxTicks);
    NextCheckpointTick = 100;
    UE_LOG(LogNLTScenarioManager, Log, TEXT("Headless self-test armed: %d ticks"), HeadlessMaxTicks);
}

void UNLTScenarioManagerSubsystem::LogCheckpoint(const TCHAR* Label) const
{
    int32 NumAgents = 0;
    if (const UWorld* World = GetWorld())
    {
        if (const UNLTAgentSpawnerSubsystem* Spawner = World->GetSubsystem<UNLTAgentSpawnerSubsystem>())
        {
            NumAgents = Spawner->GetAgentCount();
        }
    }
    UE_LOG(LogNLTScenarioManager, Log, TEXT("[%s] tick=%d agents=%d stateHash=%08x"),
        Label, ScenarioTick, NumAgents, ComputeAgentStateHash());
}

void UNLTScenarioManagerSubsystem::FinishHeadlessSelfTest()
{
    bHeadlessSelfTest = false;
    UE_LOG(LogNLTScenarioManager, Display, TEXT("NLT_HEADLESS_TEST_COMPLETE tick=%d stateHash=%08x"),
        ScenarioTick, ComputeAgentStateHash());

    // Clean process exit for headless automation runs (-game -nullrhi).
    FGenericPlatformMisc::RequestExit(false);
}
