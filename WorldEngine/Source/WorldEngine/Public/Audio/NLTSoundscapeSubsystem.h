#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Audio/SoundscapeDataAsset.h"
#include "Components/AudioComponent.h"
#include "NLTSoundscapeSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTSoundscape, Log, All);

/**
 * Manages ambient soundscape beds for a scenario level.
 * Ties audio volume/pitch to scenario stress level (0..1).
 * Mute = dead world (no scenario active). Unmute = occupied world.
 */
UCLASS()
class WORLDENGINE_API UNLTSoundscapeSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;

	/** Assigns the soundscape data asset to use. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void SetSoundscapeAsset(USoundscapeDataAsset* InAsset);

	/** Activates the soundscape (occupied world). Fades in all beds. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void Activate();

	/** Deactivates the soundscape (dead world). Fades out all beds. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void Deactivate();

	/** Immediately mutes all beds (no fade). */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void MuteAll();

	/** Immediately unmutes all beds (no fade). */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void UnmuteAll();

	/** True if the soundscape is currently active (occupied world). */
	UFUNCTION(BlueprintPure, Category = "NLT|Soundscape")
	bool IsActive() const { return bActive; }

	/** Updates the stress level (0..1) that drives volume/pitch modulation. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void SetStressLevel(float InStress);

	/** Returns the current stress level. */
	UFUNCTION(BlueprintPure, Category = "NLT|Soundscape")
	float GetStressLevel() const { return CurrentStress; }

	/** Sets the world position of the soundscape origin. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Soundscape")
	void SetOrigin(const FVector& InOrigin);

	/** Per-frame update — applies stress-driven volume/pitch to all beds. */
	void TickSoundscape(float DeltaTime);

private:
	void CreateBedAudioComponents();
	void DestroyBedAudioComponents();
	void ApplyStressToBed(UAudioComponent* Component, const FSoundscapeBedLayer& Layer);
	void UpdateBedVolumes();

	UPROPERTY()
	TObjectPtr<USoundscapeDataAsset> SoundscapeAsset;

	UPROPERTY()
	TObjectPtr<UAudioComponent> HVACComponent;

	UPROPERTY()
	TObjectPtr<UAudioComponent> FridgeComponent;

	UPROPERTY()
	TObjectPtr<UAudioComponent> ClockComponent;

	UPROPERTY()
	TObjectPtr<UAudioComponent> MurmurComponent;

	bool bActive = false;
	float CurrentStress = 0.0f;
	float TargetStress = 0.0f;
	float FadeAlpha = 0.0f;
	FVector Origin = FVector::ZeroVector;
};
