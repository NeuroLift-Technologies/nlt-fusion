# NLT World Engine — AI Habitat & Physical Simulation Layer

> **Engine migration in progress (thread `MIGRATE-001`).** The authoritative simulation is moving from **UE 5.8** to **Godot 4.7.2 (C#)**. UE remains a **frozen behavioural oracle** until the port passes conformance. Plan: [`world-engine-godot/MIGRATION-PLAN.md`](world-engine-godot/MIGRATION-PLAN.md). Pinned toolchain: [`docs/engine-reference/godot/VERSION.md`](docs/engine-reference/godot/VERSION.md).

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

NeuroLift Technologies Simulation Environment — the deterministic runtime where AI Avatars (with ADHD traits) and AI Aides live inside. This repo owns the **physical simulation layer** and is the **authoritative simulation training environment** for the Avatar-Aide-Advocate system: world state, space, time, objects, needs, NPCs, scenario instantiation, and the authoritative simulation itself. Avatar/Aide/Advocate *intelligence* — ADHD trait modeling, coaching expertise, training loop, fusion — lives in [`neurolift-ai-fusion`](https://github.com/NeuroLift-Technologies/neurolift-ai-fusion) and connects through the agent interface.

> **Core principle:** Fusion owns semantic reality; **the world engine** owns physical reality. The engine is an implementation detail of the physical layer and may change by Joshua's decision under OTOI §4.4 — the Fusion ↔ world-engine boundary does not.
>
> **Architecture docs:** [`WorldEngine/docs/architecture/`](WorldEngine/docs/architecture/) documents the **UE reference implementation** — [`TECHNICAL_DIAGRAM.md`](WorldEngine/docs/architecture/TECHNICAL_DIAGRAM.md), [`unreal-simulation-architecture.md`](WorldEngine/docs/architecture/unreal-simulation-architecture.md), [`fusion-unreal-domain-mapping.md`](WorldEngine/docs/architecture/fusion-unreal-domain-mapping.md). Retained as the semantics the Godot port must reproduce.

## Human Role in the Supervised Simulation

Humans are not passive observers of AI development here. They are active participants providing oversight, context, evaluation and authorization. The governing principle is **AI capability ≠ AI authority** — the ability of an AI system to perform an action does not determine whether that action should be performed.

[`docs/Human-Role-in-Supervised-Simulation.md`](docs/Human-Role-in-Supervised-Simulation.md) — `NLT-SIM-HUMAN-ROLE-1.0.0`, *Draft / Proposed Architectural Standard*, governance: Solidarity Framework | ASFDK — defines that participation model. Six human roles: **Supervisor, Observer, Evaluator, Scenario Designer, Instructor/Guide, Governance Authority**. Four interaction modes: **Observation, Supervision, Intervention, Evaluation**. Its `Scope` field reads `NLT World Engine | AI-Fusion Framework`, so it binds **both** repos.

**What this repo implements today.** The world engine is the *physical* substrate, so its share is the **Observer** role plus the transport half of **Supervisor** (pause / resume / step / replay / speed) — all read-only, delivered under [`RENDERER-PLAN.md` §6](world-engine-godot/RENDERER-PLAN.md). **Instructor/Guide, Scenario Designer, Governance Authority, and the interaction-mode state machine do not exist yet.** Governance Authority is the one element with prior art — UE's `NLTGovernanceSubsystem` integrating ASFDK — and arrives via Decision 6 of the migration plan. Guidance injection must arrive as `nlt.fusion-unreal` 1.0 actions so it stays inside the replay contract.

**Observer audience — a standing requirement.** People with ADHD must be able to **watch and understand the simulation without needing to parse a dense analytics dashboard.** This is a design constraint, not a later pass: it governs the observation surface, its accessibility settings, and its reading levels. It is stated here as the source of truth for both repos, and `RENDERER-PLAN.md` §6 is where it is implemented.

> **Draft status.** This standard is *proposed*, so it does not yet bind implementation. It is mirrored in `neurolift-ai-fusion`; both copies were byte-identical when this section was written, but neither repo designates a source of truth or commits the file.

## Architecture

```text
Fusion Runtime (neurolift-ai-fusion)
  ├── Avatar/Aide/Advocate intelligence
  ├── ADHD trait modeling (26-dim)
  ├── Coaching strategies
  ├── Training (PPO, out-of-process Python)
  └── Fusion + Advocate logic
        │
        │  WebSocket / HTTP API  (nlt.fusion-unreal 1.0 / nlt.world-engine.v1)
        ▼
NLT World Engine (this repo)
  ├── Physical simulation layer — Godot 4.7.2 (C#)  ← target
  │   ├── Deterministic core (.NET library, engine-independent)
  │   │   ├── Fixed tick (1Hz), seeded RNG, canonical state hash v2
  │   │   ├── Replay codec — recorded actions, not re-derived
  │   │   ├── EventBus (256-entry ring buffer)
  │   │   ├── AgentController seam (Observe → Act, per tick)
  │   │   └── TrainingEnvironment surfaces (Reward / Completion / Reset)
  │   ├── Presentation — terrain, water, sky, vegetation, settlement
  │   ├── Interiors — 4 scenarios as instanced sub-scenes
  │   └── Governance boundary — ASFDK (in-process .NET reference)
  │
  ├── Python sidecar — owns HTTP 8765 + WebSocket 8766 (Godot has no server)
  │
  └── UE 5.8 reference implementation (WorldEngine/)  ← FROZEN behavioural oracle
      ├── Mass Entity population, StateTree behavior, Learning Agents RL
      ├── Smart Objects + NavMesh, NLTGovernanceSubsystem
      └── _archive/ — Babylon.js viewer (world-engine-v2/) and
          Python ECS engine (world-engine/), both superseded
```

## Quick Start — Godot 4.7.2 (target engine)

**Prerequisites:** Godot **4.7.2 .NET (mono)** + .NET 8 SDK.

```bash
# Open the project in Godot 4.7.2 .NET (mono)
godot --path world-engine-godot

# Planned Tier 1 gate — no deterministic core test project exists yet.
# Once implemented, it will need no engine:
# dotnet test world-engine-godot/NltWorldEngine.Core.Tests
```

**Status:** rendering only. Agents, determinism, protocol, and governance land in phases 2–7 of the migration plan.

## Quick Start — Unreal Engine 5.8 (frozen oracle)

> Still the only runnable authoritative simulation until the port passes conformance. **Do not change UE simulation behaviour** (plan item 1.6).

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
├── ARCHITECTURE.md               # UE 5.8 subsystem reference (frozen)
├── DEPLOYMENT.md                 # UE 5.8 build + deployment (frozen)
├── world-engine-godot/           # Godot 4.7.2 (C#) — target authoritative sim
│   ├── MIGRATION-PLAN.md         # Migration plan
│   └── assets/levels/            # Interior level geometry (ufbx FBX import)
└── .github/workflows/            # CI (governance validation only)
```

## Key Subsystems — UE 5.8 reference (frozen)

> Retained so the Godot port can be checked against it. The migration plan maps each of these to its target location.

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

## Character & Mesh — UE reference

> `SM_SimBody_Base` is a **static low-poly mesh, not a rig**, and `CHAR-001` (emotion-driven animation) was blocked on missing mesh assets. The vision calls for *"articulated bodies, animated walk cycles, and name labels"* — none of which UE delivers today. In scope for the migration as Phase 5c: a glTF humanoid rig, a **procedural** walk cycle driven by velocity (no animation assets to author), and `Label3D` name labels.

- `BP_AvatarCharacter` — Blueprint character + SimBody skeletal mesh
- `SM_SimBody_Base` — low-poly humanoid (~179.5cm, Nanite off)
- `AAvatarAIController` — navmesh-based wandering, RL training foundation

## Spectator

The vision is *"humans watch through a spectator viewer."* Today there is **no viewer**: the Babylon.js client is archived, and `Content/Web/` holds a 2D canvas viewer that was never wired up. The Godot desktop app becomes the spectator (extend `WorldView.cs` with a HUD bound to live sim state) — and Godot 4 cannot export C# to web, so a browser client would have to be a separate project talking to the Python sidecar.

## Archived Components

Both previously lived at repository root and are now under `_archive/`. Neither was connected to the live simulation:

- **`_archive/world-engine-v2/`** — Babylon.js viewer. Note its logic layer contains **no `fetch`, no `WebSocket`, no `XMLHttpRequest`**: `simulation.ts` is a pure client-side timer and `data.ts` hardcodes all world data. Reviving it as a spectator would mean rewriting its logic layer from scratch.
- **`_archive/world-engine/`** — Python ECS engine, a reference implementation. Retained for data pipeline use and as the origin of the `AgentController` / `AgentInterface` seams the current design inherits.

## CI

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| `validate-governance.yml` | push/PR to any branch | Governance validation |
| `world-engine-godot-build.yml` | *(planned, Phase 7.2)* | `dotnet build` + `dotnet test` on the engine-independent core |

**No workflow currently builds product code.** `world-engine-v2-build.yml` was removed because it filtered on `world-engine-v2/**`, which moved to `_archive/` — the job could never fire. The Godot build and Tier 1 test gate land in Phase 7.2 of the migration plan.

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
| Human Role in Supervised Simulation | `docs/Human-Role-in-Supervised-Simulation.md` |
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

- **UE build validation in CI:** Select a UE-capable runner, add `WorldEngineEditor` build validation, run the NLT Automation suites, and publish logs/test reports. **Current CI validates governance only** — no workflow builds or tests product code.
- **Optional headless infrastructure:** Validate `WorldEngineServer` and headless runtime behavior on a UE distribution that supports Server targets. Optional later infrastructure, not a prerequisite for the training path.
- **Golden fixtures are not yet committed (MIGRATE-001, plan items 1.5 / 1.7b):** the capture infrastructure is merged, but no fixture set has been committed and non-degeneracy is unproven. Editor-context capture yields *static* state because Mass processors need a game loop, so a fixture could be N byte-identical ticks encoding no behaviour — which would make Tier 2 conformance pass on nothing. **Phase 1 is not complete until a human runs PIE capture and proves the ticks differ.**
- **Three vision claims are unmet in UE and unaddressed by the migration:** agent↔agent interaction, an NPC population (no NPC system exists at all — UE's "residents" are `AAvatarCharacter`), and realistic graphics. Each needs its own thread rather than being silently inherited.

### Completed foundations

- Versioned deterministic state hashing and RNG reset/serialization metadata.
- Versioned JSON replay records with integrity, tamper, serialization, and observed-final-state checks.
- Shared visual-only LOD policy for Mass HISM and actor residents, with 4/4 policy tests passing.
- Deterministic C++ Mass behavior processor, StateTree schema/task/condition references, and an expanded Python Fusion protocol/replay reference.
- Dedicated Server target/configuration and headless runtime guards are present, but the optional Server target has not been compiled on a server-capable UE distribution.
