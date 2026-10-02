# Open World Level — Technical Documentation

**Date:** 2026-09-21  
**Status:** Phase 1 complete (procedural terrain, vegetation, building portals, AI residents)  
**Owner:** OpenCode (Graphics/Environment lane)  
**Related:** `docs/OPENWORLD-SETUP.md`, `docs/procedural-openworld.md`

---

## 1. Overview

The Open World level is the persistent outdoor layer of the AI Habitat — a 200×200 m procedural landscape where AI residents live, walk, and transition between indoor scenario levels. Buildings are **level portals**: entering one streams the corresponding indoor `.umap` scenario level.

```
OpenWorld_Level (outdoor hub)
├── Procedural terrain (FBM noise heightfield)
├── Procedural sky dome (Rayleigh scattering + noise clouds)
├── Water plane (UE Water plugin)
├── Vegetation (HISM: trees, grass, rocks)
├── Building portals (12 authored locations)
│   ├── Office → Workplace_Level
│   ├── Apartment → Personal_Level
│   ├── Shop → Social_Level
│   ├── School → Academic_Level
│   └── Hut → OpenWorld hub (stays in open world)
├── Fab Modern City scenery (roads, sidewalks, fences, trees)
├── AI residents (12 wandering characters)
└── Day/night cycle (Atmosphere subsystem)
```

---

## 2. Subsystems

### 2.1 UNLTOpenWorldSubsystem

**Header:** `Source/WorldEngine/Public/World/NLTOpenWorldSubsystem.h`  
**Impl:** `Source/WorldEngine/Private/World/NLTOpenWorldSubsystem.cpp`

The `UWorldSubsystem` that manages the entire open world. Auto-created on map load, destroyed on unload.

#### Configuration (`FNLTOpenWorldConfig`)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Seed` | int32 | 42 | Deterministic world seed |
| `WorldSize` | FVector | (20000, 20000, 0) | World extent in cm (200×200 m) |
| `LandscapeResolution` | int32 | 513 | Heightmap resolution (513×513) |
| `LandscapeHeightScale` | float | 800.0 | Max terrain height in cm |
| `NumBuildings` | int32 | 12 | Number of building portals |
| `NumResidents` | int32 | 8 | AI residents to spawn |
| `NumTrees` | int32 | 200 | Tree instances |
| `NumRocks` | int32 | 50 | Rock instances |
| `NumGrassPatches` | int32 | 300 | Grass instances |
| `WaterLevel` | float | 50.0 | Water plane height in cm |
| `TreeDensity` | float | 0.0001 | Trees per unit area |
| `GrassDensity` | float | 0.0002 | Grass per unit area |
| `bPlaceCityScenery` | bool | true | Place Fab Modern City city-grid layer |
| `BuildingLayout` | TArray | 12 entries | Authored building positions (type, location, yaw) |

#### Building Layout (Authored)

The default 12-building layout is **not random** — every entry is placed verbatim:

| # | Type | Location (cm) | Yaw | Notes |
|---|------|---------------|-----|-------|
| 1 | Office | (4020, -1671, 0) | 0° | Baked from Blender Building 11 |
| 2 | Office | (4200, 4200, 0) | 90° | |
| 3 | Apartment | (-4200, 1500, 0) | 90° | |
| 4 | Apartment | (4200, 1500, 0) | 0° | |
| 5 | Apartment | (-4500, -4500, 0) | 45° | |
| 6 | Apartment | (9094, -5059, 0) | 127° | Baked from Blender Building 12 |
| 7 | School | (0, 4200, 0) | 90° | |
| 8 | Factory | (-4200, -1500, 0) | 90° | |
| 9 | Park | (0, -1500, 0) | 0° | |
| 10 | Shop | (-1300, 1500, 0) | 0° | |
| 11 | Shop | (1300, 1500, 0) | 90° | |
| 12 | Hut | (7000, -7000, 0) | 0° | |

**Footprint clearance:** Minimum ~400 cm between building centers. The subsystem logs the actual clearance at spawn and warns if overlap is detected.

#### Key Methods

