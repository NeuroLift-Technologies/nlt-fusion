# NLT Unreal Architecture Assessment

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

**Date:** 2026-09-05 (updated from 2026-09-01)  
**Agent:** Hermes  
**Handoff source:** GPT-5.6 Luna Technical Handoff (2026-09-01)  
**Status:** Validated against current repo state — minor refresh applied  

---

## 1. Repository State Summary

### Unreal Engine Project (`WorldEngine/`)

| Aspect | State |
|--------|-------|
| UE version | 5.8 (`~/Documents/NLT/Engine/`) |
| Project file | `WorldEngine.uproject` (433 bytes, minimal, single module) |
| C++ sources | `Source/WorldEngine/` — **57 files** (was: "empty stub") |
| Build | ✅ `make configure` and `make WorldEngineEditor` both succeed |
|| Content | 40+ assets: Audio, Materials, Kits (SimBody, Workplace), PCG, Scenarios (13 scenario assets across 4 domains), VFX, Web viewer, Levels ||
| Plugins enabled | ModelingToolsEditorMode, ModelContextProtocol, AllToolsets |
| Toolchain | Clang 20.1.8, ISPC 1.24.0, UBA enabled |

### C++ Module Structure (current)

| Subsystem | Files | Purpose |
|-----------|-------|---------|
| **Core** | `NLTEventBus`, `NLTFusionCore`, `NLTSimulationState`, `NLTSimulationStateSubsystem` | Event bus, fusion interfaces, simulation lifecycle |
| **Agents** | `NLTAgentFragments`, `NLTAgentSpawnerSubsystem`, `NLTAgentTrait`, `AvatarCharacter`, `AvatarAIController`, `LTCognitiveStateComponent`, `NLTAideInteractor`, `NLTAvatarInteractor`, `NLTEpisodeManager`, `NLTTrainingManager`, `NLTTrainingEnvironment` | Mass entity fragments, spawning, cognitive state, training |
| **Simulation** | `NLTSimulationClockSubsystem`, `NLTSimulationSubsystem`, `NLTDeterministicSeedSubsystem`, `NLTRoomStateSubsystem`, `NLTAtmosphereSubsystem`, `NLTWorkplaceEnvironmentSubsystem` | Clock, deterministic seeding, room state, atmosphere, environment |
| **World** | `NLTWorldGenerator`, `NLTWorldData`, `NLTEnvironmentVariation`, `NLTSmartObjectWorldSubsystem`, `NLTWorldObjectRenderer` | World generation, smart objects, rendering |
| **Scenarios** | `NLTDemoGameMode`, `UScenarioDataAsset`, `UScenarioLibrary`, `NLTScenarioManagerSubsystem`, `NLTDemoScenarioFragments`, `NLTDemoScenarioProcessors` | Scenario system, data assets, demo game mode |
| **Audio** | `SoundscapeSubsystem`, `SoundscapeDataAsset` | Ambient soundscape |
| **Persistence** | `NLTPersistenceSubsystem` | Snapshots, replay |
| **Roles** | `NLTFusionRoleManager` | Avatar/Aide/Advocate roles |
| **Scaling** | `NLTPopulationScaler` | LOD/population scaling |
| **Web** | `NLTWebServerSubsystem` | WebSocket control interface |
| **Visualizer** | `NLTAgentVisualizer` | Editor visualization |

### Build.cs Dependencies (current)

```
Public: Core, CoreUObject, Engine, InputCore, EnhancedInput, AIModule,
        MassEntity, MassCore, MassSignals, MassEngine, MassCommon,
        MassSimulation, MassMovement, MassCrowd, MassActors,
        MassRepresentation, MassSpawner, MassSmartObjects, MassLOD,
        MassReplication, MassAIBehavior, SmartObjectsModule, GameplayTasks,
        PCG, Json, JsonUtilities, WebSockets, Networking, Sockets,
        Niagara, NiagaraCore, LearningAgents, LearningAgentsTraining,
        Learning, LearningTraining

Private: Projects, NavigationSystem, Navmesh, AudioMixer, AudioMixerCore,
         HTTPServer, HTTP, Sockets
```

