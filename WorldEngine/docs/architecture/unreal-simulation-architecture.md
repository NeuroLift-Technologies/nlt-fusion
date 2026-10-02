# NLT Unreal Simulation Architecture

**Date:** 2026-09-05  
**Agent:** Hermes  
**Handoff source:** GPT-5.6 Luna Technical Handoff (2026-09-01)  
**Supersedes:** Section 3 of `unreal-architecture-assessment.md`  

---

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

The simulation has two spatial layers:
- **Indoor scenario levels** — Workplace, Personal, Social, Academic (the original 4 maps)
- **Open-world outdoor layer** — procedural terrain, water, sky, vegetation, and settlement with building portals that stream in the indoor levels (see `docs/procedural-openworld.md` and `docs/OPENWORLD-SETUP.md`)

---

## 1. Module Boundaries

The NLT Unreal plugin is a single C++ module (`WorldEngine`) with internal subsystem separation. No Blueprint-only actors exist — all logic is C++ subsystems + Mass fragments/processors.

```
WorldEngine (UE Module)
│
├── Core/                    # Interfaces, types, enums
│   ├── NLTFusionCore.h      # AgentRole, SimulationMode, AgentIntent, AgentNeed enums
│   ├── NLTEventBus.h        # ENLTSimulationEventType, FNLTSimulationEvent
│   ├── NLTSimulationState.h # Simulation state struct
│   └── NLTSimulationStateSubsystem.h  # State observation/query
│
├── Agents/                  # Mass entity fragments + spawner
│   ├── NLTAgentFragments.h  # Identity, Location, Intent, Cognitive, Needs, Behavior
│   ├── NLTAgentSpawnerSubsystem.h
│   ├── AvatarCharacter.h    # LOD 0 embodied agent
│   ├── AvatarAIController.h # AI controller for embodied agents
│   ├── LTCognitiveStateComponent.h  # Long/short-term cognitive state
│   ├── NLTAideInteractor.h  # Aide↔Avatar interaction
│   ├── NLTAvatarInteractor.h # Avatar↔world interaction
│   ├── NLTEpisodeManager.h  # Training episode lifecycle
│   ├── NLTTrainingManager.h # RL training orchestration
│   ├── NLTTrainingEnvironment.h # Gym-style training env
│   ├── NLTAgentTrait.h      # Trait definitions
│   └── NLTAgentTrait.cpp    # Trait implementation
│
├── Simulation/              # Tick, clock, deterministic seed, rooms, atmosphere
│   ├── NLTSimulationSubsystem.h      # Main tick, mode control
│   ├── NLTSimulationClockSubsystem.h # Simulation time
│   ├── NLTDeterministicSeedSubsystem.h # Seeded RNG
│   ├── NLTRoomStateSubsystem.h       # Room occupancy/state
│   ├── NLTAtmosphereSubsystem.h      # Weather/lighting
│   └── NLTWorkplaceEnvironmentSubsystem.h # Workplace-specific env
│
├── World/                   # World generation, smart objects, rendering
│   ├── NLTWorldGenerator.h
│   ├── NLTWorldData.h
│   ├── NLTEnvironmentVariation.h
│   ├── NLTSmartObjectWorldSubsystem.h
│   └── NLTWorldObjectRenderer.h
│
├── Scenarios/               # Scenario data + demo game mode
│   ├── NLTDemoGameMode.h
│   ├── UScenarioDataAsset.h
│   ├── UScenarioLibrary.h
│   ├── NLTScenarioManagerSubsystem.h
│   ├── NLTDemoScenarioFragments.h
│   └── NLTDemoScenarioProcessors.h
│
├── Audio/
│   ├── SoundscapeSubsystem.h
│   └── SoundscapeDataAsset.h
│
├── Persistence/             # Save/load snapshots
│   └── NLTPersistenceSubsystem.h
│
├── Roles/
│   └── NLTFusionRoleManager.h
│
├── Scaling/
│   └── NLTPopulationScaler.h
│
└── Web/                     # WebSocket control server
    └── NLTWebServerSubsystem.h
```

