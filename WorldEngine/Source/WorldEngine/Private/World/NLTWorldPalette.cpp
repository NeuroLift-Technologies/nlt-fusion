// NLTWorldPalette.cpp
#include "World/NLTWorldPalette.h"

#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Components/MeshComponent.h"
#include "UObject/ConstructorHelpers.h"

UMaterialInterface* NLTWorldPalette::GetSolidMaterial()
{
	static UMaterialInterface* SolidMat = nullptr;
	if (!SolidMat)
	{
		SolidMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Environment/Materials/M_Solid.M_Solid"));
		if (!SolidMat)
		{
			// Fall back to the engine translucent-parameter material set
			SolidMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
		}
	}
	return SolidMat;
}

UMaterialInstanceDynamic* NLTWorldPalette::MakeTintedMaterial(
	UObject* Outer,
	const TCHAR* BaseMaterialPath,
	const FLinearColor& BaseColor,
	float Roughness,
	float Metallic)
{
	if (!Outer)
	{
		return nullptr;
	}

	UMaterialInterface* Parent = nullptr;
	if (BaseMaterialPath)
	{
		Parent = LoadObject<UMaterialInterface>(nullptr, BaseMaterialPath);
	}
	if (!Parent)
	{
		Parent = GetSolidMaterial();
	}
	if (!Parent)
	{
		return nullptr;
	}

	UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(Parent, Outer);
	if (!MID)
	{
		return nullptr;
	}

	MID->SetVectorParameterValue(TEXT("BaseColor"), BaseColor);
	MID->SetScalarParameterValue(TEXT("Roughness"), Roughness);
	MID->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	return MID;
}

void NLTWorldPalette::PaintMesh(
	UMeshComponent* MeshComp,
	const TCHAR* BaseMaterialPath,
	const FLinearColor& BaseColor,
	float Roughness,
	float Metallic)
{
	if (!MeshComp)
	{
		return;
	}

	UMaterialInstanceDynamic* MID = MakeTintedMaterial(MeshComp, BaseMaterialPath, BaseColor, Roughness, Metallic);
	if (!MID)
	{
		return;
	}

	// Paint every material slot so leftover NLT_Gray / empty slots are covered.
	const int32 NumSlots = MeshComp->GetNumMaterials();
	const int32 SlotCount = FMath::Max(NumSlots, 1);
	for (int32 Slot = 0; Slot < SlotCount; ++Slot)
	{
		MeshComp->SetMaterial(Slot, MID);
	}
	MeshComp->MarkRenderStateDirty();
}