// NLTOpenWorldSubsystem.cpp

#include "World/NLTOpenWorldSubsystem.h"
#include "World/NLTBuildingPortalActor.h"
#include "World/NLTWorldPalette.h"
#include "Agents/AvatarCharacter.h"
#include "Simulation/NLTAtmosphereSubsystem.h"
#include "NavigationSystem.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "Engine/LevelStreamingDynamic.h"
#include "Engine/StaticMesh.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Landscape.h"
#include "LandscapeEdit.h"
#include "LandscapeInfo.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "EngineUtils.h"

DEFINE_LOG_CATEGORY(LogNLTOpenWorld);

// ============== Initialization ==============

void UNLTOpenWorldSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    // Get the world generator subsystem
    WorldGenerator = Collection.InitializeDependency<UNLTWorldGeneratorSubsystem>();

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Open World subsystem initialized"));
}

void UNLTOpenWorldSubsystem::Deinitialize()
{
    ClearOpenWorld();

    // Cleanup HISM components
    if (TreeHISM)
    {
        TreeHISM->ClearInstances();
        TreeHISM->DestroyComponent();
        TreeHISM = nullptr;
    }
    if (GrassHISM)
    {
        GrassHISM->ClearInstances();
        GrassHISM->DestroyComponent();
        GrassHISM = nullptr;
    }
    if (RockHISM)
    {
        RockHISM->ClearInstances();
        RockHISM->DestroyComponent();
        RockHISM = nullptr;
    }

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Open World subsystem deinitialized"));
}

// ============== World Generation ==============

void UNLTOpenWorldSubsystem::GenerateOpenWorld(const FNLTOpenWorldConfig& Config)
{
    CurrentConfig = Config;
    bWorldGenerated = true;

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Generating open world with seed %d, world size %.0fx%.0f"),
        Config.Seed, Config.WorldSize.X, Config.WorldSize.Y);

    // Generate heightmap from FBM noise
    TArray<float> Heightmap = GenerateHeightmap();

    // Generate landscape from heightmap
    GenerateLandscape(Heightmap);

    // A Landscape actor cannot be created at runtime (Landscape editing is editor-only), so if the
    // level does not contain one, spawn a simple ground plane to keep the world visible.
    SpawnGroundPlaceholder();

    // Place water plane at configured water level
    PlaceWaterPlane();

    // Place the Fab Modern City city-grid layer on the ground
    SpawnCityScenery();

    // Generate world data (districts, buildings) via World Generator
    FNLTWorldGenerationParams GenParams;
    GenParams.Seed = Config.Seed;
    GenParams.WorldSize = Config.WorldSize;
    GenParams.NumDistricts = 4;
    GenParams.NumBuildings = Config.NumBuildings; // overridden by BuildingLayout count when set
    GenParams.BuildingLayout = Config.BuildingLayout;

    if (WorldGenerator)
    {
        WorldResult = WorldGenerator->GenerateWorld(GenParams);
    }

    // Place atmospheric sky actors
    PlaceAtmosphere();

    // Spawn vegetation via HISM
    SpawnVegetation();

    // Spawn building portals at generated locations
    if (WorldResult.Buildings.Num() > 0)
    {
        for (const FNLTGeneratedBuilding& Building : WorldResult.Buildings)
        {
            // Offset Z position to terrain height
            FTransform AdjustedTransform = Building.Transform;
            FVector Location = AdjustedTransform.GetLocation();
            Location.Z = GetTerrainHeight(Location.X, Location.Y) + 10.0f;
            AdjustedTransform.SetLocation(Location);

            SpawnBuildingPortal(Building.BuildingType, AdjustedTransform);
        }
    }

    // Verify the authored layout: log the closest building pair so a mis-edited config (or a
    // footprint size change) is caught immediately. Clearance = center distance - (r_i + r_j).
    if (BuildingPortals.Num() > 1)
    {
        float MinCenterDistance = FLT_MAX;
        float MinFootprintClearance = FLT_MAX;
        for (int32 i = 0; i < BuildingPortals.Num(); ++i)
        {
            for (int32 j = i + 1; j < BuildingPortals.Num(); ++j)
            {
                const float CenterDist = FVector::Dist2D(
                    BuildingPortals[i]->GetActorLocation(), BuildingPortals[j]->GetActorLocation());
                const float Clearance = CenterDist
                    - BuildingPortals[i]->GetFootprintRadius()
                    - BuildingPortals[j]->GetFootprintRadius();
                MinCenterDistance = FMath::Min(MinCenterDistance, CenterDist);
                MinFootprintClearance = FMath::Min(MinFootprintClearance, Clearance);
            }
        }
        UE_LOG(LogNLTOpenWorld, Log,
            TEXT("Building layout: %d portals, min center distance %.0f cm, min footprint clearance %.0f cm - %s"),
            BuildingPortals.Num(), MinCenterDistance, MinFootprintClearance,
            MinFootprintClearance < 0.0f ? TEXT("OVERLAP DETECTED") : TEXT("clear"));
    }

    // Spawn AI residents
    SpawnResidents();

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Open world generation complete: %d buildings, %d residents"),
        BuildingPortals.Num(), Residents.Num());
}