---

## 2. Runtime Subsystems

All subsystems extend `UWorldSubsystem` — lifecycle bound to the world, auto-created on map load, destroyed on unload.

| Subsystem | Lifecycle | Threading |
|-----------|-----------|-----------|
| `UNLTSimulationSubsystem` | Initialize → StartSimulation → Tick → Stop → Deinitialize | Game thread |
| `UNLTSimulationClockSubsystem` | Tied to simulation tick | Game thread |
| `UNLTDeterministicSeedSubsystem` | Seed on simulation start | Game thread |
| `UNLTEventBus` | Initialize → ring buffer ready | Game thread (raise from any) |
| `UNLTPersistenceSubsystem` | On-demand save/load | Game thread |
| `UNLTSmartObjectWorldSubsystem` | Initialize → populate from world data | Game thread |
| `UNLTAtmosphereSubsystem` | Tied to world | Game thread |
| `UNLTRoomStateSubsystem` | Initialize → sync with world cells | Game thread |
| `UNLTWebServerSubsystem` | Initialize → start HTTP/WebSocket | Own thread |
| `UNLTAgentSpawnerSubsystem` | On simulation start | Game thread |
| `UNLTPopulationScaler` | On simulation start, recalculate on LOD change | Game thread |

### Simulation Tick Flow

```
1. NLTSimulationSubsystem::StartSimulation()
   ├── Seed deterministic RNG
   ├── Reset tick counter = 0
   ├── Set Mode = ESimulationMode::Realtime
   └── Broadcast OnSimulationModeChanged

2. Each tick (1Hz default, configurable rate)
   ├── NLTSimulationClockSubsystem → advance SimulationTimeMinutes
   ├── NLTDeterministicSeedSubsystem → reseed if deterministic mode
   ├── NLTSimulationSubsystem::StepTick()
   │   ├── RaiseEvent(Tick) via EventBus
   │   ├── NLTRoomStateSubsystem → update room occupancy
   │   ├── NLTAgentSpawnerSubsystem → manage entity lifecycle
   │   ├── NLTPopulationScaler → adjust LOD representations
   │   ├── NLTSmartObjectWorldSubsystem → update availability
   │   ├── NLTAideInteractor → run coaching interventions
   │   ├── NLTAvatarInteractor → process avatar intents
   │   ├── NLTEpisodeManager → track training episodes
   │   └── NLTPersistenceSubsystem → auto-snapshot if enabled
   ├── Increment SimulationTick
   └── Broadcast OnSimulationTick(tick)

3. StopSimulation()
   ├── Set bRunning = false
   └── Broadcast final state
```

---

## 3. Data Flow

### 3.1 Fusion → Unreal (semantic → physical)

```
Fusion Runtime (neurolift-ai-fusion Python)
    │
    │  WebSocket / HTTP API
    │  (NLTWebServerSubsystem)
    ▼
UNLTSimulationSubsystem.SetMode() / StepTick()
    │
    │  EventBus (internal)
    ▼
FNLTSimulationEvent → TArray ring buffer (256 events)
    │
    │  Fragments written per tick
    ▼
FMassEntity → FNLTAgent*Fragment updates
    │
    │  Mass processors → FMassMovementFragment
    ▼
Physical representation (Actor / Mass representation)
```

### 3.2 Unreal → Fusion (physical → semantic observation)

```
World Partition cell change
    │
    ▼
NLTRoomStateSubsystem → room state update
    │
    ▼
EventBus.RaiseEvent(EnvRoomStateChanged)
    │
    ▼
WebSocket → Fusion Runtime observation
```

### 3.3 Event Bus (internal)

The `NLTEventBus` is a **ring buffer** of 256 events with broadcast delegates. Two delegate channels:

