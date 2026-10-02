#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StreamableManager.h"
#include "EngineUtils.h"
#include "NLTBuildingPortalActor.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTBuildingPortal, Log, All);

/**
 * Building type to scenario level mapping.
 */
UENUM(BlueprintType)
enum class ENLTBuildingType : uint8
{
    Office      UMETA(DisplayName = "Office"),
    Apartment   UMETA(DisplayName = "Apartment"),
    Shop        UMETA(DisplayName = "Shop"),
    School      UMETA(DisplayName = "School"),
    Hut         UMETA(DisplayName = "Hut"),
    Factory     UMETA(DisplayName = "Factory"),
    Park        UMETA(DisplayName = "Park")
};

/**
 * Building portal actor that travels the local player to a scenario level on overlap.
 * Each building type maps to a specific scenario level:
 * - Office -> Workplace_Level
 * - Apartment -> Personal_Level
 * - Shop -> Social_Level
 * - School -> Academic_Level
 * - Hut -> OpenWorld hub (stays in open world)
 */
UCLASS()
class WORLDENGINE_API ANLTBuildingPortalActor : public AActor
{
    GENERATED_BODY()

public:
    ANLTBuildingPortalActor();

    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;

    /** The building type that determines the target level. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Portal")
    ENLTBuildingType BuildingType = ENLTBuildingType::Office;

    /** The target level name to travel to. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Portal")
    FName TargetLevelName = TEXT("Workplace_Level");

    /** Display name shown on the building label. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Portal")
    FText DisplayName = NSLOCTEXT("NLT", "PortalOffice", "Office Building");

    /** Interaction prompt shown when player is near. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Portal")
    FText InteractPrompt = NSLOCTEXT("NLT", "PortalPrompt", "Press E to enter");

    /** Whether this portal is currently active. */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Portal")
    bool bIsActive = true;

    /** Whether the target level is currently loaded. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    bool IsLevelLoaded() const { return bLevelLoaded; }

    /** Get the building type. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    ENLTBuildingType GetBuildingType() const { return BuildingType; }

    /** Footprint radius (larger X/Y target half-extent, cm) for the current building type - used
     *  by the open-world subsystem to verify authored layout clearances at spawn. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    float GetFootprintRadius() const;

    /** Get the target level name. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    FName GetTargetLevelName() const { return TargetLevelName; }

    /** Get the display name. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    FText GetDisplayName() const { return DisplayName; }

    /** Get the interaction prompt. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    FText GetInteractPrompt() const { return InteractPrompt; }

    /** Check if a player is currently in range. */
    UFUNCTION(BlueprintPure, Category = "NLT|Portal")
    bool IsPlayerInRange() const { return OverlappingPlayer != nullptr; }

    /** Set the building type and update the target level. */
    UFUNCTION(BlueprintCallable, Category = "NLT|Portal")
    void SetBuildingType(ENLTBuildingType NewType);

    /** Refresh the label text from current display name. */
    UFUNCTION(BlueprintCallable, Category = "NLT|Portal")
    void UpdateLabelText();

    /** Orient the label to face a direction. */
    UFUNCTION(BlueprintCallable, Category = "NLT|Portal")
    void SetLabelFacing(const FVector& FaceDirection);

protected:
    /** Root scene component. BuildingMesh is a child so imported mesh origins can be
     *  re-anchored (base on the spawn point) without shifting the interaction volume. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    USceneComponent* SceneRoot;

    /** Static mesh for the building exterior. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    UStaticMeshComponent* BuildingMesh;

    /** Trigger volume for player overlap detection. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    UBoxComponent* InteractionVolume;

    /** Text label above the building. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    UTextRenderComponent* BuildingLabel;

    /** Back-facing text label. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    UTextRenderComponent* BuildingLabelBack;

    /** Currently overlapping player (if any). */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    AActor* OverlappingPlayer;

    /** Whether the target level is currently loaded. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    bool bLevelLoaded = false;

    /** Whether the player has entered and is transitioning. */
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NLT|Portal")
    bool bIsTransitioning = false;

    UFUNCTION()
    void OnOverlapBegin(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
                        UPrimitiveComponent* OtherComp, int32 OtherBodyIndex,
                        bool bFromSweep, const FHitResult& SweepResult);

    UFUNCTION()
    void OnOverlapEnd(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
                      UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);

    /** Handle player interaction (press E to enter). */
    void OnInteract();

    /** Legacy dynamic-streaming helper; player overlap uses map travel instead. */
    void StreamInTargetLevel();

    /** Called when async level load completes. */
    UFUNCTION()
    void OnLevelLoadComplete();

    /** Legacy dynamic-streaming helper; retained for explicit streaming callers. */
    void StreamOutTargetLevel();

    /** Teleport player to the target level. */
    void TeleportPlayerToLevel();

    /** Return player to the open world. */
    void ReturnPlayerToOpenWorld();

    /** Map building type to level name. */
    FName BuildingTypeToLevelName(ENLTBuildingType Type) const;

    /** Map building type to display name. */
    FText BuildingTypeToDisplayName(ENLTBuildingType Type) const;

    /** Update the building mesh based on type. */
    void UpdateBuildingMesh();

private:
    /** Footprint box (target half-extents, cm) for the current building type - single source of
     *  truth shared by UpdateBuildingMesh() scaling and GetFootprintRadius() layout checks. */
    FVector GetTargetHalfExtent() const;

    /** The streaming handle for the loaded level. */
    TSharedPtr<FStreamableHandle> StreamingHandle;

    /** Player's position before entering the level. */
    FVector SavedPlayerPosition;

    /** Player's rotation before entering the level. */
    FRotator SavedPlayerRotation;
};
