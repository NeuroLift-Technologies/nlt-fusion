// NLTPlayerController.cpp
#include "Agents/NLTPlayerController.h"
#include "UI/NLTLevelPickerWidget.h"
#include "World/NLTDoorActor.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

ANLTPlayerController::ANLTPlayerController()
	: LevelPickerWidget(nullptr)
	, NearbyDoor(nullptr)
{
}

void ANLTPlayerController::BeginPlay()
{
	Super::BeginPlay();
}

void ANLTPlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Update available doors
	RefreshDoorList();

	// Find the nearest door the player is close to
	ANLTDoorActor* NewNearby = nullptr;
	for (ANLTDoorActor* Door : AvailableDoors)
	{
		if (Door && Door->IsPlayerInRange())
		{
			NewNearby = Door;
			break;
		}
	}

	if (NewNearby != NearbyDoor)
	{
		if (NearbyDoor && !NewNearby)
		{
			UE_LOG(LogTemp, Log, TEXT("Player moved away from door"));
		}
		else if (!NearbyDoor && NewNearby)
		{
			UE_LOG(LogTemp, Log, TEXT("Player near door '%s' - %s"),
				*NewNearby->GetName(),
				*NewNearby->GetInteractPrompt().ToString());
		}
		NearbyDoor = NewNearby;
	}
}

void ANLTPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	// Register the Interact action
	if (UInputComponent* IC = InputComponent)
	{
		IC->BindAction("Interact", IE_Pressed, this, &ANLTPlayerController::OnInteract);
		IC->BindAction("OpenMenu", IE_Pressed, this, &ANLTPlayerController::ShowLevelPicker);
	}
}

void ANLTPlayerController::RefreshDoorList()
{
	AvailableDoors.Empty();

	if (UWorld* World = GetWorld())
	{
		// Find all door actors in the world
		TArray<AActor*> FoundActors;
		UGameplayStatics::GetAllActorsOfClass(World, ANLTDoorActor::StaticClass(), FoundActors);
		for (AActor* Actor : FoundActors)
		{
			if (ANLTDoorActor* Door = Cast<ANLTDoorActor>(Actor))
			{
				AvailableDoors.Add(Door);
			}
		}
	}
}

void ANLTPlayerController::ShowLevelPicker()
{
	// Create the picker if it doesn't exist
	if (!LevelPickerWidget && PickerWidgetClass)
	{
		LevelPickerWidget = CreateWidget<UNLTLevelPickerWidget>(this, PickerWidgetClass);
	}
	else if (!LevelPickerWidget)
	{
		// Use the C++ base class (Blueprint can override)
		LevelPickerWidget = CreateWidget<UNLTLevelPickerWidget>(this, UNLTLevelPickerWidget::StaticClass());
	}

	if (!LevelPickerWidget) return;

	// Populate with available doors
	LevelPickerWidget->ClearEntries();
	for (ANLTDoorActor* Door : AvailableDoors)
	{
		if (Door)
		{
			LevelPickerWidget->AddLevelEntry(Door->GetTargetLevelId(), Door->GetDisplayName());
		}
	}

	// Bind to events
	LevelPickerWidget->OnLevelSelected.Clear();
	LevelPickerWidget->OnLevelSelected.AddDynamic(this, &ANLTPlayerController::OnLevelSelected);
	LevelPickerWidget->OnPickerClosed.Clear();
	LevelPickerWidget->OnPickerClosed.AddDynamic(this, &ANLTPlayerController::OnPickerClosed);

	// Show it
	LevelPickerWidget->ShowPicker();
}

void ANLTPlayerController::HideLevelPicker()
{
	if (LevelPickerWidget)
	{
		LevelPickerWidget->HidePicker();
	}
}

void ANLTPlayerController::OnInteract()
{
	if (NearbyDoor)
	{
		// Direct travel to the door's target
		FName TargetLevel = NearbyDoor->GetTargetLevelId();
		UE_LOG(LogTemp, Log, TEXT("Player interacting with door '%s' -> traveling to '%s'"),
			*NearbyDoor->GetName(), *TargetLevel.ToString());
		TravelToLevel(TargetLevel);
	}
	else
	{
		// Show the picker anyway if no door is nearby (fallback)
		UE_LOG(LogTemp, Log, TEXT("Player pressed Interact but no door nearby"));
		ShowLevelPicker();
	}
}

void ANLTPlayerController::OnLevelSelected(FName LevelId)
{
	HideLevelPicker();
	TravelToLevel(LevelId);
}

void ANLTPlayerController::OnPickerClosed()
{
	HideLevelPicker();
}

void ANLTPlayerController::TravelToLevel(const FName& LevelId)
{
	if (UWorld* World = GetWorld())
	{
		FString LevelPath = FString::Printf(TEXT("/Game/Scenarios/Levels/%s"), *LevelId.ToString());
		UE_LOG(LogTemp, Log, TEXT("Traveling to level: %s"), *LevelPath);

		// Open the level (single-player, non-seamless). Use the full package
		// path so travel works for the scenario maps under /Game/Scenarios/Levels.
		UGameplayStatics::OpenLevel(World, FName(*LevelPath));
	}
}