- `OnSimulationEvent` — all agent + simulation events
- `OnEnvironmentEvent` — environment-only events (weather, lighting, time of day, room state)

Event types (28 total): Tick, AgentCreated/Destroyed/Spawned/Despawned, AgentMoved, NeedChanged, IntentChanged, EmotionalShift, FusionStart/Complete/Fail, StressSpike, BurnoutDetected, Breakthrough, Distraction, SocialInteraction, TaskComplete, SimulationReset, ModeChanged, plus 7 environment events.

---

## 4. Ownership Boundaries

| Domain | Owner | Rationale |
|--------|-------|-----------|
| Agent identity, traits, needs, intent, cognitive state | Fusion (semantic) → Unreal fragments (physical) | Fusion is source of truth; Unreal mirrors for simulation |
| Position, rotation, velocity, navigation | Unreal | Mass Movement + NavMesh |
| Room occupancy, world cell state | Unreal (`NLTRoomStateSubsystem`) | Spatial, computed from Mass entity locations |
| Scenario definition & progression | Fusion (data) + Unreal (`UScenarioDataAsset`) | Hybrid — Fusion defines, Unreal executes |
| Coaching interventions | Fusion (logic) → Unreal (execution) | AideInteractor runs coaching on tick |
| Training episodes | Unreal (`NLTEpisodeManager` + `NLTTrainingManager`) | RL training is Unreal-side |
| Persistence | Unreal (`NLTPersistenceSubsystem`) | Snapshot/load — can bridge to Fusion DO |
| Governance | Planned (`NLTGovernanceSubsystem`) | TOI/OTOI/ASFDK boundary — not yet implemented |
| WebSocket control | Unreal (`NLTWebServerSubsystem`) | Entry point for Fusion commands |

### Critical Rule

> **Unreal does not write agent cognitive state during production/runtime.** Cognitive state changes flow through the EventBus and are raised by Fusion-originated commands or by subsystems that observe physical state (e.g., `StressSpike` when collision/overcrowding detected). The `FNLTAgentCognitiveFragment` is a mirror — the source of truth lives in Fusion. During PPO training, `LTCognitiveStateComponent::TickCognitiveDecay()` updates local derived state for reward computation, but these are training-time dynamics, not runtime state changes.

---

## 5. Lifecycle

### Simulation Lifecycle

```
World Load
  │
  ├── Subsystems Initialize (all UWorldSubsystem auto-created)
  │   ├── NLTFusionCore → register enums, log version
  │   ├── NLTEventBus → ring buffer ready
  │   ├── NLTSimulationClockSubsystem → time = 0
  │   ├── NLTDeterministicSeedSubsystem → seed = 12345
  │   ├── NLTSmartObjectWorldSubsystem → scan world for Smart Objects
  │   ├── NLTRoomStateSubsystem → partition world into cells
  │   └── NLTWebServerSubsystem → start HTTP/WebSocket
  │
  ├── User calls StartSimulation()
  │   ├── Mode = Realtime
  │   ├── Tick loop begins (1Hz default)
  │   └── OnSimulationTick broadcast each tick
  │
  ├── User calls PauseSimulation()
  │   └── bPaused = true, tick suspended
  │
  ├── User calls StepTick() (single step while paused)
  │   └── One tick, no broadcast
  │
  ├── User calls StopSimulation()
  │   ├── bRunning = false
  │   └── Final state snapshot
  │
  └── World Unload
      └── All subsystems Deinitialize
```

### Agent Lifecycle

```
AgentSpawner → Create FMassEntity
  │
  ├── Add fragments: Identity, Location, Intent, Cognitive, Needs, Behavior
  ├── Raise Event(AgentCreated)
  │
  ├── Agent active (tick loop processes fragments)
  │   ├── Intent changes → IntentChanged event
  │   ├── Need changes → NeedChanged event
  │   ├── Cognitive shift → EmotionalShift event
  │   └── Movement → AgentMoved event
  │
  ├── Agent destroyed → Fragments removed, Event(AgentDestroyed)
  │
  └── Spawned/Despawned for LOD transitions
      ├── LOD 0: Full Actor with AvatarCharacter
      ├── LOD 1: Reduced representation (simplified mesh)
      ├── LOD 2: Mass simulation only (no visual)
      └── LOD 3: Abstract (fragment only, no movement)
```

