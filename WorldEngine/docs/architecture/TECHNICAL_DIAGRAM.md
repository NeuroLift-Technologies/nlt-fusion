# WorldEngine Technical Architecture Diagram

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

**Date:** 2026-09-05  
**Version:** 1.0  
**Status:** Current State Analysis

---

## 1. High-Level System Architecture

```text
+----------------------------------------------------------------------------------+
|                           EXTERNAL SYSTEMS                                       |
|  +------------------+    +------------------+    +--------------------------+    |
|  | Cloudflare       |    | Babylon.js       |    | Python Training Engine   |    |
|  | Workers          |<-->| Viewer           |    | (Offline/RL)             |    |
|  | (Fusion Runtime) |    | (Web UI)         |    |                          |    |
|  +--------+---------+    +------------------+    +------------+-------------+    |
|           |                                                    |                 |
|           | WebSocket (planned)                                | gRPC/Data       |
+-----------+----------------------------------------------------+-----------------+
            |                                                    |
+-----------v----------------------------------------------------v-----------------+
|                        UNREAL ENGINE 5.8 - WORLDENGINE                           |
|  +------------------------------------------------------------------------+      |
|  |                         HTTP Layer (WebSocket planned)                 |      |
|  |                    (NLTWebServerSubsystem:8765)                        |      |
|  |         /api/snapshot  /api/control  /api/scene  /api/status           |      |
|  +--------------------------------+---------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                     CORE SUBSYSTEMS LAYER                                    ||
|  |  +---------------+  +---------------+  +--------------------------------+    ||
|  |  |SimulationClock|  | EventBus      |  | PersistenceSubsystem           |    ||
|  |  |(Deterministic)|  |(Ring Buffer)  |  | (Save/Load Snapshots)          |    ||
|  |  | Tick: int32   |  | Events: 32    |  |                                |    ||
|  |  | Time: double  |  | Broadcast     |  |                                |    ||
|  |  +-------+-------+  +-------+-------+  +--------------------------------+    ||
|  |          |                  |                                         |       ||
|  |  +-------v------------------v-----------------------------------------+|      ||
|  |  |              NLTSimulationSubsystem                                ||      ||
|  |  |  Mode: Realtime|Paused|FastForward|Headless|DeterministicTest     ||      ||
|  |  |  Rate: float (time scale)                                          ||      ||
|  |  |  Tick Management + Lifecycle                                       ||      ||
|  |  +--------------------------------------------------------------------+|      ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                    MASS ENTITY SIMULATION LAYER                              ||
|  |  +----------------------------------------------------------------------+    ||
|  |  |  Agent Fragments (FMassFragment)                                     |    ||
|  |  |  +---------------+ +---------------+ +---------------------------+   |    ||
|  |  |  |IdentityFragment| |LocationFragment| |IntentFragment           |   |    ||
|  |  |  |- AgentId:FName | |- Position      | |- Intent:Enum            |   |    ||
|  |  |  |- Role:Enum     | |- Heading:float | |- Priority:float         |   |    ||
|  |  |  |- ProfileId     | |- Velocity      | |- TargetLocation         |   |    ||
|  |  |  |- TeamId:int32  | |- bIsMoving     | |- TargetTag:FName        |   |    ||
|  |  |  +---------------+ +---------------+ +---------------------------+   |    ||
|  |  |  +---------------+ +---------------+ +---------------------------+   |    ||
|  |  |  |CognitiveFragment| |NeedsFragment  | |BehaviorFragment         |   |    ||
|  |  |  |- Focus:0.65    | |- PrimaryNeed   | |- bIsExecuting:bool      |   |    ||
|  |  |  |- CogLoad:0.20  | |- SecondaryNeed | |- CurrentState:int32     |   |    ||
|  |  |  |- Stress:0.15   | |- Urgency:float | |- CoachingCount:int32    |   |    ||
|  |  |  |- Burnout:0.05  | +---------------+ +---------------------------+   |    ||
|  |  |  |- Independence  |                                                   |    ||
|  |  |  |- FusionReady   |                                                   |    ||
|  |  |  |- SuccessRate   |                                                   |    ||
|  |  |  +---------------+                                                   |    ||
|  |  +----------------------------------------------------------------------+    ||
|  |                                                                            ||
|  |  +----------------------------------------------------------------------+    ||
|  |  |  Mass Processors (FMassProcessor) [TODO: Implement]                  |    ||
|  |  |  - NLTAgentMovementProcessor                                         |    ||
|  |  |  - NLTAgentCognitiveProcessor                                        |    ||
|  |  |  - NLTAgentNeedEvaluator                                             |    ||
|  |  |  - NLTAgentIntentResolver                                            |    ||
|  |  |  - NLTAgentLODProcessor                                              |    ||
|  |  +----------------------------------------------------------------------+    ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                    ACTOR-BASED REPRESENTATION (LOD 0)                        ||
|  |  +---------------+         +-----------------------------------------+      ||
|  |  |AvatarCharacter|         |LTCognitiveStateComponent                |      ||
|  |  |(APawn)        |<--------|- 7 cognitive dimensions                 |      ||
|  |  |- Mesh          |  owns   |- Coaching effects                      |      ||
|  |  |- Animation     |         |- Temporal decay                        |      ||
|  |  +---------------+         +-----------------------------------------+      ||
|  |                                                                            ||
|  |  +---------------+         +----------------+                               ||
|  |  |AvatarAIController|       |NLTAgentSpawner |                               ||
|  |  +---------------+         +----------------+                               ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                      WORLD & ENVIRONMENT LAYER                               ||
|  |  +---------------+  +---------------+  +--------------------------------+    ||
|  |  |WorldGenerator |  |RoomStateSubsys|  |SmartObjectWorldSubsystem       |    ||
|  |  |(PCG-based)    |  |(Environment)  |  |- Affordances                   |    ||
|  |  +---------------+  +---------------+  |- Annotations                   |    ||
|  |                                          +--------------------------------+    ||
|  |  +---------------+  +--------------------------------------------------+  ||
|  |  |WorkplaceEnvSub|  |EnvironmentVariation (Data Assets)                |  ||
|  |  |- Noise levels |  |- Workplace kits (Desk_01 variants)              |  ||
|  |  |- Social density|- Character kits                                    |  ||
|  |  |- Privacy values|- VFX particles                                     |  ||
|  |  +---------------+  +--------------------------------------------------+  ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                      AUDIO & VISUALIZATION                                   ||
|  |  +---------------+         +-----------------------------------------+      ||
|  |  |SoundscapeSubsys|         |NLTAgentVisualizer                       |      ||
|  |  |- DataAssets    |         |- Debug visualization for Mass entities |      ||
|  |  |- Workplace sfx |         |- Fragment inspection                    |      ||
|  |  +---------------+         +-----------------------------------------+      ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                      SCENARIO MANAGEMENT                                     ||
|  |  +---------------+  +---------------+  +--------------------------------+    ||
|  |  |ScenarioManager|  |DemoScenarioProc|  |UScenarioLibrary/Asset        |    ||
|  |  |(Demo mode)    |  |(Processors)   |  |- 12 scenarios                 |    ||
|  |  +---------------+  +---------------+  |- Workplace/Personal/Social    |    ||
|  |                                          |- Academic domains            |    ||
|  |                                          +--------------------------------+    ||
|  +------------------------------------------------------------------------+      |
|                                   |                                              |
|  +-------------------------------v----------------------------------------------+|
|  |                      TRAINING & LEARNING                                     ||
|  |  +---------------+  +---------------+  +--------------------------------+    ||
|  |  |TrainingManager|  |EpisodeManager |  |TrainingEnvironment           |    ||
|  |  |(LA integration)|  |(RL episodes)  |  |(Observation spaces)          |    ||
|  |  +---------------+  +---------------+  +--------------------------------+    ||
|  +------------------------------------------------------------------------+      |
+----------------------------------------------------------------------------------+
```

