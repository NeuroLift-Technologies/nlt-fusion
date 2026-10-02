# Open World Setup Guide

> **Status:** Implementation complete — requires Editor setup to activate
> **Related:** `docs/procedural-openworld.md`, `Public/World/NLTOpenWorldSubsystem.h`, `Public/World/NLTBuildingPortalActor.h`

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

## Overview

The Open World system provides a persistent outdoor environment with:

- **Procedural landscape** generated from FBM noise (seed-based, deterministic)
- **Hierarchical Instanced Static Mesh (HISM)** vegetation scatter (trees, grass, rocks)
- **Building portals** that travel the local player to scenario levels on overlap
- **AI residents** with daily routines (work → social → home)
- **Day/night cycle** synced with the Atmosphere subsystem

## Creating the OpenWorld_Level in UE Editor

### Step 1: Create the Level

1. Open the Unreal Editor for the WorldEngine project
2. Go to **File → New Level → Empty Level**
3. Save as `OpenWorld_Level` in `Content/Scenarios/Levels/`
4. Set this as the default game map in **Project Settings → Maps & Modes**

### Step 2: Add a Landscape Actor

1. In the Modes panel, switch to **Landscape** mode
2. Set the following properties:
   - **Section Size:** 63x63 quads
   - **Sections Per Component:** 1x1
   - **Number of Components:** 8x8 (creates a 504x504 quad landscape)
   - **X/Y Scale:** ~39.68 (so 504 quads spans ~20000 units)
   - **Total Size:** ~20000x20000 units (200m x 200m; matches `WorldSize` in config)
3. Click **Create**
4. Assign a landscape material (see Required Content Assets below)

### Step 3: Add Atmospheric Actors

The `NLTAtmosphereSubsystem` will find or create these at runtime:

1. **Directional Light** (Sun) — already in most levels
2. **Sky Light** — captures sky for ambient lighting
3. **Exponential Height Fog** — for atmospheric depth
4. **Sky Sphere / Sky Dome** — optional, for procedural sky rendering

### Step 4: Add a Player Spawn

1. Place a **Player Start** actor at coordinates near `(0, 300, 200)` for the open world
2. If the map has no PlayerStart, `ANLTDemoGameMode` applies the same safe spawn location at runtime

### Step 5: Add a Post Process Volume

1. Place a **Post Process Volume** and set it to **Unbound**
2. The Atmosphere subsystem will use this for color grading

## Required Content Assets

### Landscape Material

Create `M_OpenWorld_Landscape` with:

| Layer | Condition | Material Input |
|-------|-----------|---------------|
| Sand | Height < Water Level | Sandy color, low roughness |
| Grass | Water < Height < 0.5 | Green, medium roughness |
| Rock | 0.5 < Height < 0.75 | Gray, high roughness |
| Snow | Height > 0.75 | White, low roughness |

**Blueprint setup:**
- Use a `LandscapeLayerBlend` node with 4 layers
- Height-based blending via `WorldHeight` material expression
- Optional: slope-based blending for rock faces

### Building Meshes (Optional — Placeholders Work)

The portal actor uses default cube meshes as placeholders. For production:

| Building Type | Suggested Mesh | Scale |
|---------------|---------------|-------|
| Office | Tall office tower | (4, 4, 6) |
| Apartment | Wide residential block | (5, 3, 8) |
| Shop | Low commercial building | (6, 4, 3) |
| School | Large institutional | (7, 5, 4) |
| Hut | Small cottage | (3, 3, 2.5) |

**Source options:**
- Free: Fab marketplace (search "building kit")
- Marketplace: "Modular Building Kit" or "City Sample"
- Procedural: Use PCG to generate building shells

### Vegetation Meshes (Optional — Placeholders Work)

| Type | Placeholder | Production Mesh |
|------|-------------|-----------------|
| Tree | Cylinder | SpeedTree or Fab tree packs |
| Grass | Plane | Billboard grass cards |
| Rock | Sphere | Scanned rock assets |

## Subsystem Configuration Defaults

### NLTOpenWorldSubsystem

Configurable via Blueprint or C++:

