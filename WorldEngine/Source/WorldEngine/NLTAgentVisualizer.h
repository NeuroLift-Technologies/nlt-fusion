#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "MassEntityQuery.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Particles/ParticleSystem.h"
#include "Particles/ParticleSystemComponent.h"
#include "Components/PostProcessComponent.h"
#include "Visual/NLTVisualLODPolicy.h"
#include "NLTAgentVisualizer.generated.h"

// Visual state for mass agents
UENUM(BlueprintType)
enum class EMassAgentVisualState : uint8
{
    Normal UMETA(DisplayName = "Normal"),
    Focused UMETA(DisplayName = "Focused"), 
    Stressed UMETA(DisplayName = "Stressed"),
    Interacting UMETA(DisplayName = "Interacting")
};

// Team identification for mass agents
UENUM(BlueprintType)
enum class EMassAgentTeam : uint8
{
    Neutral UMETA(DisplayName = "Neutral"),
    TeamA UMETA(DisplayName = "Team A"),
    TeamB UMETA(DisplayName = "Team B"),
    TeamC UMETA(DisplayName = "Team C")
};

UCLASS()
class ANLTAgentVisualizer : public AActor
{
    GENERATED_BODY()

public:
    ANLTAgentVisualizer();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    // ============== Mesh & Materials ==============
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Mesh")
    UStaticMesh* AgentMesh;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Materials")
    UMaterialInterface* AgentMaterial;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Materials")
    UMaterialInterface* StressedMaterial;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Materials")
    UMaterialInterface* FocusedMaterial;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    float AgentScale = 1.0f;

    // ============== Particle Systems ==============
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Particles")
    UParticleSystem* StressParticles;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|Particles")
    UParticleSystem* FocusAuraParticles;
    
    // ============== Visualization Settings ==============
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    bool bShowDebugText = true;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    bool bUseTeamColors = true;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    bool bShowStressEffects = true;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    bool bShowFocusEffects = true;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    float StressThresholdForEffects = 0.6f;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    float FocusThresholdForEffects = 0.7f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization|LOD")
	FNLTVisualLODPolicy VisualLODPolicy;


private:
    UPROPERTY()
    UHierarchicalInstancedStaticMeshComponent* HISMComponent;
    
    UPROPERTY()
    UParticleSystemComponent* StressParticleComponent;
    
    UPROPERTY()
    UParticleSystemComponent* FocusAuraParticleComponent;
    
    UPROPERTY()
    UPostProcessComponent* PostProcessComponent;

    FMassEntityQuery EntityQuery;
    
    // State tracking
    TArray<FVector> ActiveStressLocations;
    TArray<FVector> ActiveFocusLocations;

	TMap<FName, ENLTVisualLODLevel> AgentVisualLevels;


    void SetupQuery();
    void UpdateVisuals();
    void ApplyStateBasedMaterials(const TArray<FTransform>& InstanceTransforms, const TArray<FLinearColor>& StateColors, const TArray<int32>& TeamIds, const TArray<EMassAgentVisualState>& States);
    void UpdateParticleEffects(const TArray<FVector>& StressLocations, const TArray<FVector>& FocusLocations);
    void UpdatePostProcessingEffects(float StressFactor, float FocusFactor);
    
    FLinearColor GetTeamColor(int32 TeamId) const;
    EMassAgentVisualState GetVisualState(float Stress, float Focus) const;

protected:
    // Material parameter names
    static const FName ParamStressLevel;
    static const FName ParamFocusLevel;
    static const FName ParamTeamColor;
    static const FName ParamPulseIntensity;
};
