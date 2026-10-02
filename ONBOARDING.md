# 🚀 3-Minute Onboarding: nlt-world-engine

> Read this first. Understand this repo in 3 minutes. Then go deeper with README.md or ARCHITECTURE.md.

> **⚠️ Engine migration in progress — thread `MIGRATE-001`.** The authoritative simulation is moving from **UE 5.8** to **Godot 4.7.2 (C#)**. UE stays frozen as the **behavioural oracle** until the port passes conformance; do not change UE simulation behaviour. Start here: [`world-engine-godot/MIGRATION-PLAN.md`](world-engine-godot/MIGRATION-PLAN.md). Toolchain: [`docs/engine-reference/godot/VERSION.md`](docs/engine-reference/godot/VERSION.md).

---

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; the world engine owns physical reality.**
>
> The physical substrate is Godot 4.7.2 (C#). The engine is an implementation detail of the physical layer and may change by Joshua's decision under OTOI §4.4; the boundary between Fusion and the world engine does not.

---

## What Is This?

**NLT World Engine** is the **deterministic simulation environment** — the embodied multi-agent world itself — where AI Avatars (modeled on ADHD trait profiles) live, fail, and are trained via reinforcement learning.

It is **NOT** the intelligence. The environment is here; the ADHD trait modeling, Aide coaching, training loop, and fusion logic live in [`neurolift-ai-fusion`](https://github.com/NeuroLift-Technologies/neurolift-ai-fusion).

Think of it as the **Sims/RPG world** — rooms, objects, needs, NPCs, stress, consequences. The AI agents (Avatars) act inside it. The training system teaches them. This repo owns the world, the scenarios, and the authoritative runtime.

---

## The Stacks

This repo has **two runnable components** in a migration state, plus an `_archive/` of retired prototypes. Know which one you're in.

### 🎮 `world-engine-godot/` — Godot 4.7.2 (C#) · **The Target**

```
What:     Physical substrate, Godot 4.7.2 .NET (mono) + .NET 8. C#.
Why:      The authoritative world, moving here. Avatars live here. Humans only watch.
Status:   IN PROGRESS — rendering only (terrain, water, sky, vegetation, settlement).
          No agents, determinism, protocol, or governance yet. Phases 0-7 of the plan.
Run:      Open world-engine-godot/project.godot in Godot 4.7.2 .NET (mono)
Tests:    Planned Tier 1 gate — no deterministic core test project exists yet.
```

**Architecture — the key structural decision:** the deterministic core is a plain
`.NET` class library with **no Godot reference**. The authoritative tick therefore cannot
depend on the renderer, and the Tier 1 test gate runs headless on any CI runner with only
the .NET SDK.

- `IAgentController` — `Observe` → `Act`, evaluated per agent per tick. Three
  implementations on one seam: deterministic (baseline), RL policy (Phase D1), LLM
  command (Phase 9). Models emit **semantic** actions; the simulation keeps locomotion
  authority — never raw velocity writes.
- `ITrainingEnvironment` — `Reward` / `IsComplete` / `Reset`. Without these it is not a
  training environment. The PPO trainer itself is deferred.

**Assets:** `assets/levels/*.fbx` — interior level geometry. Godot 4.7 imports FBX natively
via built-in **ufbx** (4.3+; the old external FBX2glTF CLI is unmaintained).

---

### 🔒 `WorldEngine/` — UE 5.8 Reference · **FROZEN Oracle**

```
What:     Unreal Engine 5.8 physical substrate. C++. 129 files, ~20,700 LOC.
Why:      Frozen behavioural oracle — the semantics the Godot port is validated against.
Status:   FROZEN. Do not change simulation behaviour (plan item 1.6).
Run:      make WorldEngineEditor && make WorldEngine
Headless: UnrealEditor-Cmd -nullrhi -game -unattended -MAP=/Game/Scenarios/Levels/Workplace_Level
```

**Key systems (all C++) — the port's reference checklist:**
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

**Maps:** Workplace, Personal, Social, Academic — each with 2–5 scenario DataAssets (13 scenarios total). The interiors were created by *duplicating* `Workplace_Level`, and `OpenWorld_Level` has no authored geometry at all (terrain, city, vegetation and a hardcoded 12-building layout are generated at runtime). Both matter when porting.

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
| **Scenario design** (what happens in a workplace/academic scenario) | `world-engine-godot/` (target) · `_archive/world-engine/contracts/v1/` for the scenario schema. UE's 13 DataAssets are the source data — extract, don't hand-transcribe |
| **Environment art / props / lighting / sound** | `world-engine-godot/assets/` (target) · `WorldEngine/Content/` (UE source assets) |
| **Simulation systems** (tick loop, needs, RNG, clock) | `world-engine-godot/` core library (target) · `WorldEngine/Source/WorldEngine/Public/` (C++ reference) |
| **AI behavior / movement / navigation** | `world-engine-godot/` — `IAgentController` seam, plan §2.6a and §6.3a |
| **Training / RL / PPO** | `neurolift-ai-fusion` (not this repo) — this repo provides the training-environment surfaces (`Reward`/`Completion`/`Reset`) |
| **Contracts / API / replay format** | `_archive/world-engine/contracts/v1/` — provider-neutral schemas, vendored into the core (plan 2.11) |
| **Spectator viewer** | `world-engine-godot/` — extend `WorldView.cs`. No viewer exists today |
| **Documentation** | `docs/`, `README.md`, `world-engine-godot/MIGRATION-PLAN.md` |
| **Governance / onboarding / agent protocol** | `NLT-DEV-OTOI.md`, `AGENTS.md`, `agents/`, `SOPs/` |

---

## Key Files at a Glance

```
README.md                              ← Full project docs (read after this)
ARCHITECTURE.md                        ← UE 5.8 subsystem reference (frozen)
CLAUDE.md                              ← Claude Code repo instructions
NLT-DEV-OTOI.md                        ← Canonical governance contract (read FIRST)
AGENTS.md                              ← Internal coordination gateway

world-engine-godot/                     ← Godot 4.7.2 (C#) — TARGET authoritative sim
├── MIGRATION-PLAN.md                  ← Read this before touching anything engine-related
├── *.cs                               ← Procedural world prototype (rendering only)
├── assets/levels/                     ← Interior level geometry (.fbx via ufbx)
└── addons/godot_ai/                   ← Third-party Godot↔MCP bridge (external, unapproved)

WorldEngine/                            ← UE 5.8 reference sim (C++) — FROZEN oracle
├── Source/WorldEngine/               ← All C++ source
│   ├── Public/                       ← Headers (Agents, Core, Simulation, Scenarios, Audio, World)
│   └── Private/                      ← Implementations
├── Content/Scenarios/                ← 13 scenario DataAssets across 4 maps
├── Config/                           ← DefaultEngine.ini, MCP settings
└── Scripts/                          ← Python (scenario creation, QA, lighting)

_archive/                              ← Retired components (not part of build)
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
| The physical substrate (Godot 4.7.2; UE 5.8 as frozen oracle) | The fusion engine |
| Seam for an external controller | The controller itself (that's `neurolift-ai-fusion`) |

**Rule of thumb:** If it changes how the Avatar *thinks*, it goes in `neurolift-ai-fusion`. If it changes the *world the Avatar lives in*, it's here.

---

## Quick Start

```bash
# Path A (target): Godot 4.7.2 — needs Godot 4.7.2 .NET (mono) + .NET 8 SDK
godot --path world-engine-godot
# Planned Tier 1 gate — no deterministic core test project exists yet.
# Once implemented, it will need no engine:
# dotnet test world-engine-godot/NltWorldEngine.Core.Tests

# Path B (frozen oracle): UE 5.8 authoritative sim (requires UE 5.8 at ~/Documents/NLT/Engine/)
cd WorldEngine
make WorldEngineEditor  # ~85s
make WorldEngine        # ~22s
# Headless run:
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor-Cmd \
  -project=WorldEngine.uproject -nullrhi -game -unattended -log \
  -MAP=/Game/Scenarios/Levels/Workplace_Level.Workplace_Level

# Path C (archived): Python ECS engine (stdlib-only) — reference, not authoritative
cd _archive/world-engine
python3 demo.py                            # Watch an agent live a day
python3 -m unittest discover tests          # Run test suite
```

**Note:** `world-engine/` and `world-engine-v2/` moved under `_archive/`. Older instructions
and any doc still saying `cd world-engine` are stale.

---

## Reading Order for Deeper Understanding

1. **This file** ← you are here
2. `world-engine-godot/MIGRATION-PLAN.md` — **read before engine work.** Which phase is in flight, what is frozen, what the gates are
3. `README.md` — full project documentation, quick start, CI, troubleshooting
4. `ARCHITECTURE.md` — UE 5.8 subsystem reference (frozen oracle — the semantics to reproduce)
5. `NLT-DEV-OTOI.md` — governance, guardrails, escalation protocol (non-negotiable)
6. `_archive/world-engine/contracts/v1/` — the API contract between environment and training

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
