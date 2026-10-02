#include "Agents/NLTStateTreeTasks.h"
#include "StateTreeExecutionContext.h"
#include "StateTreeLinker.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioUtils.h"
#include "World/NLTSmartObjectWorldSubsystem.h"
#include "Simulation/NLTSimulationSubsystem.h"
#include "MassStateTreeDependency.h"

// ============================================================================
// FNLTStateTreeTask_SelectTarget
// ============================================================================

bool FNLTStateTreeTask_SelectTarget::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(NeedsHandle);
    Linker.LinkExternalData(ConfigHandle);
    Linker.LinkExternalData(IdentityHandle);
    Linker.LinkExternalData(LocationHandle);
    Linker.LinkExternalData(BehaviorHandle);
    Linker.LinkExternalData(IntentHandle);
    Linker.LinkExternalData(AgentNeedsHandle);
    Linker.LinkExternalData(SmartWorldHandle);
    Linker.LinkExternalData(SimHandle);
    return true;
}

void FNLTStateTreeTask_SelectTarget::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadWrite<FNLTScenarioNeedsFragment>();
    Builder.AddReadWrite<FNLTScenarioConfigFragment>();
    Builder.AddReadWrite<FNLTAgentIdentityFragment>();
    Builder.AddReadWrite<FNLTAgentLocationFragment>();
    Builder.AddReadWrite<FNLTScenarioBehaviorFragment>();
    Builder.AddReadWrite<FNLTAgentIntentFragment>();
    Builder.AddReadWrite<FNLTAgentNeedsFragment>();
    Builder.AddReadWrite<UNLTSmartObjectWorldSubsystem>();
    Builder.AddReadWrite<UNLTSimulationSubsystem>();
}

EStateTreeRunStatus FNLTStateTreeTask_SelectTarget::EnterState(
    FStateTreeExecutionContext& Context,
    const FStateTreeTransitionResult& Transition) const
{
    const FVector Target = SelectTargetInternal(Context);

    // Write target into the Mass fragments (same contract as the processor).
    if (FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle))
    {
        Behavior->TargetPosition = Target;
        Behavior->bHasTarget = true;
        Behavior->Phase = ENLTScenarioMovementPhase::Moving;
    }
    if (FNLTAgentIntentFragment* Intent =
        Context.GetExternalDataPtr(IntentHandle))
    {
        if (const FNLTScenarioNeedsFragment* Needs =
            Context.GetExternalDataPtr(NeedsHandle))
        {
            float Urgency = 0.0f;
            const ENLTAgentNeed DrivenNeed = HighestNeed(*Needs, Urgency);
            Intent->Intent = IntentForNeed(DrivenNeed);
            Intent->TargetLocation = Target;
        }
    }

    return EStateTreeRunStatus::Running;
}

FVector FNLTStateTreeTask_SelectTarget::SelectTargetInternal(FStateTreeExecutionContext& Context) const
{
    const FNLTScenarioNeedsFragment* Needs =
        Context.GetExternalDataPtr(NeedsHandle);
    const FNLTScenarioConfigFragment* Config =
        Context.GetExternalDataPtr(ConfigHandle);
    const FNLTAgentIdentityFragment* Identity =
        Context.GetExternalDataPtr(IdentityHandle);
    const FNLTAgentLocationFragment* Location =
        Context.GetExternalDataPtr(LocationHandle);
    if (!Needs || !Config || !Identity || !Location)
    {
        return FVector::ZeroVector;
    }

    const UNLTSmartObjectWorldSubsystem* SmartWorld =
        Context.GetExternalDataPtr(SmartWorldHandle);
    const UNLTSimulationSubsystem* Sim =
        Context.GetExternalDataPtr(SimHandle);
    if (!SmartWorld || !Sim)
    {
        return FVector::ZeroVector;
    }

    float Urgency = 0.0f;
    const ENLTAgentNeed Need = HighestNeed(*Needs, Urgency);

    // Gather unoccupied candidates
    TArray<FNLTScenarioCandidate> Candidates;
    const TArray<FNLTWorldLocation> MatchingLocations =
        SmartWorld->FindLocationsByNeed(Need);
    Candidates.Reserve(MatchingLocations.Num());
    for (const FNLTWorldLocation& Loc : MatchingLocations)
    {
        if (Loc.bIsOccupied) continue;
        FNLTScenarioCandidate Candidate;
        Candidate.WorldLocation = Loc.WorldLocation;
        Candidate.DisplayName = Loc.DisplayName;
        Candidate.Score = ScoreLocationForNeed(Loc, Need);
        Candidate.Distance = FVector::Distance(Location->Position, Loc.WorldLocation);
        Candidates.Add(Candidate);
    }

    SortCandidatesDeterministic(Candidates);

    if (Candidates.Num() > 0)
    {
        return Candidates[0].WorldLocation;
    }

    // Fallback: deterministic seeded wander
    const uint32 Seed = NLTDemoScenario::DeterministicHash(
        GetTypeHash(Identity->AgentId),
        static_cast<uint32>(Sim->GetCurrentTick()));
    FRandomStream Stream(static_cast<int32>(Seed));
    const float Angle = Stream.FRandRange(0.0f, 2.0f * PI);
    const float Radius = Stream.FRandRange(0.25f, 1.0f) * Config->WanderRadius;
    return Location->Position + FVector(
        FMath::Cos(Angle) * Radius,
        FMath::Sin(Angle) * Radius,
        0.0f);
}

