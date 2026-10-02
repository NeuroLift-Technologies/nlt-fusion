#include "Audio/NLTSoundscapeSubsystem.h"
#include "AudioDevice.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundWave.h"
#include "Sound/SoundAttenuation.h"
#include "Engine/World.h"

DEFINE_LOG_CATEGORY(LogNLTSoundscape);

void UNLTSoundscapeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UE_LOG(LogNLTSoundscape, Log, TEXT("Soundscape subsystem initialized"));
}

void UNLTSoundscapeSubsystem::Deinitialize()
{
	DestroyBedAudioComponents();
	Super::Deinitialize();
}

bool UNLTSoundscapeSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
	{
		return false;
	}
	const UWorld* World = Cast<UWorld>(Outer);
	return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE);
}

void UNLTSoundscapeSubsystem::SetSoundscapeAsset(USoundscapeDataAsset* InAsset)
{
	SoundscapeAsset = InAsset;
	if (SoundscapeAsset)
	{
		DestroyBedAudioComponents();
		CreateBedAudioComponents();
	}
}

void UNLTSoundscapeSubsystem::Activate()
{
	if (!SoundscapeAsset)
	{
		UE_LOG(LogNLTSoundscape, Warning, TEXT("Activate called with no soundscape asset"));
		return;
	}

	if (!HVACComponent)
	{
		CreateBedAudioComponents();
	}

	bActive = true;
	FadeAlpha = 0.0f;

	// Start all beds playing at zero volume (will fade in)
	if (HVACComponent) { HVACComponent->SetVolumeMultiplier(0.0f); HVACComponent->Play(); }
	if (FridgeComponent) { FridgeComponent->SetVolumeMultiplier(0.0f); FridgeComponent->Play(); }
	if (ClockComponent) { ClockComponent->SetVolumeMultiplier(0.0f); ClockComponent->Play(); }
	if (MurmurComponent) { MurmurComponent->SetVolumeMultiplier(0.0f); MurmurComponent->Play(); }

	UE_LOG(LogNLTSoundscape, Log, TEXT("Soundscape activated (occupied world)"));
}

void UNLTSoundscapeSubsystem::Deactivate()
{
	bActive = false;
	// Fade out handled in TickSoundscape
	UE_LOG(LogNLTSoundscape, Log, TEXT("Soundscape deactivated (dead world)"));
}

void UNLTSoundscapeSubsystem::MuteAll()
{
	bActive = false;
	FadeAlpha = 0.0f;
	if (HVACComponent) { HVACComponent->SetVolumeMultiplier(0.0f); HVACComponent->Stop(); }
	if (FridgeComponent) { FridgeComponent->SetVolumeMultiplier(0.0f); FridgeComponent->Stop(); }
	if (ClockComponent) { ClockComponent->SetVolumeMultiplier(0.0f); ClockComponent->Stop(); }
	if (MurmurComponent) { MurmurComponent->SetVolumeMultiplier(0.0f); MurmurComponent->Stop(); }
}

void UNLTSoundscapeSubsystem::UnmuteAll()
{
	bActive = true;
	FadeAlpha = 1.0f;
	if (!HVACComponent) { CreateBedAudioComponents(); }
	if (HVACComponent) { HVACComponent->SetVolumeMultiplier(1.0f); HVACComponent->Play(); }
	if (FridgeComponent) { FridgeComponent->SetVolumeMultiplier(1.0f); FridgeComponent->Play(); }
	if (ClockComponent) { ClockComponent->SetVolumeMultiplier(1.0f); ClockComponent->Play(); }
	if (MurmurComponent) { MurmurComponent->SetVolumeMultiplier(1.0f); MurmurComponent->Play(); }
}

void UNLTSoundscapeSubsystem::SetStressLevel(float InStress)
{
	TargetStress = FMath::Clamp(InStress, 0.0f, 1.0f);
}

void UNLTSoundscapeSubsystem::SetOrigin(const FVector& InOrigin)
{
	Origin = InOrigin;
	const FVector HVACPos = Origin + (SoundscapeAsset ? SoundscapeAsset->HVACLayer.LocalOffset : FVector::ZeroVector);
	const FVector FridgePos = Origin + (SoundscapeAsset ? SoundscapeAsset->FridgeLayer.LocalOffset : FVector::ZeroVector);
	const FVector ClockPos = Origin + (SoundscapeAsset ? SoundscapeAsset->ClockLayer.LocalOffset : FVector::ZeroVector);
	const FVector MurmurPos = Origin + (SoundscapeAsset ? SoundscapeAsset->MurmurLayer.LocalOffset : FVector::ZeroVector);

	if (HVACComponent) { HVACComponent->SetWorldLocation(HVACPos); }
	if (FridgeComponent) { FridgeComponent->SetWorldLocation(FridgePos); }
	if (ClockComponent) { ClockComponent->SetWorldLocation(ClockPos); }
	if (MurmurComponent) { MurmurComponent->SetWorldLocation(MurmurPos); }
}

