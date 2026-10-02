# Procedural Open-World Layer (Path B — Procedural Approach)

> **Status:** In development (Phase 1 complete)
> **Owner:** OpenCode (Graphics/Environment lane)
> **Related escalation:** `docs/escalations/2026-09-20-openworld-expansion.md`

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

## Overview

This document describes the procedural open-world outdoor layer that supplements the
UE WorldEngine's indoor scenario levels. Buildings in the outdoor world are **level
portals** — entering a building streams the corresponding indoor `.umap` scenario level.

**Original approach:** Import free assets from Epic's Fab marketplace.
**Current approach:** Port proven procedural algorithms from the Three.js
`openworld-engine` (`src/world/`) into UE5 C++ — fully self-contained, no external assets.

## Architecture

```
Outdoor Open-World Layer (UE5)
├── Landscape + PCG terrain (procedural heightfield)
├── Procedural sky dome (Rayleigh scattering + noise-driven clouds)
├── Procedural water plane (vertex displacement + normal maps)
├── PCG vegetation scatter (trees, grass, rocks)
├── Building shells (data from NLTWorldGeneratorSubsystem districts)
│   └── Level portals → indoor .umap scenario levels
└── Niagara VFX (dust, water splashes, fireflies)

SimCore Integration
├── Deterministic tick (1Hz) via NLTSimulationSubsystem
├── EventBus ring buffer for outdoor events
└── Web API (port :8765) serves outdoor state
```

## Procedural Noise Library (`NLTNoiseLibrary`)

Ported from `openworld-engine/src/world/noise.js`:

- `Mulberry32(Seed)` — deterministic 32-bit PRNG
- `Noise2D(X, Y, Seed)` — 2D Perlin-style value noise, ~[-1, 1]
- `Fbm2D(X, Y, Seed, Octaves, Lacunarity, Gain)` — fractal Brownian motion, [0, 1]
- `HeightField(X, Y, Seed, Octaves)` — normalized terrain elevation

**Determinism:** Same seed always produces the same output. This satisfies the OTOI
§17 reproducibility requirement and matches the Three.js engine's guarantee
(`mulberry32(seed) → value noise → fBm; same seed = same world`).

## Sky & Atmosphere (`NLTAtmosphereSubsystem`)

### Procedural sky dome (no HDRI required)

The existing `NLTAtmosphereSubsystem` creates a sky dome (sphere mesh + dynamic material).
Enhancements:

1. **Cloud coverage** — now uses `Fbm2D` noise for natural cloud variation:
   ```cpp
   float NoiseClouds = UNLTNoiseLibrary::Fbm2D(Hours * 0.5f, 0.0f, 42, 4, 2.0f, 0.5f);
   SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("CloudNoise"), ...);
   ```

2. **Star density** — procedural star field with noise-driven clumping:
   ```cpp
   float StarNoise = UNLTNoiseLibrary::Fbm2D(Hours + 7.0f, 13.0f, 99, 3, 2.0f, 0.5f);
   SkyDomeMaterialInstance->SetScalarParameterValue(TEXT("StarDensity"), ...);
   ```

3. **HDRI fallback** — if `SkyboxCubemap` is assigned (Blueprint/UPROPERTY), it's
   applied to the sky dome material (`SkyboxCubemap` texture parameter) and to the
   SkyLight for image-based reflections. If empty, procedural color blending remains
   active.

### Material parameters expected on `M_SkyDome_Master`

| Parameter | Type | Source |
|-----------|------|--------|
| `SkyColor` | Vector3 | Procedural time-of-day blend |
| `SunIntensity` | Scalar | Daylight factor |
| `StarIntensity` | Scalar | Night phase |
| `StarDensity` | Scalar | **NEW** — Fbm noise |
| `HorizonGlow` | Scalar | Time-of-day |
| `CloudCoverage` | Scalar | Sine wave (existing) |
| `CloudNoise` | Scalar | **NEW** — Fbm noise |
| `SkyboxCubemap` | TextureCube | **NEW** — optional HDRI |

## Post-Processing (`PostProcessVolumeActor`)

### LUT support (with procedural fallback)

- If `ColorGradingLUT` (Texture2D) + `ColorGradingLUTMaterial` (UMaterialInterface)
  are assigned → applies 2D LUT via `WeightedBlendables`
- If either is empty → falls back to procedural color grading (tint, saturation, contrast)

### Material parameters expected on LUT post-process material

| Parameter | Type | Description |
|-----------|------|-------------|
| `LUT_Texture` | Texture2D | 2D LUT lookup table texture |
| `SceneColor` | Texture | Auto-bound by UE post-process system |

## Water (`Water` plugin enabled)

The UE5 built-in Water plugin is now enabled in `WorldEngine.uproject`. The procedural
water approach from `openworld-engine/src/world/water.js` maps to:

- **UE Water Plugin** for water body actors (lakes, rivers, oceans)
- **Custom material** for wave normal animation (port of the sine-wave + FBM approach)
- **Vertex displacement** via tessellation in the water material

The Water plugin provides `UWaterBody` actors and `UWaterSubsystem` for wave
management, which replaces the Three.js `buildWater()` implementation.

## Terrain (next phase)

The `NLTWorldGeneratorSubsystem` already generates district/building/road data.
The next step is to port the `terrain.js` heightfield generation:

```cpp
// Planned: procedural terrain heightfield using NLTNoiseLibrary::Fbm2D
float Height = UNLTNoiseLibrary::HeightField(WorldX, WorldY, Seed, 5);
// Map to biome: sand (<0.2), grass (0.2-0.5), rock (0.5-0.75), snow (>0.75)
```

This will integrate with UE5's Landscape system via the PCG plugin.

## Level Travel Bridge

Buildings generated by `NLTWorldGeneratorSubsystem` are building portals that
travel the local player to the existing indoor scenario levels:

```
District: Commercial    →  Buildings: Office, Shop
    ├── "Office_01"     →  Level: Workplace_Level (indoor)
    ├── "Shop_01"       →  Level: Social_Level (indoor)
    └── "Shop_02"       →  Level: Academic_Level (indoor)

District: Residential   →  Buildings: Apartment
    └── "Apt_01"        →  Level: Personal_Level (indoor)
```

Each indoor level has one return door targeting `OpenWorld_Level`. The portal
uses a non-seamless `OpenLevel` transition rather than inserting a runtime
`LevelInstance` into `OpenWorld_Level`.

## Content Directory Structure

```
WorldEngine/Content/
├── Sky/
│   └── HDRIs/        ← For future HDRI imports (backup approach)
├── Environment/
│   ├── Materials/     ← 12 existing PBR materials
│   ├── Vegetation/    ← Future procedural/imported vegetation
│   ├── Water/         ← Future water assets/materials
│   └── Terrain/       ← Future terrain assets
├── PostProcess/       ← Future LUTs, night presets
├── Kits/
│   ├── SimBody/       ← Existing character mesh + material
│   └── Workplace/     ← Existing desk kits
└── Scenarios/         ← Existing 4 indoor .umap levels
```

## Plugin Changes

| Plugin | Status |
|--------|--------|
| Water | ✅ Enabled (`.uproject` + Build.cs) |
| PCG | ✅ Already enabled |
| Niagara | ✅ Already enabled |
| Landscape | ✅ Engine core (no plugin needed) |