```cpp
// Generate the complete open world
void GenerateOpenWorld(const FNLTOpenWorldConfig& Config);

// Clear all generated content
void ClearOpenWorld();

// Spawn a building portal
ANLTBuildingPortalActor* SpawnBuildingPortal(FName BuildingType, const FTransform& Transform);

// Spawn vegetation via HISM
void SpawnVegetation();

// Spawn AI residents
void SpawnResidents();

// Generate heightmap from FBM noise
TArray<float> GenerateHeightmap() const;

// Get terrain height at world position
float GetTerrainHeight(float X, float Y) const;

// Stream in/out scenario levels
void StreamInLevel(const FName& LevelName);
void StreamOutLevel(const FName& LevelName);
```

#### Generation Flow

```
GenerateOpenWorld(Config)
├── GenerateHeightmap()          → 513×513 FBM noise grid
├── GenerateLandscape()          → Apply to existing Landscape actor (editor-only)
├── SpawnGroundPlaceholder()     → Fallback plane if no Landscape actor
├── PlaceWaterPlane()           → Log water level (UE Water plugin for runtime)
├── SpawnCityScenery()           → 11 Fab Modern City grid pieces
├── WorldGenerator->GenerateWorld() → Districts, buildings, roads
├── PlaceAtmosphere()            → Refresh sky/lighting
├── SpawnVegetation()            → HISM: trees, grass, rocks
├── SpawnBuildingPortal() × 12   → At authored locations
├── Verify layout clearance      → Log min footprint clearance
└── SpawnResidents()             → 12 AI residents with daily routines
```

---

### 2.2 ANLTBuildingPortalActor

**Header:** `Source/WorldEngine/Public/World/NLTBuildingPortalActor.h`  
**Impl:** `Source/WorldEngine/Private/World/NLTBuildingPortalActor.cpp`

The building portal actor that streams in scenario levels on player/AI overlap.

#### Building Type → Level Mapping

| Building Type | Target Level | Display Name |
|---------------|--------------|--------------|
| Office | `Workplace_Level` | "Office Building" |
| Apartment | `Personal_Level` | "Apartment" |
| Shop | `Social_Level` | "Shop" |
| School | `Academic_Level` | "School" |
| Hut | `OpenWorld_Level` | "Hut" (stays in open world) |
| Factory | `Workplace_Level` | "Factory" |
| Park | `OpenWorld_Level` | "Park" (stays in open world) |

#### Footprint Radii (cm)

| Type | Half Extents (X, Y, Z) | Footprint Radius |
|------|------------------------|------------------|
| Office | (1100, 1100, 1200) | 1100 |
| Apartment | (1200, 900, 1100) | 1200 |
| Shop | (800, 600, 600) | 800 |
| School | (1200, 900, 1000) | 1200 |
| Factory | (1300, 1000, 950) | 1300 |
| Park | (1500, 1100, 700) | 1500 |
| Hut | (150, 150, 200) | 150 |

#### Components

| Component | Purpose |
|-----------|---------|
| `SceneRoot` | Root scene component; building mesh is a child so imported meshes can be re-anchored |
| `BuildingMesh` | Static mesh for the building exterior (Fab city meshes or placeholder cube) |
| `InteractionVolume` | Box trigger for player/AI overlap detection |
| `BuildingLabel` | Front-facing text label (building name) |
| `BuildingLabelBack` | Back-facing text label (mirrored) |

#### Interaction Flow

```
Player/AI enters InteractionVolume
    │
    ├── Is local player? → Auto-stream in target level
    │
    └── Is AI resident? → Stream in target level
            │
            ├── Save player position/rotation
            ├── Async load level via FStreamableManager
            ├── OnLevelLoadComplete → ULevelStreamingDynamic::LoadLevelInstance
            ├── Teleport player to PortalEntrance (or fallback offset)
            │
            └── On overlap end → 5-second timer → ReturnPlayerToOpenWorld
                    │
                    ├── Teleport back to saved position
                    └── Stream out level
```

#### Building Meshes (Fab Modern City)

| Type | Mesh Path |
|------|-----------|
| Office | `/Game/City/Buildings/Building11/Building_11/StaticMeshes/Building_11.Building_11` |
| Apartment | `/Game/City/Buildings/Building12/Building_12/StaticMeshes/Building_12.Building_12` |
| Shop | `/Game/City/Buildings/Building12/Building_12/StaticMeshes/Building_12.Building_12` |
| School | `/Game/City/Buildings/Building11/Building_11/StaticMeshes/Building_11.Building_11` |
| Factory | `/Game/City/Buildings/Building12/Building_12/StaticMeshes/Building_12.Building_12` |
| Park | `/Game/City/Buildings/GridTrees/Grid_Trees__Low_Poly_/StaticMeshes/Grid_Trees__Low_Poly_.Grid_Trees__Low_Poly_` |
| Hut | `/Game/City/Huts/DoorWoodenHouse/WoodenHouse/StaticMeshes/WoodenHouse.WoodenHouse` |

