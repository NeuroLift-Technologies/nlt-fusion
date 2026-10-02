#include "Simulation/PostProcessVolumeActor.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/Texture2D.h"

APostProcessVolumeActor::APostProcessVolumeActor()
{
	PrimaryActorTick.bCanEverTick = false;

	// Unbound volume affecting the full level with no physical extent
	bUnbound = true;
	Priority = 1.0f;
	BlendWeight = 1.0f;
	BlendRadius = 0.0f;
	bEnabled = true;

	ApplySettings();
}

void APostProcessVolumeActor::BeginPlay()
{
	Super::BeginPlay();
	// Re-apply settings after runtime configuration by UNLTAtmosphereSubsystem
	ApplySettings();
}

void APostProcessVolumeActor::ApplySettings()
{
	bUnbound = bApplyUnbounded;

	// === Bloom ===
	Settings.bOverride_BloomIntensity = true;
	Settings.BloomIntensity = BloomIntensity;
	Settings.bOverride_BloomThreshold = true;
	Settings.BloomThreshold = BloomThreshold;

	// === Exposure ===
	Settings.bOverride_AutoExposureBias = true;
	Settings.AutoExposureBias = Exposure;

	// === Ambient Occlusion ===
	Settings.bOverride_AmbientOcclusionRadius = true;
	Settings.AmbientOcclusionRadius = AORadius;
	Settings.bOverride_AmbientOcclusionIntensity = true;
	Settings.AmbientOcclusionIntensity = AmbientOcclusion;

	// === Film Grain ===
	Settings.bOverride_FilmGrainIntensity = true;
	Settings.FilmGrainIntensity = FilmGrain;

	// === Chromatic Aberration ===
	Settings.bOverride_SceneFringeIntensity = true;
	Settings.SceneFringeIntensity = ChromaticAberration;

	// === Lens Flare ===
	Settings.bOverride_LensFlareIntensity = true;
	Settings.LensFlareIntensity = LensFlareIntensity;
	Settings.bOverride_LensFlareTint = true;
	Settings.LensFlareTint = LensFlareTint;

	// === Vignette ===
	Settings.bOverride_VignetteIntensity = true;
	Settings.VignetteIntensity = VignetteIntensity;

	// === Color Grading ===
	Settings.bOverride_SceneColorTint = true;
	Settings.SceneColorTint = ColorGradeTint;
	Settings.bOverride_ColorSaturation = true;
	Settings.ColorSaturation = FVector4(Saturation, Saturation, Saturation, 1.0f);
	Settings.bOverride_ColorContrast = true;
	Settings.ColorContrast = FVector4(Contrast, Contrast, Contrast, 1.0f);

	// === LUT Color Grading (overrides procedural tint when assigned) ===
	if (ColorGradingLUT && ColorGradingLUTMaterial)
	{
		// Build a material instance with the LUT texture parameter bound
		UMaterialInstanceDynamic* LUTMaterial =
			UMaterialInstanceDynamic::Create(ColorGradingLUTMaterial, this);
		if (LUTMaterial)
		{
			LUTMaterial->SetTextureParameterValue(TEXT("LUT_Texture"), ColorGradingLUT);

			// Add to weighted blendables at full weight
			Settings.WeightedBlendables.Array.Empty();
			// FWeightedBlendable member name changed in newer engine versions
			// use the Object field or the constructor to set the blendable object.
			FWeightedBlendable& Blendable = Settings.WeightedBlendables.Array.AddDefaulted_GetRef();
			Blendable.Weight = 1.0f;
			// "Blendable" was renamed to "Object" in modern UE versions.
			// Use the Object member and pass the raw pointer from the material instance.
			Blendable.Object = LUTMaterial;
		}
	}
	else
	{
		// Clear any previously assigned LUT blendable
		Settings.WeightedBlendables.Array.Empty();
	}

	// === Motion Blur ===
	Settings.bOverride_MotionBlurAmount = true;
	Settings.MotionBlurAmount = MotionBlurAmount;

	// === Depth of Field ===
	Settings.bOverride_DepthOfFieldFocalDistance = true;
	Settings.DepthOfFieldFocalDistance = DOFFocalDistance;
	Settings.bOverride_DepthOfFieldFstop = true;
	Settings.DepthOfFieldFstop = DOFAperture;

	// Re-assert volume state in case a default-constructed base reset it
	bEnabled = true;
	Priority = 1.0f;
	BlendWeight = 1.0f;
}
