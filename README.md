# NLT World Engine — UE 5.8 Authoritative Simulation

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

NeuroLift Technologies Simulation Environment — the deterministic runtime where AI Avatars (with ADHD traits) and AI Aides live inside. This repo owns the **physical simulation layer** and is the **authoritative simulation training environment** for the Avatar-Aide-Advocate system: world state, space, time, objects, needs, NPCs, scenario instantiation, and the Unreal Engine 5.8 authoritative simulation. Avatar/Aide/Advocate *intelligence* — ADHD trait modeling, coaching expertise, training loop, fusion — lives in [`neurolift-ai-fusion`](https://github.com/NeuroLift-Technologies/neurolift-ai-fusion) and connects through the agent interface.

> **Architecture docs:** [`WorldEngine/docs/architecture/`](WorldEngine/docs/architecture/) is the authoritative UE-side documentation — [`TECHNICAL_DIAGRAM.md`](WorldEngine/docs/architecture/TECHNICAL_DIAGRAM.md), [`unreal-simulation-architecture.md`](WorldEngine/docs/architecture/unreal-simulation-architecture.md), [`fusion-unreal-domain-mapping.md`](WorldEngine/docs/architecture/fusion-unreal-domain-mapping.md). Core principle: **Fusion owns semantic reality; Unreal owns physical reality.**

## Architecture

```text
Fusion Runtime (neurolift-ai-fusion)
  ├── Avatar/Aide/Advocate intelligence
  ├── ADHD trait modeling (26-dim)
  ├── Coaching strategies
  ├── Training (PPO via Learning Agents)
  └── Fusion + Advocate logic
        │
        │  WebSocket / HTTP API
        ▼
NLT World Engine (this repo)
  ├── UE 5.8 C++ simulation (WorldEngine/)
  │   ├── Mass Entity population
  │   ├── StateTree behavior
  │   ├── Learning Agents RL training
  │   ├── Smart Objects + NavMesh
  │   ├── Deterministic tick (1Hz)
  │   ├── EventBus (256-entry ring buffer)
  │   ├── UMLInferenceBridgeSubsystem (in-engine LLM → ExecuteLLMCommand)
  │   └── NLTGovernanceSubsystem (ASFDK-C++ TOI/OTOI boundary)
  ├── Babylon.js v2 viewer (world-engine-v2/)
  └── Python ECS engine (world-engine/) — reference only
```

## Quick Start — Unreal Engine 5.8

**Prerequisites:** UE 5.8 at `~/Documents/NLT/Engine/`, Linux (Clang 20.1.8)

**Primary path — rendered Unreal Editor or standalone game:**

```bash
cd WorldEngine
make configure          # Generate project files
make WorldEngineEditor  # Build editor (~85s)
```

Open `WorldEngine.uproject` in the UE Editor, select the training scenario, and run the configured training flow in Play In Editor or a rendered standalone game. The human watches the same UE world in which agents simulate and learn.

**Optional headless automation:**

```bash
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor-Cmd \
  -project=WorldEngine.uproject \
  -nullrhi -game -unattended -log \
  -MAP=/Game/Scenarios/Levels/Workplace_Level.Workplace_Level
```

The headless command is for automation, CI, or later infrastructure. It is not required for the primary training path. A future `WorldEngineServer` target is likewise optional.

## Project Structure

```text
nlt-world-engine/
├── WorldEngine/
│   ├── WorldEngine.uproject      # Project file
│   ├── Source/WorldEngine/       # C++ module (45 .cpp files, 16 subsystems)
│   │   ├── Public/               # Headers
│   │   │   ├── Agents/           # Fragments, spawner, AI controller, character
│   │   │   ├── Core/             # EventBus, FusionCore, SimulationState
│   │   │   ├── Simulation/       # Clock, deterministic seed, room state, atmosphere
│   │   │   ├── Scenarios/        # Data assets, scenario manager, demo game mode
│   │   │   ├── Audio/            # Soundscape subsystem
│   │   │   ├── Persistence/      # Save/load snapshots
│   │   │   ├── World/            # World generator, smart objects, environment
│   │   │   ├── Roles/            # Fusion role manager
│   │   │   ├── Scaling/          # Population LOD scaler
│   │   │   └── Web/              # WebSocket control server
│   │   └── Private/              # Implementation
│   ├── Content/                  # UE assets
│   │   ├── Scenarios/            # 4 level maps + 16 scenario DataAssets
│   │   ├── Environment/Materials/ 12 shared materials
│   │   ├── Audio/Soundscape/      4 ambient WAV beds
│   │   ├── Kits/SimBody/          SimBody skeletal mesh
│   │   ├── Kits/Workplace/        Blender-exported desk kits (3 states)
│   │   ├── PCG/                   Environment scatter
│   │   └── Web/                   2D canvas viewer (index.html)
│   ├── Scripts/                  # Python automation scripts (QA, VFX, scenarios)
│   ├── Skills/                   # Skill definitions
│   ├── Config/                   # DefaultEngine/Game/Input.ini
│   └── docs/architecture/        # Architecture documentation
│       ├── unreal-architecture-assessment.md
│       ├── unreal-simulation-architecture.md
│       ├── fusion-unreal-domain-mapping.md
│       ├── build-documentation.md
│       └── TECHNICAL_DIAGRAM.md
├── _archive/                     # Prototype directories (reference only)
│   ├── world-engine/             # Original Python ECS engine + React prototype
│   ├── world-engine-v2/          # Babylon.js viewer (superseded)
│   ├── world-engine-3d/          # Early Three.js experiment
│   ├── openworld-engine/         # Open-world exploration variant
│   └── studio/                   # Claude Design shell (superseded)
├── ARCHITECTURE.md               # UE 5.8 architecture
├── DEPLOYMENT.md                 # UE 5.8 build + deployment
└── .github/workflows/            # CI (governance + v2 build)
```

## Key Subsystems (C++)

| Subsystem | Purpose |
|-----------|---------|
| `UNLTSimulationSubsystem` | Main tick, mode control (Realtime/Paused/FastForward/SlowMotion/Headless/Replay) |
| `UNLTSimulationClockSubsystem` | Authoritative simulation clock |
| `UNLTEventBus` | 256-entry ring buffer, multicast delegates, 28 event types |
| `UNLTDeterministicSeedSubsystem` | Seeded RNG for reproducibility |
| `UNLTPersistenceSubsystem` | Snapshot save/load |
| `UNLTSmartObjectWorldSubsystem` | Smart object availability + world locations |
| `UNLTRoomStateSubsystem` | Room occupancy + cell state |
| `UNLTAgentSpawnerSubsystem` | Mass Entity agent spawning |
| `UNLTPopulationScaler` | LOD 0-3 population management |
| `UNLTAideInteractor` | Coaching interventions |
| `UNLTAvatarInteractor` | Avatar-world interaction |
| `UMLInferenceBridgeSubsystem` | In-engine LLM bridge — spawns `llm_avatar_agent.py`, drives `ExecuteLLMCommand` over loopback TCP (A1) |
| `UNLTTrainingManager` | RL training via Learning Agents plugin |
| `UNLTWebServerSubsystem` | WebSocket + HTTP control API |
| `UNLTAtmosphereSubsystem` | Weather, lighting, time of day |
| `ANLTScenarioManagerSubsystem` | Scenario runtime + DataAsset management |

## UE Plugins Enabled

| Plugin | Purpose |
|--------|---------|
| MassEntity, MassCore, MassSignals, MassEngine, MassCommon | Mass ECS |
| MassSimulation, MassMovement, MassCrowd, MassActors | Mass simulation |
| MassRepresentation, MassSpawner, MassSmartObjects, MassLOD, MassReplication, MassAIBehavior | Mass subsystems |
| LearningAgents, LearningAgentsTraining, Learning, LearningTraining | RL training (PPO) |
| StateTree | Behavior execution |
| SmartObjects | Interactive objects |
| PCG | Procedural content generation |
| Niagara, NiagaraCore | VFX |
| ModelContextProtocol | MCP server |
| ModelingToolsEditorMode, AllToolsets | Editor tools |
| WebSocketNetworking | WebSocket support |
| NLTGovernanceSubsystem | ASFDK-C++ TOI/OTOI governance boundary (capability ≠ authority) |
| MetaHumanGenerator, MetaHumanCharacter, MetaHumanCoreML, MetaHumanLiveLink | MetaHuman (optional) |

## Character & Mesh

- `BP_AvatarCharacter` — Blueprint character + SimBody skeletal mesh
- `SM_SimBody_Base` — low-poly humanoid (~179.5cm, Nanite off)
- `AAvatarAIController` — navmesh-based wandering, RL training foundation

## Web Viewer

```bash
cd world-engine-v2
npm install
npm run dev      # http://localhost:5173
npm run build    # production
```

## Python ECS Engine (Reference)

The Python engine in `world-engine/` is a **reference implementation**, not the authoritative simulation. It's retained for data pipeline use and the Babylon.js viewer connection.

```bash
cd world-engine
pip install -r requirements.txt
python3 demo.py              # Watch an agent live a full day
python3 -m unittest discover tests  # Run tests
```

## CI

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| `validate-governance.yml` | push/PR to any branch | Governance validation |
| `world-engine-v2-build.yml` | push/PR touching `world-engine-v2/` | TypeScript + Vite build |

## Documentation

| Document | Location |
|----------|----------|
| Architecture Assessment | `WorldEngine/docs/architecture/unreal-architecture-assessment.md` |
| Unreal Simulation Architecture | `WorldEngine/docs/architecture/unreal-simulation-architecture.md` |
| Fusion → Unreal Domain Mapping | `WorldEngine/docs/architecture/fusion-unreal-domain-mapping.md` |
| Build Documentation | `WorldEngine/docs/architecture/build-documentation.md` |
| Technical Diagram | `WorldEngine/docs/architecture/TECHNICAL_DIAGRAM.md` |
| Demo Setup | `WorldEngine/docs/DEMO_SETUP.md` |
| Scenario Plan | `WorldEngine/docs/SCENARIO_PLAN.md` |
| Web Viewer | `WorldEngine/docs/WEB_VIEWER.md` |
| Architecture Overview | `ARCHITECTURE.md` |
| Deployment | `DEPLOYMENT.md` |
| NLT OTOI | `NLT-DEV-OTOI.md` |
| Onboarding | `ONBOARDING.md` |
| Active Threads | `docs/active-threads.md` |

## License

License TBD — Open Source. See `LICENSE` for details when available.

---

## Contact

**NeuroLift Technologies**

- Website: https://neurolifttech.com
- Founder: Joshua W. Dorsey — joshua.dorsey@neurolifttech.com

## Remaining Work

The following work remains after the deterministic verification, replay-integrity, visual-LOD, and StateTree/Fusion reference foundations merged through PRs #55–#57.

### Product and runtime implementation

- **Native Mass StateTree runtime integration:** The current behavior path is a deterministic custom C++ Mass processor plus StateTree task/condition references. Native `UMassStateTreeProcessor` execution and authored `.sttree` behavior assets remain follow-up work.
- **Fusion ↔ Unreal WebSocket protocol:** The UE WebSocket listener now validates versioned envelopes, requires action type/target, rejects malformed JSON, and dispatches authoritative work on the game thread. End-to-end Python↔UE conformance, session/agent correlation, authorization, acknowledgements, and duplicate/timeout handling remain unverified.
- **Replay action execution:** Define approved action semantics and execute recorded actions against the authoritative simulation. Compare intermediate state/event hashes and the final state/RNG state across a multi-tick replay. The current replay implementation verifies record integrity and observed final state but does not execute action payloads.
- **Rendered LOD transition validation:** Validate Mass and actor-resident transitions in a representative rendered UE scene, including hysteresis, viewer fallback, mesh/HISM/fallback representation changes, and hidden transitions. The shared visual-only policy and integration are implemented; live-scene evidence is still pending.
- **Broader UE Automation coverage:** Add integration tests for native StateTree behavior, WebSocket protocol handling, replay action execution, rendered LOD transitions, and headless guards. The existing `AutomationTest` suite passes 7/7 `NLT.Simulation` and 4/4 `NLT.VisualLOD.Policy` tests; the Python Fusion reference suite passes 9 tests but does not prove UE interoperability.

### Validation and CI

- **UE build validation in CI:** Select a UE-capable runner, add `WorldEngineEditor` build validation, run the NLT Automation suites, and publish logs/test reports. Current CI validates governance and the Babylon.js viewer only.
- **Optional headless infrastructure:** Validate `WorldEngineServer` and headless runtime behavior on a UE distribution that supports Server targets. This is optional later infrastructure, not a prerequisite for the primary rendered UE Editor/standalone-game training path.

### Completed foundations

- Versioned deterministic state hashing and RNG reset/serialization metadata.
- Versioned JSON replay records with integrity, tamper, serialization, and observed-final-state checks.
- Shared visual-only LOD policy for Mass HISM and actor residents, with 4/4 policy tests passing.
- Deterministic C++ Mass behavior processor, StateTree schema/task/condition references, and an expanded Python Fusion protocol/replay reference.
- Dedicated Server target/configuration and headless runtime guards are present, but the optional Server target has not been compiled on a server-capable UE distribution.
