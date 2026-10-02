#include "World/NLTWorldGenerator.h"
#include "World/NLTWorldData.h"
#include "Modules/ModuleManager.h"

DEFINE_LOG_CATEGORY(LogNLTWorldGenerator);

void UNLTWorldGeneratorSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    UE_LOG(LogNLTWorldGenerator, Log, TEXT("World generator subsystem initialized"));
}

void UNLTWorldGeneratorSubsystem::Deinitialize()
{
    ClearWorld();
    Super::Deinitialize();
}

FNLTWorldGenerationResult UNLTWorldGeneratorSubsystem::GenerateWorld(const FNLTWorldGenerationParams& Params)
{
    FRandomStream Rand(Params.Seed);
    GeneratedWorld = FNLTWorldGenerationResult();

    GenerateDistricts(Params, Rand);
    GenerateBuildings(Params, Rand);
    GenerateRoads(Params, Rand);

    bWorldGenerated = true;
    UE_LOG(LogNLTWorldGenerator, Log, TEXT("World generated: %d districts, %d buildings, %d roads"),
        GeneratedWorld.Districts.Num(), GeneratedWorld.Buildings.Num(), GeneratedWorld.RoadPoints.Num());

    return GeneratedWorld;
}

void UNLTWorldGeneratorSubsystem::ClearWorld()
{
    GeneratedWorld = FNLTWorldGenerationResult();
    bWorldGenerated = false;
}

void UNLTWorldGeneratorSubsystem::GenerateDistricts(const FNLTWorldGenerationParams& Params, FRandomStream& Rand)
{
    TArray<FName> DistrictTypes = { TEXT("Residential"), TEXT("Commercial"), TEXT("Industrial"), TEXT("Park") };

    for (int32 i = 0; i < Params.NumDistricts; i++)
    {
        FNLTGeneratedDistrict District;
        District.DistrictType = DistrictTypes[Rand.RandRange(0, DistrictTypes.Num() - 1)];
        District.Center = FVector(
            Rand.FRandRange(-Params.WorldSize.X / 2, Params.WorldSize.X / 2),
            Rand.FRandRange(-Params.WorldSize.Y / 2, Params.WorldSize.Y / 2),
            0.0f
        );
        District.Radius = Rand.FRandRange(500.0f, 1500.0f);

        if (District.DistrictType == TEXT("Residential"))
        {
            District.NoiseLevel = Rand.FRandRange(0.1f, 0.4f);
            District.SocialDensity = Rand.FRandRange(0.3f, 0.6f);
            District.Privacy = Rand.FRandRange(0.5f, 0.8f);
            District.Activities = { TEXT("Rest"), TEXT("Socialize"), TEXT("Study") };
        }
        else if (District.DistrictType == TEXT("Commercial"))
        {
            District.NoiseLevel = Rand.FRandRange(0.5f, 0.9f);
            District.SocialDensity = Rand.FRandRange(0.6f, 0.9f);
            District.Privacy = Rand.FRandRange(0.1f, 0.4f);
            District.Activities = { TEXT("Work"), TEXT("Socialize"), TEXT("Shop") };
        }
        else if (District.DistrictType == TEXT("Industrial"))
        {
            District.NoiseLevel = Rand.FRandRange(0.7f, 1.0f);
            District.SocialDensity = Rand.FRandRange(0.1f, 0.4f);
            District.Privacy = Rand.FRandRange(0.2f, 0.5f);
            District.Activities = { TEXT("Work") };
        }
        else if (District.DistrictType == TEXT("Park"))
        {
            District.NoiseLevel = Rand.FRandRange(0.0f, 0.3f);
            District.SocialDensity = Rand.FRandRange(0.2f, 0.5f);
            District.Privacy = Rand.FRandRange(0.6f, 0.9f);
            District.Activities = { TEXT("Rest"), TEXT("Socialize"), TEXT("Exercise") };
        }

        GeneratedWorld.Districts.Add(District);
    }
}

