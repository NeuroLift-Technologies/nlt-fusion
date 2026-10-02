# _archive/ — Prototype Directories

> **NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

> **An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> These are prototype implementations superseded by `WorldEngine/` (UE 5.8 C++). Retained for reference only.

---

## What's Here

| Directory | Description | Status |
|-----------|-------------|--------|
| `world-engine/` | Original Python ECS engine + React frontend prototype (CDN-based, no build step) | Superseded by `WorldEngine/` (UE 5.8 C++) |
| `world-engine-v2/` | Babylon.js + Vite + TypeScript viewer | Superseded — was the spectator viewer, not the simulation |
| `world-engine-3d/` | Early 3D world prototype (Three.js, single HTML file) | Experimental, never integrated |
| `openworld-engine/` | Open-world exploration variant (Three.js + Node server) | Experimental, never integrated |
| `studio/` | Product-facing Claude Design shell (React JSX) | Superseded — was a visualization shell |

---

## Why These Exist

These directories represent the iterative design process that led to the current UE 5.8 architecture:

1. **`world-engine/`** — The original concept: a Python ECS engine with a React frontend. Proved the simulation loop and agent behaviors but lacked the graphical fidelity and performance needed for the embodied multi-agent vision.

2. **`world-engine-v2/`** — Attempted to add a proper 3D viewer (Babylon.js + Vite + TypeScript). Connected to the Python engine but was never wired to the UE simulation.

3. **`world-engine-3d/`** — Early experiment with Three.js for a single-file 3D world. Abandoned in favor of the Babylon.js approach.

4. **`openworld-engine/`** — Exploration of open-world mechanics (procedural terrain, roaming agents). Superseded by UE 5.8's PCG and Mass Entity systems.

5. **`studio/`** — Attempted to create a "Claude Design" shell for visualizing the simulation. Never integrated with the authoritative engine.

---

## The Current Architecture

The embodied multi-agent simulation is now built on **Unreal Engine 5.8**:

- **`WorldEngine/`** — UE 5.8 C++ authoritative simulation (the driving engine)
- **`world-engine/`** (Python) — Reference implementation only, not authoritative
- The spectator viewer connects to UE via WebSocket (`UNLTWebServerSubsystem`)

See the root `README.md` and `ARCHITECTURE.md` for the current system.

---

*Retained for historical reference. Not part of the build.*