---

## 2. Data Flow Diagrams

### 2.1 Simulation Tick Flow

```text
+---------------------+
|  SimulationClock    |
|  AdvanceTick()      |
+----------+----------+
           | OnAuthoritativeTick(Tick, WorldTime)
           v
+---------------------+
|NLTSimulationSubsystem|
|  StepTick()         |
+----------+----------+
           | OnSimulationTick(Tick)
           v
+-------------------------------------------------------------+
|                    EVENT BUS                                |
|  RaiseEvent(Tick, AgentId, EventType, Value)               |
|  RingBuffer[256] <- Event                                  |
+----------+-------------------------------------------------+
           |
           +------------------+------------------+-------------+
           v                  v                  v             v
+---------------+ +---------------+ +-------------+ +-------------+
|Mass Processors| | WebServer     | |Persistence  | | Audio/Visual|
|(Cognitive upd)| | (/snapshot)   | | (Snapshot)  | | (Soundscape)|
+---------------+ +---------------+ +-------------+ +-------------+
```

### 2.2 Agent Spawn Flow

```text
+---------------------+
| NLTAgentSpawner     |
| SpawnAgent(Profile) |
+----------+----------+
           |
           v
+-------------------------------------------------------+
|  Mass Spawner System                                  |
|  CreateEntity(Fragments...)                           |
|  - FNLTAgentIdentityFragment                          |
|  - FNLTAgentLocationFragment                          |
|  - FNLTAgentCognitiveFragment                         |
|  - FNLTAgentNeedsFragment                             |
|  - FNLTAgentIntentFragment                            |
|  - FNLTAgentBehaviorFragment                          |
+----------+--------------------------------------------+
           |
           | LOD Decision
           v
    +------+------+
    |             |
+---v---+   +-----v------+
|LOD 0  |   |LOD 1-3     |
|Actor  |   |Mass Only   |
|+ Mass |   |(No Actor)  |
+-------+   +------------+
```

