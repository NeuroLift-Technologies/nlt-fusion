# LT OpenWorld Engine

A realistic 3D habitat where AI agents live. Built with Three.js 0.170, no build
step, no installs beyond a static file server. Serve via HTTP (not file://).

## Vision

An AI habitat — a virtual world where AI agents live, perceive, act, and
learn. The world is rendered with realistic graphics: procedural terrain,
water, sky, vegetation, and settlement. AI residents walk through this world
with articulated bodies, animated walk cycles, and name labels. Humans watch
through a spectator viewer.

The simulation kernel (Python ECS from `nlt-world-engine`) drives the AI
residents. The viewer (this repo) renders the world they live in. They connect
over WebSocket.

## Run

```powershell
cd "D:\nlt-repos\lt-openworld-engine"
python -m http.server 8000
```

Open `http://127.0.0.1:8000/index.html` (internet needed for the three.js CDN).

## Controls

- WASD move, mouse drag look, wheel zoom, R/F up/down, 1/2 walk/orbit
- HUD: fps, position, time-of-day slider, day-cycle toggle, resident count

## What's in the world

| Layer | File | Status |
|---|---|---|
| Terrain | `src/world/terrain.js` | FBM noise, biome vertex colors, island falloff |
| Water | `src/world/world.js` | Translucent animated plane |
| Sky | `src/world/sky.js` | Gradient shader dome + sun + stars at night |
| Vegetation | `src/world/vegetation.js` | Instanced trees, grass, rocks |
| Settlement | `src/world/settlement.js` | Procedural huts, campfire, dock |
| Renderer | `src/render/pipeline.js` | ACES tone mapping, bloom, vignette |
| Player | `src/player/controls.js` | First-person walk + orbit camera |
| Characters | `src/character/Character.js` | Articulated AI residents with walk animation |
| Particles | `src/character/particles.js` | Footstep dust effects |
| Manager | `src/character/CharacterManager.js` | Spawns, updates, manages all residents |

## Current state

The world renders with procedural terrain, water, sky, vegetation, and a small
camp. Four AI residents (Avery, Blake, Casey, Devon) walk around the camp with
articulated limbs, animated walk cycles, and name labels. Footstep dust puffs
up when they move.

**Next priorities:**
1. PBR materials (physically-based rendering for all surfaces)
2. HDR environment lighting (image-based lighting)
3. GLB character models (animated humans replacing procedural bodies)
4. Social systems (residents interact with each other)
5. Advanced atmosphere (volumetric fog, weather)

## Layout

```
lt-openworld-engine/
├── index.html              # Shell, HUD, import map
├── src/
│   ├── main.js             # Boot, loop, wiring
│   ├── config.js           # All tunables (world size, quality, palette)
│   ├── world/              # Terrain, water, sky, vegetation, settlement
│   ├── render/             # Renderer, post-processing, day/night cycle
│   ├── player/             # Walk + orbit controls
│   └── character/          # AI resident system (Character, particles, manager)
├── design/gdd/             # Game design docs (legacy studio layer)
├── production/             # Backlog, session state (legacy studio layer)
├── docs/                   # Architecture decisions, workspace setup
└── .cline/                 # Cline rules, workflows, skills (legacy)
```

## Studio workflow (legacy)

This repo originally coupled the engine with a CCGS-style one-person game
studio governed by Cline. That layer (`.cline/`, `design/`, `production/`) is
being superseded by the AI-habitat vision. The engine (`src/`) is the technical
artifact that remains.
