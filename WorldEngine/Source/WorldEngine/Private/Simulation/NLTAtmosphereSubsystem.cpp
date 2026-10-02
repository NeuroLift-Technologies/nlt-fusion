#include "Simulation/NLTAtmosphereSubsystem.h"
#include "Simulation/PostProcessVolumeActor.h"
#include "Modules/ModuleManager.h"
#include "EngineUtils.h"
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/TextureCube.h"
#include "UObject/ConstructorHelpers.h"
#include "Math/UnrealMathUtility.h"
#include "Core/NLTNoiseLibrary.h"

DEFINE_LOG_CATEGORY(LogNLTAtmosphere);

// ─── Lifecycle ────────────────────────────────────────────────────

bool UNLTAtmosphereSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
		return false;
	const UWorld* World = Cast<UWorld>(Outer);
	return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE);
}

void UNLTAtmosphereSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	TimeOfDayHours = StartTimeOfDay;
	CurrentPhase = CalculatePhase(TimeOfDayHours);
	UE_LOG(LogNLTAtmosphere, Log, TEXT("Atmosphere subsystem initialized at %.1fh"), TimeOfDayHours);
}

void UNLTAtmosphereSubsystem::Deinitialize()
{
	SkyDomeMaterialInstance = nullptr;
	Super::Deinitialize();
}

TStatId UNLTAtmosphereSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UNLTAtmosphereSubsystem, STATGROUP_Tickables);
}

void UNLTAtmosphereSubsystem::Tick(float DeltaTime)
{
	if (bAutoAdvanceTime && RealSecondsPerGameDay > 0.0f)
	{
		const float DeltaHours = (DeltaTime / RealSecondsPerGameDay) * 24.0f;
		SetTimeOfDayHours(TimeOfDayHours + DeltaHours);
	}
	else if (bAtmosphereReady)
	{
		UpdateSunLight(TimeOfDayHours);
		UpdateSkyLight(TimeOfDayHours);
		UpdateHeightFog(TimeOfDayHours);
		UpdateSkyDome(TimeOfDayHours);
		UpdateColorGrading(TimeOfDayHours);
	}
	else
	{
		RefreshAtmosphere();
	}
}

// ─── Time-of-Day Control ─────────────────────────────────────────

void UNLTAtmosphereSubsystem::SetTimeOfDayHours(float InHours)
{
	TimeOfDayHours = FMath::Fmod(InHours, 24.0f);
	if (TimeOfDayHours < 0.0f) TimeOfDayHours += 24.0f;

	const ENLTTimeOfDayPhase NewPhase = CalculatePhase(TimeOfDayHours);
	if (NewPhase != CurrentPhase)
	{
		CurrentPhase = NewPhase;
		UE_LOG(LogNLTAtmosphere, Log, TEXT("Phase changed to %d at %.1fh"),
			static_cast<int32>(CurrentPhase), TimeOfDayHours);
	}

	UpdateSunLight(TimeOfDayHours);
	UpdateSkyLight(TimeOfDayHours);
	UpdateHeightFog(TimeOfDayHours);
	UpdateSkyDome(TimeOfDayHours);
	UpdateColorGrading(TimeOfDayHours);
}

void UNLTAtmosphereSubsystem::AdvanceTimeOfDay(float DeltaHours)
{
	SetTimeOfDayHours(TimeOfDayHours + DeltaHours);
}

void UNLTAtmosphereSubsystem::RefreshAtmosphere()
{
	FindSunLight();
	FindSkyLight();
	FindHeightFog();
	FindOrCreateSkyDome();
	FindOrCreatePostProcessVolume();
	bAtmosphereReady = true;
	SetTimeOfDayHours(TimeOfDayHours);
}

float UNLTAtmosphereSubsystem::GetDaylightFactor() const
{
	const float SunAngle = (TimeOfDayHours / 24.0f) * 2.0f * PI - PI * 0.5f;
	return FMath::Max(0.0f, FMath::Sin(SunAngle));
}

FVector UNLTAtmosphereSubsystem::GetSunDirection() const
{
	return ComputeSunDirection(TimeOfDayHours);
}

// ─── Sun Light ───────────────────────────────────────────────────