### Prior Unreal Attempts

| Project | Status |
|---------|--------|
| `MyProject/` | **Removed** — was UE 5.8 FirstPerson template, no custom code |
|| `MyProject2/` | **Removed** — was UE 5.8 + MassAI/LearningAgents/MassCrowd/MetaHuman plugins ||

### Existing Fusion World Engine (neurolift-ai-fusion)

| Component | Location | Status |
|-----------|----------|--------|
| Fusion runtime | `src/fusion/fusion_engine.py` | Active — Avatar/Aide/Advocate orchestration |
| Avatars | `src/avatars/` | 26-dim ADHD trait profiles, active implementations |
| Aides | `src/aides/` | Coaching strategies (attention, executive function) |
| Advocates | `src/advocates/` | Post-fusion advocate role |
| Core events | `src/core/events.py` | Event bus, signal types |
| World engine (Python) | `src/simulation/environment/world_engine.py` | Active simulation environment |
| Session orchestrator | `src/simulation/session_orchestrator.py` | Active |
| Training | `src/simulation/training/train_nlt.py` | PPO training via Learning Agents |
| Architecture doc | `docs/architecture.md` | Canonical fusion architecture |

---

## 2. Existing Domain Model Inventory

### Fusion Concepts (from docs/architecture.md + source)

| Concept | Current Representation | Notes |
|---------|----------------------|-------|
| Pair | Durable Object (Cloudflare) | 1 Avatar + 1 Aide |
| Avatar | Python class / DO state | 26-dim ADHD trait profile |
| Aide | Python class / DO state | 1:1 with avatar, coaching strategies |
| Advocate | Python class | Helps other pairs |
| Room | Grid rect (24×18 iso) | office, meeting, home, phone, lounge |
|| Scenario | `UScenarioDataAsset` + Python | 13 assets across 4 domains ||
| Need | Derived from stress/cogLoad/focus | `FNLTAgentNeedsFragment` in UE |
| Intent | State machine states | idle, working, drifting, hyperfocus, overwhelmed, coached |
| Tick | 1Hz simulation clock | `NLTSimulationClockSubsystem` |
| Event | `NLTEventBus` + signal types | Full event bus implementation |
| Fusion | Progress metric (0→100%) | Bond + skills threshold |
| Cognitive state | `LTCognitiveStateComponent` | Long-term + short-term state |

### Key Metrics in Fusion

```
focus, cogLoad, stress, burnout, independence, fusionReady, successRate
```

---

## 3. Proposed Unreal Mapping

### 3.1 Fusion → Unreal Concept Mapping

| Fusion Concept | Unreal Representation | Owner | Status |
|----------------|----------------------|-------|--------|
| Agent (Avatar/Aide/Advocate) | `FMassEntity` with fragments | Fusion Runtime | ✅ Fragments defined |
| Agent identity | `FNLTAgentIdentityFragment` | Fusion Runtime | ✅ Implemented |
| Physical location | `FNLTAgentLocationFragment` | Fusion Runtime | ✅ Implemented |
| Need | `FNLTAgentNeedsFragment` | Fusion Runtime | ✅ Implemented |
| Intent | `FNLTAgentIntentFragment` | Fusion Runtime | ✅ Implemented |
| Cognitive state | `FNLTAgentCognitiveFragment` + `LTCognitiveStateComponent` | Fusion Runtime | ✅ Implemented |
| Physical movement | `FMassMovementFragment` + NavMesh | Unreal | ✅ MassMovement dependency |
| World environment | World Partition cells + PCG | Unreal | ✅ PCG + EnvironmentVariation |
| Smart Object | `FSmartObjectDefinition` + slot annotations | Unreal | ✅ MassSmartObjects |
| Simulation tick | `UNLTSimulationSubsystem` | Fusion Runtime | ✅ Implemented |
| Event bus | `UNLTEventBus` | Fusion Runtime | ✅ Implemented |
| Cognition | `ICognitionProvider` → gateway | Fusion Runtime | ✅ NLTFusionCore |
| Governance | `UNLTGovernanceSubsystem` → TOI/OTOI/ASFDK | Fusion Runtime | ⬜ Planned |
| Persistence | `UNLTPersistenceSubsystem` → snapshots | Fusion Runtime | ✅ Implemented |
| Atmosphere | `NLTAtmosphereSubsystem` | Unreal | ✅ Implemented |
| Room state | `NLTRoomStateSubsystem` | Fusion Runtime | ✅ Implemented |
| Population scaling | `NLTPopulationScaler` | Fusion Runtime | ✅ Implemented |
| Training | `NLTTrainingManager` + LearningAgents | Unreal | ✅ Implemented |
| Web control | `NLTWebServerSubsystem` | Unreal | ✅ Implemented |