void UNLTOpenWorldSubsystem::ClearOpenWorld()
{
    // Destroy all building portals
    for (ANLTBuildingPortalActor* Portal : BuildingPortals)
    {
        if (Portal)
        {
            Portal->Destroy();
        }
    }
    BuildingPortals.Empty();

    // Destroy all residents
    for (AAvatarCharacter* Resident : Residents)
    {
        if (Resident)
        {
            Resident->Destroy();
        }
    }
    Residents.Empty();

    // Destroy vegetation root actor (and its HISM components)
    if (TreeHISM && TreeHISM->GetOwner())
    {
        TreeHISM->GetOwner()->Destroy();
        TreeHISM = nullptr;
        GrassHISM = nullptr;
        RockHISM = nullptr;
    }
    else
    {
        // Clear vegetation instances (fallback if no root actor)
        if (TreeHISM) TreeHISM->ClearInstances();
        if (GrassHISM) GrassHISM->ClearInstances();
        if (RockHISM) RockHISM->ClearInstances();
    }

    // Destroy the fallback ground plane (if one was spawned)
    if (GroundPlaceholder)
    {
        GroundPlaceholder->Destroy();
        GroundPlaceholder = nullptr;
    }

    // Destroy city scenery actors
    for (AStaticMeshActor* Scenery : CityScenery)
    {
        if (Scenery)
        {
            Scenery->Destroy();
        }
    }
    CityScenery.Empty();

    bWorldGenerated = false;
}

// ============== Heightmap & Landscape ==============

TArray<float> UNLTOpenWorldSubsystem::GenerateHeightmap() const
{
    TArray<float> Heightmap;
    int32 Resolution = CurrentConfig.LandscapeResolution;
    Heightmap.SetNum(Resolution * Resolution);

    float HalfWorldSize = CurrentConfig.WorldSize.X * 0.5f;

    for (int32 Y = 0; Y < Resolution; Y++)
    {
        for (int32 X = 0; X < Resolution; X++)
        {
            // Convert heightmap UV to world position
            float WorldX = FMath::Lerp(-HalfWorldSize, HalfWorldSize, (float)X / (Resolution - 1));
            float WorldY = FMath::Lerp(-HalfWorldSize, HalfWorldSize, (float)Y / (Resolution - 1));

            // Sample FBM noise for terrain height
            float Height = UNLTNoiseLibrary::Fbm2D(WorldX, WorldY, CurrentConfig.Seed, 5, 2.0f, 0.5f);
            Heightmap[Y * Resolution + X] = Height;
        }
    }

    return Heightmap;
}

float UNLTOpenWorldSubsystem::CalculateTerrainHeight(float X, float Y) const
{
    float NormalizedHeight = UNLTNoiseLibrary::Fbm2D(X, Y, CurrentConfig.Seed, 5, 2.0f, 0.5f);
    return NormalizedHeight * CurrentConfig.LandscapeHeightScale;
}

float UNLTOpenWorldSubsystem::GetTerrainHeight(float X, float Y) const
{
    return CalculateTerrainHeight(X, Y);
}

