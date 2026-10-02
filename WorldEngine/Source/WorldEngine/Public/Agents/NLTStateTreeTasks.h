#pragma once

#include "CoreMinimal.h"
#include "StateTreeTaskBase.h"
#include "StateTreeConditionBase.h"
#include "StateTreeExecutionTypes.h"
#include "MassStateTreeTypes.h"
#include "MassEntityTypes.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioUtils.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "NLTStateTreeTasks.generated.h"

class UNLTSmartObjectWorldSubsystem;
class UNLTSimulationSubsystem;
class UWorld;

// Forward declare the linker (full definition needed only in .cpp)
struct FStateTreeLinker;

// ============================================================================
// Instance Data Structs
// ============================================================================

/** Instance data for the SelectTarget task. */
USTRUCT()
struct FNLTStateTreeTaskSelectTargetInstanceData
{
    GENERATED_BODY()

    /** Threshold above which the highest need drives a target selection. */
    UPROPERTY(EditAnywhere, Category = "NLT|Task")
    float NeedThreshold = 0.3f;
};

/** Instance data for the SyncBehaviorFragments task. */
USTRUCT()
struct FNLTStateTreeTaskSyncBehaviorFragmentsInstanceData
{
    GENERATED_BODY()

    /** State to write into behavior fragment on enter. */
    UPROPERTY(EditAnywhere, Category = "NLT")
    ENLTStateTreeBehaviorState TargetState = ENLTStateTreeBehaviorState::Idle;

    /** Intent to mirror into FNLTAgentIntentFragment. */
    UPROPERTY(EditAnywhere, Category = "NLT")
    ENLTAgentIntent TargetIntent = ENLTAgentIntent::Idle;

    /** Need to record as the primary need (None = compute from highest need). */
    UPROPERTY(EditAnywhere, Category = "NLT")
    ENLTAgentNeed DrivenNeed = ENLTAgentNeed::None;
};

/** Instance data for the NeedAboveThreshold condition. */
USTRUCT()
struct FNLTStateTreeConditionNeedAboveThresholdInstanceData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, Category = "NLT|Condition")
    float Threshold = 0.3f;
};

/** Instance data for the MovementPhaseIs condition. */
USTRUCT()
struct FNLTStateTreeConditionMovementPhaseIsInstanceData
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, Category = "NLT|Condition")
    ENLTScenarioMovementPhase Phase = ENLTScenarioMovementPhase::Idle;
};

// ============================================================================
// Tasks
// ============================================================================

/**
 * Selects a target location for the agent based on its highest need.
 * Reads FNLTScenarioNeedsFragment + FNLTScenarioConfigFragment + FNLTAgentLocationFragment,
 * writes target + intent into FNLTScenarioBehaviorFragment + FNLTAgentIntentFragment +
 * FNLTAgentNeedsFragment.
 *
 * Behavior is identical to UNLTStateTreeBehaviorProcessor::SelectTarget —
 * this task is the editor-exposed counterpart for .sttree assets.
 */
USTRUCT(meta = (DisplayName = "NLT Select Target", Icon = "StateTreeEditorStyle|Node.Task"))
struct FNLTStateTreeTask_SelectTarget : public FMassStateTreeTaskBase
{
    GENERATED_BODY()

public:
    using FInstanceDataType = FNLTStateTreeTaskSelectTargetInstanceData;

    /** External data handles (linked via FStateTreeLinker::LinkExternalData). */
    TStateTreeExternalDataHandle<FNLTScenarioNeedsFragment> NeedsHandle;
    TStateTreeExternalDataHandle<FNLTScenarioConfigFragment> ConfigHandle;
    TStateTreeExternalDataHandle<FNLTAgentIdentityFragment> IdentityHandle;
    TStateTreeExternalDataHandle<FNLTAgentLocationFragment> LocationHandle;
    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;
    TStateTreeExternalDataHandle<FNLTAgentIntentFragment> IntentHandle;
    TStateTreeExternalDataHandle<FNLTAgentNeedsFragment> AgentNeedsHandle;
    TStateTreeExternalDataHandle<UNLTSmartObjectWorldSubsystem> SmartWorldHandle;
    TStateTreeExternalDataHandle<UNLTSimulationSubsystem> SimHandle;

    virtual const UStruct* GetInstanceDataType() const override
    {
        return FInstanceDataType::StaticStruct();
    }

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override;
    virtual void ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override {}

private:
    FVector SelectTargetInternal(FStateTreeExecutionContext& Context) const;
};

/**
 * Moves the entity one closed-form step toward the behavior target.
 * Reads FNLTScenarioConfigFragment + FNLTScenarioBehaviorFragment,
 * writes FNLTAgentLocationFragment.
 */
