#pragma warning(disable: 4668) // __GNUC__ undefined on MSVC
// AgentGovernanceState.h — Internal per-agent governance state (not exposed to UE reflection)
#pragma once

#include "CoreMinimal.h"
#include <string>
#include <memory>

// Include ASFDK-C++ headers via the ThirdParty include path
#include <asfdk/ASFDK.h>

/**
 * FAgentGovernanceState — Per-agent governance state.
 * Wraps the ASFDK C++ instance for a single agent.
 */
class FAgentGovernanceState
{
public:
    FAgentGovernanceState(const FName& InAgentId, const FString& InAgentName);
    ~FAgentGovernanceState();

    /** Process an interaction through the governance pipeline */
    FString ProcessInteraction(const FString& Input, const FString& Channel);

    /** Assess an agent's current state */
    FString Assess(const FString& Input);

    /** Get the overall status as JSON */
    FString GetStatusJson();

    FName GetAgentId() const { return AgentId; }
    FString GetAgentName() const { return AgentName; }

private:
    FName AgentId;
    FString AgentName;
    asfdk::ASFDK Asfdk;
    bool bInitialized = true;
};