FVector UNLTAtmosphereSubsystem::ComputeSunDirection(float Hours) const
{
	const float SunAngle = (Hours / 24.0f) * 2.0f * PI - PI * 0.5f;
	const float Elevation = FMath::Sin(SunAngle);
	const float Azimuth = FMath::Cos(SunAngle);
	return FVector(-Azimuth, 0.0f, -Elevation).GetSafeNormal();
}

void UNLTAtmosphereSubsystem::UpdateSunLight(float Hours)
{
	FindSunLight();
	if (!SunLight) return;

	ULightComponent* LightComp = SunLight->GetLightComponent();
	if (!LightComp) return;

	const float Daylight = GetDaylightFactor();
	const FVector Dir = ComputeSunDirection(Hours);
	SunLight->SetActorRotation(Dir.Rotation());

	const float Intensity = FMath::Lerp(SunIntensityNight, SunIntensityMidday, Daylight);
	LightComp->SetIntensity(Intensity);

	FLinearColor SunColor;
	if (Daylight > 0.5f)
		SunColor = BlendColor(SunColorDawn, SunColorMidday, (Daylight - 0.5f) * 2.0f);
	else if (Daylight > 0.0f)
		SunColor = BlendColor(SunColorNight, SunColorDawn, Daylight * 2.0f);
	else
		SunColor = SunColorNight;
	LightComp->SetLightColor(SunColor);
	LightComp->SetCastShadows(bSunCastShadows && Daylight > 0.05f);

	// Warm at dawn/dusk (low daylight), cool at midday (high daylight)
	LightComp->SetUseTemperature(true);
	LightComp->SetTemperature(FMath::Lerp(3000.0f, 6500.0f, Daylight));
}

// ─── Sky Light ───────────────────────────────────────────────────

void UNLTAtmosphereSubsystem::UpdateSkyLight(float Hours)
{
	FindSkyLight();
	if (!SkyLight) return;

	USkyLightComponent* SkyComp = SkyLight->GetLightComponent();
	if (!SkyComp) return;

	const float Daylight = GetDaylightFactor();
	SkyComp->SetIntensity(FMath::Lerp(SkyIntensityNight, SkyIntensityMidday, Daylight));

	FLinearColor SkyColor;
	if (Daylight > 0.5f)
		SkyColor = BlendColor(SkyColorDawn, SkyColorDay, (Daylight - 0.5f) * 2.0f);
	else if (Daylight > 0.0f)
		SkyColor = BlendColor(SkyColorNight, SkyColorDawn, Daylight * 2.0f);
	else
		SkyColor = SkyColorNight;
	SkyComp->SetLightColor(SkyColor);

	if (bUseRealTimeSkyCapture)
		SkyComp->RecaptureSky();
}

// ─── Height Fog ──────────────────────────────────────────────────

void UNLTAtmosphereSubsystem::UpdateHeightFog(float Hours)
{
	FindHeightFog();
	if (!HeightFog) return;

	UExponentialHeightFogComponent* FogComp = HeightFog->GetComponent();
	if (!FogComp) return;

	const float Daylight = GetDaylightFactor();
	FogComp->SetFogDensity(bFogEnabled ? FMath::Lerp(FogDensityNight, FogDensityDay, Daylight) : 0.0f);
	FogComp->SetFogHeightFalloff(FogHeightFalloff);
	FogComp->SetStartDistance(FogStartDistance);

	FLinearColor FogColor;
	if (Daylight > 0.5f)
		FogColor = BlendColor(FogColorDawn, FogColorDay, (Daylight - 0.5f) * 2.0f);
	else if (Daylight > 0.0f)
		FogColor = BlendColor(FogColorNight, FogColorDawn, Daylight * 2.0f);
	else
		FogColor = FogColorNight;
	FogComp->SetFogInscatteringColor(FogColor);

	FogComp->SetDirectionalInscatteringExponent(2.0f);
	FogComp->SetDirectionalInscatteringStartDistance(1000.0f);
	FogComp->SetDirectionalInscatteringColor(FLinearColor(1.0f, 0.95f, 0.85f, 1.0f) * Daylight * 0.8f);
}

// ─── Sky Dome ────────────────────────────────────────────────────

