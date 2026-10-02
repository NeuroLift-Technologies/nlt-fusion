// NLTWorldPalette.h
// Shared runtime helper that paints the procedural open world with the project's
// own Environment/Materials set (M_Solid family: BaseColor/Roughness/Metallic
// parameters) instead of the engine-grey BasicShapeMaterial.
#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UMaterialInstanceDynamic;
class UMeshComponent;

/**
 * World palette helper (plain C++, no UCLASS):
 * loads a project material and applies a runtime-tinted dynamic instance to a
 * mesh component. All Environment/Materials/* assets derive from M_Solid and
 * expose BaseColor/Roughness/Metallic/EmissiveColor, so a single tint path
 * works for ground, buildings, vegetation and street furniture.
 */
class NLTWorldPalette
{
public:
	/**
	 * Reset a mesh component's materials to a tinted dynamic instance of the
	 * given project material. If the mesh has N slots they are all painted with
	 * the same tint (removes NLT_Gray placeholders / empty slots).
	 */
	static void PaintMesh(
		UMeshComponent* MeshComp,
		const TCHAR* BaseMaterialPath,
		const FLinearColor& BaseColor,
		float Roughness = 0.55f,
		float Metallic = 0.0f);

	/** Create a standalone tinted dynamic material (no component required). */
	static UMaterialInstanceDynamic* MakeTintedMaterial(
		UObject* Outer,
		const TCHAR* BaseMaterialPath,
		const FLinearColor& BaseColor,
		float Roughness = 0.55f,
		float Metallic = 0.0f);

	/** Load the project's M_Solid parent material. */
	static UMaterialInterface* GetSolidMaterial();

	// ---- Named palette swatches (golden-hour friendly) ----
	static FLinearColor GroundGrass()       { return FLinearColor(0.30f, 0.42f, 0.22f); }
	static FLinearColor GrassPatch()        { return FLinearColor(0.33f, 0.46f, 0.24f); }
	static FLinearColor TreeCanopy()        { return FLinearColor(0.24f, 0.36f, 0.18f); }
	static FLinearColor TrunkBrown()        { return FLinearColor(0.40f, 0.30f, 0.20f); }
	static FLinearColor RockGrey()          { return FLinearColor(0.52f, 0.50f, 0.46f); }
	static FLinearColor RoadAsphalt()       { return FLinearColor(0.20f, 0.20f, 0.22f); }
	static FLinearColor SidewalkConcrete()  { return FLinearColor(0.72f, 0.70f, 0.66f); }
	static FLinearColor BuildingStone()     { return FLinearColor(0.60f, 0.57f, 0.52f); }
	static FLinearColor TowerTint()         { return FLinearColor(0.63f, 0.61f, 0.59f); }
	static FLinearColor GlassTeal()         { return FLinearColor(0.42f, 0.55f, 0.55f); }
	static FLinearColor FenceMetal()        { return FLinearColor(0.30f, 0.31f, 0.33f); }
	static FLinearColor TrashDark()         { return FLinearColor(0.24f, 0.24f, 0.26f); }
	static FLinearColor ParkingDark()       { return FLinearColor(0.36f, 0.36f, 0.37f); }
};