// ============================================================================
// FNLTStateTreeTask_MoveToTarget
// ============================================================================

bool FNLTStateTreeTask_MoveToTarget::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(LocationHandle);
    Linker.LinkExternalData(BehaviorHandle);
    Linker.LinkExternalData(ConfigHandle);
    return true;
}

void FNLTStateTreeTask_MoveToTarget::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadWrite<FNLTAgentLocationFragment>();
    Builder.AddReadWrite<FNLTScenarioBehaviorFragment>();
    Builder.AddReadOnly<FNLTScenarioConfigFragment>();
}

EStateTreeRunStatus FNLTStateTreeTask_MoveToTarget::Tick(
    FStateTreeExecutionContext& Context,
    const float DeltaTime) const
{
    // The headless simulation uses a fixed timestep; DeltaTime is ignored
    // in favor of NLTDemoScenario::TickDeltaSeconds to preserve determinism.
    StepMovementInternal(Context, NLTDemoScenario::TickDeltaSeconds);
    return EStateTreeRunStatus::Running;
}

void FNLTStateTreeTask_MoveToTarget::StepMovementInternal(FStateTreeExecutionContext& Context, float Dt) const
{
    FNLTAgentLocationFragment* Location =
        Context.GetExternalDataPtr(LocationHandle);
    FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle);
    const FNLTScenarioConfigFragment* Config =
        Context.GetExternalDataPtr(ConfigHandle);
    if (!Location || !Behavior || !Config)
    {
        return;
    }

    const FVector ToTarget = Behavior->TargetPosition - Location->Position;
    const float Distance = ToTarget.Size();
    const float Step = Config->MovementSpeed * Dt;

    if (Distance <= FMath::Max(Step, Config->ArrivalRadius))
    {
        Location->Position = Behavior->TargetPosition;
        Location->Velocity = FVector::ZeroVector;
        Location->bIsMoving = false;
        Behavior->Phase = ENLTScenarioMovementPhase::Arrived;
        Behavior->bHasTarget = false;
    }
    else
    {
        const FVector Dir = ToTarget / Distance;
        Location->Position += Dir * Step;
        Location->Velocity = Dir * Config->MovementSpeed;
        Location->Heading = FMath::RadiansToDegrees(FMath::Atan2(Dir.Y, Dir.X));
        Location->bIsMoving = true;
    }

    Location->WorldCell = FIntVector(
        FMath::FloorToInt32(Location->Position.X / 100.0f),
        FMath::FloorToInt32(Location->Position.Y / 100.0f),
        0);
}

// ============================================================================
// FNLTStateTreeTask_SyncBehaviorFragments
// ============================================================================

bool FNLTStateTreeTask_SyncBehaviorFragments::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(BehaviorHandle);
    Linker.LinkExternalData(IntentHandle);
    Linker.LinkExternalData(AgentNeedsHandle);
    Linker.LinkExternalData(NeedsHandle);
    return true;
}

void FNLTStateTreeTask_SyncBehaviorFragments::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadWrite<FNLTScenarioBehaviorFragment>();
    Builder.AddReadWrite<FNLTAgentIntentFragment>();
    Builder.AddReadWrite<FNLTAgentNeedsFragment>();
    Builder.AddReadWrite<FNLTScenarioNeedsFragment>();
}