void UNLTSoundscapeSubsystem::TickSoundscape(float DeltaTime)
{
	if (!SoundscapeAsset)
	{
		return;
	}

	// Smooth fade in/out
	const float FadeSpeed = bActive
		? (SoundscapeAsset->FadeInDuration > 0.0f ? 1.0f / SoundscapeAsset->FadeInDuration : 1.0f)
		: (SoundscapeAsset->FadeOutDuration > 0.0f ? -1.0f / SoundscapeAsset->FadeOutDuration : -1.0f);

	FadeAlpha = FMath::Clamp(FadeAlpha + FadeSpeed * DeltaTime, 0.0f, 1.0f);

	// Smooth stress interpolation
	CurrentStress = FMath::FInterpTo(CurrentStress, TargetStress, DeltaTime, 2.0f);

	// Stop all components if fully faded out
	if (!bActive && FadeAlpha <= 0.0f)
	{
		if (HVACComponent && HVACComponent->IsPlaying()) { HVACComponent->Stop(); }
		if (FridgeComponent && FridgeComponent->IsPlaying()) { FridgeComponent->Stop(); }
		if (ClockComponent && ClockComponent->IsPlaying()) { ClockComponent->Stop(); }
		if (MurmurComponent && MurmurComponent->IsPlaying()) { MurmurComponent->Stop(); }
		return;
	}

	UpdateBedVolumes();
}

void UNLTSoundscapeSubsystem::CreateBedAudioComponents()
{
	UWorld* World = GetWorld();
	if (!World || !SoundscapeAsset)
	{
		return;
	}

	auto CreateBed = [this, World](USoundWave* Sound, const FVector& Offset, USoundAttenuation* Attenuation) -> UAudioComponent*
	{
		if (!Sound)
		{
			return nullptr;
		}
		UAudioComponent* Comp = NewObject<UAudioComponent>(World);
		Comp->SetSound(Sound);
		Comp->bAutoActivate = false;
		Comp->bStopWhenOwnerDestroyed = false;
		Comp->bIsUISound = false;
		Comp->bAllowSpatialization = (Attenuation != nullptr);
		if (Attenuation)
		{
			Comp->AttenuationSettings = Attenuation;
		}
		Comp->SetWorldLocation(Origin + Offset);
		Comp->RegisterComponent();
		return Comp;
	};

	HVACComponent = CreateBed(SoundscapeAsset->HVACLayer.SoundWave, SoundscapeAsset->HVACLayer.LocalOffset, SoundscapeAsset->HVACLayer.Attenuation);
	FridgeComponent = CreateBed(SoundscapeAsset->FridgeLayer.SoundWave, SoundscapeAsset->FridgeLayer.LocalOffset, SoundscapeAsset->FridgeLayer.Attenuation);
	ClockComponent = CreateBed(SoundscapeAsset->ClockLayer.SoundWave, SoundscapeAsset->ClockLayer.LocalOffset, SoundscapeAsset->ClockLayer.Attenuation);
	MurmurComponent = CreateBed(SoundscapeAsset->MurmurLayer.SoundWave, SoundscapeAsset->MurmurLayer.LocalOffset, SoundscapeAsset->MurmurLayer.Attenuation);
}

void UNLTSoundscapeSubsystem::DestroyBedAudioComponents()
{
	if (HVACComponent) { HVACComponent->DestroyComponent(); HVACComponent = nullptr; }
	if (FridgeComponent) { FridgeComponent->DestroyComponent(); FridgeComponent = nullptr; }
	if (ClockComponent) { ClockComponent->DestroyComponent(); ClockComponent = nullptr; }
	if (MurmurComponent) { MurmurComponent->DestroyComponent(); MurmurComponent = nullptr; }
}

void UNLTSoundscapeSubsystem::ApplyStressToBed(UAudioComponent* Component, const FSoundscapeBedLayer& Layer)
{
	if (!Component)
	{
		return;
	}

	const float StressNorm = (SoundscapeAsset->FullStressThreshold > 0.0f)
		? FMath::Clamp(CurrentStress / SoundscapeAsset->FullStressThreshold, 0.0f, 1.0f)
		: 0.0f;

	const float Volume = FMath::Lerp(Layer.BaseVolume, Layer.MaxVolume, StressNorm) * FadeAlpha;
	const float Pitch = FMath::Lerp(Layer.BasePitch, Layer.MaxPitch, StressNorm);

	Component->SetVolumeMultiplier(Volume);
	Component->SetPitchMultiplier(Pitch);
}

void UNLTSoundscapeSubsystem::UpdateBedVolumes()
{
	if (HVACComponent) { ApplyStressToBed(HVACComponent, SoundscapeAsset->HVACLayer); }
	if (FridgeComponent) { ApplyStressToBed(FridgeComponent, SoundscapeAsset->FridgeLayer); }
	if (ClockComponent) { ApplyStressToBed(ClockComponent, SoundscapeAsset->ClockLayer); }
	if (MurmurComponent) { ApplyStressToBed(MurmurComponent, SoundscapeAsset->MurmurLayer); }
}
