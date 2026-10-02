#include "Agents/NLTAgentSpawnerSubsystem.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTAgentSpawner);

void UNLTAgentSpawnerSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
}

void UNLTAgentSpawnerSubsystem::Deinitialize()
{
    Super::Deinitialize();
}

void UNLTAgentSpawnerSubsystem::SpawnAgent(const FNLTSpawnRequest& Request)
{
    UWorld* World = GetWorld();
    if (!World) return;

            UMassEntitySubsystem* EntityManagerSub = World->GetSubsystem<UMassEntitySubsystem>();
    if (!EntityManagerSub || !EntityManagerSub->GetInitializationState().bPostInitializeCalled)
    {
        UE_LOG(LogNLTAgentSpawner, Warning, TEXT("SpawnAgent: MassEntity subsystem not initialized; cannot spawn"));
        return;
    }


    FMassEntityManager& EntityManager = EntityManagerSub->GetMutableEntityManager();

    TArray<FInstancedStruct> Fragments;

    FNLTAgentIdentityFragment Identity;
    Identity.AgentId = FName(*FString::Printf(TEXT("Agent_%d"), AgentCount));
    Identity.ProfileId = Request.ProfileId;
    Identity.Role = Request.Role;
    Identity.DisplayName = *Request.DisplayName;
    Fragments.Add(FInstancedStruct::Make(Identity));

    FNLTAgentLocationFragment Location;
    Location.Position = Request.Position;
    Fragments.Add(FInstancedStruct::Make(Location));

    Fragments.Add(FInstancedStruct::Make(FNLTAgentIntentFragment()));
    Fragments.Add(FInstancedStruct::Make(FNLTAgentCognitiveFragment()));
    Fragments.Add(FInstancedStruct::Make(FNLTAgentNeedsFragment()));
    Fragments.Add(FInstancedStruct::Make(FNLTAgentBehaviorFragment()));

    AppendScenarioFragments(Fragments, AgentCount);

    FMassEntityHandle Entity = EntityManager.CreateEntity(Fragments);
    SpawnedEntities.Add(Entity);

    AgentCount++;
    UE_LOG(LogNLTAgentSpawner, Log, TEXT("Spawned agent: %s at %s"),
        *Identity.AgentId.ToString(), *Request.Position.ToString());
}

void UNLTAgentSpawnerSubsystem::AppendScenarioFragments(TArray<FInstancedStruct>& Fragments, int32 AgentIndex)
{
    // Deterministic per-agent variation: stable hash of (spawn seed, agent index).
    const uint32 AgentHash = NLTDemoScenario::DeterministicHash(
        static_cast<uint32>(SpawnSeed), static_cast<uint32>(AgentIndex));
    FRandomStream AgentStream(static_cast<int32>(AgentHash));

    FNLTScenarioNeedsFragment Needs;
    Needs.Quiet = AgentStream.FRandRange(0.10f, 0.35f);
    Needs.Rest = AgentStream.FRandRange(0.05f, 0.25f);
    Needs.Social = AgentStream.FRandRange(0.15f, 0.45f);
    Needs.Stimulation = AgentStream.FRandRange(0.10f, 0.40f);

    FNLTScenarioConfigFragment Config;
    Config.MovementSpeed = AgentStream.FRandRange(120.0f, 180.0f);
    Config.ArrivalRadius = 100.0f;
    Config.DecisionIntervalTicks = 60;
    Config.WanderRadius = 1500.0f;
    Config.NeedGrowthMultiplier = NeedGrowthMultiplier;

    Fragments.Add(FInstancedStruct::Make(Needs));
    Fragments.Add(FInstancedStruct::Make(Config));
    Fragments.Add(FInstancedStruct::Make(FNLTScenarioBehaviorFragment()));

    // StateTree behavior layer fragments — enables the UNLTStateTreeBehaviorProcessor
    // to drive decision + movement for this entity.  The config fragment points at
    // the default behavior definition; the StateTree behavior fragment tracks
    // runtime state.
    FNLTStateTreeBehaviorFragment STBehavior;
    STBehavior.State = ENLTStateTreeBehaviorState::Idle;
    STBehavior.bEnabled = true;
    STBehavior.bUsingFallback = false;
    Fragments.Add(FInstancedStruct::Make(STBehavior));

    FNLTStateTreeBehaviorConfigFragment STConfig;
    STConfig.NeedGrowthOverride = 1.0f;
    Fragments.Add(FInstancedStruct::Make(STConfig));
}

void UNLTAgentSpawnerSubsystem::SpawnAgents(int32 Count, const FVector& Origin, float Radius)
{
    SpawnAgentsDeterministic(Count, Origin, Radius, SpawnSeed);
}

void UNLTAgentSpawnerSubsystem::SpawnAgentsByType(FName AgentType, int32 Count)
{
    // Default spawn origin at world center with 500cm radius
    SpawnAgentsDeterministic(Count, FVector::ZeroVector, 500.0f, SpawnSeed);
}

void UNLTAgentSpawnerSubsystem::SpawnAgentsDeterministic(int32 Count, const FVector& Origin, float Radius, int32 Seed)
{
    SpawnSeed = Seed;
    FRandomStream PositionStream(Seed);

    for (int32 i = 0; i < Count; i++)
    {
        FNLTSpawnRequest Request;
        Request.ProfileId = NAME_None;
        // Deterministic role rotation: Avatar / Aide / Advocate
        Request.Role = static_cast<ENLTAgentRole>(1 + (i % 3));
        Request.DisplayName = FString::Printf(TEXT("Agent_%d"), AgentCount + i);
        Request.Position = Origin + FVector(
            PositionStream.FRandRange(-Radius, Radius),
            PositionStream.FRandRange(-Radius, Radius),
            0.0f
        );
        SpawnAgent(Request);
    }
}

void UNLTAgentSpawnerSubsystem::DespawnAllAgents()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        SpawnedEntities.Empty();
        AgentCount = 0;
        return;
    }

        UMassEntitySubsystem* EntityManagerSub = World->GetSubsystem<UMassEntitySubsystem>();
    if (!EntityManagerSub || !EntityManagerSub->GetInitializationState().bPostInitializeCalled)
    {
        UE_LOG(LogNLTAgentSpawner, Warning, TEXT("DespawnAllAgents: MassEntity not initialized; clearing %d entity handles"), SpawnedEntities.Num());
        SpawnedEntities.Empty();
        AgentCount = 0;
        return;
    }


    FMassEntityManager& EntityManager = EntityManagerSub->GetMutableEntityManager();
    if (SpawnedEntities.Num() > 0)
    {
        EntityManager.BatchDestroyEntities(SpawnedEntities);
    }
    SpawnedEntities.Empty();
    AgentCount = 0;
}