EStateTreeRunStatus FNLTStateTreeTask_SyncBehaviorFragments::EnterState(
    FStateTreeExecutionContext& Context,
    const FStateTreeTransitionResult& Transition) const
{
    const FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

    if (FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle))
    {
        Behavior->Phase = ENLTScenarioMovementPhase::Idle;
    }
    if (FNLTAgentIntentFragment* Intent =
        Context.GetExternalDataPtr(IntentHandle))
    {
        Intent->Intent = InstanceData.TargetIntent;
    }
    if (FNLTAgentNeedsFragment* AgentNeeds =
        Context.GetExternalDataPtr(AgentNeedsHandle))
    {
        if (InstanceData.DrivenNeed != ENLTAgentNeed::None)
        {
            AgentNeeds->PrimaryNeed = InstanceData.DrivenNeed;
        }
        else if (const FNLTScenarioNeedsFragment* Needs =
            Context.GetExternalDataPtr(NeedsHandle))
        {
            float Urgency = 0.0f;
            const ENLTAgentNeed Highest = HighestNeed(*Needs, Urgency);
            AgentNeeds->PrimaryNeed = Highest;
            AgentNeeds->Urgency = Urgency;
        }
    }

    return EStateTreeRunStatus::Succeeded;
}

// ============================================================================
// FNLTStateTreeTask_MarkArrived
// ============================================================================

bool FNLTStateTreeTask_MarkArrived::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(BehaviorHandle);
    Linker.LinkExternalData(LocationHandle);
    return true;
}

void FNLTStateTreeTask_MarkArrived::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadWrite<FNLTScenarioBehaviorFragment>();
    Builder.AddReadWrite<FNLTAgentLocationFragment>();
}

EStateTreeRunStatus FNLTStateTreeTask_MarkArrived::EnterState(
    FStateTreeExecutionContext& Context,
    const FStateTreeTransitionResult& Transition) const
{
    if (FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle))
    {
        Behavior->Phase = ENLTScenarioMovementPhase::Arrived;
        Behavior->bHasTarget = false;
    }
    if (FNLTAgentLocationFragment* Location =
        Context.GetExternalDataPtr(LocationHandle))
    {
        Location->bIsMoving = false;
        Location->Velocity = FVector::ZeroVector;
    }

    return EStateTreeRunStatus::Succeeded;
}

// ============================================================================
// FNLTStateTreeCondition_NeedAboveThreshold
// ============================================================================

bool FNLTStateTreeCondition_NeedAboveThreshold::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(NeedsHandle);
    return true;
}

void FNLTStateTreeCondition_NeedAboveThreshold::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadOnly<FNLTScenarioNeedsFragment>();
}

bool FNLTStateTreeCondition_NeedAboveThreshold::TestCondition(FStateTreeExecutionContext& Context) const
{
    const FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

    const FNLTScenarioNeedsFragment* Needs =
        Context.GetExternalDataPtr(NeedsHandle);
    if (!Needs)
    {
        return false;
    }
    float Urgency = 0.0f;
    HighestNeed(*Needs, Urgency);
    return Urgency >= InstanceData.Threshold;
}

// ============================================================================
// FNLTStateTreeCondition_MovementPhaseIs
// ============================================================================

bool FNLTStateTreeCondition_MovementPhaseIs::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(BehaviorHandle);
    return true;
}

void FNLTStateTreeCondition_MovementPhaseIs::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadOnly<FNLTScenarioBehaviorFragment>();
}

bool FNLTStateTreeCondition_MovementPhaseIs::TestCondition(FStateTreeExecutionContext& Context) const
{
    const FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

    const FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle);
    if (!Behavior)
    {
        return false;
    }
    return Behavior->Phase == InstanceData.Phase;
}

// ============================================================================
// FNLTStateTreeCondition_NoTarget
// ============================================================================

bool FNLTStateTreeCondition_NoTarget::Link(FStateTreeLinker& Linker)
{
    Linker.LinkExternalData(BehaviorHandle);
    return true;
}

void FNLTStateTreeCondition_NoTarget::GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const
{
    Builder.AddReadOnly<FNLTScenarioBehaviorFragment>();
}

bool FNLTStateTreeCondition_NoTarget::TestCondition(FStateTreeExecutionContext& Context) const
{
    const FNLTScenarioBehaviorFragment* Behavior =
        Context.GetExternalDataPtr(BehaviorHandle);
    if (!Behavior)
    {
        return false;
    }
    return !Behavior->bHasTarget;
}