void UNLTWorldGeneratorSubsystem::GenerateBuildings(const FNLTWorldGenerationParams& Params, FRandomStream& Rand)
{
    // Fixed, authored layout (FNLTOpenWorldConfig.BuildingLayout). Every building keeps the exact
    // type, location and yaw from the config - placement is NOT random, so the city never overlaps
    // and never drifts between runs. The seed only varies per-building semantic detail below.
    if (Params.BuildingLayout.Num() == 0)
    {
        UE_LOG(LogNLTWorldGenerator, Warning,
            TEXT("GenerateBuildings: BuildingLayout is empty - spawning no buildings. Populate FNLTOpenWorldConfig.BuildingLayout."));
        return;
    }

    for (const FNLTDesiredBuilding& Desired : Params.BuildingLayout)
    {
        FNLTGeneratedBuilding Building;
        Building.BuildingType = Desired.BuildingType;
        // Z is 0 here; the open-world subsystem raises each building onto the terrain at spawn.
        Building.Transform = FTransform(
            FRotator(Desired.Rotation.Pitch, Desired.Rotation.Yaw, Desired.Rotation.Roll),
            FVector(Desired.Location.X, Desired.Location.Y, 0.0f)
        );
        Building.SemanticData = GenerateBuildingSemantics(Building.BuildingType, Rand);
        GeneratedWorld.Buildings.Add(Building);
    }

    UE_LOG(LogNLTWorldGenerator, Log, TEXT("World generated with %d explicit building placements"), GeneratedWorld.Buildings.Num());
}

void UNLTWorldGeneratorSubsystem::GenerateRoads(const FNLTWorldGenerationParams& Params, FRandomStream& Rand)
{
    for (int32 i = 0; i < Params.NumRoads; i++)
    {
        FTransform RoadPoint;
        RoadPoint.SetLocation(FVector(
            Rand.FRandRange(-Params.WorldSize.X / 2, Params.WorldSize.X / 2),
            Rand.FRandRange(-Params.WorldSize.Y / 2, Params.WorldSize.Y / 2),
            0.0f
        ));
        RoadPoint.SetRotation(FQuat(FRotator(0.0f, Rand.FRandRange(0.0f, 360.0f), 0.0f)));
        GeneratedWorld.RoadPoints.Add(RoadPoint);
    }
}

FNLTLocationSemanticData UNLTWorldGeneratorSubsystem::GenerateBuildingSemantics(FName BuildingType, FRandomStream& Rand)
{
    FNLTLocationSemanticData Semantics;
    Semantics.LocationType = BuildingType;

    if (BuildingType == TEXT("Office"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.3f, 0.6f);
        Semantics.SocialDensity = Rand.FRandRange(0.5f, 0.8f);
        Semantics.Privacy = Rand.FRandRange(0.2f, 0.5f);
        Semantics.AvailableActivities = { TEXT("Work"), TEXT("Meet") };
    }
    else if (BuildingType == TEXT("Apartment"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.1f, 0.4f);
        Semantics.SocialDensity = Rand.FRandRange(0.3f, 0.6f);
        Semantics.Privacy = Rand.FRandRange(0.6f, 0.9f);
        Semantics.AvailableActivities = { TEXT("Rest"), TEXT("Sleep") };
    }
    else if (BuildingType == TEXT("Shop"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.5f, 0.8f);
        Semantics.SocialDensity = Rand.FRandRange(0.6f, 0.9f);
        Semantics.Privacy = Rand.FRandRange(0.1f, 0.4f);
        Semantics.AvailableActivities = { TEXT("Shop"), TEXT("Socialize") };
    }
    else if (BuildingType == TEXT("Factory"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.7f, 1.0f);
        Semantics.SocialDensity = Rand.FRandRange(0.1f, 0.4f);
        Semantics.Privacy = Rand.FRandRange(0.2f, 0.5f);
        Semantics.AvailableActivities = { TEXT("Work") };
    }
    else if (BuildingType == TEXT("Park"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.0f, 0.3f);
        Semantics.SocialDensity = Rand.FRandRange(0.2f, 0.5f);
        Semantics.Privacy = Rand.FRandRange(0.6f, 0.9f);
        Semantics.AvailableActivities = { TEXT("Rest"), TEXT("Exercise") };
    }
    else if (BuildingType == TEXT("School"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.4f, 0.7f);
        Semantics.SocialDensity = Rand.FRandRange(0.6f, 0.9f);
        Semantics.Privacy = Rand.FRandRange(0.3f, 0.6f);
        Semantics.AvailableActivities = { TEXT("Learn"), TEXT("Meet") };
    }
    else if (BuildingType == TEXT("Hut"))
    {
        Semantics.NoiseLevel = Rand.FRandRange(0.0f, 0.2f);
        Semantics.SocialDensity = Rand.FRandRange(0.05f, 0.25f);
        Semantics.Privacy = Rand.FRandRange(0.7f, 1.0f);
        Semantics.AvailableActivities = { TEXT("Rest"), TEXT("Survive") };
    }

    return Semantics;
}
