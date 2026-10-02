#include "Agents/NLTStateTreeSchema.h"
#include "Scenarios/Demo/NLTDemoScenarioFragments.h"
#include "Scenarios/Demo/NLTDemoScenarioUtils.h"
#include "Agents/NLTAgentFragments.h"
#include "Agents/NLTStateTreeFragments.h"
#include "Agents/NLTStateTreeTasks.h"
#include "StateTree.h"
#include "StateTreeConditionBase.h"
#include "StateTreeTaskBase.h"
#include "StateTreeLinker.h"
#include "StateTreeSchema.h"
#include "Subsystems/WorldSubsystem.h"
#include "MassEntityTypes.h"
#include "MassStateTreeTypes.h"
#include "MassStateTreeDependency.h"

void UNLTStateTreeSchema::PostLoad()
{
    Super::PostLoad();
}

bool UNLTStateTreeSchema::IsStructAllowed(const UScriptStruct* InScriptStruct) const
{
    if (!InScriptStruct)
    {
        return false;
    }

    // Allow all Mass StateTree nodes (tasks, conditions, evaluators, property functions)
    // and common (non-Mass) StateTree nodes.
    return InScriptStruct->IsChildOf(FMassStateTreeTaskBase::StaticStruct())
        || InScriptStruct->IsChildOf(FMassStateTreeConditionBase::StaticStruct())
        || InScriptStruct->IsChildOf(FMassStateTreeEvaluatorBase::StaticStruct())
        || InScriptStruct->IsChildOf(FMassStateTreePropertyFunctionBase::StaticStruct())
        || InScriptStruct->IsChildOf(FStateTreeTaskCommonBase::StaticStruct())
        || InScriptStruct->IsChildOf(FStateTreeConditionCommonBase::StaticStruct());
}

bool UNLTStateTreeSchema::IsExternalItemAllowed(const UStruct& InStruct) const
{
    // Allow WorldSubsystems and Mass fragments as external data.
    return InStruct.IsChildOf(UWorldSubsystem::StaticClass())
        || UE::Mass::IsA<FMassFragment>(&InStruct);
}

bool UNLTStateTreeSchema::Link(FStateTreeLinker& Linker)
{
    // Each task/condition node binds its own external data handles via its
    // own Link() method.  The schema's Link() here delegates to the base
    // implementation which handles the standard schema-level resolution.
    // Mass fragment dependencies are collected via GetDependencies() on
    // each node by UMassStateTreeSchema when running under the Mass
    // integration.
    return Super::Link(Linker);
}
