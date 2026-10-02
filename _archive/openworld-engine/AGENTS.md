# LT OpenWorld Engine — Habitat for AI

## What we're building

A realistic 3D habitat where AI agents live. The world is rendered with
procedural terrain, water, sky, vegetation, and settlement. AI residents walk
through with articulated bodies, animated walk cycles, and name labels. Humans
watch through a spectator viewer.

## Architecture

```
Python ECS Kernel (nlt-world-engine)    ← drives AI residents (needs, social, behavior)
                │
                │ WebSocket / REST
                ▼
LT OpenWorld Engine (this repo)         ← renders the world
  ┌─────────────────────────────────────┐
  │  Three.js 0.170, no build step      │
  │                                     │
  │  Terrain ─┐                         │
  │  Water   ─┤                         │
  │  Sky     ─┤ → WebGL Renderer        │
  │  Veg     ─┤   (ACES, bloom,         │
  │  Settlement─┘    vignette)          │
  │  Characters ──  AI residents        │
  │  Particles ──  Footstep dust        │
  └─────────────────────────────────────┘
```

## Agent roster

| Agent | Domain | Focus |
|---|---|---|
| world-builder | Terrain, water, sky, vegetation, settlement | Procedural world systems |
| character-creator | AI residents: bodies, animations, particles | GLTFModel, walk cycles, idle states |
| render-engineer | Lighting, materials, post-processing | PBR, HDR, SBL, shadows |
| habitat-livability | AI livability: needs, social systems, interaction | Resident behavior integration |

## Coordination

- The kernel (`nlt-world-engine`) drives AI decisions (where to go, what to do)
- This repo renders what the kernel decides
- Server (`server.py`) bridges kernel ↔ viewer over WebSocket
- Characters follow terrain heightfield (no physics — pure rendering)

## Priorities (current)

1. **PBR materials** — physically-based rendering for all surfaces
2. **HDR environment lighting** — image-based lighting for realistic reflections
3. **GLB character models** — animated humans replacing procedural bodies
4. **Social systems** — residents interact with each other
5. **Advanced atmosphere** — volumetric fog, weather, day/night polish

## Run

```powershell
cd "D:\nlt-repos\lt-openworld-engine"
python -m http.server 8000
```

Open `http://127.0.0.1:8000/index.html` (internet needed for the three.js CDN).