void UNLTAtmosphereSubsystem::UpdateSkyDome(float Hours)
{
	if (!SkyDomeMaterialInstance)
	{
		FindOrCreateSkyDome();
		return;
	}

	const float Daylight = GetDaylightFactor();
	bStarsVisible = (Daylight < 0.05f);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("StarIntensity"),
		bStarsVisible ? StarIntensity * (1.0f - Daylight / 0.05f) : 0.0f);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("HorizonGlow"),
		FMath::Sin(Daylight * PI) * HorizonGlowIntensity);

	FLinearColor SkyColor;
	if (Daylight > 0.5f)
		SkyColor = BlendColor(SkyColorDawn, SkyColorDay, (Daylight - 0.5f) * 2.0f);
	else if (Daylight > 0.0f)
		SkyColor = BlendColor(SkyColorNight, SkyColorDawn, Daylight * 2.0f);
	else
		SkyColor = SkyColorNight;
	SkyDomeMaterialInstance->SetVectorParameterValue(TEXT("SkyColor"), SkyColor);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("SunIntensity"), Daylight * 3.0f);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("CloudCoverage"),
		0.3f + 0.2f * FMath::Sin(Hours * 0.5f));

	// Procedural noise-driven cloud variation (deterministic per time-of-day)
	// Ported from openworld-engine/src/world/sky.js cloud algorithm.
	// Uses seeded fBm for natural-looking cloud motion and coverage variation.
	float NoiseClouds = UNLTNoiseLibrary::Fbm2D(Hours * 0.5f, 0.0f, 42, 4, 2.0f, 0.5f);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("CloudNoise"),
		FMath::Max(0.0f, (NoiseClouds + 0.3f) * 0.7f));

	// Procedural star density for the sky dome night rendering
	float StarNoise = UNLTNoiseLibrary::Fbm2D(Hours + 7.0f, 13.0f, 99, 3, 2.0f, 0.5f);
	SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("StarDensity"),
		FMath::Clamp(0.5f + StarNoise * 0.5f, 0.0f, 1.0f));

	// Re-apply HDRI cubemap if assigned (material instance may have been recreated)
	if (SkyboxCubemap)
	{
		SkyDomeMaterialInstance->SetTextureParameterValue(TEXT("SkyboxCubemap"), SkyboxCubemap);
	}
}

// ─── Color Grading ───────────────────────────────────────────────

void UNLTAtmosphereSubsystem::UpdateColorGrading(float Hours)
{
	if (!PostProcessVolumeActor) return;

	const float Daylight = GetDaylightFactor();
	const float WarmAmount = (1.0f - Daylight) * WarmTintStrength * 0.3f;
	PostProcessVolumeActor->ColorGradeTint = FLinearColor(
		1.0f + WarmAmount, 1.0f + WarmAmount * 0.3f, 1.0f - WarmAmount * 0.5f, 1.0f);

	PostProcessVolumeActor->Settings.bOverride_SceneColorTint = true;
	PostProcessVolumeActor->Settings.SceneColorTint = PostProcessVolumeActor->ColorGradeTint;
	PostProcessVolumeActor->BloomIntensity = 1.2f + (MiddaySaturation - 1.0f) * Daylight * 0.5f;
	PostProcessVolumeActor->Settings.BloomIntensity = PostProcessVolumeActor->BloomIntensity;
}

// ─── Phase Calculation ───────────────────────────────────────────

ENLTTimeOfDayPhase UNLTAtmosphereSubsystem::CalculatePhase(float Hours) const
{
	if (Hours >= 5.0f && Hours < 7.0f) return ENLTTimeOfDayPhase::Dawn;
	if (Hours >= 7.0f && Hours < 11.0f) return ENLTTimeOfDayPhase::Morning;
	if (Hours >= 11.0f && Hours < 14.0f) return ENLTTimeOfDayPhase::Midday;
	if (Hours >= 14.0f && Hours < 17.0f) return ENLTTimeOfDayPhase::Afternoon;
	if (Hours >= 17.0f && Hours < 19.0f) return ENLTTimeOfDayPhase::Sunset;
	if (Hours >= 19.0f && Hours < 21.0f) return ENLTTimeOfDayPhase::Dusk;
	return ENLTTimeOfDayPhase::Night;
}

FLinearColor UNLTAtmosphereSubsystem::BlendColor(const FLinearColor& A, const FLinearColor& B, float Alpha)
{
	const float T = FMath::Clamp(Alpha, 0.0f, 1.0f);
	return FLinearColor(
		FMath::Lerp(A.R, B.R, T), FMath::Lerp(A.G, B.G, T),
		FMath::Lerp(A.B, B.B, T), FMath::Lerp(A.A, B.A, T));
}