### 2.3 Cognition Gateway Pattern (TO BE IMPLEMENTED)

```text
+-------------------------------------------------------------+
|                    ICognitionProvider                       |
|                    (Interface)                              |
|  + RequestIntent(AgentId, Context) -> Future<Intent>       |
|  + EvaluateNeed(CognitiveState, Environment) -> Need       |
|  + GenerateCoaching(State, Goal) -> Strategy               |
+----------------------+--------------------------------------+
                       |
         +-------------+-------------+
         |             |             |
+--------v----+ +------v------+ +----v------------+
|MockProvider | |LLMProvider  | |RuleProvider     |
|(Determinist.)| |(Async API)  | |(StateTree)      |
+-------------+ +-------------+ +-----------------+
```

---

## 3. Module Dependency Graph

```text
WorldEngine Module
|
+-- Core Subsystems
|   +-- NLTFusionCore (base types, enums, constants)
|   +-- NLTEventBus (event distribution)
|   +-- NLTSimulationSubsystem (lifecycle, mode management)
|   +-- NLTSimulationClockSubsystem (deterministic time)
|
+-- Agent Systems
|   +-- NLTAgentFragments.h (Mass fragments)
|   +-- LTCognitiveStateComponent (Actor-based cognition)
|   +-- AvatarCharacter (LOD 0 pawn)
|   +-- AvatarAIController
|   +-- NLTAgentSpawnerSubsystem
|   +-- NLTTrainingManager
|   +-- NLTEpisodeManager
|   +-- NLTAvatarInteractor
|   +-- NLTAideInteractor
|
+-- Simulation Systems
|   +-- NLTDeterministicSeedSubsystem
|   +-- NLTRoomStateSubsystem
|   +-- NLTWorkplaceEnvironmentSubsystem
|
+-- World Systems
|   +-- NLTWorldGenerator (PCG)
|   +-- NLTEnvironmentVariation
|   +-- NLTSmartObjectWorldSubsystem
|
+-- Persistence
|   +-- NLTPersistenceSubsystem
|
+-- Networking
|   +-- NLTWebServerSubsystem (HTTP:8765)
|
+-- Audio
|   +-- SoundscapeSubsystem
|   +-- SoundscapeDataAsset
|
+-- Scenarios
|   +-- NLTScenarioManagerSubsystem
|   +-- NLTDemoScenarioProcessors
|   +-- UScenarioLibrary
|   +-- UScenarioDataAsset
|   +-- NLTDemoGameMode
|
+-- Scaling
|   +-- NLTPopulationScaler
|
+-- Roles
    +-- NLTFusionRoleManager
```

---

## 4. Missing Critical Components (Gap Analysis)

```text
+---------------------------------+----------------------------------+
|  CURRENT STATE                  |  REQUIRED                        |
+---------------------------------+----------------------------------+
|  [OK] Mass Fragments defined    |  [MISSING] Mass Processors       |
|  [OK] Event bus implemented     |  [MISSING] Cognition Provider    |
|  [OK] Simulation clock          |  [MISSING] Governance Subsystem  |
|  [OK] Persistence stub          |  [MISSING] WebSocket Client      |
|  [OK] HTTP Server               |  [MISSING] LOD Manager           |
|  [OK] Control (loopback)        |  [MISSING] Remote auth token     |
|  [OK] Agent spawner             |  [MISSING] Smart Object annot.   |
|  [OK] Scenario data assets      |  [MISSING] Need->Intent mapping  |
|  [OK] Cognitive component       |  [MISSING] Coaching system       |
|                                 |  [MISSING] Determinism validation|
+---------------------------------+----------------------------------+
```