void UNLTOpenWorldSubsystem::GenerateLandscape(const TArray<float>& Heightmap)
{
    UWorld* World = GetWorld();
    if (!World)
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Cannot generate landscape: no world"));
        return;
    }

    // Try to find an existing landscape in the world
    for (TActorIterator<ALandscape> It(World); It; ++It)
    {
        ALandscape* Landscape = *It;
        if (Landscape)
        {
            UE_LOG(LogNLTOpenWorld, Log, TEXT("Found existing landscape: %s"), *Landscape->GetName());
            // Landscape already exists; heightmap would be applied via Landscape editing tools
            return;
        }
    }

    // Note: Creating a new Landscape via C++ requires Editor-only code.
    // For runtime, the level should have a pre-placed Landscape actor.
    // The heightmap data is available for Blueprint-exposed height queries.
    UE_LOG(LogNLTOpenWorld, Log, TEXT("Heightmap generated (%d points). Landscape actor should exist in level."),
        Heightmap.Num());
}

void UNLTOpenWorldSubsystem::SpawnGroundPlaceholder()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // A real Landscape added in the editor is the intended ground - never spawn a placeholder
    // if one is already there.
    for (TActorIterator<ALandscape> It(World); It; ++It)
    {
        if (*It)
        {
            UE_LOG(LogNLTOpenWorld, Log, TEXT("Ground: using existing landscape '%s'"), *It->GetName());
            return;
        }
    }

    // When city scenery is active, the Building_Base ground slab IS the ground — skip the
    // green placeholder plane so it doesn't cover the road/sidewalk textures.
    if (CurrentConfig.bPlaceCityScenery)
    {
        UE_LOG(LogNLTOpenWorld, Log, TEXT("Ground: skipped placeholder plane (city scenery provides ground)"));
        return;
    }

    if (GroundPlaceholder)
    {
        return; // Already spawned (e.g. GenerateOpenWorld called twice)
    }

    UStaticMesh* PlaneMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane"));
    if (!PlaneMesh)
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Ground: placeholder plane mesh /Engine/BasicShapes/Plane not found - the level will have no floor"));
        return;
    }

    // The plane mesh is 100x100 units at scale 1, so scale it to cover the configured world size.
    const float PlaneExtent = 100.0f;
    const float ScaleX = CurrentConfig.WorldSize.X / PlaneExtent;
    const float ScaleY = CurrentConfig.WorldSize.Y / PlaneExtent;
    const float GroundZ = GetTerrainHeight(0.0f, 0.0f);

    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    GroundPlaceholder = World->SpawnActor<AStaticMeshActor>(
        AStaticMeshActor::StaticClass(),
        FVector(0.0f, 0.0f, GroundZ),
        FRotator::ZeroRotator,
        SpawnParams
    );

    if (!GroundPlaceholder)
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Ground: failed to spawn placeholder ground plane"));
        return;
    }

    if (UStaticMeshComponent* GroundMesh = GroundPlaceholder->GetStaticMeshComponent())
    {
        GroundMesh->SetMobility(EComponentMobility::Movable);
        GroundMesh->SetStaticMesh(PlaneMesh);
        GroundMesh->SetWorldScale3D(FVector(ScaleX, ScaleY, 1.0f));

        // Real color instead of the engine-grey placeholder: tint the ground a
        // natural grass green from the project's own M_Solid material set.
        NLTWorldPalette::PaintMesh(GroundMesh, TEXT("/Game/Environment/Materials/MI_Plant.MI_Plant"),
            NLTWorldPalette::GroundGrass(), 0.85f, 0.0f);
    }

    UE_LOG(LogNLTOpenWorld, Log,
        TEXT("Ground: no Landscape actor in level, spawned placeholder ground plane at Z=%.0f covering %.0fx%.0f (add a Landscape actor for real terrain)"),
        GroundZ, CurrentConfig.WorldSize.X, CurrentConfig.WorldSize.Y);
}

void UNLTOpenWorldSubsystem::PlaceWaterPlane()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // Check if water plane already exists
    for (TActorIterator<AActor> It(World); It; ++It)
    {
        if (It->GetName().Contains(TEXT("Water")))
        {
            UE_LOG(LogNLTOpenWorld, Log, TEXT("Water plane already exists"));
            return;
        }
    }

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Water plane placement at height %.0f (Water plugin can be used for runtime water)"),
        CurrentConfig.WaterLevel);
}