// ─── Actor Finding / Creation ────────────────────────────────────

void UNLTAtmosphereSubsystem::FindSunLight()
{
	if (SunLight) return;

	if (bOverrideExistingLights)
	{
		TActorIterator<ADirectionalLight> It(GetWorld());
		SunLight = It ? *It : nullptr;
	}
	else
	{
		for (TActorIterator<ADirectionalLight> It(GetWorld()); It; ++It)
		{
			if (It->GetName().Contains(TEXT("NLT_SunLight")))
			{
				SunLight = *It;
				break;
			}
		}
	}

	if (!SunLight)
	{
		FActorSpawnParameters SP;
		SP.Name = TEXT("NLT_SunLight");
		SunLight = GetWorld()->SpawnActor<ADirectionalLight>(SP);
		if (SunLight)
		{
			SunLight->GetLightComponent()->SetIntensity(SunIntensityMidday);
			SunLight->GetLightComponent()->SetLightColor(SunColorMidday);
			SunLight->GetLightComponent()->SetCastShadows(bSunCastShadows);
			SunLight->GetLightComponent()->SetMobility(EComponentMobility::Movable);
			SunLight->SetActorRotation(FRotator(-45.0f, 0.0f, 0.0f));
		}
	}
}

void UNLTAtmosphereSubsystem::FindSkyLight()
{
	if (SkyLight) return;

	if (bOverrideExistingLights)
	{
		TActorIterator<ASkyLight> It(GetWorld());
		SkyLight = It ? *It : nullptr;
	}
	else
	{
		for (TActorIterator<ASkyLight> It(GetWorld()); It; ++It)
		{
			if (It->GetName().Contains(TEXT("NLT_SkyLight")))
			{
				SkyLight = *It;
				break;
			}
		}
	}

	if (!SkyLight)
	{
		FActorSpawnParameters SP;
		SP.Name = TEXT("NLT_SkyLight");
		SkyLight = GetWorld()->SpawnActor<ASkyLight>(SP);
		if (SkyLight)
		{
			SkyLight->GetLightComponent()->SetIntensity(SkyIntensityMidday);
			SkyLight->GetLightComponent()->SetLightColor(SkyColorDay);
			SkyLight->GetLightComponent()->SetMobility(EComponentMobility::Movable);
		}
	}
}

void UNLTAtmosphereSubsystem::FindHeightFog()
{
	if (HeightFog) return;
	{
		TActorIterator<AExponentialHeightFog> It(GetWorld());
		HeightFog = It ? *It : nullptr;
	}

	if (!HeightFog)
	{
		FActorSpawnParameters SP;
		SP.Name = TEXT("NLT_HeightFog");
		HeightFog = GetWorld()->SpawnActor<AExponentialHeightFog>(SP);
	}
}

void UNLTAtmosphereSubsystem::FindOrCreateSkyDome()
{
	if (SkyDomeComponent) return;

	for (TObjectIterator<UStaticMeshComponent> It; It; ++It)
	{
		if (It->GetWorld() == GetWorld() && It->GetOwner() &&
			It->GetOwner()->GetName().Contains(TEXT("Sky")))
		{
			SkyDomeComponent = *It;
			break;
		}
	}

	if (!SkyDomeComponent)
	{
		AActor* SkyActor = GetWorld()->SpawnActor<AActor>(
			AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator);
		if (SkyActor)
		{
#if WITH_EDITOR
			SkyActor->SetActorLabel(TEXT("NLT_SkyDome"));
#endif

			// Runtime-safe asset lookup (not constructor-only API)
			UStaticMesh* SphereMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere"));
			if (SphereMesh)
			{
				SkyDomeComponent = NewObject<UStaticMeshComponent>(SkyActor, TEXT("SkyDomeMesh"));
				SkyDomeComponent->SetStaticMesh(SphereMesh);
				SkyDomeComponent->SetWorldScale3D(FVector(10000.0f));
				SkyDomeComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				SkyDomeComponent->SetCastShadow(false);
				SkyDomeComponent->bReceivesDecals = false;
				SkyDomeComponent->RegisterComponent();
				SkyActor->SetRootComponent(SkyDomeComponent);
			}
		}
	}

	if (SkyDomeComponent && !SkyDomeMaterialInstance)
	{
		UMaterialInterface* BaseMat = SkyDomeMaterial ? SkyDomeMaterial.Get() : SkyDomeComponent->GetMaterial(0);
		if (BaseMat)
		{
			SkyDomeMaterialInstance = UMaterialInstanceDynamic::Create(BaseMat, SkyDomeComponent);
			SkyDomeComponent->SetMaterial(0, SkyDomeMaterialInstance);
		}
	}

	// Apply HDRI cubemap to sky dome material if assigned
	if (SkyDomeMaterialInstance && SkyboxCubemap)
	{
		// UObject wrapper types (TObjectPtr) must provide raw pointer to API that expects UTexture*
		SkyDomeMaterialInstance->SetTextureParameterValue(TEXT("SkyboxCubemap"), SkyboxCubemap.Get());
	}
}

