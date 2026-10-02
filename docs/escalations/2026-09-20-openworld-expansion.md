# Escalation Record — UE WorldEngine open-world expansion + third-party asset integration

> Copied from `templates/escalation.md`. A tracking GitHub issue will be filed via
> `ISSUE_TEMPLATE/agent-escalation.md`.

---

## Escalation Record

**Date:** 2026-09-20
**Agent:** OpenCode (Poolside)
**Session:** ses_f42eb19bdffeoge74S1sWybvX4
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**WORLD-ENGINE-OTOI Version:** NLT-WORLDENGINE-OTOI-1.0.0
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** high

---

### Trigger

The user requested pivoting the UE WorldEngine from its current **indoor Sims-like
scenario simulation** toward a **full open-world engine** (matching the Three.js
`openworld-engine` project), and asked whether free UE5 assets from Epic's Fab
marketplace would help. This triggers **two** guardrails:

1. **"No architecture decisions"** (AGENTS.md §Guardrails) — Expanding from 4 indoor
   scenario levels (Workplace, Personal, Social, Academic) to an open world is an
   architectural direction change requiring human sign-off.
2. **"No external integrations"** (AGENTS.md §Guardrails) — Importing third-party
   assets from Fab (Epic Games marketplace) is a third-party content integration
   requiring Joshua's approval.

Additionally, the user labeled this "Path B — Full UE5 Port," but **no "Path B"
open-world direction is documented** anywhere in the repo. The existing "Path A/B"
labels are for training (Path A = UE5 runtime, Path B = Python standalone) and
engine reference (Path A = UE5.8 authoritative, Path B = Python ECS). This labeling
ambiguity requires clarification.

---

### Situation

This workspace contains **three** distinct engine projects:

| Project | Path | Engine | Current State |
|--------|------|--------|---------------|
| **UE WorldEngine** | `WorldEngine/` | Unreal Engine 5.8 | Indoor Sims-like AI simulation (4 scenario `.umap` levels). C++ core subsystems (16 subsystems), Mass Entity, Learning Agents, PCG, Niagara, MCP server. Character system uses custom `SimBody` low-poly mesh with emotion-driven animation pipeline (active **CHAR-001 thread**). |
| Python ECS | `world-engine/` | Python | Reference implementation only (stubs raise `NotImplementedError`). |
| LT OpenWorld | `openworld-engine/` | Three.js 0.170 | Procedural open-world island (terrain, water, sky, vegetation, settlement). Uses procedural generation, no build step, CDN-dependent. |

**What the user wants:** The UE WorldEngine to *also* have an **open-world outdoor layer**
— terrain, water, sky, vegetation, settlement — where **buildings are portals to the existing
indoor scenario levels** (Workplace, Personal, Social, Academic). The outdoor world is the
traversal layer; entering a building loads the corresponding indoor `.umap` level. This mirrors
the Three.js `openworld-engine` AGENTS.md description: "A realistic 3D habitat where AI agents
live" with terrain, water, sky, vegetation, and settlement — but implemented *inside* UE5 rather
than Three.js.

**Key insight:** `NLTWorldGeneratorSubsystem` already produces the *semantic data* for this
architecture — districts (Residential/Commercial/Industrial/Park), buildings (Office/Apartment/
Shop/Factory/Park), and roads. The outdoor world's layout is procedurally defined; the indoor
levels are the pre-built `.umap` scenario maps. The missing piece is the outdoor rendering layer
(terrain, water, sky, vegetation, building shells) and the level-streaming bridge that connects
outdoor building entrances to indoor levels.

**Current WorldEngine state relevant to open-world expansion:**

- `NLTWorldGeneratorSubsystem` (`Source/WorldEngine/{Public,Private}/World/NLTWorldGenerator.cpp|h`)
  already generates **semantic data** for districts (Residential, Commercial, Industrial, Park),
  buildings (Office, Apartment, Shop, Factory, Park), and roads — but it does **not** spawn
  any UE geometry or levels. It's a data-only world generator.
- `NLTWorldObjectRenderer.cpp` exists to visually render the generated world, but its
  integration status is unclear.
- `NLTAtmosphereSubsystem` has time-of-day control (sun, sky light, height fog, color grading)
  but uses **hardcoded FLinearColor values** — no HDRI skybox textures are referenced.
