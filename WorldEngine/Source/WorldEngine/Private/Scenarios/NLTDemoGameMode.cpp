// NLTDemoGameMode.cpp
#include "Scenarios/NLTDemoGameMode.h"
#include "Scenarios/Demo/NLTScenarioManagerSubsystem.h"
#include "Scenarios/UScenarioLibrary.h"
#include "World/NLTDoorActor.h"
#include "World/NLTOpenWorldSubsystem.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerStart.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"

ANLTDemoGameMode::ANLTDemoGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
}

void ANLTDemoGameMode::BeginPlay()
{
	Super::BeginPlay();

	// Auto-generate open world if this is an OpenWorld level.
	// Any level whose name contains "OpenWorld" (e.g. OpenWorld_Level, OpenWorld_City) is
	// treated as an open world hub, so renaming/duplicating the level keeps working.
	if (UWorld* World = GetWorld())
	{
		const FString LevelName = UGameplayStatics::GetCurrentLevelName(World);
		if (LevelName.Contains(TEXT("OpenWorld"), ESearchCase::IgnoreCase))
		{
			// Dedicated servers do not need generated presentation scenery. Keep
			// scenario startup for the regular scenario maps below.
			if (IsRunningDedicatedServer())
			{
				UE_LOG(LogTemp, Log, TEXT("Demo: Dedicated server skipped OpenWorld scenery generation"));
				return;
			}

			if (UNLTOpenWorldSubsystem* OWS = World->GetSubsystem<UNLTOpenWorldSubsystem>())
			{
				if (!OWS->IsWorldGenerated())
				{
					FNLTOpenWorldConfig Config;
					Config.Seed = 42;
					// World size + building layout come from FNLTOpenWorldConfig defaults: 200 m
					// open world with a fixed, authored 12-building layout (no random placement).
					Config.NumBuildings = 12;
					Config.NumResidents = 8;
					Config.NumTrees = 200;
					Config.NumRocks = 50;
					Config.NumGrassPatches = 300;
					// Explicitly set the baked BuildingLayout (struct default initializers don't propagate via UPROPERTY)
					Config.BuildingLayout = {
						{ TEXT("Office"),    FVector( 4020.0f, -1671.0f, 0.0f), FRotator(0.0f,   0.0f, 0.0f) },  // baked: Blender Building 11
						{ TEXT("Office"),    FVector( 5200.0f,  5700.0f, 0.0f), FRotator(0.0f,  90.0f, 0.0f) },
						{ TEXT("Apartment"), FVector(-5200.0f,  1500.0f, 0.0f), FRotator(0.0f,  90.0f, 0.0f) },
						{ TEXT("Apartment"), FVector( 4200.0f,  1500.0f, 0.0f), FRotator(0.0f,   0.0f, 0.0f) },
						{ TEXT("Apartment"), FVector(-6000.0f, -6000.0f, 0.0f), FRotator(0.0f,  45.0f, 0.0f) },
						{ TEXT("Apartment"), FVector( 9094.0f, -5059.0f, 0.0f), FRotator(0.0f, 127.0f, 0.0f) },  // baked: Blender Building 12
						{ TEXT("School"),    FVector(    0.0f,  4200.0f, 0.0f), FRotator(0.0f,  90.0f, 0.0f) },
						{ TEXT("Factory"),   FVector(-5200.0f, -2000.0f, 0.0f), FRotator(0.0f,  90.0f, 0.0f) },
						{ TEXT("Park"),      FVector(    0.0f, -1500.0f, 0.0f), FRotator(0.0f,   0.0f, 0.0f) },
						{ TEXT("Shop"),      FVector(-1300.0f,  1500.0f, 0.0f), FRotator(0.0f,   0.0f, 0.0f) },
						{ TEXT("Shop"),      FVector( 1300.0f,  1500.0f, 0.0f), FRotator(0.0f,  90.0f, 0.0f) },
						{ TEXT("Hut"),       FVector( 7000.0f, -7000.0f, 0.0f), FRotator(0.0f,   0.0f, 0.0f) }
					};
					OWS->GenerateOpenWorld(Config);
					EnsureOpenWorldPlayerSpawn();
					UE_LOG(LogTemp, Log, TEXT("[Demo] Generated open world (seed=%d) on level '%s'"), Config.Seed, *LevelName);
				}
			}
			return; // Skip scenario/level-door logic for open world
		}

		UE_LOG(LogTemp, Log, TEXT("[Demo] Level '%s' is not an OpenWorld level; no world generated"), *LevelName);
	}

	// Spawn doors that lead to other levels
	SpawnLevelDoors();

	// Start the scenario simulation
	if (UNLTScenarioManagerSubsystem* ScenarioManager = GetWorld()->GetSubsystem<UNLTScenarioManagerSubsystem>())
	{
		UScenarioDataAsset* ScenarioAsset = UScenarioLibrary::GetScenarioById(DefaultScenarioId);
		if (!ScenarioAsset)
		{
			UE_LOG(LogTemp, Warning, TEXT("Demo: scenario asset not found for id '%s'; spawning raw"), *DefaultScenarioId.ToString());
		}

		FNLTScenarioParams Params;
		Params.NumAgents = 20;
		Params.Seed = 1000;
		Params.SpawnOrigin = FVector(0.0f, 0.0f, 100.0f);
		Params.SpawnRadius = 5000.0f;
		Params.bAutoStartSimulation = true;

		const bool bStarted = ScenarioAsset
			? ScenarioManager->StartScenarioWithAsset(Params, ScenarioAsset)
			: ScenarioManager->StartScenario(Params);

		if (bStarted)
		{
			UE_LOG(LogTemp, Log, TEXT("Demo: scenario '%s' started (asset=%s, agents=%d)"),
				*DefaultScenarioId.ToString(),
				ScenarioAsset ? TEXT("yes") : TEXT("no"),
				Params.NumAgents);
		}
		else
		{
			UE_LOG(LogTemp, Error, TEXT("Demo: failed to start scenario '%s'"), *DefaultScenarioId.ToString());
		}
	}
	else
	{
		UE_LOG(LogTemp, Error, TEXT("Demo: UNLTScenarioManagerSubsystem not available on this world"));
	}
}

void ANLTDemoGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (UNLTScenarioManagerSubsystem* ScenarioManager = GetWorld()->GetSubsystem<UNLTScenarioManagerSubsystem>())
	{
		ScenarioManager->TickScenarioManager(DeltaSeconds);
	}
}

void ANLTDemoGameMode::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UNLTScenarioManagerSubsystem* ScenarioManager = GetWorld()->GetSubsystem<UNLTScenarioManagerSubsystem>())
	{
		ScenarioManager->StopScenario();
	}

	Super::EndPlay(EndPlayReason);
}

void ANLTDemoGameMode::EnsureOpenWorldPlayerSpawn()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	bool bHasPlayerStart = false;
	for (TActorIterator<APlayerStart> It(World); It; ++It)
	{
		bHasPlayerStart = true;
		break;
	}
	if (bHasPlayerStart)
	{
		return;
	}

	APlayerController* PC = World->GetFirstPlayerController();
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	if (!Pawn)
	{
		FTimerDelegate RetryDelegate;
		RetryDelegate.BindUObject(this, &ANLTDemoGameMode::EnsureOpenWorldPlayerSpawn);
		World->GetTimerManager().SetTimerForNextTick(RetryDelegate);
		return;
	}

	// OpenWorld_Level has no authored PlayerStart yet. Keep the default pawn
	// above the city ground and away from the Park/Shop portal trigger volumes.
	const FVector SafeSpawnLocation(0.0f, 300.0f, 200.0f);
	Pawn->SetActorLocation(SafeSpawnLocation, false, nullptr, ETeleportType::TeleportPhysics);
	PC->SetControlRotation(FRotator::ZeroRotator);

	UE_LOG(LogTemp, Log,
		TEXT("[Demo] No OpenWorld PlayerStart found; placed pawn at safe spawn %s"),
		*SafeSpawnLocation.ToString());
}