void UNLTAtmosphereSubsystem::FindOrCreatePostProcessVolume()
{
	if (PostProcessVolumeActor) return;
	{
		TActorIterator<APostProcessVolumeActor> It(GetWorld());
		PostProcessVolumeActor = It ? *It : nullptr;
	}

	if (!PostProcessVolumeActor)
	{
		FActorSpawnParameters SP;
		SP.Name = TEXT("NLT_PostProcess");
		PostProcessVolumeActor = GetWorld()->SpawnActor<APostProcessVolumeActor>(SP);
		if (PostProcessVolumeActor)
		{
			PostProcessVolumeActor->BloomIntensity = 1.2f;
			PostProcessVolumeActor->Exposure = 1.0f;
			PostProcessVolumeActor->AmbientOcclusion = 0.4f;
			PostProcessVolumeActor->FilmGrain = 0.02f;
		}
	}
}

void UNLTAtmosphereSubsystem::SetSkyboxCubemap(UTextureCube* InCubemap, bool bApplyToSkyLight)
{
	if (!InCubemap) return;

	SkyboxCubemap = InCubemap;
	bUseSkyboxForSkyLight = bApplyToSkyLight;

	// Apply to sky dome material
	if (SkyDomeMaterialInstance)
	{
		SkyDomeMaterialInstance->SetTextureParameterValue(TEXT("SkyboxCubemap"), SkyboxCubemap);
	}

	// Apply to SkyLight for image-based reflections
	FindSkyLight();
	if (bUseSkyboxForSkyLight && SkyLight)
	{
		USkyLightComponent* SkyComp = SkyLight->GetLightComponent();
			if (SkyComp)
			{
				// Pass raw pointer; newer engine APIs may not include SetCubemapTint.
				SkyComp->SetCubemap(SkyboxCubemap.Get());
				// If SetCubemapTint does not exist on this engine version, avoid calling it.
				// Use SetLightColor on the component as a fallback for tinting if needed.
				// SkyComp->SetLightColor(FLinearColor::White);
			}
	}

	UE_LOG(LogNLTAtmosphere, Log, TEXT("Skybox cubemap %s applied to sky dome%s%s"),
		SkyboxCubemap ? *SkyboxCubemap->GetName() : TEXT("(null)"),
		bUseSkyboxForSkyLight ? TEXT(" and SkyLight") : TEXT(""),
		bUseRealTimeSkyCapture ? TEXT(" (recapturing)") : TEXT(""));
	
	if (bUseRealTimeSkyCapture)
	{
		if (USkyLightComponent* SkyComp = SkyLight->GetLightComponent())
		{
			SkyComp->RecaptureSky();
		}
	}
}

void UNLTAtmosphereSubsystem::SetColorGradingLUT(UTexture2D* InLUT, UMaterialInterface* InLUTMaterial)
{
	FindOrCreatePostProcessVolume();
	if (PostProcessVolumeActor)
	{
		PostProcessVolumeActor->ColorGradingLUT = InLUT;
		PostProcessVolumeActor->ColorGradingLUTMaterial = InLUTMaterial;
		PostProcessVolumeActor->ApplySettings();

		UE_LOG(LogNLTAtmosphere, Log, TEXT("Color grading LUT %s %s via %s"),
			InLUT ? *InLUT->GetName() : TEXT("(null — reverting to procedural)"),
			InLUT && InLUTMaterial ? TEXT("applied") : TEXT("cleared"),
			InLUTMaterial ? *InLUTMaterial->GetName() : TEXT("N/A"));
	}
	else
	{
		UE_LOG(LogNLTAtmosphere, Warning, TEXT("SetColorGradingLUT: PostProcessVolumeActor not found"));
	}
}