- The PCG plugin is enabled for environment scatter, but the `EnvironmentScatter.uasset`
  is the only PCG asset present.
- 4 scenario levels are `.umap` files with door rows and PlayerStarts — designed for indoor
  navigation, not open-world traversal.
- The character system (CHAR-001 thread) is mid-implementation of rigged SkeletalMesh
  replacement for SimBody static mesh.
- No terrain, landscape, water, or large-scale outdoor assets exist in `Content/`.

**Free UE5 asset list provided by user** covers: Terrain, Vegetation, Water, Sky/Atmosphere,
Characters/NPCs, Buildings/Architecture, Roads/Paths, Lighting/Post-Processing, VFX.

---

### Decision Required

1. **Architectural direction:** Should the UE WorldEngine add an **outdoor open-world layer**
   (procedural terrain, water, sky, vegetation, settlement) where buildings are **level portals**
   to the existing 4 indoor scenario `.umap` files? This adds level-streaming architecture
   (outdoor world ↔ indoor scenario transition) — an integration-gate concern (Codex + Poolside).
   How does this relate to the Three.js `openworld-engine` — should the UE5 outdoor layer replace
   it, run alongside it, or inform it?

2. **Asset vendoring / external integration:** Should free UE5 assets from Epic's Fab marketplace
   be imported into `WorldEngine/Content/`? Which categories are approved? (Fab requires a free
   Epic account; commercial-use verification needed per AGENTS.md.) Categories with the clearest
   fit: Sky/Atmosphere HDRIs, terrain/landscape, water, vegetation/foliage, post-process LUTs.
   Categories needing lane coordination: Characters/NPCs (Pool), buildings (Kilo/architecture).