void UNLTOpenWorldSubsystem::SpawnCityScenery()
{
    if (!CurrentConfig.bPlaceCityScenery)
    {
        UE_LOG(LogNLTOpenWorld, Log, TEXT("City scenery: disabled by config (bPlaceCityScenery=false)"));
        return;
    }

    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // ---- PHASE 1: Ground layers (stacked at origin, shared scale) ----
    // Building_Base = ground slab with sidewalk/road geometry baked in.
    // Road_003 = road surface mesh, Sidewalk_001 = raised sidewalk edges.
    // Fences and Trash_Bins = low-profile street props.
    struct FSceneryPiece
    {
        const TCHAR* MeshPath;
        float ZOffset;        // cm above the ground plane
        UStaticMesh* Mesh;    // resolved below
        FLinearColor Tint;    // world palette swatch (only used when bTint=true)
        float Roughness;      // material roughness (only used when bTint=true)
        bool bTint;           // true = override with flat palette; false = use imported PBR materials
    };

    FSceneryPiece GroundPieces[] =
    {
        // Ground slab (textured PBR)
        { TEXT("/Game/City/Grid/CityGridTextured/Grid_System_Building_Base.Grid_System_Building_Base"),                8.0f,  nullptr, FLinearColor::White, 0.5f, false },
        // Road surface + sidewalk edges (non-textured geometry from original import)
        { TEXT("/Game/City/Grid/CityGrid/StaticMeshes/Road_003.Road_003"),                                            10.0f, nullptr, FLinearColor(0.15f, 0.15f, 0.15f), 0.9f, true  },
        { TEXT("/Game/City/Grid/CityGrid/StaticMeshes/Sidewalk_001.Sidewalk_001"),                                    12.0f, nullptr, FLinearColor(0.75f, 0.73f, 0.68f), 0.8f, true  },
        // Street props
        { TEXT("/Game/City/Grid/CityGridTextured/Grid_System_Fences.Grid_System_Fences"),                             14.0f, nullptr, FLinearColor::White, 0.5f, false },
        { TEXT("/Game/City/Grid/CityGridTextured/Grid_System_Trash_Bins_and_Path_Lights.Grid_System_Trash_Bins_and_Path_Lights"), 16.0f, nullptr, FLinearColor::White, 0.5f, false },
    };

    UE_LOG(LogNLTOpenWorld, Log, TEXT("City scenery: loading %d ground pieces"), (int32)UE_ARRAY_COUNT(GroundPieces));
    int32 LoadedCount = 0;
    float MaxHalfExtent = 0.0f;
    for (FSceneryPiece& Piece : GroundPieces)
    {
        Piece.Mesh = LoadObject<UStaticMesh>(nullptr, Piece.MeshPath);
        if (!Piece.Mesh)
        {
            UE_LOG(LogNLTOpenWorld, Warning, TEXT("City scenery: failed to load '%s' - continuing without it"), Piece.MeshPath);
            continue;
        }
        ++LoadedCount;
        const FVector PieceExtent = Piece.Mesh->GetBounds().BoxExtent;
        MaxHalfExtent = FMath::Max(MaxHalfExtent, FMath::Max(PieceExtent.X, PieceExtent.Y));
    }

    if (LoadedCount == 0)
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("City scenery: no city-grid meshes loaded - skipping layer"));
        return;
    }

    const float WorldHalf = FMath::Min(CurrentConfig.WorldSize.X, CurrentConfig.WorldSize.Y) * 0.5f;
    const float SharedScale = (MaxHalfExtent > 1.0f) ? (WorldHalf / MaxHalfExtent) : 1.0f;
    const float GroundZ = GetTerrainHeight(0.0f, 0.0f);

    // Spawn ground layers at the origin with shared scale.
    int32 Spawned = 0;
    for (const FSceneryPiece& Piece : GroundPieces)
    {
        if (!Piece.Mesh) continue;

        FActorSpawnParameters SpawnParams;
        SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

        const FVector SpawnLocation(0.0f, 0.0f, GroundZ + Piece.ZOffset);
        AStaticMeshActor* Scenery = World->SpawnActor<AStaticMeshActor>(
            AStaticMeshActor::StaticClass(), SpawnLocation, FRotator::ZeroRotator, SpawnParams);
        if (!Scenery) continue;

        if (UStaticMeshComponent* MeshComp = Scenery->GetStaticMeshComponent())
        {
            MeshComp->SetMobility(EComponentMobility::Movable);
            MeshComp->SetStaticMesh(Piece.Mesh);
            if (Piece.bTint)
            {
                NLTWorldPalette::PaintMesh(MeshComp, TEXT("/Game/Environment/Materials/MI_Plant.MI_Plant"),
                    Piece.Tint, Piece.Roughness, 0.0f);
            }
        }
        Scenery->SetActorScale3D(FVector(SharedScale, SharedScale, SharedScale));
        CityScenery.Add(Scenery);
        ++Spawned;
    }

    UE_LOG(LogNLTOpenWorld, Log,
        TEXT("City scenery: placed %d ground pieces (scale %.3f, base Z %.0f)"),
        Spawned, SharedScale, GroundZ);

    // Buildings are intentionally not spawned here. ANLTBuildingPortalActor is the single
    // source of truth for building visuals and placement; GenerateOpenWorld() creates those
    // portals from FNLTOpenWorldConfig::BuildingLayout after this ground layer is placed.
    // Spawning a second decorative building grid here puts shells outside the authored block.
    UE_LOG(LogNLTOpenWorld, Log, TEXT("City scenery: building visuals are supplied by BuildingLayout portals"));
}

