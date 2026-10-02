#pragma warning(disable: 4668) // __GNUC__ undefined on MSVC
#include "NLTGovernanceSubsystem.h"
#include "AgentGovernanceState.h"
#include <nlohmann/json.hpp> // used directly below (GetGovernanceStatus); was previously only reaching this TU transitively via AgentGovernanceState.h -> asfdk/ASFDK.h

DEFINE_LOG_CATEGORY(LogNLTGovernance);

UNLTGovernanceSubsystem* UNLTGovernanceSubsystem::Get(const UWorld* World)
{
    if (!World) return nullptr;
    return World->GetSubsystem<UNLTGovernanceSubsystem>();
}

void UNLTGovernanceSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogNLTGovernance, Log, TEXT("NLTGovernanceSubsystem initialized"));
}

void UNLTGovernanceSubsystem::Deinitialize()
{
    AgentStates.Empty();
    Super::Deinitialize();
    UE_LOG(LogNLTGovernance, Log, TEXT("NLTGovernanceSubsystem deinitialized"));
}

void UNLTGovernanceSubsystem::InitializeAgent(FName AgentId, const FString& AgentName)
{
    if (AgentStates.Contains(AgentId))
    {
        UE_LOG(LogNLTGovernance, Warning, TEXT("Agent %s already initialized"), *AgentId.ToString());
        return;
    }

    AgentStates.Add(AgentId, MakeShared<FAgentGovernanceState>(AgentId, AgentName));
    UE_LOG(LogNLTGovernance, Log, TEXT("Agent %s initialized"), *AgentId.ToString());
}

void UNLTGovernanceSubsystem::ShutdownAgent(FName AgentId)
{
    AgentStates.Remove(AgentId);
    UE_LOG(LogNLTGovernance, Log, TEXT("Agent %s shutdown"), *AgentId.ToString());
}

FString UNLTGovernanceSubsystem::ProcessInteraction(FName AgentId, const FString& Input, const FString& Channel)
{
    TSharedPtr<FAgentGovernanceState>* StatePtr = AgentStates.Find(AgentId);
    if (!StatePtr)
    {
        UE_LOG(LogNLTGovernance, Error, TEXT("Agent %s not found"), *AgentId.ToString());
        return TEXT("{\"error\": \"agent not found\"}");
    }

    return (*StatePtr)->ProcessInteraction(Input, Channel);
}

FString UNLTGovernanceSubsystem::AssessAgent(FName AgentId, const FString& Input)
{
    TSharedPtr<FAgentGovernanceState>* StatePtr = AgentStates.Find(AgentId);
    if (!StatePtr)
    {
        UE_LOG(LogNLTGovernance, Error, TEXT("Agent %s not found"), *AgentId.ToString());
        return TEXT("{\"error\": \"agent not found\"}");
    }

    return (*StatePtr)->Assess(Input);
}

FString UNLTGovernanceSubsystem::GetGovernanceStatus() const
{
    nlohmann::json Status;
    Status["subsystemActive"] = true;
    Status["agentCount"] = AgentStates.Num();

    nlohmann::json AgentsJson = nlohmann::json::array();
    for (const auto& Pair : AgentStates)
    {
        nlohmann::json AgentJson;
        AgentJson["agentId"] = std::string(TCHAR_TO_UTF8(*Pair.Key.ToString()));
        AgentJson["agentName"] = std::string(TCHAR_TO_UTF8(*Pair.Value->GetAgentName()));
        AgentJson["status"] = nlohmann::json::parse(std::string(TCHAR_TO_UTF8(*Pair.Value->GetStatusJson())));
        AgentsJson.push_back(AgentJson);
    }
    Status["agents"] = AgentsJson;

    return FString(Status.dump().c_str());
}

bool UNLTGovernanceSubsystem::IsAgentInitialized(FName AgentId) const
{
    return AgentStates.Contains(AgentId);
}
