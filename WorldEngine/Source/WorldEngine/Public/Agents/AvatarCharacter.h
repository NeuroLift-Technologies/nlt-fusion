// AvatarCharacter.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "AIController.h"
#include "Particles/ParticleSystemComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Agents/NLTAvatarVisualComponent.h"
#include "Agents/NLTEmotionStateComponent.h"
#include "Agents/NLTCharacterAnimationComponent.h"
#include "Agents/NLTPairChoreographyComponent.h"
#include "Visual/NLTVisualLODPolicy.h"
#include "AvatarCharacter.generated.h"

// Visual state for character
UENUM(BlueprintType)
enum class ECharacterVisualState : uint8
{
    Normal UMETA(DisplayName = "Normal"),
    Focused UMETA(DisplayName = "Focused"),
    Stressed UMETA(DisplayName = "Stressed"),
    Interacting UMETA(DisplayName = "Interacting")
};

// Team identification
UENUM(BlueprintType)
enum class ECharacterTeam : uint8
{
    Neutral UMETA(DisplayName = "Neutral"),
    TeamA UMETA(DisplayName = "Team A"),
    TeamB UMETA(DisplayName = "Team B"),
    TeamC UMETA(DisplayName = "Team C")
};

UCLASS()
class WORLDENGINE_API AAvatarCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AAvatarCharacter();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    // ============== AI Properties ==============
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
    float WanderRadius = 1000.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
    float WaitTimeMin = 2.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
    float WaitTimeMax = 5.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "AI")
    float InteractionRange = 200.0f;

    // ============== Visual Properties ==============

    // Team identification
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Team")
    ECharacterTeam Team = ECharacterTeam::Neutral;

    // Material overrides for different body parts
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Materials")
    UMaterialInterface* BodyMaterial;

    // Default skeletal mesh for the avatar body (for blueprint override)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Mesh")
    TObjectPtr<USkeletalMesh> DefaultMesh;

    // SimBody static mesh as fallback / loaded at runtime
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Mesh")
    TObjectPtr<UStaticMesh> SimBodyMesh;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Materials")
    UMaterialInterface* HeadMaterial;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Materials")
    UMaterialInterface* LimbsMaterial;

    // Dynamic material instances
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Materials")
    UMaterialInstanceDynamic* DynamicBodyMaterial;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Materials")
    UMaterialInstanceDynamic* DynamicHeadMaterial;

    // The static mesh component for the avatar's visible body (SimBody mesh)
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Mesh")
    UStaticMeshComponent* BodyMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|LOD")
	FNLTVisualLODPolicy VisualLODPolicy;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|LOD")
	ENLTVisualLODLevel CurrentVisualLOD = ENLTVisualLODLevel::LOD0_Near;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|LOD")
	ENLTVisualRepresentation CurrentVisualRepresentation = ENLTVisualRepresentation::Mesh;


    // ============== Particle Effects ==============

    // Stress particles (appears when stressed)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Particles")
    UParticleSystem* StressParticles;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Particles")
    UParticleSystemComponent* StressParticleComponent;

    // Focus aura (appears when focused)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Particles")
    UParticleSystem* FocusAuraParticles;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Particles")
    UParticleSystemComponent* FocusAuraComponent;

    // Interaction particles
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Particles")
    UParticleSystem* InteractionParticles;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|Particles")
    UParticleSystemComponent* InteractionParticleComponent;

    // ============== Post-Processing ==============

    // Character-specific post processing component
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|PostProcessing")
    UPostProcessComponent* PostProcessComponent;

    // ============== Visual State ==============

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visual|State")
    ECharacterVisualState CurrentVisualState = ECharacterVisualState::Normal;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|State")
    float StressThresholdForParticles = 0.6f;

    // ============== Cognitive State ==============
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Cognitive")
    class ULTCognitiveStateComponent* CognitiveState;

    // ============== Emotion State Machine ==============
    // Drives expressive body language from cognitive dimensions.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Emotion")
    class UNLTEmotionStateComponent* EmotionState;

    // ============== Character Animation ==============
    // Manages animation state machine, montages, and procedural posing.
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Animation")
    class UNLTCharacterAnimationComponent* CharacterAnimation;

    // ============== Pair Choreography ==============
    // Manages Avatar↔Aide social choreography (facing, co-reaction, coaching).
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Choreography")
    class UNLTPairChoreographyComponent* PairChoreography;

    // ============== Role & Mesh ==============
    // Whether this character is an Avatar or an Aide in the coaching pair.
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Role")
    ENLTAgentRole CharacterRole = ENLTAgentRole::Avatar;

    // If true, use a SkeletalMesh for rigged character animation
    // instead of the SimBody static mesh fallback.
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Mesh")
    bool bUseSkeletalMeshCharacter = false;

    // Skeleton asset to assign to the SkeletalMesh when bUseSkeletalMeshCharacter is true.
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visual|Mesh")
    TObjectPtr<USkeletalMesh> SkeletalMeshCharacter;

    // Assign a partner actor for pair choreography (Aide ↔ Avatar).
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Choreography")
    TObjectPtr<AActor> ChoreographyPartner;

    // ============== Avatar Visual Component ==============
    // Driven by cognitive state (status ring, emissive glow, state particles).
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|AvatarVisual")
    class UNLTAvatarVisualComponent* AvatarVisualComponent;

protected:
    float FocusThresholdForAura = 0.7f;

    virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

    // Visual update functions
	void UpdateVisualLOD();

    void UpdateVisualState();
    void UpdateMaterials();
    void UpdateParticleEffects();
    void UpdatePostProcessing();

    // Helper functions
    FLinearColor GetTeamColor() const;
    float GetStressLevel() const;
    float GetFocusLevel() const;

    // ============== Emotion / Animation helpers ==============
    void InitializeCharacterMesh();
    void BindEmotionToComponents();
    void UpdateChoreography(float DeltaTime);

    // Material parameter names
    static const FName ParamTeamColor;
    static const FName ParamStressLevel;
    static const FName ParamFocusLevel;
    static const FName ParamVisualState;
    static const FName ParamPulseIntensity;
};
