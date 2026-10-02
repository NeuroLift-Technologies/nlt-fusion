# World-Gen Reference

How the current config knobs map to world generation, for proposing terrain
variants. Source: `src/config.js`, `src/world/noise.js`, `src/world/terrain.js`.

## Key knobs and what they affect

- `world.seed` — drives `mulberry32` RNG. Lands, biomes, vegetation, settlement
  placement all derive from it (plus offsets like `+99`, `+7`, `+21`, `+77`).
  Same seed = same world.
- `world.size` — island extent. Terrain covers `[-size/2, size/2]`. Vegetation
  scatter uses `size * 0.92` for sampling bounds; settlement camp search uses
  `size * 0.6`.
- `world.heightScale` — multiplier on base height. Higher = taller peaks, more
  snow at top, can push biomes off the visible top.
- `world.seaLevel` — water plane height. Biome thresholds are relative to
  `seaLevel + N`. Camp search band is `seaLevel + 1 .. seaLevel + 4`; raising
  sea level too much can flood the band.
- `world.segments` — terrain mesh resolution (256 = 257x257 verts).

## Biome thresholds (terrain.js)

- `h < seaLevel + 0.6` → sand
- `h < seaLevel + 7` → grass (lerps toward dry with detail noise)
- `h < seaLevel + 15` → rock (lerps toward grass)
- else → rock → snow (scales with height above seaLevel + 15)

## Scatter bands (vegetation.js)

- Trees: `seaLevel + 0.8 .. seaLevel + 16`
- Grass: `seaLevel .. seaLevel + 9`
- Rocks: `seaLevel - 1 .. seaLevel + 22`

## Settlement camp (settlement.js)

- Searches 400 random points for flat-ish land near water:
  `h > seaLevel + 1 && h < seaLevel + 4`. If no point matches, uses fallback
  `(30, 30)`.

## Variant proposal tips

- To make a greener world: raise vegetation counts, possibly lower heightScale
  so more land sits in grass bands.
- To make a rockier/exposed world: raise heightScale (more rock/snow), reduce
  tree count.
- To flood more shoreline: raise seaLevel — but watch the camp search band.
- To change the shape without changing biomes: change `seed` only.