```cpp
FNLTOpenWorldConfig Config;
Config.Seed = 42;                    // Deterministic world seed
Config.WorldSize = FVector(20000, 20000, 0);  // 200m x 200m world extent in cm
Config.LandscapeResolution = 513;    // Heightmap resolution
Config.LandscapeHeightScale = 800.0f; // Max terrain height
Config.NumBuildings = 12;            // Number of building portals
Config.NumResidents = 8;             // AI residents (header default)
Config.NumTrees = 200;               // Tree instances
Config.NumRocks = 50;                // Rock instances
Config.NumGrassPatches = 300;        // Grass instances
Config.WaterLevel = 50.0f;           // Water plane height
Config.TreeDensity = 0.0001f;        // Trees per unit area
Config.GrassDensity = 0.0002f;       // Grass per unit area
```

### NLTBuildingPortalActor

Per-building configuration:

| Property | Default | Description |
|----------|---------|-------------|
| `BuildingType` | Office | Determines target level |
| `TargetLevelName` | Workplace_Level | Level to travel to |
| `DisplayName` | "Office Building" | Label text |
| `InteractPrompt` | "Press E to enter" | UI prompt |
| `bIsActive` | true | Whether portal is usable |

### NLTAtmosphereSubsystem

Synced with open world time:

| Property | Default | Description |
|----------|---------|-------------|
| `StartTimeOfDay` | 8.5 | Morning start |
| `RealSecondsPerGameDay` | 600 | 10 min = 1 game day |
| `bAutoAdvanceTime` | false | Auto-progress time |

## Level Travel Setup

### Scenario Levels

The following levels must exist in `Content/Scenarios/Levels/`:

| Level Name | Building Type | Content |
|------------|---------------|---------|
| `Workplace_Level` | Office | Indoor office environment |
| `Personal_Level` | Apartment | Indoor home environment |
| `Social_Level` | Shop | Indoor shop/market |
| `Academic_Level` | School | Indoor school/classroom |
| `OpenWorld_Level` | Hub | Return to open world |

### Travel Method

1. **Building portal overlap:**
   - When the local player enters a building portal, the portal calls `ANLTPlayerController::TravelToLevel`.
   - Travel uses `UGameplayStatics::OpenLevel` with the full `/Game/Scenarios/Levels/...` package path.
   - The open-world map is replaced by the destination map; no dynamic `LevelInstance` is created in the open world.

2. **Return doors:**
   - Each indoor scenario level spawns one `ANLTDoorActor` targeting `OpenWorld_Level`.
   - The return door is placed in the existing central door row for that level.

3. **Spawn points:**
   - Each scenario level uses its own `PlayerStart` for the arriving player.
   - If `OpenWorld_Level` has no PlayerStart, the GameMode uses `(0, 300, 200)` as a safe runtime fallback.

### AI Resident Daily Routines

Residents follow a time-based routine synced with the Atmosphere subsystem:

| Time | Activity | Destination | Level |
|------|----------|-------------|-------|
| 06:00–09:00 | Morning commute | Office building | Workplace_Level |
| 12:00–14:00 | Midday social | Shop | Social_Level |
| 18:00–21:00 | Evening return | Apartment | Personal_Level |
| 22:00–06:00 | Night rest | Apartment | Personal_Level |

**Implementation note:** The `SpawnResidents()` method assigns roles based on resident index. Full daily routine behavior (pathfinding, time checks) is handled by the AI behavior tree or a future `NLTResidentScheduleComponent`.

## Blueprint Integration

### Generating the World

Call from a Blueprint (e.g., GameMode or Level Blueprint):

```
Event BeginPlay
  → Get Game Instance Subsystem (NLTOpenWorldSubsystem)
  → GenerateOpenWorld (Config)
```

### Clearing the World

```
ClearOpenWorld
```

### Spawning Additional Portals

```
SpawnBuildingPortal (BuildingType, Transform)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Landscape not visible | Ensure Landscape actor exists in level; heightmap is generated but requires a Landscape to display |
| Portals not streaming | Verify level paths match exactly (case-sensitive) |
| AI residents not spawning | Check that `SpawnResidents()` is called after `GenerateOpenWorld()` |
| Labels not facing player | Ensure `SetLabelFacing()` is called in Tick with valid direction |
| Level not unloading | Check that `StreamOutTargetLevel()` is called after overlap end + timer |

## File Reference

```
Source/WorldEngine/
├── Public/World/
│   ├── NLTOpenWorldSubsystem.h      (167 lines)
│   └── NLTBuildingPortalActor.h     (174 lines)
├── Private/World/
│   ├── NLTOpenWorldSubsystem.cpp    (implementation)
│   └── NLTBuildingPortalActor.cpp   (implementation)
└── docs/
    └── OPENWORLD-SETUP.md           (this file)
```
