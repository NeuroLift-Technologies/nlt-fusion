#include "Scenarios/Demo/NLTStateTreeBehaviorProcessor.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioUtils.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "Simulation/NLTSimulationSubsystem.h"
#include "World/NLTSmartObjectWorldSubsystem.h"
#include "MassEntityManager.h"
#include "MassExecutionContext.h"

DEFINE_LOG_CATEGORY_STATIC(LogNLTStateTreeBehavior, Log, All);

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

UNLTStateTreeBehaviorProcessor::UNLTStateTreeBehaviorProcessor()
    : EntityQuery(*this)
{
    // Run after the needs processor (which grows need drives) and before
    // the visualizer / network replication.
    ExecutionOrder.ExecuteInGroup = TEXT("Tasks");
    ExecutionOrder.ExecuteAfter.Add(TEXT("NLTScenarioNeedsProcessor"));
    bRequiresGameThreadExecution = true; // reads world subsystem state
}

// ---------------------------------------------------------------------------
// ConfigureQueries
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager)
{
    EntityQuery.AddRequirement<FNLTScenarioNeedsFragment>(EMassFragmentAccess::ReadOnly);
    EntityQuery.AddRequirement<FNLTScenarioConfigFragment>(EMassFragmentAccess::ReadOnly);
    EntityQuery.AddRequirement<FNLTScenarioBehaviorFragment>(EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FNLTAgentIdentityFragment>(EMassFragmentAccess::ReadOnly);
    EntityQuery.AddRequirement<FNLTAgentLocationFragment>(EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FNLTAgentIntentFragment>(EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FNLTAgentNeedsFragment>(EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FNLTStateTreeBehaviorFragment>(EMassFragmentAccess::ReadWrite);
    EntityQuery.AddRequirement<FNLTStateTreeBehaviorConfigFragment>(EMassFragmentAccess::ReadOnly);
    EntityQuery.RegisterWithProcessor(*this);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context)
{
    UWorld* World = EntityManager.GetWorld();
    if (!World)
    {
        return;
    }

    const UNLTSimulationSubsystem* Sim = World->GetSubsystem<UNLTSimulationSubsystem>();
    const UNLTSmartObjectWorldSubsystem* SmartWorld = World->GetSubsystem<UNLTSmartObjectWorldSubsystem>();
    if (!Sim || !SmartWorld)
    {
        UE_LOG(LogNLTStateTreeBehavior, Warning, TEXT("UNLTStateTreeBehaviorProcessor: Missing required subsystems (Sim: %s, SmartWorld: %s), skipping behavior processing"),
            Sim ? TEXT("found") : TEXT("missing"), SmartWorld ? TEXT("found") : TEXT("missing"));
        return;
    }

    const int32 SimulationTick = Sim->GetCurrentTick();

    InitializeStateTreeFragments(EntityManager);

    const bool bUseSTT = bUseStateTreeBehavior;
    const TSoftObjectPtr<UNLTDemoStateTreeBehavior>& DefaultDef = DefaultBehaviorDefinition;

    EntityQuery.ForEachEntityChunk(Context,
        [this, SimulationTick, SmartWorld, bUseSTT, DefaultDef](FMassExecutionContext& Context)
        {
            const int32 NumEntities = Context.GetNumEntities();
            TConstArrayView<FNLTScenarioNeedsFragment> Needs = Context.GetFragmentView<FNLTScenarioNeedsFragment>();
            TConstArrayView<FNLTScenarioConfigFragment> Configs = Context.GetFragmentView<FNLTScenarioConfigFragment>();
            TArrayView<FNLTScenarioBehaviorFragment> Behaviors = Context.GetMutableFragmentView<FNLTScenarioBehaviorFragment>();
            TConstArrayView<FNLTAgentIdentityFragment> Identities = Context.GetFragmentView<FNLTAgentIdentityFragment>();
            TArrayView<FNLTAgentLocationFragment> Locations = Context.GetMutableFragmentView<FNLTAgentLocationFragment>();
            TArrayView<FNLTAgentIntentFragment> Intents = Context.GetMutableFragmentView<FNLTAgentIntentFragment>();
            TArrayView<FNLTAgentNeedsFragment> AgentNeeds = Context.GetMutableFragmentView<FNLTAgentNeedsFragment>();
            TArrayView<FNLTStateTreeBehaviorFragment> STBehaviors = Context.GetMutableFragmentView<FNLTStateTreeBehaviorFragment>();
            TConstArrayView<FNLTStateTreeBehaviorConfigFragment> STConfigs = Context.GetFragmentView<FNLTStateTreeBehaviorConfigFragment>();

            for (int32 i = 0; i < NumEntities; i++)
            {
                FNLTStateTreeBehaviorFragment& STBehavior = STBehaviors[i];
                if (!STBehavior.bEnabled || !bUseSTT)
                {
                    continue;
                }

                const UNLTDemoStateTreeBehavior* BehaviorDef = nullptr;
                const FNLTStateTreeBehaviorConfigFragment& STConfig = STConfigs[i];
                if (STConfig.BehaviorDefinition.ToSoftObjectPath().IsValid())
                {
                    // In a fully-loaded game this would be a synchronous load;
                    // for the headless path we fall through to the default.
                    BehaviorDef = Cast<UNLTDemoStateTreeBehavior>(
                        STConfig.BehaviorDefinition.Get());
                }
                if (!BehaviorDef && DefaultDef.ToSoftObjectPath().IsValid())
                {
                    BehaviorDef = Cast<UNLTDemoStateTreeBehavior>(DefaultDef.Get());
                }
                if (!BehaviorDef)
                {
                    BehaviorDef = Cast<UNLTDemoStateTreeBehavior>(
                        StaticLoadObject(UNLTDemoStateTreeBehavior::StaticClass(),
                                         nullptr,
                                         TEXT("/Game/NLT/Behaviors/DefaultStateTreeBehavior.DefaultStateTreeBehavior")));
                }
                if (!BehaviorDef)
                {
                    // No behavior definition available — skip this entity.
                    continue;
                }

                TickStateTree(SimulationTick, SmartWorld, Needs[i], Configs[i],
                              Identities[i], Locations[i], Behaviors[i], Intents[i],
                              AgentNeeds[i], STBehavior, BehaviorDef);
            }
        });
}

// ---------------------------------------------------------------------------
// InitializeStateTreeFragments
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::InitializeStateTreeFragments(FMassEntityManager& EntityManager)
{
    // Entities spawned through UNLTAgentSpawnerSubsystem already get the
    // fragment via AppendScenarioFragments / SpawnAgent.  This guard handles
    // entities spawned through other paths (Mass Spawner, etc.) that may
    // lack the StateTree behavior fragment.
    // No-op: the query requires the fragment, so entities without it are
    // simply not matched.
}

// ---------------------------------------------------------------------------
// TickStateTree — the core per-entity state machine
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::TickStateTree(
    const int32 SimulationTick,
    const UNLTSmartObjectWorldSubsystem* SmartWorld,
    const FNLTScenarioNeedsFragment& Needs,
    const FNLTScenarioConfigFragment& Config,
    const FNLTAgentIdentityFragment& Identity,
    FNLTAgentLocationFragment& Location,
    FNLTScenarioBehaviorFragment& Behavior,
    FNLTAgentIntentFragment& Intent,
    FNLTAgentNeedsFragment& AgentNeeds,
    FNLTStateTreeBehaviorFragment& STBehavior,
    const UNLTDemoStateTreeBehavior* BehaviorDef) const
{
    const float Dt = NLTDemoScenario::TickDeltaSeconds;
    const ENLTStateTreeBehaviorState CurrentState = STBehavior.State;

    // Advance state-local tick counter
    STBehavior.StateTicks++;

    // Track the highest need for transition conditions
    float NeedValue = 0.0f;
    const ENLTAgentNeed HighestNeed = PickHighestNeed(Needs, NeedValue);

    switch (CurrentState)
    {
    case ENLTStateTreeBehaviorState::Idle:
    {
        // Transition: Idle → EvaluateNeeds when any need exceeds the threshold.
        if (NeedValue >= BehaviorDef->UrgencyReevaluationThreshold)
        {
            TransitionTo(ENLTStateTreeBehaviorState::EvaluateNeeds,
                TEXT("NeedAboveThreshold"), SimulationTick, STBehavior);
        }
        else if (BehaviorDef->IdleReevaluationInterval > 0 &&
                 STBehavior.StateTicks >= BehaviorDef->IdleReevaluationInterval)
        {
            TransitionTo(ENLTStateTreeBehaviorState::Idle,
                TEXT("IdleReevaluation"), SimulationTick, STBehavior);
        }
        // Stay Idle otherwise
        break;
    }

    case ENLTStateTreeBehaviorState::EvaluateNeeds:
    {
        // Record the driven need and immediately transition to target selection.
        Behavior.DrivenNeed = HighestNeed;
        AgentNeeds.PrimaryNeed = HighestNeed;
        AgentNeeds.Urgency = NeedValue;
        Intent.Intent = IntentForNeed(HighestNeed);
        TransitionTo(ENLTStateTreeBehaviorState::SelectTarget,
            TEXT("NeedEvaluated"), SimulationTick, STBehavior);
        break;
    }

    case ENLTStateTreeBehaviorState::SelectTarget:
    {
        const FVector Target = SelectTarget(SimulationTick, SmartWorld,
            HighestNeed, Config, Identity, Location.Position);

        Behavior.TargetPosition = Target;
        Behavior.bHasTarget = true;
        Behavior.Phase = ENLTScenarioMovementPhase::Moving;
        Intent.TargetLocation = Target;
        Intent.SourceTick = SimulationTick;

        // Determine whether we hit the fallback path
        // (re-derive the candidate situation to set bUsingFallback)
        const TArray<FNLTWorldLocation> MatchingLocations =
            SmartWorld->FindLocationsByNeed(HighestNeed);
        TArray<FNLTScenarioCandidate> Candidates;
        for (const FNLTWorldLocation& Loc : MatchingLocations)
        {
            if (Loc.bIsOccupied) continue;
            FNLTScenarioCandidate Candidate;
            Candidate.WorldLocation = Loc.WorldLocation;
            Candidate.DisplayName = Loc.DisplayName;
            Candidate.Score = ScoreLocationForNeed(Loc, HighestNeed);
            Candidate.Distance = FVector::Dist(Location.Position, Loc.WorldLocation);
            Candidates.Add(Candidate);
        }

        if (Candidates.Num() == 0)
        {
            STBehavior.bUsingFallback = true;
            TransitionTo(ENLTStateTreeBehaviorState::FallbackWander,
                TEXT("NoMatchingLocations"), SimulationTick, STBehavior);
        }
        else
        {
            STBehavior.bUsingFallback = false;
            TransitionTo(ENLTStateTreeBehaviorState::MoveToTarget,
                TEXT("TargetSelected"), SimulationTick, STBehavior);
        }
        break;
    }

    case ENLTStateTreeBehaviorState::MoveToTarget:
    {
        StepMovement(Dt, Config.MovementSpeed,
            Config.ArrivalRadius, Behavior.TargetPosition,
            Location, Behavior);

        if (Behavior.Phase == ENLTScenarioMovementPhase::Arrived)
        {
            TransitionTo(ENLTStateTreeBehaviorState::Arrived,
                TEXT("ArrivedAtTarget"), SimulationTick, STBehavior);
        }
        break;
    }

    case ENLTStateTreeBehaviorState::FallbackWander:
    {
        StepMovement(Dt, Config.MovementSpeed,
            Config.ArrivalRadius, Behavior.TargetPosition,
            Location, Behavior);

        if (Behavior.Phase == ENLTScenarioMovementPhase::Arrived)
        {
            TransitionTo(ENLTStateTreeBehaviorState::Arrived,
                TEXT("WanderArrived"), SimulationTick, STBehavior);
        }
        break;
    }

    case ENLTStateTreeBehaviorState::Arrived:
    {
        // Hold for ArrivedHoldTicks, then go back to Idle to re-evaluate needs.
        if (STBehavior.StateTicks >= BehaviorDef->ArrivedHoldTicks)
        {
            Behavior.Phase = ENLTScenarioMovementPhase::Idle;
            Behavior.bHasTarget = false;
            Location.bIsMoving = false;
            Location.Velocity = FVector::ZeroVector;
            Intent.TargetLocation = Location.Position;
            TransitionTo(ENLTStateTreeBehaviorState::Idle,
                TEXT("ArrivedHoldElapsed"), SimulationTick, STBehavior);
        }
        break;
    }

    case ENLTStateTreeBehaviorState::Override:
    {
        // External command controls behavior — no auto-transitions.
        // The caller clears bEnabled / sets state when the override ends.
        break;
    }
    }
}

// ---------------------------------------------------------------------------
// PickHighestNeed — deterministic tie-break by enum order
// ---------------------------------------------------------------------------

ENLTAgentNeed UNLTStateTreeBehaviorProcessor::PickHighestNeed(
    const FNLTScenarioNeedsFragment& Needs, float& OutValue) const
{
    ENLTAgentNeed Best = ENLTAgentNeed::Quiet;
    float BestValue = Needs.Quiet;
    if (Needs.Rest > BestValue)    { Best = ENLTAgentNeed::Rest;    BestValue = Needs.Rest; }
    if (Needs.Social > BestValue)  { Best = ENLTAgentNeed::Social;  BestValue = Needs.Social; }
    if (Needs.Stimulation > BestValue) { Best = ENLTAgentNeed::Stimulation; BestValue = Needs.Stimulation; }
    OutValue = BestValue;
    return Best;
}

// ---------------------------------------------------------------------------
// SelectTarget — deterministic candidate selection with fallback
// ---------------------------------------------------------------------------

FVector UNLTStateTreeBehaviorProcessor::SelectTarget(
    const int32 SimulationTick,
    const UNLTSmartObjectWorldSubsystem* SmartWorld,
    const ENLTAgentNeed Need,
    const FNLTScenarioConfigFragment& Config,
    const FNLTAgentIdentityFragment& Identity,
    const FVector& CurrentPosition) const
{
    // Gather unoccupied candidates matching this need
    TArray<FNLTScenarioCandidate> Candidates;
    const TArray<FNLTWorldLocation> MatchingLocations = SmartWorld->FindLocationsByNeed(Need);
    Candidates.Reserve(MatchingLocations.Num());
    for (const FNLTWorldLocation& Loc : MatchingLocations)
    {
        if (Loc.bIsOccupied) continue;
        FNLTScenarioCandidate Candidate;
        Candidate.WorldLocation = Loc.WorldLocation;
        Candidate.DisplayName = Loc.DisplayName;
        Candidate.Score = ScoreLocationForNeed(Loc, Need);
        Candidate.Distance = FVector::Dist(CurrentPosition, Loc.WorldLocation);
        Candidates.Add(Candidate);
    }

    // Deterministic sort: score desc, distance asc, name asc
    Candidates.Sort([](const FNLTScenarioCandidate& A, const FNLTScenarioCandidate& B)
    {
        if (A.Score != B.Score) return A.Score > B.Score;
        if (A.Distance != B.Distance) return A.Distance < B.Distance;
        return A.DisplayName < B.DisplayName;
    });

    if (Candidates.Num() > 0)
    {
        return Candidates[0].WorldLocation;
    }

    // Fallback: deterministic seeded wander target
    const uint32 Seed = NLTDemoScenario::DeterministicHash(
        GetTypeHash(Identity.AgentId),
        static_cast<uint32>(SimulationTick));
    FRandomStream Stream(static_cast<int32>(Seed));
    const float Angle = Stream.FRandRange(0.0f, 2.0f * PI);
    const float Radius = Stream.FRandRange(0.25f, 1.0f) * Config.WanderRadius;
    return CurrentPosition + FVector(
        FMath::Cos(Angle) * Radius,
        FMath::Sin(Angle) * Radius,
        0.0f);
}

// ---------------------------------------------------------------------------
// StepMovement — closed-form movement step (no Chaos physics)
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::StepMovement(
    const float Dt,
    const float Speed,
    const float ArrivalRadius,
    const FVector& Target,
    FNLTAgentLocationFragment& Location,
    FNLTScenarioBehaviorFragment& Behavior) const
{
    const FVector ToTarget = Target - Location.Position;
    const float Distance = ToTarget.Size();
    const float Step = Speed * Dt;

    if (Distance <= FMath::Max(Step, ArrivalRadius))
    {
        Location.Position = Target;
        Location.Velocity = FVector::ZeroVector;
        Location.bIsMoving = false;
        Behavior.Phase = ENLTScenarioMovementPhase::Arrived;
        Behavior.bHasTarget = false;
    }
    else
    {
        const FVector Dir = ToTarget / Distance;
        Location.Position += Dir * Step;
        Location.Velocity = Dir * Speed;
        Location.Heading = FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X));
        Location.bIsMoving = true;
    }

    Location.WorldCell = FIntVector(
        FMath::FloorToInt32(Location.Position.X / 100.0f),
        FMath::FloorToInt32(Location.Position.Y / 100.0f),
        0);
}

// ---------------------------------------------------------------------------
// TransitionTo — state change with logging + timestamp
// ---------------------------------------------------------------------------

void UNLTStateTreeBehaviorProcessor::TransitionTo(
    ENLTStateTreeBehaviorState NewState,
    FName Reason,
    int32 CurrentTick,
    FNLTStateTreeBehaviorFragment& STBehavior) const
{
    if (STBehavior.State != NewState)
    {
        UE_LOG(LogNLTStateTreeBehavior, Verbose,
            TEXT("[StateTree] %s -> %s @ tick %d (%s)"),
            *StaticEnum<ENLTStateTreeBehaviorState>()->GetNameStringByValue((int64)STBehavior.State),
            *StaticEnum<ENLTStateTreeBehaviorState>()->GetNameStringByValue((int64)NewState),
            CurrentTick, *Reason.ToString());
    }

    STBehavior.State = NewState;
    STBehavior.StateEnterTick = CurrentTick;
    STBehavior.StateTicks = 0;
    STBehavior.LastTransitionReason = Reason;
}