---

## 3. Procedural Noise Library (`NLTNoiseLibrary`)

**Header:** `Source/WorldEngine/Public/Core/NLTNoiseLibrary.h`  
**Impl:** `Source/WorldEngine/Private/Core/NLTNoiseLibrary.cpp`

Ported from `openworld-engine/src/world/noise.js`. All functions are deterministic — same seed always produces the same output.

### API

```cpp
// Deterministic 32-bit PRNG
static float Mulberry32(int32 Seed);

// 2D Perlin-style value noise, ~[-1, 1]
static float Noise2D(float X, float Y, int32 Seed);

// Fractal Brownian motion, [0, 1]
static float Fbm2D(float X, float Y, int32 Seed, int32 Octaves, float Lacunarity, float Gain);

// Normalized terrain elevation
static float HeightField(float X, float Y, int32 Seed, int32 Octaves);
```

### Terrain Generation

The heightmap is generated by sampling `Fbm2D` at each grid point:

```cpp
float Height = UNLTNoiseLibrary::Fbm2D(WorldX, WorldY, Seed, 5, 2.0f, 0.5f);
```

- **Octaves:** 5
- **Lacunarity:** 2.0
- **Gain:** 0.5
- **Height scale:** 800 cm (configurable via `LandscapeHeightScale`)

### Biome Classification

| Height Range | Biome | Vegetation Suitability |
|--------------|-------|------------------------|
| < WaterLevel (50 cm) | Water | No vegetation |
| 50 – 600 cm | Grassland | Trees, grass, rocks |
| 600 – 800 cm | Rock | Rocks only |
| > 800 cm (75% of max) | Snow | No vegetation |

---

## 4. Vegetation System (HISM)

Vegetation is spawned via `UHierarchicalInstancedStaticMeshComponent` on a hidden root actor.

### HISM Components

| Component | Mesh | Count | Scale Range |
|-----------|------|-------|-------------|
| `TreeHISM` | Fab Mobile Trees (or cylinder fallback) | 200 | 300–600 cm height |
| `GrassHISM` | Plane | 300 | 0.5–1.5× |
| `RockHISM` | Sphere | 50 | 0.3–1.5× |

### Scatter Algorithm

```
For each vegetation instance:
    1. Random position within world bounds
    2. Sample terrain height at (X, Y)
    3. Check IsSuitableForVegetation(X, Y, Height)
    4. If suitable, add instance with random rotation and scale
```

### Tree Scaling

Trees are normalized to the imported mesh bounds so they land in the 3–6 m height band:

```cpp
const float TreeNativeZ = FMath::Max(TreeMesh->GetBounds().BoxExtent.Z * 2.0f, 100.0f);
const float DesiredHeight = Rand.FRandRange(300.0f, 600.0f);  // 3–6 m
const float Scale = DesiredHeight / TreeNativeZ;
```

---

## 5. City Scenery (Fab Modern City)

The `SpawnCityScenery()` method places 11 Fab Modern City grid pieces at the world origin with a shared scale.

### Scenery Pieces

| Piece | Mesh | Z Offset (cm) |
|-------|------|---------------|
| Road | `Road_003` | 8 |
| Building Base | `Building_Base` | 12 |
| Sidewalk | `Sidewalk_001` | 15 |
| Building 13 | `Building_13` | 16 |
| Grass | `Grass` | 21 |
| Grid Trees | `Grid_Trees__Low_Poly_` | 20 |
| Path Imperfections | `Path_And_Imperfections` | 25 |
| Fences | `Fences` | 24 |
| Trash Bins & Path Lights | `Trash_Bins_and_Path_Lights` | 26 |
| Traffic Lights | `Traffic_Lights` | 28 |
| Parking Entrance | `Parking_Entrance_001` | 30 |

### Shared Scale

All pieces share a single scale computed from the widest footprint:

