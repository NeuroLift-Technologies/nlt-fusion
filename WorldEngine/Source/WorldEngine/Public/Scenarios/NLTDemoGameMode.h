// NLTDemoGameMode.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "NLTDemoGameMode.generated.h"

UCLASS()
class WORLDENGINE_API ANLTDemoGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ANLTDemoGameMode();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

protected:
	UPROPERTY(EditAnywhere, Category = "NLT|Scenario")
	FName DefaultScenarioId = TEXT("wp_1");

public:
	// Public so derived classes can call it without starting the scenario
	void SpawnLevelDoors();

private:
	class ANLTDoorActor* SpawnDoor(const FName& TargetLevel, const FText& DisplayName, const FVector& Location, const FRotator& Rotation = FRotator::ZeroRotator);

	/** Ensure the open-world player has a safe spawn even when the map has no PlayerStart. */
	void EnsureOpenWorldPlayerSpawn();
};