void UNLTOpenWorldSubsystem::PlaceAtmosphere()
{
    // Atmosphere is handled by the Atmosphere Subsystem
    // This method ensures the subsystem is initialized
    UNLTAtmosphereSubsystem* Atmosphere = GetAtmosphereSubsystem();
    if (Atmosphere)
    {
        UE_LOG(LogNLTOpenWorld, Log, TEXT("Atmosphere subsystem ready"));
        Atmosphere->RefreshAtmosphere();
    }
    else
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Atmosphere subsystem not available"));
    }
}

// ============== Building Portals ==============

ANLTBuildingPortalActor* UNLTOpenWorldSubsystem::SpawnBuildingPortal(FName BuildingType, const FTransform& Transform)
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return nullptr;
    }

    FActorSpawnParameters SpawnParams;
    SpawnParams.Owner = nullptr;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

    ANLTBuildingPortalActor* Portal = World->SpawnActor<ANLTBuildingPortalActor>(
        ANLTBuildingPortalActor::StaticClass(),
        Transform,
        SpawnParams
    );

    if (Portal)
    {
        Portal->SetBuildingType(GetBuildingTypeFromFName(BuildingType));
        BuildingPortals.Add(Portal);

        UE_LOG(LogNLTOpenWorld, Log, TEXT("Spawned building portal '%s' at (%.0f, %.0f, %.0f)"),
            *BuildingType.ToString(),
            Transform.GetLocation().X,
            Transform.GetLocation().Y,
            Transform.GetLocation().Z);
    }

    return Portal;
}

ENLTBuildingType UNLTOpenWorldSubsystem::GetBuildingTypeFromFName(FName TypeName) const
{
    if (TypeName == TEXT("Office")) return ENLTBuildingType::Office;
    if (TypeName == TEXT("Apartment")) return ENLTBuildingType::Apartment;
    if (TypeName == TEXT("Shop")) return ENLTBuildingType::Shop;
    if (TypeName == TEXT("School")) return ENLTBuildingType::School;
    if (TypeName == TEXT("Factory")) return ENLTBuildingType::Factory;
    if (TypeName == TEXT("Park")) return ENLTBuildingType::Park;
    return ENLTBuildingType::Hut;
}

// ============== Vegetation (HISM) ==============

