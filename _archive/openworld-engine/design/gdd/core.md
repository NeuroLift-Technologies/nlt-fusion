# LT OpenWorld — Core Design Document

> Status: Draft (skeleton). Fill section-by-section via `/design-system`.
> One-person studio; the human is the executive director.

## 1. Overview

One-line pitch: a lifelike procedural 3D open world on a Three.js engine — a
quiet island with a lakeside camp, day/night cycles, wind in the grass, and the
sense that the world is breathing even when the player isn't there.

This is not yet a game with a win state. It is a living environment to walk
through, look at, and feel present in.

## 2. Player Fantasy

The player is a traveler who arrives at a quiet lakeside camp at the edge of a
procedural island. The fantasy is presence and discovery, not conquest:

- Walk the shoreline and the hills.
- Watch the day cycle the sky, the water, the campfire.
- Feel that the world is alive (wind in grass, flickering fire, stars at night)
  even when doing nothing.

The tone is calm, observant, slightly lonely. Beauty is in the small motions:
light on water, smoke from a fire, grass swaying.

## 3. Detailed Rules

### 3.1 Pillars

1. **Lifelike feel first.** The world should read as real and alive at rest:
   believable water, sky, vegetation, light.
2. **Quiet and present.** No urgent goals, no combat, no score. Presence over
   agitation.
3. **Procedural but coherent.** A fresh seed gives a different but believable
   island every time.
4. **Minimal UI.** The HUD shows only what's necessary (fps, position, time);
   the world is the interface.

### 3.2 Scope (current)

- Walk and orbit around a procedural island.
- Time-of-day control (slider) and a day-cycle toggle.
- A lakeside camp as the first point of interest.
- Post-processing (ACES, bloom, vignette) for a cinematic read.

### 3.3 Out of scope (for now)

- Quests, objectives, win states.
- NPCs with AI (beyond utility-NPC experiments in `nlt-world-engine`, if/when
  bridged).
- Audio (planned, not here yet).
- Multiplayer.

## 4. Formulas

(Tune layout/feel values via `src/config.js`. Any balance value in this doc
must either cite a formula below or link to its rationale.)

- Day cycle speed: slider scrub = instantaneous; day-cycle toggle advances
  `timeOfDay += dt * 0.5` per frame (full 24h ≈ 48s at 60fps).
- Night factor: `smoothstep(-sunUp, -0.08, 0.25)` where
  `sunUp = sin((h - 6) / 12 * π)`.
- Seeded world: `mulberry32(seed)` → value noise → fBm; same seed = same world.

## 5. Edge Cases

1. Sea level vs camp placement: the camp search band is
   `seaLevel + 1 .. seaLevel + 4`; raising sea level too much can flood the
   band so no camp is placed.
2. Height extremes: very high `heightScale` can push biomes/snow off the top of
   the visible terrain and move vegetation bands.
3. Sliding off terrain: player clamps to world bounds ±250; falling below sea
   level clamps to sea level (never sinks).
4. Post-processing failure: if the CDN addons fail to load, the renderer falls
   back to plain rendering; the world still renders.
5. Offline / CDN-down: the import map points at a CDN; no internet = no three.js
   = `#err`. This is expected, not a bug.
6. Window resize: camera, renderer, composer all resize together.

## 6. Dependencies

- Engine systems: terrain, water, sky, vegetation, settlement, render pipeline,
  player controls (all in `src/`).
- Config surface: `src/config.js` is the single source of truth for tunables.
- Three.js 0.170 via CDN import map; post-processing addons are optional.

## 7. Tuning Knobs

(Each knob maps 1:1 to a `src/config.js` entry. Add new tunables to config,
never inline.)

| Knob | config.js path | What it controls |
|---|---|---|
| World size | `world.size` | Island extent (meters) |
| Terrain resolution | `world.segments` | Mesh tessellation |
| Height scale | `world.heightScale` | Max elevation |
| Sea level | `world.seaLevel` | Water plane + biome thresholds |
| Seed | `world.seed` | Deterministic world gen |
| Sun elevation/azimuth | `sky.sunElevationDeg`, `sky.sunAzimuthDeg` | Default sun position |
| Water colors/opacity | `water.colorShallow`, `water.colorDeep`, `water.opacity` | Water read |
| Vegetation counts | `vegetation.treeCount`, `grassCount`, `rockCount` | Scatter density |
| Walk speed | `player.walkSpeed` | Movement rate |
| Pixel ratio cap | `quality.pixelRatioMax` | Perf vs sharpness |
| Shadow quality | `quality.shadowMapSize`, `quality.shadows` | Shadow fidelity |
| Bloom strength | (pipeline.js) `0.28` | Bloom intensity (not yet in config — candidate knob) |

## 8. Acceptance Criteria

(Design-gate criteria. The design gate passes when these hold.)

1. The world loads and renders a coherent island with visible biomes
   (sand/grass/rock/snow) from waterline to summit.
2. The sky dome shows a believable day sky with a sun disc, and a night sky
   with stars when night factor is high.
3. Water animates believably (gentle waves) and reads as water (shallow/deep
   color blend, transparency).
4. Vegetation scatters believably: trees on mid-slopes, grass lower, rocks
   varied — instanced, no per-frame random.
5. The lakeside camp is placed near water on flat-ish ground and reads as a
   small settlement (huts, tent, campfire with light).
6. Walk mode feels controlled (WASD + pointer-drag look); orbit mode gives an
   overview. No camera fighting.
7. Post-processing adds cinematic polish (ACES, bloom, vignette) and the scene
   still renders if the addons fail to load.
8. The HUD is minimal and correct (fps, position, time, slider, day-cycle
   toggle) and never obscures the world.
9. Same seed always gives the same world (determinism).
10. No console errors at boot in a normal run (over HTTP with internet).

(Fine-tune as the game takes shape.)