---

## 5. Build Configuration Issues

```text
Current Build.cs Dependencies:
+-- MassEntity modules (13 modules) [OK]
+-- LearningAgents modules (4 modules) [OK]
+-- Audio/Niagara [OK]
+-- HTTP/WebSocket [OK]
+-- PCG [OK]
|
+-- PROBLEMS:
    +-- No StateTree module explicitly listed
    +-- No SmartObjectsModule in Public deps
    +-- PlayFabParty: Win64 only (Linux break)
    +-- MetaHumanCoreML: Mac/iOS only
    +-- Hardcoded plugin paths in .uproject
```

---

## 6. Recommended Plugin Restructuring

```text
Plugins/
+-- NLTFusionCore/          # Shared interfaces, fragments, enums
+-- NLTSimulation/          # Clock, scheduler, event bus
+-- NLTAgents/              # Mass processors, spawner, cognition
+-- NLTWorld/               # World gen, semantic metadata, smart objects
+-- NLTGovernance/          # TOI/OTOI/ASFDK boundaries [MISSING]
+-- NLTPersistence/         # Snapshots, replay, serialization
+-- NLTNetworking/          # WebSocket client, replication [MISSING]
+-- NLTEditor/              # Editor tools, fragment visualizers
+-- NLTScenarios/           # Scenario data, processors, game modes
```

---

## 7. Key Metrics and Constants

```cpp
namespace NLTFusion {
    constexpr float NeedThreshold = 0.7f;
    constexpr float CognitiveLoadMax = 1.0f;
    constexpr float StressMax = 1.0f;
    constexpr float FocusMax = 1.0f;
    constexpr float BurnoutMax = 1.0f;
    constexpr float IndependenceMax = 1.0f;
    constexpr float FusionReadyMax = 1.0f;
    constexpr float SuccessRateMax = 1.0f;
}

Event Bus: RingBuffer[256], 32 event types
Simulation Clock: FixedTimestepSeconds = 1/60 (default)
Web Server: Port 8765
LOD Targets: 500 (LOD0), 5k (LOD1), 20k (LOD2), 24.5k (LOD3)
```

---

## 8. Integration Points

```text
+--------------------------------------------------------------+
|                     FUSION RUNTIME                           |
|              (Cloudflare Durable Objects)                    |
+----------------------+---------------------------------------+
                       | WebSocket (planned)
                       v
+--------------------------------------------------------------+
|                  UNREAL WORLDENGINE                          |
|  +--------------------------------------------------------+  |
|  |  NLTWebServerSubsystem (HTTP)                          |  |
|  |  GET /api/snapshot -> Mass entity state                |  |
|  |  GET /api/status   -> Simulation metrics               |  |
|  |  GET /api/scene    -> World description                |  |
|  |  POST /api/control -> Sim commands (loopback-only)     |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  [TODO: WebSocket Client for bidirectional sync]             |
+--------------------------------------------------------------+
```

---

## 9. Thread Safety Model

```text
Main Game Thread:
+-- Simulation tick execution
+-- Mass processor updates
+-- Actor spawning/despawning
+-- Rendering (LOD 0 agents)

HTTP Server Thread (NLTWebServerSubsystem):
+-- Request handling
+-- JSON serialization
+-- Event buffer access (FCriticalSection protected)

[TODO: Define worker thread strategy for cognition requests]
```

---

## 10. State Machine Overview

### Agent Intent States

```text
None -> Idle -> [FindQuietPlace|Work|Socialize|Rest|Study|MoveToLocation|Interact]
                        |
             [Coached|Overwhelmed|Drifting|Hyperfocus]
```

### Simulation Modes

```text
Realtime | Paused | FastForward | SlowMotion | Headless | Replay | DeterministicTest
```

---

## 11. File Inventory Summary

| Category | Files | Status |
|----------|-------|--------|
| Core Subsystems | 6 headers, 4 impl | Partial |
| Agent Systems | 11 headers, 8 impl | Partial |
| Simulation | 5 headers, 4 impl | Partial |
| World Systems | 4 headers, 3 impl | Partial |
| Persistence | 1 header, 1 impl | Stub |
| Networking | 1 header, 1 impl | HTTP only |
| Audio | 2 headers, 2 impl | Complete |
| Scenarios | 5 headers, 4 impl | Demo only |
| **Total** | **~74 files** | **~60% complete** |

---

**End of Technical Diagram**
