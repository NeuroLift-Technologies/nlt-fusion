#pragma once

#include "CoreMinimal.h"
#include "Core/NLTFusionCore.h"
#include "MassEntityTypes.h"
#include "MassEntityConcepts.h"
#include "NLTStateTreeFragments.generated.h"

/**
 * Lifecycle states for the StateTree-driven behavior layer on a Mass entity.
 *
 * Mirrors the StateTree "state" concept but is stored as a fragment so the
 * processor, visualizer, and headless tests all observe a single source of
 * truth without requiring a runtime UStateTree instance.
 */
UENUM()
enum class ENLTStateTreeBehaviorState : uint8
{
    /** Initial / neutral — needs are below threshold, no active target. */
    Idle            UMETA(DisplayName = "Idle"),

    /** Needs are being evaluated to determine the highest-priority drive. */
    EvaluateNeeds   UMETA(DisplayName = "Evaluate Needs"),

    /** A target location is being selected from scored candidates (or fallback wander). */
    SelectTarget    UMETA(DisplayName = "Select Target"),

    /** The entity is moving toward the selected target. */
    MoveToTarget    UMETA(DisplayName = "Move To Target"),

    /** The entity has reached its target and begins arrival cool-down. */
    Arrived         UMETA(DisplayName = "Arrived"),

    /** No world location matches the current need; running deterministic random wander. */
    FallbackWander  UMETA(DisplayName = "Fallback Wander"),

    /** A coached or override behavior is active (external command). */
    Override        UMETA(DisplayName = "Override"),
};

/**
 * Per-entity runtime state for the StateTree behavior layer.
 *
 * This fragment is the bridge between the C++ Mass processor and any
 * editor-authored UStateTree asset that uses the custom task/condition
 * classes in NLTStateTreeTasks / NLTStateTreeConditions.  When a
 * .sttree asset is present the UMassStateTreeProcessor owns this state;
 * when running headless (no editor) the UNLTStateTreeBehaviorProcessor
 * owns it directly.
 */
USTRUCT()
struct FNLTStateTreeBehaviorFragment : public FMassFragment
{
    GENERATED_BODY()

    /** Current behavior state machine state. */
    UPROPERTY()
    ENLTStateTreeBehaviorState State = ENLTStateTreeBehaviorState::Idle;

    /** Simulation tick at which the current state was entered. */
    UPROPERTY()
    int32 StateEnterTick = 0;

    /** Number of ticks spent in the current state (resets on entry). */
    UPROPERTY()
    int32 StateTicks = 0;

    /** Most recent reason the state machine transitioned (for debugging / determinism logs). */
    UPROPERTY()
    FName LastTransitionReason;

    /** Whether the StateTree behavior layer is active for this entity.
     *  When false, the legacy UNLTScenarioDecisionProcessor / MovementProcessor
     *  (if enabled) retain control. */
    UPROPERTY()
    bool bEnabled = true;

    /** When true, the entity is using the fallback wander path (no matching locations). */
    UPROPERTY()
    bool bUsingFallback = false;
};

/**
 * Optional fragment that binds a UDataAsset behavior definition (and, when
 * available, a UStateTree asset) to a Mass entity template.  Spawned entities
 * get this at construction time so the processor knows which behavior to run.
 */
USTRUCT()
struct FNLTStateTreeBehaviorConfigFragment : public FMassFragment
{
    GENERATED_BODY()

    /** Soft reference to the behavior-definition data asset. */
    UPROPERTY()
    TSoftObjectPtr<UObject> BehaviorDefinition;

    /** Soft reference to an optional editor-authored UStateTree asset.
     *  If this is None the processor falls back to the C++ data-asset path. */
    UPROPERTY()
    TSoftObjectPtr<UObject> StateTreeAsset;

    /** Need-growth multiplier override (1.0 = use the config fragment's value). */
    UPROPERTY()
    float NeedGrowthOverride = 1.0f;
};

/**
 * TSoftObjectPtr is not trivially copyable (it contains an FString path),
 * so we opt into the Mass fragment exception for this config fragment.
 */
template<>
struct TMassFragmentTraits<FNLTStateTreeBehaviorConfigFragment>
{
    static constexpr bool AuthorAcceptsItsNotTriviallyCopyable = true;
};
