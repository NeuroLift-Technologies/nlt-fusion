#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Core/NLTNoiseLibrary.h"
#include "World/NLTWorldGenerator.h"
#include "World/NLTWorldData.h"
#include "NLTOpenWorldSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogNLTOpenWorld, Log, All);

// Declared in World/NLTBuildingPortalActor.h. Forward declared here so this header is
// self-contained: unity builds batch module .cpp files in varying order, so relying on a
// transitive include of NLTBuildingPortalActor.h is fragile (C3646 unknown override specifier).
enum class ENLTBuildingType : uint8;

/**
 * Configuration for open world landscape generation.
 */
USTRUCT(BlueprintType)
struct FNLTOpenWorldConfig
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite)
    int32 Seed = 42;

    /** Open world extent (cm). 200 x 200 m so the authored building layout (see BuildingLayout)
     *  spreads out with footprint clearance instead of cramming - "open, no constraint on space".
     *  Buildings keep their authored coordinates, so only the world scale changes here. */
    UPROPERTY(BlueprintReadWrite)
    FVector WorldSize = FVector(20000.0f, 20000.0f, 0.0f);

    UPROPERTY(BlueprintReadWrite)
    int32 LandscapeResolution = 513;

    UPROPERTY(BlueprintReadWrite)
    float LandscapeHeightScale = 800.0f;

    UPROPERTY(BlueprintReadWrite)
    int32 NumBuildings = 12;

    UPROPERTY(BlueprintReadWrite)
    int32 NumResidents = 8;

    UPROPERTY(BlueprintReadWrite)
    int32 NumTrees = 200;

    UPROPERTY(BlueprintReadWrite)
    int32 NumRocks = 50;

    UPROPERTY(BlueprintReadWrite)
    int32 NumGrassPatches = 300;

    UPROPERTY(BlueprintReadWrite)
    float WaterLevel = 50.0f;

    UPROPERTY(BlueprintReadWrite)
    float TreeDensity = 0.0001f;

    UPROPERTY(BlueprintReadWrite)
    float GrassDensity = 0.0002f;

    /** Whether to place the Fab Modern City city-grid layer (roads, sidewalks, fences, trees). */
    UPROPERTY(BlueprintReadWrite)
    bool bPlaceCityScenery = true;

    /** Fixed, authored building layout - every entry is (type, exact location, yaw). Placement is
     *  NOT random: the generator places these verbatim every run. Edit this array to author the
     *  city. The default 12-building layout is footprint-clear (min clearance ~400 cm, verified and
     *  logged at spawn). Keep new positions >= (r_i + r_j + 400) apart using the per-type footprint
     *  radii from ANLTBuildingPortalActor::GetTargetHalfExtent() (Office 1100, Apartment/School
     *  1200, Factory 1300, Park 1500, Shop 800, Hut 150).
     *
     *  The Office and Apartment anchors were baked from the Fab Modern City block in Blender
     *  (see Imports/FabCity/GridSystem): Building 11 tower center at (52.2, -21.7) m and
     *  Building 12 tower center at (118.1, -65.7) m, scaled to the open world by m * 100 * 0.770
     *  (the shared scenery scale) so the portals sit on the imported block towers. */
    UPROPERTY(BlueprintReadWrite)
    TArray<FNLTDesiredBuilding> BuildingLayout = {
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
};

/**
 * Open World subsystem that manages the persistent open-world level.
 * Generates landscape from FBM noise, places buildings, spawns vegetation
 * via HISM, spawns AI residents, and manages day/night cycle.
 */
