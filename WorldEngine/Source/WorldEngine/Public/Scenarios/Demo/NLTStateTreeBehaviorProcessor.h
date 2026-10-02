#pragma once

#include "CoreMinimal.h"
#include "MassEntityQuery.h"
#include "MassProcessor.h"
#include "Scenarios/Demo/NLTDemoStateTreeBehavior.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
class UNLTSmartObjectWorldSubsystem;
class UNLTSimulationSubsystem;
#include "NLTStateTreeBehaviorProcessor.generated.h"

/**
 * StateTree-driven behavior processor for Mass entities.
 *
 * This processor **augments** (and, when bUseStateTreeBehavior is true, replaces)
 * the legacy UNLTScenarioDecisionProcessor + UNLTScenarioMovementProcessor.
 * It runs a C++-defined state machine over Mass entities that mirrors the
 * semantics of a UStateTree asset: states, transitions, conditions, and tasks.
 *
 * State machine (headless, no .sttree required):
 *
 *   Idle → EvaluateNeeds → SelectTarget → MoveToTarget → Arrived → (loop)
 *                                     ↘ FallbackWander → (same move logic)
 *
 * The needs-growth processor (UNLTScenarioNeedsProcessor) is **not** replaced —
 * it remains the single source of need-drive growth (deterministic, fragment-local,
 * parallel-safe).
 *
 * When a native Mass StateTree processor is later integrated, it can consume
 * editor-authored .sttree assets using the same fragment contract. This class
 * currently provides the deterministic C++ behavior path only.
 *
 * Determinism:
 *   - All decisions use NLTDemoScenario::DeterministicHash (FNV-1a) — no
 *     wall-clock RNG, no FRand.
 *   - The fixed timestep (NLTDemoScenario::TickDeltaSeconds) is the only time
 *     source.
 *   - Candidate sorting is deterministic (score desc, distance asc, name asc).
 */
UCLASS()
class UNLTStateTreeBehaviorProcessor : public UMassProcessor
{
    GENERATED_BODY()

public:
    UNLTStateTreeBehaviorProcessor();

    /** When true, this processor drives decision + movement; the legacy
     *  UNLTScenarioDecisionProcessor / UNLTScenarioMovementProcessor are
     *  effectively bypassed (they early-out when this fragment is present
     *  and enabled).  Default: true. */
    UPROPERTY(EditAnywhere, Category = "NLT|StateTree")
    bool bUseStateTreeBehavior = true;

    /** Behavior definition asset assigned to entities that do not specify one. */
    UPROPERTY(EditAnywhere, Category = "NLT|StateTree")
    TSoftObjectPtr<UNLTDemoStateTreeBehavior> DefaultBehaviorDefinition;

    /** If true, logs every state transition (verbose — enable for debugging / QA). */
    UPROPERTY(EditAnywhere, Category = "NLT|StateTree")
    bool bLogTransitions = false;

protected:
    virtual void ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager) override;
    virtual void Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context) override;

    /** Initializes the StateTree behavior fragment for entities that are
     *  missing one (e.g. spawned without the config fragment). */
    void InitializeStateTreeFragments(FMassEntityManager& EntityManager);

    /** Runs one state-machine tick for a single entity's fragments. */
    void TickStateTree(
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
        const UNLTDemoStateTreeBehavior* BehaviorDef) const;

    /** Selects the highest need (deterministic tie-break by enum order). */
    ENLTAgentNeed PickHighestNeed(const FNLTScenarioNeedsFragment& Needs, float& OutValue) const;

    /** Deterministic candidate selection (highest score, nearest, name-asc;
     *  falls back to a seeded wander target when no candidates match). */
    FVector SelectTarget(
        const int32 SimulationTick,
        const UNLTSmartObjectWorldSubsystem* SmartWorld,
        const ENLTAgentNeed Need,
        const FNLTScenarioConfigFragment& Config,
        const FNLTAgentIdentityFragment& Identity,
        const FVector& CurrentPosition) const;

    /** Closed-form movement step toward target (no Chaos physics). */
    void StepMovement(
        const float Dt,
        const float Speed,
        const float ArrivalRadius,
        const FVector& Target,
        FNLTAgentLocationFragment& Location,
        FNLTScenarioBehaviorFragment& Behavior) const;

    /** Transitions the state machine and records the reason. */
    void TransitionTo(ENLTStateTreeBehaviorState NewState, FName Reason,
                      int32 CurrentTick, FNLTStateTreeBehaviorFragment& STBehavior) const;

    FMassEntityQuery EntityQuery;
};
