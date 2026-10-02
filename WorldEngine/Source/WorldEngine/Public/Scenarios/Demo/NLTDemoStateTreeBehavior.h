#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "MassEntityTypes.h"
#include "StateTree.h"
#include "Engine/DataAsset.h"
#include "Agents/NLTStateTreeFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "NLTDemoStateTreeBehavior.generated.h"

/**
 * Per-state configuration for the StateTree behavior definition.
 * Each entry describes what happens when the behavior layer enters a state
 * and the conditions that trigger a transition out of it.
 */
USTRUCT(BlueprintType)
struct FNLTStateTreeBehaviorStateConfig
{
    GENERATED_BODY()

    /** State this config describes. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "State")
    ENLTStateTreeBehaviorState State = ENLTStateTreeBehaviorState::Idle;

    /** Number of ticks to remain in this state before re-evaluating transitions
     *  (0 = re-evaluate every tick).  This gates decision frequency so the
     *  state machine does not re-pick targets every tick. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "State")
    int32 TicksInState = 0;

    /** Need threshold (0..1) — when the highest need exceeds this, the agent
     *  is driven to act.  Below this it stays Idle. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "State", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float NeedThreshold = 0.3f;

    /** Arrival radius override (cm); 0 = use the config fragment's ArrivalRadius. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "State")
    float OverrideArrivalRadius = 0.0f;
};

/**
 * Defines the state-machine topology, transition conditions, and parameters
 * that UNLTStateTreeBehaviorProcessor walks each tick. It is the deterministic
 * headless-compatible behavior definition; it is not a UStateTree asset.
 *
 * Intended usage:
 *   1. Assign to FNLTStateTreeBehaviorConfigFragment.BehaviorDefinition at spawn.
 *   2. UNLTStateTreeBehaviorProcessor reads this asset to drive each entity.
 *   3. When a .sttree asset is later authored in-editor using the custom
 *      FNLTStateTreeTask_* / FNLTStateTreeCondition_* structs, point
 *      BehaviorDefinition at the .sttree and the processor will use UMassStateTreeProcessor
 *      instead — same fragment contract, same behavior semantics.
 */
UCLASS(BlueprintType)
class UNLTDemoStateTreeBehavior : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    /** Initial state every entity starts in. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree")
    ENLTStateTreeBehaviorState InitialState = ENLTStateTreeBehaviorState::Idle;

    /** Per-state configuration table. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree")
    TArray<FNLTStateTreeBehaviorStateConfig> States;

    /** The UStateTree asset to use when running in editor mode (optional).
     *  If this is None, the processor uses this C++ data-asset definition instead. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree")
    TSoftObjectPtr<UStateTree> EditorStateTree;

    /** Number of ticks between re-evaluations when in Idle (0 = every tick). */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree", meta = (ClampMin = "1"))
    int32 IdleReevaluationInterval = 10;

    /** Number of ticks to stay in Arrived before transitioning back to Idle. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree", meta = (ClampMin = "1"))
    int32 ArrivedHoldTicks = 5;

    /** Need urgency (0..1) that triggers a re-evaluation from Idle even if
     *  IdleReevaluationInterval has not elapsed. */
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "StateTree", meta = (ClampMin = "0.0", ClampMax = "1.0"))
    float UrgencyReevaluationThreshold = 0.5f;

    /** Convenience: builds a default behavior config with the canonical transitions. */
    static TArray<FNLTStateTreeBehaviorStateConfig> GetDefaultStateConfigs();

    /** Returns the config for a given state, or nullptr if not found. */
    const FNLTStateTreeBehaviorStateConfig* GetStateConfig(ENLTStateTreeBehaviorState InState) const;

    /** Returns true if this definition requires the editor StateTree path. */
    bool HasEditorStateTree() const { return !EditorStateTree.IsNull(); }
};