void UNLTOpenWorldSubsystem::SpawnVegetation()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // Create a root actor to hold the HISM components (components need an actor owner to be part of the scene)
    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
    SpawnParams.Name = TEXT("VegetationRoot");
    AActor* VegRoot = World->SpawnActor<AActor>(AActor::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
    if (!VegRoot)
    {
        UE_LOG(LogNLTOpenWorld, Error, TEXT("Failed to spawn vegetation root actor"));
        return;
    }
    VegRoot->SetActorHiddenInGame(true);
    VegetationRoot = VegRoot;

    // Create HISM components for vegetation attached to the root actor

    // --- Trees ---
    TreeHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(VegetationRoot, TEXT("TreeHISM"));
    TreeHISM->SetMobility(EComponentMobility::Movable);
    TreeHISM->RegisterComponent();
    VegetationRoot->AddInstanceComponent(TreeHISM);

    // Fab "Mobile Trees" mesh. NOTE: LoadObject, not ConstructorHelpers::FObjectFinder - SpawnVegetation
    // runs at runtime from BeginPlay and FObjectFinder is a fatal error outside of constructors.
    UStaticMesh* TreeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Game/City/Trees/MobileTrees/SM_Mobile_Trees.SM_Mobile_Trees"));
    const bool bTreeIsFallbackCylinder = (TreeMesh == nullptr);
    if (!TreeMesh)
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Vegetation: failed to load SM_Mobile_Trees - falling back to placeholder cylinder"));
        TreeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
    }
    TreeHISM->SetStaticMesh(TreeMesh);
    if (bTreeIsFallbackCylinder)
    {
        // Green canopy tint for the grey engine cylinder only - the imported Fab
        // tree keeps its real bark/leaf materials (Mobile28_Trunk / Mobile28_Leaf).
        NLTWorldPalette::PaintMesh(TreeHISM, TEXT("/Game/Environment/Materials/MI_Plant.MI_Plant"),
            NLTWorldPalette::TreeCanopy(), 0.8f, 0.0f);
    }

    // The Fab tree mesh is authored ~18 x 24 m; normalize instance scale to the imported bounds
    // so open-world trees land in the 3-6 m range regardless of source scale.
    const float TreeNativeZ = FMath::Max(TreeMesh->GetBounds().BoxExtent.Z * 2.0f, 100.0f);
    // Anchor the tree base to the terrain: subtract the bounds-center offset from the instance Z
    // so a centered-pivot import still plants trees on the ground.
    const float TreeCenterZ = TreeMesh->GetBounds().Origin.Z;

    // --- Grass ---
    GrassHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(VegetationRoot, TEXT("GrassHISM"));
    GrassHISM->SetMobility(EComponentMobility::Movable);
    GrassHISM->RegisterComponent();
    VegetationRoot->AddInstanceComponent(GrassHISM);

    if (UStaticMesh* GrassMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")))
    {
        GrassHISM->SetStaticMesh(GrassMesh);
    }
    // Grass tuft tint.
    NLTWorldPalette::PaintMesh(GrassHISM, TEXT("/Game/Environment/Materials/MI_Plant.MI_Plant"),
        NLTWorldPalette::GrassPatch(), 0.85f, 0.0f);

    // --- Rocks ---
    RockHISM = NewObject<UHierarchicalInstancedStaticMeshComponent>(VegetationRoot, TEXT("RockHISM"));
    RockHISM->SetMobility(EComponentMobility::Movable);
    RockHISM->RegisterComponent();
    VegetationRoot->AddInstanceComponent(RockHISM);

    if (UStaticMesh* RockMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere")))
    {
        RockHISM->SetStaticMesh(RockMesh);
    }
    // Rock tint.
    NLTWorldPalette::PaintMesh(RockHISM, TEXT("/Game/Environment/Materials/MI_Metal.MI_Metal"),
        NLTWorldPalette::RockGrey(), 0.9f, 0.0f);

    // Scatter vegetation across the landscape
    FRandomStream Rand(CurrentConfig.Seed + 100);

    float HalfWorldSize = CurrentConfig.WorldSize.X * 0.5f;

    // Spawn trees
    for (int32 i = 0; i < CurrentConfig.NumTrees; i++)
    {
        float X = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Y = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Height = GetTerrainHeight(X, Y);

        if (IsSuitableForVegetation(X, Y, Height))
        {
            // Trees land in the 3-6 m height band (world cm), normalized to the imported mesh bounds.
            const float DesiredHeight = Rand.FRandRange(300.0f, 600.0f);
            const float Scale = DesiredHeight / TreeNativeZ;
            FTransform InstanceTransform(
                FRotator(0.0f, Rand.FRandRange(0.0f, 360.0f), 0.0f),
                FVector(X, Y, Height - TreeCenterZ * Scale),
                FVector(Scale, Scale, Scale * Rand.FRandRange(1.0f, 1.3f))
            );
            TreeHISM->AddInstance(InstanceTransform);
        }
    }

    // Spawn grass patches
    for (int32 i = 0; i < CurrentConfig.NumGrassPatches; i++)
    {
        float X = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Y = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Height = GetTerrainHeight(X, Y);

        if (IsSuitableForVegetation(X, Y, Height))
        {
            float Scale = Rand.FRandRange(0.5f, 1.5f);
            FTransform InstanceTransform(
                FRotator(0.0f, Rand.FRandRange(0.0f, 360.0f), 0.0f),
                FVector(X, Y, Height + 2.0f),
                FVector(Scale, Scale, Scale * 0.3f)
            );
            GrassHISM->AddInstance(InstanceTransform);
        }
    }

    // Spawn rocks
    for (int32 i = 0; i < CurrentConfig.NumRocks; i++)
    {
        float X = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Y = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
        float Height = GetTerrainHeight(X, Y);

        if (IsSuitableForVegetation(X, Y, Height))
        {
            float Scale = Rand.FRandRange(0.3f, 1.5f);
            FTransform InstanceTransform(
                FRotator(Rand.FRandRange(0.0f, 45.0f), Rand.FRandRange(0.0f, 360.0f), Rand.FRandRange(0.0f, 45.0f)),
                FVector(X, Y, Height),
                FVector(Scale, Scale * Rand.FRandRange(0.5f, 1.5f), Scale * Rand.FRandRange(0.3f, 0.8f))
            );
            RockHISM->AddInstance(InstanceTransform);
        }
    }

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Vegetation spawned: %d trees, %d grass, %d rocks"),
        TreeHISM->GetInstanceCount(),
        GrassHISM->GetInstanceCount(),
        RockHISM->GetInstanceCount());
}

