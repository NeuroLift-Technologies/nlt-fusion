#pragma once

#include "CoreMinimal.h"
#include "NLTVisualLODPolicy.generated.h"

class UWorld;

UENUM(BlueprintType)
enum class ENLTVisualLODLevel : uint8
{
	LOD0_Near UMETA(DisplayName = "LOD0 Near"),
	LOD1_Mid UMETA(DisplayName = "LOD1 Mid"),
	LOD2_Far UMETA(DisplayName = "LOD2 Far"),
	LOD3_Hidden UMETA(DisplayName = "LOD3 Hidden")
};

UENUM(BlueprintType)
enum class ENLTVisualRepresentation : uint8
{
	Hidden UMETA(DisplayName = "Hidden"),
	Mesh UMETA(DisplayName = "Mesh"),
	HISM UMETA(DisplayName = "HISM"),
	FallbackMesh UMETA(DisplayName = "Fallback Mesh")
};

/** Shared visual-only LOD policy for Mass entities and actor-based residents. */
USTRUCT(BlueprintType)
struct WORLDENGINE_API FNLTVisualLODPolicy
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD", meta = (ClampMin = "0.0"))
	float NearDistance = 1500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD", meta = (ClampMin = "0.0"))
	float MidDistance = 4000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD", meta = (ClampMin = "0.0"))
	float FarDistance = 8000.0f;

	/** Additional distance required before a visual level can become farther. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD", meta = (ClampMin = "0.0"))
	float Hysteresis = 250.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD")
	bool bUseViewerLocation = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LOD")
	bool bHideActorsAtFarDistance = true;

	/** Resolve a level with optional previous state for hysteresis. */
	ENLTVisualLODLevel ResolveLevel(float Distance, ENLTVisualLODLevel PreviousLevel, bool bHasPreviousLevel) const;

	/** Resolve the visual representation without affecting simulation state. */
	ENLTVisualRepresentation ResolveRepresentation(
		ENLTVisualLODLevel Level,
		bool bMassEntity,
		bool bHasPrimaryMesh,
		bool bHasFallbackMesh) const;

	/** Get the viewer location, or the supplied fallback when no local viewer exists. */
	static FVector GetViewerLocation(const UWorld* World, const FVector& FallbackLocation);

	float GetDistance(const FVector& WorldLocation, const FVector& ViewerLocation) const
	{
		return FVector::Distance(WorldLocation, ViewerLocation);
	}
};