3. **Character system across both layers:** The active **CHAR-001 thread** (Pool's lane) is
   building a custom emotion-driven animation pipeline around `SimBody` characters for indoor
   scenarios. The outdoor open world needs characters that walk terrain, enter buildings, and
   transition seamlessly into indoor SimBody avatars. Does the same SimBody aesthetic apply to
   outdoor characters, or are separate outdoor character assets (e.g., City Sample Crowds +
   MassCrowd) needed for the outdoor layer?

4. **"Path B" designation:** The user labeled this "Path B — Full UE5 Port." No such path is
   documented in the repo. Does "Path B" mean: (a) a formal architectural designation for the
   open-world outdoor layer, or (b) porting the Three.js `openworld-engine` concept into UE5?
   Needs documentation clarification.

---

### Options Considered

1. **Open-world outdoor layer with indoor building portals (recommended)**
   - Description: Add a procedural outdoor open-world layer (terrain, water, sky, vegetation,
     settlement with the `NLTWorldGeneratorSubsystem` district/building/road data as layout)
     where each building serves as a level-streaming portal to the corresponding indoor
     `.umap` scenario level. Characters transition between outdoor traversal and indoor
     scenario simulation. Import Fab assets for: sky/atmosphere HDRIs, terrain, water,
     vegetation, post-process LUTs. SimBody aesthetic carries through to outdoor characters.
   - Trade-offs: Preserves all current indoor scenario + CHAR-001 development. Adds
     outdoor rendering layer within OpenCode's environmental-assets lane. Level streaming
     bridge is an integration concern (Codex + Poolside). Requires Joshua approval for
     Fab asset integration and architectural direction.

2. **Full open-world pivot (deprecate indoor scenarios)**
   - Description: Replace indoor Sims-like scenario levels entirely with a pure open-world
     engine. Deprecate/archive the 4 `.umap` levels. Import terrain, water, sky, vegetation,
     settlement, AND character/NPC assets from Fab (City Sample, Creative Characters).
   - Trade-offs: Loses all CHAR-001 character pipeline work and Kilo's scenario levels.
     Massive architectural rewrite. Conflicts with Pool's lane (characters) and Kilo's lane
     (scenarios). Not recommended.

3. **Asset import only (sky/atmosphere + post-processing LUTs, no open-world layer)**
   - Description: Only import skybox HDRIs + post-process LUTs to enhance the existing
     `NLTAtmosphereSubsystem`. No terrain, water, or outdoor world. Defer open-world
     architecture.
   - Trade-offs: Lowest risk, fills 2 identified gaps. Fits OpenCode's lane with zero
     cross-lane impact. Does not achieve the open-world goal but de-risks the asset-import
     process for later phases.

4. **Defer entirely**
   - Description: Keep current indoor-only direction. Add to backlog.
   - Trade-offs: No immediate work; preserves focus on CHAR-001 and DOC-MCP-001. Does not
     satisfy the open-world requirement.

### Asset Categorization (per World Engine OTOI §4.4 lanes)

| Asset Category | Lane impact | Status |
|---|---|---|
| Sky & Atmosphere (HDRIs, skyboxes) | OpenCode — environmental lighting | ✅ Clean, recommend approve |
| Post-Processing (LUTS, night presets) | OpenCode — post-processing materials | ✅ Clean, recommend approve |
| Water (Stylized Water) | OpenCode — environmental assets | ✅ Clean if scoped as environmental |
| Vegetation & Foliage | OpenCode — environmental assets | ✅ Clean if scoped as environmental |
| Terrain & Landscape | OpenCode + Kilo (level streaming bridge) | ⚠️ Needs integration planning |
| VFX & Particles | OpenCode — environmental VFX | ✅ Clean, supplements existing Niagara |
| Buildings & Architecture | Kilo (world-state contracts) + OpenCode | ⚠️ Escalate to both lanes |
| Characters & NPCs | Pool (CHAR-001) + Core (governance boundary) | ⚠️ Escalate — conflicts with SimBody pipeline

---

### Recommendation

**Approve Option 1** (open-world outdoor layer with indoor building portals), but with
staged asset approval:

1. **Phase 1 (within OpenCode's lane, no cross-lane conflict):** Approve sky/atmosphere
   HDRIs + post-process LUTs → directly fills the two biggest identified gaps
   (`NLTAtmosphereSubsystem::SkyDomeMaterial` has no HDRI; color grading is hardcoded
   floats). Can proceed immediately after Joshua sign-off.
2. **Phase 2 (environmental, pending integration planning):** Water + vegetation + terrain
   → needs level-streaming architecture discussion with Codex + Poolside (integration gate).
3. **Phase 3 (cross-lane):** Characters + buildings → coordinate with Pool (characters) and
   Kilo (scenarios/world-state) before any asset imports.

The `NLTWorldGeneratorSubsystem` already produces the procedural layout data (districts,
buildings, roads) — the outdoor layer builds on existing infrastructure, not from scratch.

All imports go into `WorldEngine/Content/{Kits|Environment|Sky|Terrain|Vegetation}/`
following the path conventions in `CharacterGraphicsSetup.md`, and must be verified
for license compliance before commercial use.

---

### Blockers

- **Cannot download/import Fab assets** until architectural direction and license
  verification are confirmed (external integration guardrail).
- **Cannot proceed with open-world level design** until the expansion scope is defined
  (architectural decision guardrail).
- **Cannot introduce terrain/character/building assets** until lane ownership is
  clarified (Pool, Kilo may be affected).

---

### Resolution

*(Originally to be filled in after Joshua responds)*

**Date resolved:** 2026-09-20
**Decision:** Approved open-world outdoor layer direction (buildings as portals to indoor
`.umap` levels). Phase 1 asset imports approved. **BUT** Fab assets are NOT downloadable
(confirmed by Joshua W. Dorsey, Sr. — they are not free/accessible despite listing).
C++ integration code prepared and ready to consume assets if they become available.
Pivoting to alternative approaches (procedural systems or alternative free asset sources).
**Decided by:** Joshua W. Dorsey, Sr.
**Actions taken:**
1. Updated escalation with clarified "building portal" architecture
2. Provided categorized Fab download links to approver
3. Prepared C++ integration code (atmosphere HDRI params, post-process LUT support,
   asset directory structure) — ready but awaiting assets
4. **BLOCKED:** Fab assets are not accessible. Cannot proceed with asset imports.

---

## Blocker: Fab Assets Not Accessible

**Date:** 2026-09-20
**Reported by:** Joshua W. Dorsey, Sr.
**Status:** Active blocker

Joshua confirmed that the free UE5 assets listed from Epic's Fab marketplace **cannot be
downloaded** — they are not accessible despite being labeled "free." The C++ integration
code and directory structure are prepared and ready, but without the actual asset files,
the system cannot render the enhanced sky, LUT color grading, water, vegetation, or terrain.

---

## Pivoting to Procedural Approach

**Date:** 2026-09-20
**Status:** Approved direction

Joshua confirmed that **Fab assets are not accessible** (not free / cannot download). Pivoting
to a **procedural approach** instead — porting the already-working procedural systems from the
Three.js `openworld-engine` into the UE WorldEngine. This is fully self-contained, requires no
external asset dependencies, and fits within OpenCode's authorized lane (environmental assets,
materials, lighting, scene organization).

### Procedural Systems Available for Port

The `openworld-engine/src/world/` directory already contains complete, tested implementations:

| System | Three.js Source | UE5 Port Target |
|--------|-----------------|-----------------|
| **Terrain** | `terrain.js` (procedural heightfield with FBM noise, biomes) | `NLTWorldGeneratorSubsystem` + PCG + Landscape |
| **Sky** | `sky.js` (Rayleigh scattering, golden hour, stars, moon) | Enhance existing `NLTAtmosphereSubsystem` sky dome |
| **Water** | `water.js` (translucent plane, wave normals, vertex displacement) | UE5 Water plugin or custom material |
| **Vegetation** | `vegetation.js` (seeded tree/grass/rock scatter) | PCG + existing `EnvironmentScatter.uasset` |
| **Settlement** | `settlement.js` (camp/huts/campfire) | `NLTWorldGeneratorSubsystem::GenerateBuildings()` |

### UE5 Plugin Changes Needed

| Plugin | Currently Enabled? | Purpose |
|--------|-------------------|---------|
| Water | ❌ Not in .uproject | Native UE5 water bodies (lakes, rivers) |
| Landscape | ✅ Engine core | Procedural terrain via PCG |
| PCG | ✅ Already enabled | Procedural scatter (vegetation, rocks) |
| Niagara | ✅ Already enabled | Water splash, dust, environmental VFX |

### Action Plan (Phase 1 — Procedural Sky + Noise Library)

1. Add procedural noise functions to `NLTAtmosphereSubsystem` (port `noise.js` fbm2D/hash functions)
2. Enhance the existing sky dome material to support HDRI cubemap OR procedural Rayleigh scattering fallback
3. Enable the Water plugin in `WorldEngine.uproject`
4. Prepare terrain generation via `NLTWorldGeneratorSubsystem` + PCG (data already exists)
5. Keep all existing C++ HDRI/LUT integration code — works with procedurally-generated cubemaps if needed

**All Fab asset download links and content directory structure remain prepared as a backup
if access becomes available later.

---

## Discovery: Open-World System Already Implemented in C++

**Date:** 2026-09-20
**Finding:** The WorldEngine already has a **complete open-world implementation** in C++,
not just planned infrastructure. The `NLTOpenWorldSubsystem`, `NLTBuildingPortalActor`,
`OpenWorld_Level.umap`, and `NLTDemoGameMode` auto-generation are all present and wired.

### What the Fab "Modern City Environment" Provides

The downloaded asset at `D:\UE Vault\Modern_City_Environment-6e72d76b` provides visual
geometry that slots directly into the existing placeholder system:

| Fab Asset | Existing Placeholder | Integration Point | AI-Relevant? |
|-----------|---------------------|-------------------|--------------|
| Building FBX (198MB grid_system.fbx) | `BuildingMesh = /Engine/BasicShapes/Cube` (placeholder) in `NLTBuildingPortalActor::UpdateBuildingMesh()` | Replace cube with building meshes; scale per type | **YES** — building portals stream to indoor training levels |
| Road (GLTF: Road.gltf + 32MB.bin) | No roads yet | Spawn as static geometry around buildings | YES — navigable surface for AI residents |
| Sidewalk (GLTF: Sidewalk.gltf + 3.7MB.bin) | No sidewalks yet | Spawn around building portals | YES — AI walk paths between buildings |
| Towers (GLTF: Towers.gltf + 23MB.bin) | Scale variation in `UpdateBuildingMesh()` | New building type variant | YES — taller buildings for district variety |
| Green Area (GLTF: Green Area.gltf + textures) | `TreeHISM`/`GrassHISM` use `/Engine/BasicShapes/Cylinder` and `Plane` | Replace placeholder vegetation meshes | YES — park district for AI recreation |
| Parking (GLTF: Parking.gltf + 139MB.bin) | Not implemented | Spawn in commercial districts | YES — parking lot = waiting/interaction area for AI |
| Textures | BasicShapeMaterial | PBR material assignments | YES — better visual fidelity for observation |

### AI Integration — Already In Place

The existing C++ code already has full AI integration:

1. **`NLTOpenWorldSubsystem::SpawnResidents()`** (line 523) — spawns 12 `AAvatarCharacter`
   AI residents with daily routines:
   - Morning → walk to Office (streams Workplace_Level for training)
   - Midday → walk to Shop (streams Social_Level for social scenarios)
   - Evening → walk to Apartment (streams Personal_Level for self-care scenarios)
   - Roles assigned: `ENLTAgentRole::Avatar` (learning) and `ENLTAgentRole::Advocate` (coached)

2. **`NLTBuildingPortalActor`** — building entrances trigger `StreamInLevel()`:
   - Office → Workplace_Level
   - Apartment → Personal_Level
   - Shop → Social_Level
   - School → Academic_Level
   - Hut → OpenWorld_Level (self-transition hub)

3. **Level streaming bridge** — `StreamInLevel()` / `StreamOutLevel()` using
   `ULevelStreamingDynamic`

### Integration Path for Fab Assets

To use the Fab city environment with AI:

1. **Import FBX/GLTF** → `.uasset` static meshes in `WorldEngine/Content/City/`
2. **Update `NLTBuildingPortalActor::UpdateBuildingMesh()`** — replace the
   `/Engine/BasicShapes/Cube` placeholder with a `TMap<ENLTBuildingType, UStaticMesh*>`
   referencing the imported Fab building meshes
3. **Update `NLTOpenWorldSubsystem::SpawnVegetation()`** — replace Cylinder/Sphere/Plane
   placeholders with Fab tree/grass/rock meshes on the HISM components
4. **Add road/sidewalk spawning** — new method in `NLTOpenWorldSubsystem` to place
   Fab road meshes between buildings
5. **NavMesh generation** — ensure imported meshes generate NavMesh for AI pathfinding

### `isAiForbidden: false` — AI Usage Permitted

The Fab metadata explicitly states `isAiForbidden: false` — the Modern City Environment
assets **can be used** for AI training, simulation, and agent interaction scenarios.

### What Needs To Happen (Editor-Time Only)

The asset import + mesh assignment in `UpdateBuildingMesh()` requires UE Editor access
(on the Linux build box or a Windows machine with UE 5.8 installed). The C++ scaffolding
(`NLTNoiseLibrary`, atmosphere HDRI/LUT support, Water plugin) is already compiled-ready.

---

## Progress Update (2026-09-20 PM) — C++ Mesh Wiring + City Scenery + Runtime Verification

**Agent:** OpenCode (Poolside) · **All items below are DONE; build + runtime verified.**

### 1. Fab assets imported (editor-time, performed earlier in this session record)

| Asset group | UE package | StaticMeshes (verbatim paths used by C++) |
|---|---|---|
| Building 11 (Office/School archetype) | `/Game/City/Buildings/Building11/Building_11` | `Building_11.Building_11` (30.9×35.4×32.6m) |
| Building 12 (Apartment/Shop/Factory archetype) | `/Game/City/Buildings/Building12/Building_12` | `Building_12.Building_12` (44.3×18.7×39.2m, Nanite 85.8K tris) |
| Park grove | `/Game/City/Buildings/GridTrees` | `Grid_Trees__Low_Poly_.Grid_Trees__Low_Poly_` (233×181×4m) |
| City grid (road/sidewalk/trees/fences/trash/parking) | `/Game/City/Grid/CityGrid` (merged GLB) | `Road_003`, `Sidewalk_001`, `Grid_Trees__Low_Poly_`, `Fences`, `Trash_Bins_and_Path_Lights`, `Parking_Entrance_001` |
| Fences / Trash bins (legacy individual imports, superseded by the merged CityGrid) | `/Game/City/Buildings/{Fences,TrashBins}/...` | retained; not used by runtime code |

All imports are **geometry-only** (shared `NLT_Gray` material, no textures) — this was the
decided compromise to beat the 120s gateway import window and 1GB-pagefile OOM limits.
The merged `CityGrid.glb` (6.98 MB, 155,703 tris, single shared Fab scene origin → perfect
piece alignment) was compiled from the Grid System + Road/Sidewalk Blender scene via
blender-mcp (`Imports/FabCity/GridSystem/splits_geo/CityGrid.glb`).

### 2. C++ changes (this session, built + verified)

**`NLTBuildingPortalActor`**
- Added `USceneComponent* SceneRoot` root; `BuildingMesh` is now a child so imported mesh
  origins can be re-anchored without shifting the interaction volume/labels.
- `UpdateBuildingMesh()` now:
  - Loads the Fab meshes per `ENLTBuildingType` (`LoadObject` at runtime; Hut keeps the cube).
  - Scales each mesh bounds-aware to a per-type footprint (half-extents in UE cm): Office
    1100×1100×1200, Apartment 1200×900×1100, Shop 800×600×600, School 1200×900×1000,
    Factory 1300×1000×950, Park 1500×1100×700 (Park scales **uniformly** to keep the low
    grove natural instead of stretching its 4 m height).
  - Re-anchors the imported mesh so its **base sits exactly on the spawn point** (terrain+10)
    with X/Y re-centered; labels float above the roof (`2*scaledHalfZ + 500`); the interaction
    volume becomes a footprint+300 cm, base-anchored, ≤9 m-tall box the player overlaps on
    approach (was a 1.5×1.5×2 m box centered at the actor — which would have missed ground
    pawns for tall Fab towers).

**`NLTOpenWorldSubsystem`**
- New `SpawnCityScenery()` (+ `bPlaceCityScenery=true` config toggle, `CityScenery` actor
  array with `ClearOpenWorld` cleanup). Placed 6 merged city-grid pieces at world origin with
  one shared scale (`worldHalf / max piece half-extent` ≈ **0.193**) flat-stacked at 8–30 cm
  Z offsets above `GetTerrainHeight(0,0)` (matching the ground-plane Z), preserving the Fab
  block layout via the shared scene origin.
- `GenerateOpenWorld()` calls it right after `PlaceWaterPlane()`.

### 3. Runtime verification (standalone `-game`, seed 42, OpenWorld_Level)

From `Saved/Logs/WorldEngine.log` (2026-09-20 14:59–15:02):

```
Ground: no Landscape actor in level, spawned placeholder ground plane at Z=0 covering 5000x5000
City scenery: placed 6 Fab Modern City grid pieces (scale 0.193, base Z 0, world 5000x5000)
World generated: 4 districts, 12 buildings, 8 roads
Spawned building portal 'Shop' at (2067, 2102, -10)   ... (12 portals total: Shop×3, Factory×2, Apartment×3, Park×4)
Spawned 12 AI residents
Open world generation complete: 12 buildings, 12 residents
Portal 'NLTBuildingPortalActor_1': Pawn 'DefaultPawn_0' entered range → auto-streaming → 'Workplace_Level' loaded successfully
... (portal overlap triggering + level streaming + teleport offset all fire correctly; no mesh load failures logged)
```

- **All Fab building meshes loaded** (no `failed to load` warnings → Building_12 for
  Apartment/Shop/Factory and GridTrees for Park exercised at runtime; Building_11 (Office/
  School) not exercised this seed — same code path, asset import confirmed by metadata).
- **Interaction volumes work** for ground-level pawns (footprint-sized triggers fired and
  streamed `Workplace_Level`/`Personal_Level`).
- One pre-existing, non-fatal `ensure` (`MyOwnerWorld`, `SpawnVegetation()` line 521 —
  placeholder HISM registered via `NewObject` at subsystem scope) was noted; unrelated to
  this session's changes, recovers, and vegetation still spawns.
- `r.GenerateMeshDistanceFields=False` remains set (documented, reversible) to protect the
  1 GB pagefile.

### Handoff notes for Joshua

- Changes are **uncommitted** in git (see next commit). Assets under `WorldEngine/Content/City/`
  are staged; `WorldEngine/Imports/.gitignore` keeps the 1.6 GB Fab staging out of VCS while
  committing the import scripts + geometry-only GLB splits (`splits_geo/`) for reproducibility.
- `UpdateBuildingMesh()` swap-in is **scale-only** on the NLT_Gray geometry — no material
  assignment yet (textures intentionally deferred; NLT_Gray keeps the pack light).
- Visual confirmation (building proportions, label placement, grid alignment) is recommended
  by launching PIE on `OpenWorld_Level` — MCP `control_editor.play` has a catalog bug
  (validator rejects the documented `control` param; console `PIE.Start` is blocked as
  "dangerous"), which is why verification ran via standalone `-game` instead.
- Known follow-ups (not this session): Office/School spawn weighting (no Office/School spawn
  at seed 42), vegetation HISM ensure cleanup, NavMesh for imported meshes.

---

## Progress Update (2026-09-20 evening) — Fixed Set-Coordinate Building Layout

**Agent:** OpenCode (Poolside) · **All items DONE; built + runtime verified in standalone `-game` (seed 42).**

### Context

Joshua flagged two layout issues in the open world: (1) buildings were too close together /
overlapping, and (2) building spawn coordinates were random (seed-driven `FRandRange`) and
needed to be **set coordinates**. Decision (with Joshua): **config-driven fixed layout** —
an editable list of (type, exact location, yaw) that the generator places verbatim every run.

### Changes

| File | Change |
|---|---|
| `NLTWorldGenerator.h` | New `FNLTDesiredBuilding` USTRUCT (BuildingType / Location / Rotation); `FNLTWorldGenerationParams::BuildingLayout` array. |
| `NLTWorldGenerator.cpp` | `GenerateBuildings()` now copies `BuildingLayout` verbatim (no random placement; empty → warning + zero buildings). Added School + Hut branches to `GenerateBuildingSemantics`. |
| `NLTOpenWorldSubsystem.h` | `FNLTOpenWorldConfig.WorldSize` default **5000 → 20000** (50 m → 200 m open world so the authored layout spreads out); new `BuildingLayout` default with **12 authored buildings**, pre-verified pairwise footprint-clear. |
| `NLTOpenWorldSubsystem.cpp` | Plumbs `Config.BuildingLayout` into `GenerateWorld`; **new spawn-time layout diagnostic** (min center distance + min footprint clearance between all portal pairs via `GetFootprintRadius()`). |
| `NLTBuildingPortalActor.h/.cpp` | Shared `GetTargetHalfExtent()` table (single source of truth for mesh scaling + spacing checks); public `GetFootprintRadius()` = max(X/Y) half-extent. |
| `NLTDemoGameMode.cpp` | Dropped the hard-coded `WorldSize=5000` override (uses config defaults now). |

### Authored default layout (12 buildings, cm coords)

Offices ×2, Apartments ×4, School, Factory, Park, Shops ×2, Hut — spread across the 200 m
world, min center distance **2600 cm**, min edge clearance **400 cm** (no overlaps, all within
bounds). Rotation/yaw authored per building; Z is auto-raised onto terrain at spawn.

### Runtime verification (standalone `-game`, seed 42, OpenWorld_Level)

```
Generating open world with seed 42, world size 20000x20000
City scenery: placed 6 Fab Modern City grid pieces (scale 0.770, base Z 0, world 20000x20000)
World generated with 12 explicit building placements
Spawned building portal 'Office' at (-4200, 4200, 10)    ... (12 portals: Office×2, Apartment×4, School, Factory, Park, Shop×2, Hut)
Building layout: 12 portals, min center distance 2600 cm, min footprint clearance 400 cm - clear
Open world generation complete: 12 buildings, 12 residents
```

- Formation is seed-independent: positions/types are fixed; seed still varies per-building
  semantic detail + landscape/vegetation (reproducibility requirement preserved).
- **Resolved a prior follow-up:** Office and School now always spawn (old RNG never emitted
  School; seed 42 never hit Office/School weighting).

### Handoff notes for Joshua

- Build note: this machine's pagefile is **fixed at 1 GB** (`C:\pagefile.sys`,
  `AutomaticManagedPageFile=False`) — UE unity-PCH builds OOM (`C3859`) while an editor
  instance is running. Workaround used here: close the editor + `-NoUnity
  -MaxParallelActions=2` (build ~50 s). Recommend raising the pagefile (admin) long-term.
- **Blender workflow (next step, per Joshua):** Joshua is arranging the Fab
  `Modern_City_Environment` block in Blender (currently loaded, buildings at origin). Plan:
  read the arranged building world-transforms via blender-mcp and bake them into
  `FNLTOpenWorldConfig.BuildingLayout` as the set coordinates (no asset re-export needed).
- Commit: `[OPENCODE] feat(openworld): fixed set-coordinate building layout (no overlap)`.