### 3.2 Architecture Diagram

```
                    FUSION RUNTIME (neurolift-ai-fusion)
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     Cloudflare       Unreal        Analytics
     Workers +       Simulation     Pipeline
     Babylon.js      (nlt-world-engine)
     (existing)         │
          │              │
          └──────────────┼──────────────┘
                         │
                    WebSocket
                         │
                    Human Observer
```

### 3.3 Migration Decision

| Fusion Component | Migration Path |
|-------------------|----------------|
| sim.jsx tick loop | Ported → `UNLTSimulationSubsystem` C++ |
| data.js (avatars, scenarios, rooms) | Ported → UE Data Assets / Data Tables + `UScenarioDataAsset` |
| WebSocket live mode | Keep — Unreal connects via `NLTWebServerSubsystem` |
| world-view.jsx | Keep for web; Unreal replaces 3D rendering |
| Python engine | Remains separate; Fusion Runtime bridges via event bus |

---

## 4. Architectural Conflicts & Risks

### 4.1 Critical: Mass Entity Is the Population Foundation

**Risk:** UE 5.8 Mass Entity + StateTree are not yet production-proven at massive scale. Epic's own demos show ~10k entities comfortably; 50k requires careful LOD management.

**Mitigation:** Follow the handoff's LOD strategy rigorously:
- LOD 0: Full Actor (500 near player)
- LOD 1: Reduced representation (5k nearby)
- LOD 2: Mass simulation (20k regional)
- LOD 3: Abstract simulation (24.5k remote, no physical rep)

### 4.2 Critical: No Actor-Centric Architecture

**Risk:** UE tutorials and most community code assume ACharacter-based AI. Every standard AI Controller, Behavior Tree, and PawnSensing component assumes an Actor exists.

**Mitigation:**
- Use MassEntity as the simulation layer
- Use StateTree for behavior execution (not cognitive intelligence)
- Actors only for LOD 0 embodied agents
- Smart Objects for world affordances

### 4.3 Important: LLM/Model Coupling

**Risk:** Directly calling LLM APIs from the simulation tick will destroy performance and create non-determinism.

**Mitigation:**
- Cognition Gateway interface (`ICognitionProvider`)
- Async cognition — requests don't block ticks
- Deterministic mock provider for testing

### 4.4 Important: Determinism vs Unreal

**Risk:** Unreal's physics, garbage collection, and rendering are inherently non-deterministic. Promising perfect determinism is a trap.

**Mitigation:**
- Use seeded RNG for simulation decisions (`NLTDeterministicSeedSubsystem`)
- Track `RandomSeed + SimulationTick + EventSequence` for reproducibility
- Accept approximate determinism (same seed → same decisions, not same frame times)

### 4.5 Moderate: Linux Build Toolchain

**Risk:** Linux UE development is less documented than Windows. Some plugins (MetaHuman, some ML tools) have limited Linux support.

**Mitigation:** The existing WorldEngine project already builds on Linux (Clang 20.1.8, UBA). We're greenfield — no Windows-specific code needed.

---

## 5. Plugin & Dependency Strategy

### Required UE 5.8 Modules (Build.cs)

```
Core, CoreUObject, Engine, InputCore, EnhancedInput
MassEntity, MassCore, MassSignals, MassEngine, MassCommon,
MassSimulation, MassMovement, MassCrowd, MassActors,
MassRepresentation, MassSpawner, MassSmartObjects, MassLOD,
MassReplication, MassAIBehavior
SmartObjectsModule, GameplayTasks
PCG, PCGGeometryScriptNavigation
NavigationSystem
GameplayTags, EngineSettings
AIModule
Json, JsonUtilities
WebSockets, Networking, Sockets
Niagara, NiagaraCore
LearningAgents, LearningAgentsTraining, Learning, LearningTraining
```

