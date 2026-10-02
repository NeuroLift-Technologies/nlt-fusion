#include "Visual/NLTVisualLODPolicy.h"

#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

ENLTVisualLODLevel FNLTVisualLODPolicy::ResolveLevel(
	float Distance,
	ENLTVisualLODLevel PreviousLevel,
	bool bHasPreviousLevel) const
{
	const float Near = FMath::Max(0.0f, NearDistance);
	const float Mid = FMath::Max(Near, MidDistance);
	const float Far = FMath::Max(Mid, FarDistance);
	const float HysteresisAmount = FMath::Max(0.0f, Hysteresis);

	if (Distance < Near)
	{
		return ENLTVisualLODLevel::LOD0_Near;
	}
	if (Distance < Mid)
	{
		// Keep the current level while inside the hysteresis band.
		if (bHasPreviousLevel && PreviousLevel == ENLTVisualLODLevel::LOD0_Near &&
			Distance < Near + HysteresisAmount)
		{
			return PreviousLevel;
		}
		return ENLTVisualLODLevel::LOD1_Mid;
	}
	if (Distance < Far)
	{
		if (bHasPreviousLevel && PreviousLevel == ENLTVisualLODLevel::LOD1_Mid &&
			Distance < Mid + HysteresisAmount)
		{
			return ENLTVisualLODLevel::LOD1_Mid;
		}
		return ENLTVisualLODLevel::LOD2_Far;
	}

	if (bHasPreviousLevel && PreviousLevel == ENLTVisualLODLevel::LOD2_Far &&
		Distance < Far + HysteresisAmount)
	{
		return ENLTVisualLODLevel::LOD2_Far;
	}
	return ENLTVisualLODLevel::LOD3_Hidden;
}

ENLTVisualRepresentation FNLTVisualLODPolicy::ResolveRepresentation(
	ENLTVisualLODLevel Level,
	bool bMassEntity,
	bool bHasPrimaryMesh,
	bool bHasFallbackMesh) const
{
	if (Level == ENLTVisualLODLevel::LOD3_Hidden)
	{
		return ENLTVisualRepresentation::Hidden;
	}
	if (bMassEntity)
	{
		return bHasPrimaryMesh || bHasFallbackMesh
			? ENLTVisualRepresentation::HISM
			: ENLTVisualRepresentation::Hidden;
	}
	if (bHasPrimaryMesh)
	{
		return ENLTVisualRepresentation::Mesh;
	}
	if (bHasFallbackMesh)
	{
		return ENLTVisualRepresentation::FallbackMesh;
	}
	return ENLTVisualRepresentation::Hidden;
}

FVector FNLTVisualLODPolicy::GetViewerLocation(const UWorld* World, const FVector& FallbackLocation)
{
	if (!World || !World->IsGameWorld())
	{
		return FallbackLocation;
	}
	if (APlayerController* PlayerController = World->GetFirstPlayerController())
	{
		FVector ViewerLocation = FallbackLocation;
		FRotator ViewerRotation = FRotator::ZeroRotator;
		PlayerController->GetPlayerViewPoint(ViewerLocation, ViewerRotation);
		return ViewerLocation;
	}
	return FallbackLocation;
}