---

## 6. Threading Considerations

All subsystems run on the **game thread**. The web server (`NLTWebServerSubsystem`) runs on its own thread for incoming HTTP/WebSocket connections but delegates state reads/writes to the game thread via async tasks.

**Mass Entity processors** write fragment changes in parallel by design — individual processors run concurrently across Mass's execution graph. Reads (observations exported to Fusion) are batched to the game thread via the EventBus to avoid race conditions.

**Deterministic seed** (`NLTDeterministicSeedSubsystem`) ensures the same seed + tick + event sequence produces identical simulation results regardless of frame time variance.

---

## 7. Persistence Model

`NLTPersistenceSubsystem` provides snapshot/load on `FString SlotName`:

```cpp
USaveGame → FNLTSavedGame
├── SlotName
├── SimulationTick
├── WorldTime
├── ActiveEvents[]      // Current event IDs
├── TimeOfDay
└── RandomSeed          // For deterministic replay
```

Snapshots are **not** full world state — they're metadata + event history. Full world reconstruction requires replaying from the EventBus ring buffer or an external event log.

**Replay mode:** `ESimulationMode::Replay` replays saved event sequences deterministically using the stored seed.

---

## 8. Event Model

### Internal Events (EventBus ring buffer)

| Category | Events |
|----------|--------|
| **Tick** | Tick, ModeChanged, SimulationReset |
| **Agent lifecycle** | AgentCreated, AgentDestroyed, AgentSpawned, AgentDespawned, AgentMoved |
| **Cognitive** | NeedChanged, IntentChanged, EmotionalShift, StressSpike, BurnoutDetected, Breakthrough, Distraction |
| **Fusion** | FusionStart, FusionComplete, FusionFail |
| **Social** | SocialInteraction, TaskComplete |
| **Environment** | EnvWeatherChanged, EnvLightingChanged, EnvTimeOfDayChanged, EnvRoomStateChanged, EnvAmbientSound, EnvParticleEffect, EnvFogChanged, EnvWindChanged |

### External Events (WebSocket → Fusion)

Unreal sends event summaries to Fusion via WebSocket. Fusion can send commands back:
- `SetMode(mode)` — pause, resume, step, fast-forward
- `SpawnAgent(identity)` — create agent with specified profile
- `SetAgentState(agentId, state)` — override cognitive state (governance-gated)
- `QueryState(filter)` — request snapshot of specific agents/rooms

### External Events (Fusion → Unreal via WebSocket)

- `TickCommand` — advance simulation N ticks
- `ResetCommand` — reset simulation to tick 0
- `SaveCommand` — trigger persistence snapshot
- `LoadCommand(slotName)` — restore from snapshot

---

## 9. Open Items

| # | Item | Impact | Status |
|---|------|--------|--------|
| 1 | `NLTGovernanceSubsystem` — TOI/OTOI/ASFDK boundary | Governance compliance | ⬜ Not started |
| 2 | StateTree behavior trees on Mass entities | Cognitive intelligence execution | ⬜ Not started |
| 3 | Cross-level navigation (rooms → world cells) | Spatial coherence | ⬜ Partial — levels exist, not connected |
| 4 | Full Fusion ↔ Unreal WebSocket protocol | Bidirectional event flow | ⬜ In progress |
| 5 | Replay mode deterministic verification | Reproducibility guarantee | ⬜ Not started |
| 6 | LOD transition logic for avatar actors | Scale from 1 to 10k | ⬜ Partial — PopulationScaler exists |
| 7 | Headless server build configuration | Cloud deployment | ⬜ Not started |