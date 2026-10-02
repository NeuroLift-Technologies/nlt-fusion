#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Engine/ExponentialHeightFog.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/Texture.h"
#include "NLTAtmosphereSubsystem.generated.h"

class APostProcessVolumeActor;

DECLARE_LOG_CATEGORY_EXTERN(LogNLTAtmosphere, Log, All);

UENUM(BlueprintType)
enum class ENLTTimeOfDayPhase : uint8
{
	Dawn		UMETA(DisplayName = "Dawn"),
	Morning		UMETA(DisplayName = "Morning"),
	Midday		UMETA(DisplayName = "Midday"),
	Afternoon	UMETA(DisplayName = "Afternoon"),
	Sunset		UMETA(DisplayName = "Sunset"),
	Dusk		UMETA(DisplayName = "Dusk"),
	Night		UMETA(DisplayName = "Night"),
};

UCLASS()
class WORLDENGINE_API UNLTAtmosphereSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// === Time-of-Day Control ===

	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere")
	float GetTimeOfDayHours() const { return TimeOfDayHours; }

	UFUNCTION(BlueprintCallable, Category = "NLT|Atmosphere")
	void SetTimeOfDayHours(float InHours);

	UFUNCTION(BlueprintCallable, Category = "NLT|Atmosphere")
	void AdvanceTimeOfDay(float DeltaHours);

	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere")
	ENLTTimeOfDayPhase GetTimeOfDayPhase() const { return CurrentPhase; }

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere")
	float RealSecondsPerGameDay = 600.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere")
	bool bAutoAdvanceTime = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere")
	float StartTimeOfDay = 8.5f;

	// === Sun Light ===

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	float SunIntensityMidday = 10.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	float SunIntensityNight = 0.15f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	FLinearColor SunColorMidday = FLinearColor(1.0f, 0.97f, 0.88f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	FLinearColor SunColorDawn = FLinearColor(1.0f, 0.50f, 0.25f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	FLinearColor SunColorNight = FLinearColor(0.25f, 0.30f, 0.55f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sun")
	bool bSunCastShadows = true;

	/** If false, do not modify existing level sun/sky lights (only apply to spawned lights). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere")
	bool bOverrideExistingLights = true;

	// === Sky Light ===

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	float SkyIntensityMidday = 1.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	float SkyIntensityNight = 0.08f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	FLinearColor SkyColorDay = FLinearColor(0.45f, 0.62f, 0.88f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	FLinearColor SkyColorNight = FLinearColor(0.02f, 0.03f, 0.08f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	FLinearColor SkyColorDawn = FLinearColor(0.85f, 0.45f, 0.35f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	bool bUseRealTimeSkyCapture = false;

	// === Height Fog ===

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	float FogDensityDay = 0.008f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	float FogDensityNight = 0.025f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	FLinearColor FogColorDawn = FLinearColor(0.95f, 0.55f, 0.35f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	FLinearColor FogColorDay = FLinearColor(0.72f, 0.80f, 0.92f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	FLinearColor FogColorNight = FLinearColor(0.04f, 0.05f, 0.10f, 1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	float FogHeightFalloff = 0.15f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	float FogStartDistance = 500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Fog")
	bool bFogEnabled = true;

	// === Sky Dome ===

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|SkyDome")
	float StarIntensity = 1.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|SkyDome")
	float HorizonGlowIntensity = 2.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|SkyDome")
	TObjectPtr<UMaterialInterface> SkyDomeMaterial;

	/**
	 * Optional HDRI skybox cubemap (e.g. from Fab "13 Nebula Skyboxes" or
	 * "HDRI Variety Skyboxes"). When set, this is applied to the sky dome
	 * material as the "SkyboxCubemap" parameter and optionally to the SkyLight
	 * for image-based reflections. When empty, the procedural color blending
	 * remains active as the fallback.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|SkyDome")
	TObjectPtr<UTextureCube> SkyboxCubemap;

	/** When true, the SkyboxCubemap drives the SkyLight cubemap for reflections. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Sky")
	bool bUseSkyboxForSkyLight = true;

	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere|SkyDome")
	bool AreStarsVisible() const { return bStarsVisible; }

	/**
	 * Assign an HDRI skybox cubemap at runtime (e.g. from a weather-preset
	 * DataAsset). Passes the texture to the sky dome material and optionally
	 * to the SkyLight for IBL reflections.
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Atmosphere|SkyDome")
	void SetSkyboxCubemap(UTextureCube* InCubemap, bool bApplyToSkyLight = true);

	/**
	 * Assign a color-grading LUT at runtime (e.g. from a weather-preset
	 * DataAsset). Delegates to the post-process volume's LUT system.
	 * Call with nullptr to revert to procedural color grading.
	 */
	UFUNCTION(BlueprintCallable, Category = "NLT|Atmosphere|Color")
	void SetColorGradingLUT(UTexture2D* InLUT, UMaterialInterface* InLUTMaterial);

	/** True when a custom HDRI skybox cubemap is assigned. */
	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere|SkyDome")
	bool HasSkyboxCubemap() const { return SkyboxCubemap != nullptr; }

	// === Color Grading ===

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Color")
	float ColorGradingStrength = 0.6f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Color")
	float WarmTintStrength = 0.7f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Color")
	float CoolTintStrength = 0.4f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Color")
	float MiddayContrast = 1.1f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NLT|Atmosphere|Color")
	float MiddaySaturation = 1.15f;

	// === Utility ===

	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere")
	float GetDaylightFactor() const;

	UFUNCTION(BlueprintPure, Category = "NLT|Atmosphere")
	FVector GetSunDirection() const;

	UFUNCTION(BlueprintCallable, Category = "NLT|Atmosphere")
	void RefreshAtmosphere();

private:
	// UTickableWorldSubsystem interface
	virtual void Tick(float DeltaTime) override;
	virtual bool IsTickable() const override { return true; }
	virtual TStatId GetStatId() const override;

	void UpdateSunLight(float Hours);
	void UpdateSkyLight(float Hours);
	void UpdateHeightFog(float Hours);
	void UpdateSkyDome(float Hours);
	void UpdateColorGrading(float Hours);
	ENLTTimeOfDayPhase CalculatePhase(float Hours) const;
	FVector ComputeSunDirection(float Hours) const;
	static FLinearColor BlendColor(const FLinearColor& A, const FLinearColor& B, float Alpha);
	void FindHeightFog();
	void FindOrCreateSkyDome();
	void FindSunLight();
	void FindSkyLight();
	void FindOrCreatePostProcessVolume();

	TObjectPtr<ADirectionalLight> SunLight = nullptr;
	TObjectPtr<ASkyLight> SkyLight = nullptr;
	TObjectPtr<AExponentialHeightFog> HeightFog = nullptr;
	TObjectPtr<UStaticMeshComponent> SkyDomeComponent = nullptr;
	UMaterialInstanceDynamic* SkyDomeMaterialInstance = nullptr;
	TObjectPtr<APostProcessVolumeActor> PostProcessVolumeActor = nullptr;

	float TimeOfDayHours = 8.5f;
	ENLTTimeOfDayPhase CurrentPhase = ENLTTimeOfDayPhase::Morning;
	bool bStarsVisible = false;
	bool bAtmosphereReady = false;
};