```cpp
const float WorldHalf = FMath::Min(WorldSize.X, WorldSize.Y) * 0.5f;
const float SharedScale = (MaxHalfExtent > 1.0f) ? (WorldHalf / MaxHalfExtent) : 1.0f;
```

---

## 6. AI Residents

12 AI residents are spawned with daily routines synced to the Atmosphere subsystem.

### Daily Routine

| Time | Activity | Destination | Level |
|------|----------|-------------|-------|
| 06:00–09:00 | Morning commute | Office | Workplace_Level |
| 12:00–14:00 | Midday social | Shop | Social_Level |
| 18:00–21:00 | Evening return | Apartment | Personal_Level |
| 22:00–06:00 | Night rest | Apartment | Personal_Level |

### Resident Assignment

| Index | Role | Primary Destination |
|-------|------|---------------------|
| 0–2 | Office workers | Office → Workplace_Level |
| 3–5 | Shop visitors/workers | Shop → Social_Level |
| 6–8 | Residents | Apartment → Personal_Level |
| 9–11 | Others (Hut visitors, etc.) | Hut → OpenWorld hub |

### Wander Parameters

```cpp
Resident->WanderRadius = Rand.FRandRange(500.0f, 2000.0f);  // 5–20 m
Resident->WaitTimeMin = 1.0f;
Resident->WaitTimeMax = 4.0f;
```

---

## 7. Level Streaming

### Streaming Method

The portal uses `ULevelStreamingDynamic::LoadLevelInstance` for runtime streaming:

```cpp
ULevelStreamingDynamic* StreamingLevel = ULevelStreamingDynamic::LoadLevelInstance(
    World,
    LevelPath,
    FVector::ZeroVector,
    FRotator::ZeroRotator,
    bSuccess
);
```

### Teleport Targets

Each scenario level should contain a `TargetPoint` named `PortalEntrance`. If not found, the player is teleported with a 100 cm offset from their current position.

### Unload Behavior

When the player leaves the interaction volume:
1. A 5-second timer starts
2. If the player hasn't re-entered, `ReturnPlayerToOpenWorld()` is called
3. The player is teleported back to their saved position
4. The level is streamed out

---

## 8. Atmosphere Integration

The open world day/night cycle is managed by `UNLTAtmosphereSubsystem`:

| Property | Default | Description |
|----------|---------|-------------|
| `StartTimeOfDay` | 8.5 | Morning start |
| `RealSecondsPerGameDay` | 600 | 10 min = 1 game day |
| `bAutoAdvanceTime` | false | Auto-progress time |

The sky dome uses procedural noise for cloud coverage and star density:

```cpp
float NoiseClouds = UNLTNoiseLibrary::Fbm2D(Hours * 0.5f, 0.0f, 42, 4, 2.0f, 0.5f);
float StarNoise = UNLTNoiseLibrary::Fbm2D(Hours + 7.0f, 13.0f, 99, 3, 2.0f, 0.5f);
```

---

## 9. File Reference

```
Source/WorldEngine/
├── Public/World/
│   ├── NLTOpenWorldSubsystem.h          (229 lines)
│   └── NLTBuildingPortalActor.h         (194 lines)
├── Private/World/
│   ├── NLTOpenWorldSubsystem.cpp        (863 lines)
│   └── NLTBuildingPortalActor.cpp       (640 lines)
├── Public/Core/
│   └── NLTNoiseLibrary.h
├── Private/Core/
│   └── NLTNoiseLibrary.cpp
├── Public/World/
│   └── NLTWorldGenerator.h
├── Private/World/
│   └── NLTWorldGenerator.cpp
└── docs/
    ├── OPENWORLD-SETUP.md               (setup guide)
    ├── procedural-openworld.md          (design doc)
    └── openworld-technical.md           (this file)
```

---

## 10. Open Items

| # | Item | Status |
|---|------|--------|
| 1 | Runtime Landscape creation (currently editor-only) | Partial — placeholder plane fallback |
| 2 | Water plane visual (currently log-only) | UE Water plugin enabled, not placed |
| 3 | AI daily routine behavior trees | Partial — residents wander, no schedule logic |
| 4 | Building interior lighting per level | Not started |
| 5 | NavMesh for open world terrain | Not started |
| 6 | LOD for distant vegetation | Not started |
| 7 | Save/load open world state | Not started |

---

*Phase 1 complete. Open world generates and runs in the editor. Production deployment pending open items.*
