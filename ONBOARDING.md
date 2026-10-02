# 🚀 3-Minute Onboarding: nlt-world-engine

> Read this first. Understand this repo in 3 minutes. Then go deeper with README.md or ARCHITECTURE.md.

---

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

## What Is This?

**NLT World Engine** is the **deterministic simulation environment** — the embodied multi-agent world itself — where AI Avatars (modeled on ADHD trait profiles) live, fail, and are trained via reinforcement learning.

It is **NOT** the intelligence. The environment is here; the ADHD trait modeling, Aide coaching, training loop, and fusion logic live in [`neurolift-ai-fusion`](https://github.com/NeuroLift-Technologies/neurolift-ai-fusion).

Think of it as the **Sims/RPG world** — rooms, objects, needs, NPCs, stress, consequences. The AI agents (Avatars) act inside it. The training system teaches them. This repo owns the world, the scenarios, and the authoritative runtime.

---

## The 3 Stacks

This repo has **three runnable components**. Know which one you're in.

### 🎮 `WorldEngine/` — UE 5.8 Authoritative Simulation (The Real One)

```
What:     Unreal Engine 5.8 physical substrate. C++.
Why:      The final, authoritative world. Avatars live here. Humans only watch.
Run:      make WorldEngineEditor && make WorldEngine
Headless: UnrealEditor-Cmd -nullrhi -game -unattended -MAP=/Game/Scenarios/Levels/Workplace_Level
```

**Key systems (all C++):**
| System | What it does |
|--------|--------------|
| `NLTSimulationClockSubsystem` | Authoritative clock, timestep, time-of-day |
| `NLTDeterministicSeedSubsystem` | Seeded RNG (reproducible runs) |
| `NLTAgentSpawnerSubsystem` | Mass Entity agent spawning |
| `UScenarioManagerSubsystem` | Scenario runtime manager |
| `SoundscapeSubsystem` | 4 ambient audio beds tied to scenario stress |
| `AAvatarCharacter` | AI-controlled character (SimBody skeletal mesh, auto-possess) |
| `AAvatarAIController` | Navmesh wandering (foundation for RL training) |

**Plugins enabled:** LearningAgents (PPO), MLAdapter, MassAI, MassCrowd, StateTree, SmartObjects, ModelContextProtocol (MCP).

**Maps:** Workplace, Personal, Social, Academic — each with 2–5 scenario DataAssets (13 scenarios total).

---

### 🐍 `_archive/world-engine/` — Python ECS Engine (Reference / Data Pipeline)

```
What:     Deterministic tick-loop engine. Pure Python stdlib.
Why:      Original simulation approach; retained for data pipeline and reference.
Run:      cd _archive/world-engine && python3 demo.py
Tests:    python3 -m unittest discover tests
```

**Key modules:**
| Module | What it does |
|--------|--------------|
| `simulation/environment/world_engine.py` | Core ECS tick loop |
| `simulation/environment/ecs.py` | Entity-Component-System |
| `simulation/environment/world_builder.py` | Constructs rooms, objects, NPCs |
| `simulation/environment/scenarios.py` | Scenario definitions |
| `simulation/environment/agent_interface.py` | `perceive → submit intent → poll result` seam |
| `simulation/npcs/base_npc.py` | NPC base class |

**`demo.py`** runs a "day in the life" agent autonomously. The `UtilityAgent.decide()` is where an LLM controller (from `neurolift-ai-fusion`) plugs in — the seam between environment and intelligence.

**`contracts/v1/`** — Provider-neutral transport + deterministic replay schemas. This is the API contract between any environment engine and the training system.

---

### 🌐 `_archive/world-engine-v2/` — Babylon.js Viewer (Frontend Shell)

```
What:     TypeScript + Vite + Babylon.js. Visualizes a pair's world.
Status:   Not yet wired to Python/UE engine.
Run:      cd _archive/world-engine-v2 && npm install && npm run dev
```

**`_archive/studio/`** — Product-facing Claude Design shell (also un-wired visualization).

---

## How a Pair Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAIR (e.g. StayAlert)                       │
│                                                                 │
│   ┌──────────────┐    coaching    ┌──────────────┐             │
│   │   Avatar     │ ◄──────────── │    Aide      │             │
│   │ (ADHD trait) │ ─────────────► │  (expertise) │             │
│   └──────┬───────┘   feedback    └──────────────┘             │
│          │                                                      │
│          │ lives in                                             │
│          ▼                                                      │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │              SCENARIO (e.g. Workplace_1)                 │ │
│   │  Rooms, objects, NPCs, stress, consequences              │ │
│   │  Avatar needs: Focus, Stress, Energy, Hunger, Burnout    │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│   Lifecycle: Onboarding → Training → Setback → Breakthrough    │
│              → Fusion Ready → Fusion Ceremony → Advocate       │
└─────────────────────────────────────────────────────────────────┘
```

**19 Avatar-Aide pairs** — 16 executive function (FocusFlow, Timely, TaskKickstart, etc.) + 3 non-executive (StressShield, SensoryBalance, ConfidenceCoach).

---

## Where to Contribute

| I want to work on... | Go to... |
|----------------------|----------|
| **Scenario design** (what happens in a workplace/academic scenario) | `WorldEngine/Content/Scenarios/` (DataAssets) or `_archive/world-engine/src/simulation/environment/scenarios.py` |
| **Environment art / props / lighting / sound** | `WorldEngine/Content/` (Materials, Audio, Kits) or `WorldEngine/Scripts/` |
| **Simulation systems** (tick loop, needs, RNG, clock) | `_archive/world-engine/src/` (Python) or `WorldEngine/Source/WorldEngine/Public/` (C++) |
| **AI behavior / movement / navigation** | `WorldEngine/Source/WorldEngine/Public/Agents/` + `AAvatarAIController` |
| **Training / RL / PPO** | `neurolift-ai-fusion` (not this repo) — this repo provides the `agent_interface` seam |
| **Contracts / API / replay format** | `_archive/world-engine/contracts/v1/` |
| **Frontend viewer** | `_archive/world-engine-v2/` (Babylon.js) |
| **Documentation** | `docs/`, `README.md`, `ARCHITECTURE.md` |
| **Governance / onboarding / agent protocol** | `NLT-DEV-OTOI.md`, `AGENTS.md`, `agents/`, `SOPs/` |

---

## Key Files at a Glance

```
README.md                              ← Full project docs (read after this)
ARCHITECTURE.md                        ← UE 5.8 architecture + subsystems
CLAUDE.md                              ← Claude Code repo instructions
NLT-DEV-OTOI.md                        ← Canonical governance contract (read FIRST)
AGENTS.md                              ← Internal coordination gateway

WorldEngine/                            ← UE 5.8 authoritative sim (C++)
├── Source/WorldEngine/               ← All C++ source
│   ├── Public/                       ← Headers (Agents, Core, Simulation, Scenarios, Audio, World)
│   └── Private/                      ← Implementations
├── Content/Scenarios/                ← 13 scenario DataAssets across 4 maps
├── Config/                           ← DefaultEngine.ini, MCP settings
└── Scripts/                          ← Python (scenario creation, QA, lighting)

_archive/                              ← Prototype directories (reference only)
├── world-engine/                     ← Python ECS engine + React prototype
├── world-engine-v2/                  ← Babylon.js viewer (superseded)
├── world-engine-3d/                  ← Early Three.js experiment
├── openworld-engine/                 ← Open-world exploration variant
└── studio/                           ← Claude Design shell (superseded)
```

---

## The Boundary: What This Repo Is NOT

| This repo IS | This repo is NOT |
|--------------|------------------|
| The environment (world, rooms, objects, needs) | The Avatar/Aide ML models |
| Scenarios (what happens to an Avatar) | The training loop / PPO optimizer |
| Deterministic replay & transport contracts | Aide coaching expertise / RRT |
| UE 5.8 physical substrate | The fusion engine |
| Seam for an external controller | The controller itself (that's `neurolift-ai-fusion`) |

**Rule of thumb:** If it changes how the Avatar *thinks*, it goes in `neurolift-ai-fusion`. If it changes the *world the Avatar lives in*, it's here.

---

## Quick Start (3 Paths)

```bash
# Path A: UE 5.8 authoritative sim (requires UE 5.8 at ~/Documents/NLT/Engine/)
cd WorldEngine
make WorldEngineEditor  # ~85s
make WorldEngine        # ~22s
# Headless run:
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor-Cmd \
  -project=WorldEngine.uproject -nullrhi -game -unattended -log \
  -MAP=/Game/Scenarios/Levels/Workplace_Level.Workplace_Level

# Path B: Python ECS engine (stdlib-only, no deps needed)
cd world-engine
python3 demo.py                            # Watch an agent live a day
python3 -m unittest discover tests          # Run test suite

# Path C: Babylon.js viewer (not wired to engine yet)
cd world-engine-v2
npm install
npm run dev                                # localhost:5173
```

---

## Reading Order for Deeper Understanding

1. **This file** ← you are here
2. `README.md` — full project documentation, quick start, CI, troubleshooting
3. `ARCHITECTURE.md` — MMO topology, Durable Objects, WebSocket fan-out, pair lifecycle
4. `NLT-DEV-OTOI.md` — governance, guardrails, escalation protocol (non-negotiable)
5. `_archive/world-engine/contracts/v1/` — the API contract between environment and training

---

## Non-Negotiable

> **Joshua W. Dorsey, Sr. is final authority on all architectural, deployment, UX, and strategic decisions. Escalate. Do not guess.**

- Commit format: `[AGENT_NAME] type(scope): description`
- End every session with a handoff record
- No credentials in code or VCS
- No LLM provider lock-in
- No production deployments without explicit human approval

---

*Part of the [NeuroLift Technologies](https://github.com/NeuroLift-Technologies) ecosystem. OTOI v1.0.3.*
