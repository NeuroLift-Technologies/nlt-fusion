#pragma once

#include "CoreMinimal.h"
#include "StateTreeSchema.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioUtils.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "NLTStateTreeSchema.generated.h"

/**
 * Custom StateTree schema for NLT Mass entities.
 *
 * Defines the context data (Mass fragments + world subsystems) that custom
 * StateTree tasks and conditions can access.  When a .sttree asset using this
 * schema is run on a Mass entity via UMassStateTreeProcessor, the fragments
 * below are bound as "ExternalData" entries that the task/condition structs
 * read through FStateTreeExecutionContext::GetExternalDataPtr<Handle>.
 *
 * The same fragment contract is consumed directly by
 * UNLTStateTreeBehaviorProcessor (the C++ data-asset path) so that the
 * editor-authored and headless paths share identical semantics.
 *
 * In UE 5.8+ the StateTree runtime uses FStateTreeExternalDataDesc (not
 * FStateTreeExternalData) and resolves handles through FStateTreeLinker.
 * The schema's Link() method collects fragment/subsystem dependencies
 * declared by each node's GetDependencies().
 */
UCLASS(DisplayName = "NLT Agent StateTree")
class UNLTStateTreeSchema : public UStateTreeSchema
{
    GENERATED_BODY()

public:
    // ---- UStateTreeSchema interface ----

    /**
     * Returns true for our custom task structs and common StateTree nodes.
     */
    virtual bool IsStructAllowed(const UScriptStruct* InScriptStruct) const override;

    /**
     * Allows WorldSubsystems and Mass fragments as external data items.
     */
    virtual bool IsExternalItemAllowed(const UStruct& InStruct) const override;

    /**
     * Resolves external-data handles for all nodes in the StateTree.
     * Delegates to UMassStateTreeSchema's dependency-collection pattern.
     */
    virtual bool Link(FStateTreeLinker& Linker) override;

    /**
     * Returns the external data descriptors that the StateTree runtime
     * needs to bind before execution.
     *
     * Note: In UE 5.8 the Mass StateTree integration resolves fragment
     * access through the Mass execution context, so this typically returns
     * empty — the schema's Link() + node GetDependencies() carry the
     * binding contract.
     */
    virtual TConstArrayView<FStateTreeExternalDataDesc> GetContextDataDescs() const override
    {
        return {};
    }

    // ---- Editor-friendly properties ----

    /** When true, allows the StateTree to bind to any Actor (not just NLT pawns). */
    UPROPERTY()
    bool bAllowAnyActor = false;

    /** When true, requires the entity to have FNLTStateTreeBehaviorFragment. */
    UPROPERTY()
    bool bRequireBehaviorFragment = true;

protected:
    virtual void PostLoad() override;

private:
    /** External data descriptors exposed to the StateTree tasks/conditions. */
    TArray<FStateTreeExternalDataDesc> ExternalDataDescs;
};