USTRUCT(meta = (DisplayName = "NLT Move To Target", Icon = "StateTreeEditorStyle|Node.Task"))
struct FNLTStateTreeTask_MoveToTarget : public FMassStateTreeTaskBase
{
    GENERATED_BODY()

public:
    using FInstanceDataType = FStateTreeNodeBase::FNoInstanceDataType;

    TStateTreeExternalDataHandle<FNLTAgentLocationFragment> LocationHandle;
    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;
    TStateTreeExternalDataHandle<FNLTScenarioConfigFragment> ConfigHandle;

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override
    {
        return EStateTreeRunStatus::Running;
    }
    virtual EStateTreeRunStatus Tick(FStateTreeExecutionContext& Context, const float DeltaTime) const override;
    virtual void ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override {}

private:
    void StepMovementInternal(FStateTreeExecutionContext& Context, float Dt) const;
};

/**
 * Syncs the StateTree state back to the Mass fragments (behavior phase,
 * intent, primary need).  Run as an "on enter state" task to keep the
 * visualizer and domain observers consistent.
 */
USTRUCT(meta = (DisplayName = "NLT Sync Behavior Fragments", Icon = "StateTreeEditorStyle|Node.Task"))
struct FNLTStateTreeTask_SyncBehaviorFragments : public FMassStateTreeTaskBase
{
    GENERATED_BODY()

public:
    using FInstanceDataType = FNLTStateTreeTaskSyncBehaviorFragmentsInstanceData;

    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;
    TStateTreeExternalDataHandle<FNLTAgentIntentFragment> IntentHandle;
    TStateTreeExternalDataHandle<FNLTAgentNeedsFragment> AgentNeedsHandle;
    TStateTreeExternalDataHandle<FNLTScenarioNeedsFragment> NeedsHandle;

    virtual const UStruct* GetInstanceDataType() const override
    {
        return FInstanceDataType::StaticStruct();
    }

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override;
    virtual void ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override {}
};

/**
 * Marks the entity as arriving (phase = Arrived, no target).
 */
USTRUCT(meta = (DisplayName = "NLT Mark Arrived", Icon = "StateTreeEditorStyle|Node.Task"))
struct FNLTStateTreeTask_MarkArrived : public FMassStateTreeTaskBase
{
    GENERATED_BODY()

public:
    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;
    TStateTreeExternalDataHandle<FNLTAgentLocationFragment> LocationHandle;

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual EStateTreeRunStatus EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override;
    virtual void ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const override {}
};

// ============================================================================
// Conditions
// ============================================================================

/**
 * Returns true when the highest need exceeds Threshold.
 */
USTRUCT(meta = (DisplayName = "NLT Need Above Threshold"))
struct FNLTStateTreeCondition_NeedAboveThreshold : public FMassStateTreeConditionBase
{
    GENERATED_BODY()

public:
    using FInstanceDataType = FNLTStateTreeConditionNeedAboveThresholdInstanceData;

    TStateTreeExternalDataHandle<FNLTScenarioNeedsFragment> NeedsHandle;

    virtual const UStruct* GetInstanceDataType() const override
    {
        return FInstanceDataType::StaticStruct();
    }

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual bool TestCondition(FStateTreeExecutionContext& Context) const override;
};

/**
 * Returns true when the behavior phase equals the target phase.
 */
USTRUCT(meta = (DisplayName = "NLT Movement Phase Is"))
struct FNLTStateTreeCondition_MovementPhaseIs : public FMassStateTreeConditionBase
{
    GENERATED_BODY()

public:
    using FInstanceDataType = FNLTStateTreeConditionMovementPhaseIsInstanceData;

    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;

    virtual const UStruct* GetInstanceDataType() const override
    {
        return FInstanceDataType::StaticStruct();
    }

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual bool TestCondition(FStateTreeExecutionContext& Context) const override;
};

/**
 * Returns true when the entity has no active target (bHasTarget == false).
 */
USTRUCT(meta = (DisplayName = "NLT Has No Target"))
struct FNLTStateTreeCondition_NoTarget : public FMassStateTreeConditionBase
{
    GENERATED_BODY()

public:
    TStateTreeExternalDataHandle<FNLTScenarioBehaviorFragment> BehaviorHandle;

    virtual bool Link(FStateTreeLinker& Linker) override;
    virtual void GetDependencies(UE::MassBehavior::FStateTreeDependencyBuilder& Builder) const override;

    virtual bool TestCondition(FStateTreeExecutionContext& Context) const override;
};
