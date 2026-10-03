// ANLTPlayerController.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "NLTPlayerController.generated.h"

class UNLTLevelPickerWidget;
class ANLTDoorActor;

/**
 * Player controller for NLT World Engine demo/interactive mode.
 * Handles the Interact input (E key) and manages the level picker widget.
 * When the player presses Interact near a door, a picker appears listing
 * all doors in the level; clicking one loads that level.
 */
UCLASS()
class WORLDENGINE_API ANLTPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ANLTPlayerController();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupInputComponent() override;

	/** Travel to a specific level. */
	UFUNCTION(BlueprintCallable, Category = "NLT|Travel")
	void TravelToLevel(const FName& LevelId);

protected:
	/** The level picker widget (created on demand). */
	UPROPERTY()
	UNLTLevelPickerWidget* LevelPickerWidget;

	/** The widget class to instantiate (Blueprint subclass can override). */
	UPROPERTY(EditDefaultsOnly, Category = "NLT|UI")
	TSubclassOf<UNLTLevelPickerWidget> PickerWidgetClass;

	/** Currently tracked doors (refreshed each tick from world). */
	TArray<ANLTDoorActor*> AvailableDoors;

	/** Door the player is currently near (if any). */
	UPROPERTY()
	ANLTDoorActor* NearbyDoor;

	/** Refresh the list of available doors. */
	void RefreshDoorList();

	/** Show the level picker populated with available doors. */
	void ShowLevelPicker();

	/** Hide the level picker. */
	void HideLevelPicker();

	/** Called when a level is selected from the picker. */
	UFUNCTION()
	void OnLevelSelected(FName LevelId);

	/** Called when the picker is closed without selection. */
	UFUNCTION()
	void OnPickerClosed();

	/** Interact input handler. */
	void OnInteract();

	/**
	 * Quit input handler (Escape / console Start).
	 * Uses QuitGame rather than FPlatformMisc::RequestExit so the engine still
	 * runs its normal shutdown path and flushes logs on Windows.
	 */
	void OnQuit();
};