void ANLTDemoGameMode::SpawnLevelDoors()
{
	UWorld* World = GetWorld();
	if (!World) return;

	// Dedicated servers do not create a local player or need a PlayerStart.
	if (IsRunningDedicatedServer())
	{
		return;
	}

	const FName CurrentLevel = FName(*UGameplayStatics::GetCurrentLevelName(World));
	UE_LOG(LogTemp, Log, TEXT("SpawnLevelDoors: Current level is '%s'"), *CurrentLevel.ToString());

	const FName ReturnLevel = TEXT("OpenWorld_Level");
	const FText ReturnDisplayName = FText::FromString(TEXT("Open World"));

	// Preserve the D-drive Personal_Level door row along its south wall.
	FVector DoorLocation(0.0f, -885.0f, 100.0f);
	FRotator DoorRotation(0.0f, 180.0f, 0.0f);
	if (CurrentLevel == TEXT("Workplace_Level"))
	{
		DoorLocation = FVector(1580.0f, 0.0f, 100.0f);
		DoorRotation = FRotator(0.0f, 90.0f, 0.0f);
	}
	else if (CurrentLevel == TEXT("Social_Level") ||
			 CurrentLevel == TEXT("Academic_Level"))
	{
		DoorLocation = FVector(0.0f, 950.0f, 100.0f);
		DoorRotation = FRotator::ZeroRotator;
	}
	else if (CurrentLevel != TEXT("Personal_Level"))
	{
		UE_LOG(LogTemp, Warning,
			TEXT("SpawnLevelDoors: no return-door placement configured for level '%s'; using the Personal_Level position"),
			*CurrentLevel.ToString());
	}

	SpawnDoor(ReturnLevel, ReturnDisplayName, DoorLocation, DoorRotation);
	UE_LOG(LogTemp, Log,
		TEXT("SpawnLevelDoors: Spawned one return door to '%s' on level '%s'"),
		*ReturnLevel.ToString(), *CurrentLevel.ToString());
}

ANLTDoorActor* ANLTDemoGameMode::SpawnDoor(const FName& TargetLevel, const FText& DisplayName, const FVector& Location, const FRotator& Rotation)
{
	UWorld* World = GetWorld();
	if (! World) return nullptr;

	FActorSpawnParameters SpawnParams;
	SpawnParams.Name = FName(*FString::Printf(TEXT("Door_%s"), *TargetLevel.ToString()));
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	ANLTDoorActor* Door = World->SpawnActor<ANLTDoorActor>(
		ANLTDoorActor::StaticClass(),
		Location,
		Rotation,
		SpawnParams
	);

	if (Door)
	{
		Door->TargetLevelId = TargetLevel;
		Door->DisplayName = DisplayName;
		Door->UpdateLabelText();

		int32 YawInt = FMath::RoundToInt(Rotation.Yaw) % 360;
		if (YawInt < 0) YawInt += 360;
		FVector FaceDir(0.0f, -1.0f, 0.0f);
		switch (YawInt)
		{
			case 90:  FaceDir = FVector(-1.0f, 0.0f, 0.0f); break;
			case 180: FaceDir = FVector(0.0f, 1.0f, 0.0f);  break;
			case 270: FaceDir = FVector(1.0f, 0.0f, 0.0f);  break;
			default:  break;
		}
		Door->SetLabelFacing(FaceDir);

		UE_LOG(LogTemp, Log, TEXT("SpawnLevelDoors: Spawned door to '%s' at %s"), *TargetLevel.ToString(), *Location.ToString());
	}

	return Door;
}
