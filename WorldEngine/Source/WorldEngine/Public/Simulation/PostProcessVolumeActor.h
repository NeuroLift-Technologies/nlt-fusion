#pragma once

#include "CoreMinimal.h"
#include "Engine/PostProcessVolume.h"
#include "Materials/MaterialInterface.h"
#include "Engine/Texture.h"
#include "PostProcessVolumeActor.generated.h"

/**
 * Cinematic post-process volume for WorldEngine.
 * Derives from APostProcessVolume so the inherited registered Settings
 * (bUnbound global volume) are driven by this actor's configuration.
 * Provides film-quality rendering with bloom, ambient occlusion,
 * film grain, chromatic aberration, lens flare, vignette,
 * and color grading.
 */
UCLASS()
class WORLDENGINE_API APostProcessVolumeActor : public APostProcessVolume
{
	GENERATED_BODY()

public:
	APostProcessVolumeActor();

	virtual void BeginPlay() override;

	// ─── Bloom ──────────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Bloom", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float BloomIntensity = 1.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Bloom", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float BloomThreshold = 1.0f;

	// ─── Exposure ───────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Exposure", meta = (ClampMin = "0.1", ClampMax = "2.0"))
	float Exposure = 1.0f;

	// ─── Ambient Occlusion ──────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|AO", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float AmbientOcclusion = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|AO", meta = (ClampMin = "0.0", ClampMax = "1000.0"))
	float AORadius = 200.0f;

	// ─── Film Grain ─────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Film", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float FilmGrain = 0.03f;

	// ─── Chromatic Aberration ───────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Lens", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float ChromaticAberration = 0.5f;

	// ─── Lens Flare ─────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Lens", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float LensFlareIntensity = 0.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Lens")
	FLinearColor LensFlareTint = FLinearColor::White;

	// ─── Vignette ───────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Vignette", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float VignetteIntensity = 0.3f;

	// ─── Color Grading ──────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Color")
	FLinearColor ColorGradeTint = FLinearColor(1.0f, 1.0f, 1.0f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Color", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float Saturation = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Color", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float Contrast = 1.0f;

	/**
	 * Optional 2D LUT (Look-Up Table) texture for cinematic color grading
	 * (e.g. from Fab "Post Process LUTS"). When set, a post-process material
	 * (M_CC_ColorGrading) must be assigned to ColorGradingLUTMaterial to apply
	 * the LUT via WeightedBlendables. When empty, procedural color grading
	 * (tint, saturation, contrast) remains the fallback.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Color")
	TObjectPtr<UTexture2D> ColorGradingLUT;

	/**
	 * Post-process material that samples the ColorGradingLUT. This material
	 * should take SceneColor + LUT texture and output graded color. Created in
	 * the UE Editor and assigned here. Falls back to procedural grading if empty.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Color")
	TObjectPtr<UMaterialInterface> ColorGradingLUTMaterial;

	// ─── Motion Blur ────────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|Motion", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float MotionBlurAmount = 0.1f;

	// ─── Depth of Field ─────────────────────────────────────────

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|DOF", meta = (ClampMin = "0.0", ClampMax = "10.0"))
	float DOFFocalDistance = 1000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process|DOF", meta = (ClampMin = "0.0", ClampMax = "100.0"))
	float DOFAperture = 5.5f;

	/** Apply all current property values to the inherited registered Settings. */
	UFUNCTION(BlueprintCallable, Category = "Post-Process")
	void ApplySettings();

	/** True when this volume should affect the entire level (unbound). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Post-Process")
	bool bApplyUnbounded = true;
};
