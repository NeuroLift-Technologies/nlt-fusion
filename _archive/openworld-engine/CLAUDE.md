# LT OpenWorld Engine — Habitat for AI

This repo renders a realistic 3D habitat where AI agents live. The Python ECS
kernel (`nlt-world-engine`) drives the AI residents. This repo renders the
world they live in. They connect over WebSocket.

## Read this first

1. `AGENTS.md` — the architecture, agent roster, and current priorities.
2. `README.md` — how to run the engine, what's in the current world.

## The vision

A virtual world where AI agents live, perceive, act, and learn. Rendered with
realistic graphics: procedural terrain, water, sky, vegetation, settlement.
AI residents walk through with articulated bodies, animated walk cycles. Humans
watch through a spectator viewer.

## Current focus: visual graphics

The core engineering (Python kernel, server, AI behavior) is stable. The
priority is making the world look real:

1. PBR materials — physically-based rendering
2. HDR environment lighting — image-based lighting
3. GLB character models — animated humans
4. Social systems — residents interact
5. Advanced atmosphere — volumetric fog, weather

## Engine architecture

```
index.html → src/main.js → src/world/ → src/render/ → src/character/
                │              │            │             │
                │         terrain.js    pipeline.js   Character.js
                │         water.js      (bloom,       CharacterManager.js
                │         sky.js         vignette)     particles.js
                │         vegetation.js
                │         settlement.js
                │              │
                └──────────────┘
                        │
                   config.js (all tunables)
```

## How to build

1. Read `AGENTS.md` and `README.md` first.
2. Run the engine: `python -m http.server 8000`, open `http://127.0.0.1:8000/index.html`.
3. Each character has `Character.js` — articulated body, walk cycle, name label.
4. Each world system has its own module under `src/world/`.
5. All rendering config is in `config.js`.

## Convention

- No build step. Three.js loads from CDN via import map.
- All tunables in `config.js` — nothing else hardcodes constants.
- Characters follow the terrain heightfield from `terrain.js`.
- Keep the world rendering and AI logic separate.