bool UNLTOpenWorldSubsystem::IsSuitableForVegetation(float X, float Y, float Height) const
{
    // Vegetation grows above water level and below snow line
    return Height > CurrentConfig.WaterLevel &&
           Height < CurrentConfig.LandscapeHeightScale * 0.75f;
}

FVector UNLTOpenWorldSubsystem::GetRandomLandscapePoint(FRandomStream& Rand) const
{
    float HalfWorldSize = CurrentConfig.WorldSize.X * 0.5f;
    float X = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
    float Y = Rand.FRandRange(-HalfWorldSize, HalfWorldSize);
    float Z = GetTerrainHeight(X, Y);
    return FVector(X, Y, Z);
}

// ============== AI Residents ==============

void UNLTOpenWorldSubsystem::SpawnResidents()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    FRandomStream Rand(CurrentConfig.Seed + 200);

    // Categorize buildings by type for daily routine mapping
    ANLTBuildingPortalActor* OfficePortal = nullptr;
    ANLTBuildingPortalActor* ApartmentPortal = nullptr;
    ANLTBuildingPortalActor* ShopPortal = nullptr;
    ANLTBuildingPortalActor* SchoolPortal = nullptr;
    ANLTBuildingPortalActor* HutPortal = nullptr;

    for (ANLTBuildingPortalActor* Portal : BuildingPortals)
    {
        if (!Portal) continue;

        switch (Portal->GetBuildingType())
        {
        case ENLTBuildingType::Office:
            if (!OfficePortal) OfficePortal = Portal;
            break;
        case ENLTBuildingType::Apartment:
            if (!ApartmentPortal) ApartmentPortal = Portal;
            break;
        case ENLTBuildingType::Shop:
            if (!ShopPortal) ShopPortal = Portal;
            break;
        case ENLTBuildingType::School:
            if (!SchoolPortal) SchoolPortal = Portal;
            break;
        case ENLTBuildingType::Hut:
            if (!HutPortal) HutPortal = Portal;
            break;
        default:
            break;
        }
    }

    // Spawn residents with daily routines
    for (int32 i = 0; i < 12; i++)
    {
        FVector SpawnPos = GetRandomLandscapePoint(Rand);
        SpawnPos.Z += 90.0f;  // Feet height offset for character

        FActorSpawnParameters SpawnParams;
        SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

        AAvatarCharacter* Resident = World->SpawnActor<AAvatarCharacter>(
            AAvatarCharacter::StaticClass(),
            SpawnPos,
            FRotator::ZeroRotator,
            SpawnParams
        );

        if (Resident)
        {
            Resident->WanderRadius = Rand.FRandRange(500.0f, 2000.0f);
            Resident->WaitTimeMin = 1.0f;
            Resident->WaitTimeMax = 4.0f;

            // Assign daily routine based on index pattern
            // Morning (6-9): walk to workplace (Office -> Workplace_Level)
            // Midday (12-14): walk to social (Shop -> Social_Level)
            // Evening (18-21): walk to home (Apartment -> Personal_Level)
            // Night (22-6): stay home

            // Assign a primary destination based on resident index
            if (i < 3 && OfficePortal)
            {
                // Office workers
                Resident->CharacterRole = ENLTAgentRole::Avatar;
            }
            else if (i < 6 && ShopPortal)
            {
                // Shop visitors/workers
                Resident->CharacterRole = ENLTAgentRole::Avatar;
            }
            else if (i < 9 && ApartmentPortal)
            {
                // Residents
                Resident->CharacterRole = ENLTAgentRole::Avatar;
            }
            else
            {
                // Others: Hut visitors, etc.
                Resident->CharacterRole = ENLTAgentRole::Advocate;
            }

            Residents.Add(Resident);

            UE_LOG(LogNLTOpenWorld, Log, TEXT("Spawned AI resident '%s' at (%.0f, %.0f, %.0f)"),
                *Resident->GetName(), SpawnPos.X, SpawnPos.Y, SpawnPos.Z);
        }
    }

    UE_LOG(LogNLTOpenWorld, Log, TEXT("Spawned %d AI residents"), Residents.Num());
}