### Project Plugins (already available)

| Plugin | Purpose |
|--------|---------|
| MassAI | Mass + AI integration |
| LearningAgents | RL/training agents |
| HTNPlanner | Hierarchical task network planning |
| MassCrowd | Crowd simulation |
| MetaHuman | High-fidelity characters (LOD 0 only) |
| ModelContextProtocol | MCP server integration |

### Custom Plugin Structure

```
Plugins/NLTFusion/
├── NLTFusionCore/          # Shared interfaces, types
├── NLTSimulation/          # Clock, scheduler, event bus
├── NLTAgents/              # Mass fragments, processors
├── NLTWorld/               # World state, semantic metadata
├── NLTCognition/           # AI gateway, intent handling
├── NLTGovernance/          # TOI/OTOI/ASFDK boundary
├── NLTPersistence/         # Snapshots, replay
├── NLTNetworking/          # Future replication
└── NLTEditor/              # Editor tools, visualization
```

---

## 6. Unresolved Questions

| # | Question | Impact | Recommended Resolution |
|---|----------|--------|----------------------|
| 1 | Should the existing Cloudflare DO remain authoritative, or does Unreal take over simulation? | Architectural fork | DO remains source of truth; Unreal is a high-fidelity visualization + optional simulation node |
| 2 | How many agents must the system actually support? | Scale design | Start with 1k, profile, scale to 10k, defer 50k |
| 3 | Is real-time (30Hz+) simulation required, or is tick-based (1-10Hz) sufficient? | Architecture complexity | Tick-based (1-10Hz) with interpolation for rendering |
| 4 | What is the budget for cloud compute (if headless servers are used)? | Headless architecture | Not yet constrained; profile on consumer hardware first |
| 5 | How does the existing Python engine stub relate to the Unreal implementation? | Duplicate effort | Python remains offline/training; Unreal is runtime. Bridge via event bus |
| 6 | Is there a specific gamefeel/visual quality bar for LOD 0 agents? | Art pipeline | Start with primitive shapes; MetaHuman only for final demo |
| 7 | Should `NLTGovernanceSubsystem` be implemented now or deferred? | Governance compliance | Defer — ASFDK integration pending governance review |

---

## 7. Recommended First Steps

1. **Complete NLTGovernanceSubsystem** — TOI/OTOI/ASFDK boundary (currently planned, not implemented)
2. **Implement StateTree behavior trees** — cognitive intelligence layer on top of Mass
3. **Build semantic world** — one room, Smart Object, navigation (levels exist, need connectivity)
4. **Connect to Fusion** — deterministic mock cognition, real event flow
5. **Profile Mass Entity at scale** — prove LOD strategy with 1-10 agents first

---

## 8. Conclusion

The handoff architecture is **sound and largely validated**. The key insight — Fusion owns semantic reality, Unreal owns physical reality — is correct and the implementation reflects it rigorously.

The existing WorldEngine UE project has evolved from an empty shell into a fully populated C++ module with 11 subsystems, Mass Entity integration, training infrastructure, and web server control. The toolchain works. The prior attempts (MyProject, MyProject2) have been removed.

The fusion repo (neurolift-ai-fusion) has correspondingly matured — Python engine is no longer stubs, with active Avatar/Aide/Advocate/EventBus implementations and a full scenario system.

**The riskiest element remains Mass Entity + StateTree at scale.** We should prove the architecture with 1-10 agents first, then scale aggressively with profiling at every step.

The deliverables from the original handoff are achievable in this order:
1. Architecture Assessment ← (this document, validated)
2. Unreal Architecture ← (in progress — C++ skeleton complete)
3. Domain Mapping ← (mostly mapped — see Section 3.1 status column)
4. Initial Technical Prototype ← (Milestones 1-3)
5. Build Documentation ← (alongside)