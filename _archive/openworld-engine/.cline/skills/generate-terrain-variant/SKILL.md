---
name: generate-terrain-variant
description: Produce a seeded terrain variant config plus rationale, without editing engine code.
---

# Generate Terrain Variant

Given a desired look/character for the world, produce a candidate
`src/config.js` patch (or a variant config snippet) with a rationale, seeded so
it's reproducible.

## Steps

1. Read `src/config.js` in full — know the current tunables (world.size,
   world.segments, world.heightScale, world.seaLevel, world.seed,
   sky.*, water.*, vegetation.*, player.*, quality.*).
2. Read `src/world/noise.js` and `src/world/terrain.js` briefly to understand
   which constants the tunables feed (e.g. `baseHeight` island falloff,
   biome thresholds vs `seaLevel`, scatter bands in `vegetation.js`,
   settlement camp search band in `settlement.js`). Don't rewrite them — just
   know what a config change will actually affect.
3. Read `index.html` HUD to know which values are user-facing (time slider,
   walk/orbit) vs internal.
4. Propose a variant by adjusting only config-level values (not code), with:
   - A one-line goal (e.g. "lower, greener, more water" or "taller, rockier,
     exposed").
   - The changed keys and new values.
   - The seed to use (pick an integer; explain that same seed = same result).
   - A short rationale tying each change to the intended read.
   - Any knock-on effects to call out (e.g. lowering `seaLevel` floods the
     camp search band in `settlement.js`; extreme `heightScale` may push
     vegetation bands off the terrain).
5. Present the patch as a diff-style list of `key: old -> new` lines plus the
   rationale. Do NOT edit `src/config.js` unless explicitly instructed.

## When to use

This skill is for exploring "what if the world looked like X". It is
config-level only. Code-level terrain changes (new biome logic, new noise
layering, new scatter rules) are a story, not a skill use.

## Bundled reference

- See `docs/world-gen-reference.md` (this skill's bundled reference) for how
  config knobs map to world generation.
- See `src/config.js` for the current tunables.