UCLASS()
class WORLDENGINE_API UNLTOpenWorldSubsystem : public UWorldSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    /** Generate the complete open world: landscape, buildings, vegetation, residents. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    void GenerateOpenWorld(const FNLTOpenWorldConfig& Config);

    /** Clear all generated world content. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    void ClearOpenWorld();

    /** Check if the open world has been generated. */
    UFUNCTION(BlueprintPure, Category = "NLT|OpenWorld")
    bool IsWorldGenerated() const { return bWorldGenerated; }

    /** Get the current open world configuration. */
    UFUNCTION(BlueprintPure, Category = "NLT|OpenWorld")
    const FNLTOpenWorldConfig& GetConfig() const { return CurrentConfig; }

    /** Get the generated world result from the world generator. */
    UFUNCTION(BlueprintPure, Category = "NLT|OpenWorld")
    const FNLTWorldGenerationResult& GetGeneratedWorld() const { return WorldResult; }

    /** Spawn a building portal at the specified transform. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    class ANLTBuildingPortalActor* SpawnBuildingPortal(FName BuildingType, const FTransform& Transform);

    /** Spawn vegetation instances across the landscape. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    void SpawnVegetation();

    /** Spawn AI residents that wander the open world. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    void SpawnResidents();

    /** Generate the landscape heightmap from FBM noise. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld")
    TArray<float> GenerateHeightmap() const;

    /** Get the terrain height at a world position. */
    UFUNCTION(BlueprintPure, Category = "NLT|OpenWorld")
    float GetTerrainHeight(float X, float Y) const;

    /** Stream in a scenario level by name. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld|Streaming")
    void StreamInLevel(const FName& LevelName);

    /** Stream out a scenario level by name. */
    UFUNCTION(BlueprintCallable, Category = "NLT|OpenWorld|Streaming")
    void StreamOutLevel(const FName& LevelName);

    /** Get the atmosphere subsystem for day/night control. */
    UFUNCTION(BlueprintPure, Category = "NLT|OpenWorld")
    class UNLTAtmosphereSubsystem* GetAtmosphereSubsystem() const;

private:
    bool bWorldGenerated = false;
    FNLTOpenWorldConfig CurrentConfig;
    FNLTWorldGenerationResult WorldResult;

    /** HISM components for vegetation. */
    UPROPERTY()
    class UHierarchicalInstancedStaticMeshComponent* TreeHISM;

    UPROPERTY()
    class UHierarchicalInstancedStaticMeshComponent* GrassHISM;

    UPROPERTY()
    class UHierarchicalInstancedStaticMeshComponent* RockHISM;

    /** Placeholder ground plane spawned when the level has no Landscape actor. */
    UPROPERTY()
    class AStaticMeshActor* GroundPlaceholder;

    /** Root actor holding vegetation HISM components. */
    UPROPERTY()
    class AActor* VegetationRoot;

    /** Spawned city scenery actors (Fab Modern City city-grid pieces). */
    UPROPERTY()
    TArray<class AStaticMeshActor*> CityScenery;

    /** Spawned building portals. */
    UPROPERTY()
    TArray<class ANLTBuildingPortalActor*> BuildingPortals;

    /** Spawned AI residents. */
    UPROPERTY()
    TArray<class AAvatarCharacter*> Residents;

    /** The world generator subsystem. */
    UPROPERTY()
    UNLTWorldGeneratorSubsystem* WorldGenerator;

    /** Generate landscape from heightmap data. */
    void GenerateLandscape(const TArray<float>& Heightmap);

    /** Spawn a placeholder ground plane when the level has no Landscape actor. */
    void SpawnGroundPlaceholder();

    /** Place water plane at the configured water level. */
    void PlaceWaterPlane();

    /** Spawn the Fab Modern City city-grid layer (roads, sidewalks, fences, trees, props).
     *  All pieces share the Fab scene origin, so they are placed at the world origin with
     *  a shared scale to preserve the block layout. */
    void SpawnCityScenery();

    /** Place atmospheric sky actors. */
    void PlaceAtmosphere();

    /** Calculate terrain height from FBM noise. */
    float CalculateTerrainHeight(float X, float Y) const;

    /** Determine if a position is suitable for vegetation. */
    bool IsSuitableForVegetation(float X, float Y, float Height) const;

    /** Get a random point on the landscape. */
    FVector GetRandomLandscapePoint(FRandomStream& Rand) const;

    /** Map building type name to enum. */
    ENLTBuildingType GetBuildingTypeFromFName(FName TypeName) const;
};