// ============== Level Streaming ==============

void UNLTOpenWorldSubsystem::StreamInLevel(const FName& LevelName)
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    FString LevelPath = FString::Printf(TEXT("/Game/Scenarios/Levels/%s"), *LevelName.ToString());

    // Use LevelStreamingDynamic to load a sublevel
    bool bSuccess = false;
    ULevelStreamingDynamic* StreamingLevel = ULevelStreamingDynamic::LoadLevelInstance(
        World,
        LevelPath,
        FVector::ZeroVector,
        FRotator::ZeroRotator,
        bSuccess
    );

    if (bSuccess && StreamingLevel)
    {
        UE_LOG(LogNLTOpenWorld, Log, TEXT("Streaming in level: %s"), *LevelName.ToString());
    }
    else
    {
        UE_LOG(LogNLTOpenWorld, Warning, TEXT("Failed to stream in level: %s"), *LevelName.ToString());
    }
}

void UNLTOpenWorldSubsystem::StreamOutLevel(const FName& LevelName)
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return;
    }

    // Find the streaming level by name
    for (ULevelStreaming* StreamingLevel : World->GetStreamingLevels())
    {
        if (StreamingLevel && StreamingLevel->GetWorldAssetPackageName().Contains(LevelName.ToString()))
        {
            StreamingLevel->SetShouldBeLoaded(false);
            StreamingLevel->SetShouldBeVisible(false);
            UE_LOG(LogNLTOpenWorld, Log, TEXT("Streaming out level: %s"), *LevelName.ToString());
            return;
        }
    }

    UE_LOG(LogNLTOpenWorld, Warning, TEXT("Level not found for streaming out: %s"), *LevelName.ToString());
}

// ============== Atmosphere Access ==============

UNLTAtmosphereSubsystem* UNLTOpenWorldSubsystem::GetAtmosphereSubsystem() const
{
    UWorld* World = GetWorld();
    if (!World)
    {
        return nullptr;
    }

    return World->GetSubsystem<UNLTAtmosphereSubsystem>();
}
