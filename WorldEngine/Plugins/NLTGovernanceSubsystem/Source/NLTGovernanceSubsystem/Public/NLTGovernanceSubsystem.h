#pragma warning(disable: 4668) // __GNUC__ undefined on MSVC
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"
#include "Subsystems/WorldSubsystem.h"
#include "NLTGovernanceSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTGovernance, Log, All);

class FNLTGovernanceSubsystemModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};

/**
 * NLTGovernanceSubsystem — World-level governance manager for Unreal Engine 5.
 * 
 * Integrates ASFDK-C++ (TOI/OTOI/RRT/Sleepwalker) with UE5 Mass Entity and Actor
 * systems. Provides governance-aware AI decision-making, emotional continuity,
 * and crisis intervention for NLT agent simulations.
 */
UCLASS()
class NLTGOVERNANCESUBSYSTEM_API UNLTGovernanceSubsystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Get the singleton governance subsystem for this world */
    static UNLTGovernanceSubsystem* Get(const UWorld* World);

    // ===================== Governance API =====================

    /** Initialize governance for a specific agent */
    UFUNCTION(BlueprintCallable, Category = "NLT|Governance")
    void InitializeAgent(FName AgentId, const FString& AgentName);

    /** Shutdown governance for a specific agent */
    UFUNCTION(BlueprintCallable, Category = "NLT|Governance")
    void ShutdownAgent(FName AgentId);

    /** Process an interaction through the governance pipeline */
    UFUNCTION(BlueprintCallable, Category = "NLT|Governance")
    FString ProcessInteraction(FName AgentId, const FString& Input, const FString& Channel);

    /** Assess an agent's current state */
    UFUNCTION(BlueprintCallable, Category = "NLT|Governance")
    FString AssessAgent(FName AgentId, const FString& Input);

    /** Get the overall governance status */
    UFUNCTION(BlueprintPure, Category = "NLT|Governance")
    FString GetGovernanceStatus() const;

    /** Check if governance is active for an agent */
    UFUNCTION(BlueprintPure, Category = "NLT|Governance")
    bool IsAgentInitialized(FName AgentId) const;

private:
    /** Map of agent IDs to their governance state */
    TMap<FName, TSharedPtr<class FAgentGovernanceState>> AgentStates;

    /** Global governance configuration */
    FString GovernanceConfigPath;
};
