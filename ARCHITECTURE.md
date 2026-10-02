# NeuroLift World Engine — UE 5.8 Subsystem Reference

> **This document describes the UE 5.8 implementation, which is migrating to Godot 4.7.2 under thread `MIGRATE-001`.**
>
> It is retained as the **frozen behavioural oracle**: a description of the semantics the Godot port must reproduce. Read it for that purpose, not as the target architecture. The target is in `world-engine-godot/MIGRATION-PLAN.md`.
>
> **Do not change UE simulation behaviour** (plan item 1.6). Where this document says "UE", read "the physical layer, currently UE".

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; the world engine owns physical reality.**
>
> The physical substrate is Godot 4.7.2 (C#). The engine is an implementation detail of the physical layer and may change by Joshua's decision under OTOI §4.4; the boundary between Fusion and the world engine does not.

The physical layer is the **driving engine** for the Avatar-Aide-Advocate system — currently UE 5.8, moving to Godot 4.7.2.
This document supersedes the earlier Cloudflare/Vercel MMO architecture.

---

## Core Concept

> Each Avatar+Aide pair is an **isolated simulation instance** — a living habitat.
> Observers connect to watch **one specific pair's journey** — from onboarding to fusion.
> The world engine owns the world, the tick loop, the state, and the physics.

---

## Architecture Overview

**Primary runtime:** the rendered simulation on the developer's machine — currently a UE 5.8 Editor or standalone game, moving to the Godot 4.7.2 desktop app. The human watches the same world in which the agents simulate and train. A headless server target is optional later infrastructure for running the same physical world without a rendered viewport; it is not the primary training architecture.

The optional `WorldEngineServer` target remains available for a future headless deployment path, but server compilation and deployment are not prerequisites for the Editor-based training loop.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NLT World Engine (UE 5.8)                       │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                  UE 5.8 Editor / rendered game                   │ │
│  │                                                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │ │
│  │  │ Simulation  │  │   World     │  │   Learning Agents    │  │ │
│  │  │   Clock     │  │   State     │  │   (PPO Training)     │  │ │
│  │  │  (1Hz tick) │  │  (Mass ECS) │  │                      │  │ │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │ │
│  │                                                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │ │
│  │  │  Scenario   │  │  Governance │  │   WebSocket / HTTP   │  │ │
│  │  │  Manager    │  │  Boundary   │  │   Control API        │  │ │
│  │  │(DataAssets) │  │(ASFDK-C++)  │  │   (Observer Feed)    │  │ │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              WebSocket / HTTP Observer Gateway                 │ │
│  │  • Real-time state broadcast                                  │ │
│  │  • Pair directory + metadata                                  │ │
│  │  • Authentication (optional)                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## UE 5.8 as the Driving Engine

### What Replaced What

| Old Concept | UE 5.8 Equivalent |
|-------------|-------------------|
| Cloudflare Durable Object (per pair) | UE Editor or rendered standalone game instance (Dedicated Server optional later) |
| 1Hz tick loop in JS | UE deterministic tick (UNLTSimulationClockSubsystem) |
| WebSocket fan-out | UE WebSocketNetworking plugin + UNLTWebServerSubsystem |
| Babylon.js viewer (frontend) | UE Web/2D canvas viewer (Content/Web/) or external web viewer |
| Cloudflare Workers API | UE HTTP control server |
| Vercel frontend | UE-integrated web viewer or external deployment |

---

## The Pair Model

Each **pair** (Avatar + Aide) runs as an isolated UE simulation:

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAIR INSTANCE (UE)                          │
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

---

## UE Subsystems (C++)

| Subsystem | Role |
|-----------|------|
| `UNLTSimulationSubsystem` | Main tick, mode control (Realtime/Paused/FastForward/Headless/Replay) |
| `UNLTSimulationClockSubsystem` | Authoritative simulation clock |
| `UNLTEventBus` | 256-entry ring buffer, multicast delegates |
| `UNLTDeterministicSeedSubsystem` | Seeded RNG for reproducibility |
| `UNLTPersistenceSubsystem` | Snapshot save/load |
| `UNLTSmartObjectWorldSubsystem` | Smart object availability + world locations |
| `UNLTRoomStateSubsystem` | Room occupancy + cell state |
| `UNLTAgentSpawnerSubsystem` | Mass Entity agent spawning |
| `UNLTPopulationScaler` | LOD 0-3 population management |
| `UNLTAideInteractor` | Coaching interventions |
| `UNLTAvatarInteractor` | Avatar-world interaction |
| `UMLInferenceBridgeSubsystem` | In-engine LLM bridge (spawns Fusion agent, drives ExecuteLLMCommand) |
| `UNLTTrainingManager` | RL training via Learning Agents plugin |
| `UNLTWebServerSubsystem` | WebSocket + HTTP control API (observer feed) |
| `UNLTAtmosphereSubsystem` | Weather, lighting, time of day |
| `ANLTScenarioManagerSubsystem` | Scenario runtime + DataAsset management |

---

## Scaling to 19+ Pairs

| Resource | Old (Cloudflare) | UE 5.8 Equivalent |
|----------|------------------|-------------------|
| Pair instance | Durable Object | UE Editor/rendered game instance; Dedicated Server optional later |
| Tick loop | JS alarm (1Hz) | UE Game Thread (1Hz deterministic) |
| WebSocket | Workers API | UE WebSocketNetworking |
| State | DO storage | UE Mass ECS + save/load snapshots |
| Frontend | Vercel (Next.js) | UE web viewer or external static hosting |

---

## Web Viewer

The Babylon.js viewer (`world-engine-v2/`) connects to the UE simulation via the WebSocket control API:

```
world-engine-v2/ (Babylon.js + Vite + TypeScript)
    │
    │ WebSocket connection
    ▼
UE UNLTWebServerSubsystem (broadcasts state)
```

---

## Design Principles

1. **UE is authoritative** — All simulation state lives in UE. No external database for runtime state.
2. **One instance per pair** — Isolation prevents cross-pair interference.
3. **Deterministic replay** — Seeded RNG + fixed tick rate enables reproducibility.
4. **Headless-first** — Dedicated server runs without rendering; observers connect via WebSocket.
5. **Training-ready** — Learning Agents plugin integrates PPO training loop natively.

---

*Supersedes: Cloudflare Workers + Vercel + Durable Objects architecture (2026-03)*
