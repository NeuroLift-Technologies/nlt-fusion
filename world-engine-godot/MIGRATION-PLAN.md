# UE 5.8 → Godot 4.7.2 Migration Plan

**Scope:** migrating this directory (`world-engine-godot/`) from a rendering prototype to the authoritative NLT World Engine simulation, replacing the UE 5.8 implementation in `../WorldEngine/`.

**Repo:** `NeuroLift-Technologies/nlt-world-engine`
**Date:** 2026-10-02
**Status:** implementation-ready (1 open question, §9)
**Authority:** Joshua W. Dorsey, Sr. (OTOI §4.4 — framework change, approved via this plan)

> Canonical plan copy lives at `.kilo/plans/1790898229735-ue-to-godot-migration-plan.md`.
> This copy ships with the prototype it governs. Keep them in sync.

---

## 0. Where this directory stands today

**This directory is rendering-only.** It is a working Godot 4.7.2 C# scene bootstrap — camera, sun, sky shader, terrain, water, vegetation, settlement, daylight cycle. It contains **no** agents, ECS, determinism/replay, scenarios, protocol, persistence, or governance.

It is also **entirely untracked in git** (`?? world-engine-godot/`), unregistered in `docs/active-threads.md`, and undocumented in any root doc. See Phase 0.

| File | LOC | Role | Fate under this plan |
|---|---|---|---|
| `Main.cs` | 5 | Scene root; extends `WorldView` | Keep |
| `WorldView.cs` | 124 | Camera, environment, sun, sky/water uniforms, input | Keep — becomes the native spectator (Phase 4, §9) |
| `WorldConstants.cs` | 84 | Seed, tick rate, world dims + `Mathx` + `SimulationRng` | **Rewrite** — see 4.2, 4.3 |
| `TerrainBuilder.cs` | 71 | Procedural heightfield mesh | Keep — drive from core noise (4.3) |
| `WaterBuilder.cs` | 76 | Water plane + shader | Keep |
| `SkyBuilder.cs` | 54 | Sky shader material | Keep |
| `SettlementBuilder.cs` | 125 | Building plans + instanced meshes | Keep |
| `VegetationBuilder.cs` | 118 | Instanced vegetation, avoids settlement plans | Keep |
| `Daylight.cs` | 52 | Time-of-day sample struct + function | Keep — drive from sim clock (4.4) |
| `WorldGeometry.cs` | 54 | Mesh helpers | Keep |
| `.godot/` | — | Build cache (dlls, pdbs, shader cache) | **Gitignore** before first commit (0.1) |
| `addons/godot_ai/` | — | Third-party Godot↔MCP bridge v4.2.3 (`hi-godot/godot-ai`, MIT) — **already on `main`, unratified** | **See 0.8** — ratify or remove |

### `addons/godot_ai/` — newly added, needs governance decisions

This is the Godot counterpart to the `unreal-mcp` entry in `../mcp-config.yaml`, so it closes the open item in 8.4/10.4. It was added outside the thread record and has not been reviewed here. Three things need decisions:

> **⚠️ STANDING RULE (Joshua, 2026-10-02): third-party plugin installation is reserved to Joshua personally. No agent installs one** — not into the repository, not onto a machine, not via an MCP tool, not as a "helpful" addition mid-task. Hard rule, not a preference, and **not delegable**. If a task appears to need one, escalate and stop.
>
> This addon is therefore already a governance question, not a pending gate: **`addons/godot_ai/` is tracked on `main`.** Plugin version **4.2.3**, `hi-godot/godot-ai`, MIT, `LICENSE` present. What needs Joshua's word:
- [ ] **0.8a** **Ratify or remove** the ~100 files of vendored third-party code now on `main`, with **no approval record, no provenance note** (where it came from, when, at whose approval), and **no `../mcp-config.yaml` entry** — which still carries only `unreal-mcp` at `127.0.0.1:8001`. Removal is the more honest default given it arrived with no record
- [ ] **0.8b** It bootstraps a **Python server via `uv`** — a new external toolchain dependency, pinned nowhere in this repo. Confirm acceptable, and pin it
- [ ] **0.8c** It **mutates MCP client configuration** for cursor, claude, codex, cline, antigravity, codebuddy, deepseek and claude_desktop — a machine-level change to developer tooling, with reach well beyond this repo. It also **exposes action handlers over MCP** (scene mutation, script execution, test running), so any agent with editor access can drive the Godot editor. If ratified, add the `../mcp-config.yaml` entry and rewrite the UE-specific governance note, **keeping the existing boundary verbatim**: *"development-plane interface… does NOT grant simulated agents runtime authority."* Editor automation is a dev plane; runtime agent actions must still pass through the sidecar and the ASFDK-C# gate. Change only the UE nouns, never the wording
- [ ] **0.8d** Confirm it is compatible with Godot **4.7.2 mono + C#** before relying on it. Its README states 4.5+ / 4.7+ recommended but says nothing about the C# variant

---

## 1. Situation in the UE code being replaced

All verified against the working tree.

| Fact | Evidence |
|---|---|
| UE module is 129 files / ~20,700 LOC, 44 public + 8 private module deps, 32 plugins enabled | `../WorldEngine/Source/WorldEngine/**`, `WorldEngine.Build.cs`, `WorldEngine.uproject` |
| Mass Entity **movement is unused** — agents step closed-form toward `TargetPosition`; `MassMovement` is linked but unused | `NLTDemoScenarioProcessors.cpp`, `NLTStateTreeBehaviorProcessor.cpp` |
| **No `.sttree` assets exist.** The live behavior path is a C++ state machine; StateTree is scaffolded but nominal | `NLTDemoStateTreeBehavior.h`, `Content/` (no `.sttree`) |
| HTTP API on **port 8765**, 7 routes, loopback-enforced mutations; WebSocket on **8766**, port-only, no path routing | `../WorldEngine/Source/WorldEngine/Private/NLTWebServerSubsystem.cpp:141-172` |
| WS broadcast is **dead** — `BroadcastEvent` appends to the ring buffer and never calls `SendWebSocketEnvelope` | `NLTWebServerSubsystem.cpp:982-999`; `../docs/active-threads.md` SIM-001 |
| Frozen wire contract: `PROTOCOL="nlt.fusion-unreal"`, `PROTOCOL_VERSION="1.0"`, `CONTRACT_VERSION="nlt.world-engine.v1"`, actions `move_to, move_by, interact, set_focus, idle`; 9 passing reference tests | `../WorldEngine/Scripts/fusion_protocol.py` |
| Determinism scaffolding already exists: `FNLTRandomStream` (LCG), canonical state text `NLT.WorldEngine.State.v1`, replay contract `nlt.world-engine.replay.v1`, 256-slot/30-type event bus, fixed timestep 1/60 | `NLTSimulationState.h`, `NLTSimulationStateHash.cpp`, `NLTSimulationReplay.cpp`, `NLTEventBus.h` |
| **A headless capture hook already exists**: `BeginHeadlessSelfTest(MaxTicks)` emits `NLT_HEADLESS_TEST_COMPLETE tick=%d stateHash=%08x` | `../WorldEngine/Source/WorldEngine/Private/Scenarios/Demo/NLTScenarioManagerSubsystem.cpp` |
| Persistence is 4 disconnected mechanisms, two using raw `FMemory::Memcpy` blobs — **not portable** | `NLTSimulationClockSubsystem.cpp`, `NLTDeterministicSeedSubsystem.cpp`, `NLTRoomStateSubsystem.cpp`, `NLTPersistenceSubsystem.cpp` |
| Seed mismatch: UE verified runs use **seed 42**; this prototype defaults to **20260401** | `../docs/active-threads.md` ESC-001; `WorldConstants.cs:7` |
| UE editor **builds and runs automation on Win64 today** — fixtures are capturable now | `../docs/active-threads.md` DET-001 (`Result: Succeeded`, 7/7 `NLT.Simulation`, 4/4 `NLT.VisualLOD.Policy`) |
| **`../docs/world-engine/DESIGN.md` argues against Godot** ("That rules out a render-and-input game engine (Unity/Godot/Unreal)") — now inverted and must be explicitly reversed | `../docs/world-engine/DESIGN.md:15`, `:84` |
| `world-engine-v2-build.yml` is **dead**: filters `world-engine-v2/**` and sets `working-directory: world-engine-v2`, but that code moved to `_archive/world-engine-v2/`. It is the only workflow that ever compiled product code. **Governance `validate` is healthy** — verified passing on PR #61 | `.github/workflows/world-engine-v2-build.yml`; `.nltotoi/scripts/validate-governance.sh:131` |
| `.gitignore` has no Godot entries; this `.godot/` cache sits in the working tree | `../.gitignore` |
| **No CI builds UE, runs UE tests, tests Python, or builds Godot** — no safety net to break, no gate to preserve | `../.github/workflows/*` (2 files) |
| ASFDK on **Win64 is stubs only**; real `libasfdk.a` needed on Linux; ASFDK vendors two divergent `nlohmann/json.hpp` copies | `../WorldEngine/Plugins/NLTGovernanceSubsystem/` |

---

## 2. Settled decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Target state | **Staged.** Godot becomes authoritative only after a validated port; UE stays alive as the behavioral oracle until Tier 2 conformance passes | No CI safety net exists today; an untested rewrite is not verifiable |
| 2 | Language | **C# / .NET 8**, continuing this project | Prototype already C#; typed; xUnit gives the Tier-1 gate without launching Godot; closest float semantics to the C++ being ported |
| 3 | RL training | **Split.** In scope (Phase 2/6): the **training-environment surfaces** — `ITrainingEnvironment` with `Observe`/`Reward`/`IsComplete`/`Reset`, episode boundaries, determinism-preserving reset. Deferred (Phase D1): the PPO trainer and `RLPolicyController`. Independently, the `IAgentController` seam (2.6a–2.6c) lands now with `DeterministicUtilityController`, so RL is a drop-in rather than a rewrite | `../README.md:5` calls this repo *"the authoritative simulation training environment"* and says agents "**learn**". A training environment is the *surfaces* — reward, completion, reset — not the trainer, and UE already had them (`UNLTTrainingEnvironment::GatherAgentReward` / `GatherAgentCompletion` / `ResetAgentEpisode`). Those are pure C# and cheap; deferring them would leave a simulation that cannot be learned in. The **trainer** stays out because UE's was never verified (`TRAIN-002` open) and Godot has no Learning Agents equivalent |
| 4 | HTTP/WS surface | **Python sidecar owns 8765 + 8766**, proxying to Godot over internal IPC | Godot ships no server; preserves the exact route table, envelope, ports and loopback enforcement so Fusion needs zero changes |
| 5 | World scope | **Rebuild the 4 interior scenarios procedurally** as sub-scenes; keep the outdoor shell procedural on this prototype's seeded generators | Interiors are where all agent simulation happens; `.umap` cannot convert; avoids an asset-reimport workstream |
| 6 | Governance | **In-process .NET reference to `asfdk-csharp`** from this project | Keeps the authority check inside the authoritative process (defense in depth) with no IPC hop |
| 7 | Validation | **Four tiers:** core unit tests → golden vectors → protocol conformance → headless run | "Validated" needs a mechanical gate, not eyeballing |

---

## 3. Target architecture

```
Fusion Runtime (neurolift-ai-fusion)          ── unchanged consumer ──┐
                                                                   │ nlt.fusion-unreal 1.0
                                                                   │ nlt.world-engine.v1
┌──────────────────────────────────────────────────────────────────▼─────────────┐
│ sidecar/  (Python)  — owns 8765 HTTP + 8766 WS, loopback enforcement, ASFDK-C#  │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │ internal IPC (stdin/stdout framed JSON; single-writer ordering)
┌───────────────▼──────────────────────────────────────────────────────────────────┐
│ world-engine-godot/  (this directory — Godot 4.7.2, C#)                         │
│                                                                                 │
│  WorldView · Terrain/Water/Sky/Vegetation/Settlement/Daylight · Interiors       │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ NltWorldEngine.Core/        plain net8.0 class library — ZERO Godot refs   │  │
│  │   Rng · CanonicalState · StateHash · Replay · EventBus · Agents ·          │  │
│  │   Scenarios · Contracts · Noise/Biome · VisualLodPolicy                   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│  NltWorldEngine.Core.Tests/  xUnit — runs headless, no Godot install required   │
│  ASFDK-C# (ProjectReference)                                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

**The load-bearing structural decision:** the deterministic core is a plain .NET library with **no Godot reference**. That makes Tier 1 CI-runnable on a stock `ubuntu-latest` runner with only the .NET SDK — the first thing this repo has ever had.

### The controller seam — how a model drives a character

The vision (`../README.md:5`) is *"machine learning models inhabit a persistent world, **control their characters**."* So the migration must land a place for a model to act. That place is one interface in the core, evaluated per agent per tick:

```csharp
public interface IAgentController
{
    AgentObservation Observe(int agentId);
    AgentAction     Act(int agentId, in AgentObservation observation);
}
```

Three implementations, one seam:

| Controller | Runs | Where |
|---|---|---|
| `DeterministicUtilityController` | in-tick | Core, Phase 2/6. Baseline, and the **fixture controller** the golden vectors are captured with |
| `RLPolicyController` | in-tick (forward pass) | Phase D1. A trained policy genuinely drives characters every tick |
| `LlmCommandController` | out-of-band | Phase 9. Inference is ~100 ms–seconds, so it cannot run at tick frequency; it emits actions applied **at tick boundaries** |

**The rule that keeps this honest** — carried over verbatim from `../WorldEngine/Source/WorldEngine/Public/Agents/AvatarAIController.h:40-45`:

> The model issues high-level **semantic** commands. Physical locomotion still runs through the controller, which remains the movement authority — **no raw velocity writes from the model.**

`AgentAction` is therefore semantic (`MoveDirection`, `Interaction`, `TargetId`), never a position or velocity write. UE enforced this with the movement component staying authoritative under the AIController; preserve the invariant.

Observation/action encodings match UE's declared RL schemas so the contract stays portable — Avatar obs `{Position, Velocity(3), Cognitive(7)}`, act `{MoveDirection(3), Interaction(4 exclusive discrete)}` (`NLTAvatarInteractor.cpp`); Aide obs `{AvatarState(13), AideState(7)}`, act 10-way discrete (`NLTAideInteractor.cpp`).

**Determinism holds because decisions are recorded, not re-derived.** Any controller's action goes into the replay stream (`FNLTReplayAction`), so an ML-controlled run reproduces exactly on replay. That is what makes Tier 2b below possible, and it is exactly the decision already recorded in `../docs/world-engine/DESIGN.md:34`.

---

## 4. Ordered phases

### Phase 0 — Governance and freeze the oracle (do this first, it is time-sensitive)

UE builds today; it may not tomorrow. Capturing golden fixtures is only possible while UE runs.

- [x] 0.1 **DONE 2026-10-02.** `.gitignore` already listed `.godot/`, `.import/`, `export.cfg`, `export_presets.cfg`, but 119 cache files had been committed **before** that rule existed and gitignore does not apply retroactively to tracked files. Untracked via `git rm -r --cached world-engine-godot/.godot`, and added scoped `world-engine-godot/**/bin/` + `**/obj/` entries
- [x] 0.2 **DONE 2026-10-02.** `../docs/escalations/2026-10-02-godot-migration.md` — records Joshua's approval of the framework change per OTOI §4.4, the three options considered, and all seven settled terms
- [x] 0.3 **FILED 2026-10-02 as [#64](https://github.com/NeuroLift-Technologies/nlt-world-engine/issues/64)** (`agent-action-required`; the `governance` and `proposal` labels referenced by `ISSUE_TEMPLATE/governance-proposal.md` **do not exist** in this repo). Proposed wording is deliberately engine-agnostic — *"the world engine owns physical reality"* rather than naming Godot — so the principle does not go stale at the next engine change. Awaiting written approval per OTOI §9 before editing `../AGENTS.md`
- [x] 0.4 **DONE 2026-10-02.** `MIGRATE-001` registered in `../docs/active-threads.md`; registration at `../docs/agent-log/registrations/2026-10-02-kilo-godot-migration.json`, intent log at `../docs/agent-log/intent/2026-10-02-godot-migration-phase0.md`
- [x] 0.5 **Already satisfied.** The prototype is tracked — `world-engine-godot/` and this plan file were committed to `main` before 2026-10-02. No `feat/godot-migration` branch was needed for the initial commit; work now lands on scoped fix branches
- [x] 0.6 **DONE 2026-10-02.** `world-engine-v2-build.yml` deleted. It filtered on `world-engine-v2/**` and set `working-directory: world-engine-v2`, but that path no longer exists at root (it is `_archive/world-engine-v2/`), so the job could never fire. **Governance validation was always healthy** — `validate-governance.sh:131` correctly requires `.github/workflows/validate-governance.yml` and `validate` passes on every PR; an earlier claim that it was broken was wrong. Consequence: the repo has **no** product-code CI until 7.2
- [x] 0.7 **DONE 2026-10-02.** `../docs/engine-reference/godot/VERSION.md` created — pins Godot 4.7.2 .NET (mono), .NET 8, the FBX/ufbx import matrix, known asset sources, and the 3D asset inventory. This file was **missing**, which is why all five `../.claude/agents/godot-*.md` specialists were failing their mandatory version check

### Phase 1 — Capture golden fixtures from UE

- [ ] 1.1 Add a UE-only fixture emitter: extend `UNLTScenarioManagerSubsystem::BeginHeadlessSelfTest` to write per-tick canonical state text, RNG state, ordered event stream, and replay JSON to `Saved/Fixtures/seed{N}/`. New emitter, existing subsystem — do not alter simulation behavior
- [ ] 1.2 Define **canonical state text v2** as **bit-exact hex of IEEE-754**, not `%.9g`/`%.17g` decimal. Rationale: printf `%g` and .NET `G9` differ in exponent formatting and trailing-zero suppression, so byte-exact text equality across C++ and C# is not achievable portably. Bit-exact encoding removes the whole class of float-formatting ambiguity. Bump the version string to `NLT.WorldEngine.State.v2`
- [ ] 1.3 Capture at seed **42** (matches the verified `standalone -game seed 42` run) for ≥3 scenarios and N ≥ 20,000 ticks, plus at least one case that exercises stressors, needs saturation and Aide interventions
- [ ] 1.4 Capture the existing `NLT.VisualLOD.Policy` policy inputs as Tier-2 vectors too (currently 4/4 passing in UE)
- [ ] 1.5 **[AGENT — requires a UE-capable machine]** Commit fixtures under `fixtures/` with a `PROVENANCE.md` recording the exact UE build, commit, seed, tick count, capture context, and command line used. **Ownership corrected 2026-10-02:** previously marked `[HUMAN — cannot be automated]`, which was wrong. The constraint is a machine with UE and a PIE-capable harness, not a human in the loop — Cline has already driven a full capture autonomously and returned a hard verdict. Do not hand-hold work an agent with the right toolchain can complete. **Phase 1 is not complete, and `MIGRATE-001` must not be closed, until these land in git** — the infrastructure shipping without vectors is a false green
- [ ] 1.6 **From here on, UE is frozen** — reference only. No UE behaviour changes. **NARROWED 2026-10-02:** the freeze covers *behavioural* changes only. **Defect fixes required to make UE's already-documented behaviour observable are permitted**, recorded in the escalation and the thread. SIM-001 is exactly such a defect — UE's own documentation states the clock is authoritative and processors are registered, and neither is true. Fixing it makes UE match its documented behaviour rather than inventing new behaviour. Without this carve-out, Phase 1 is unsatisfiable (see 1.10 and [#67](https://github.com/NeuroLift-Technologies/nlt-world-engine/issues/67)).

- [ ] 1.7 **Fixture non-degeneracy assertion — blocks Phase 1 sign-off.** Editor-context capture produces *static* state because Mass processors do not run without a game loop, so a fixture can be N byte-identical ticks that encode no behaviour. Tier 2 would then pass against nothing and go green on the gate that retires UE.
  - **1.7a [AGENT] — DONE 2026-10-02** (branch `kilo/phase1-nondegeneracy`). `UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy` is a pure function over the three per-tick series, so the assertion is headlessly testable even though the capture is not. Six `NLT.FixtureCapture.NonDegeneracy.*` cases, **6/6 passing**. `PROVENANCE.md` carries a PASS/FAIL verdict and the emitter logs `Error` on a degenerate capture. That split is what made 1.7a agent-actionable while 1.7b stayed human.
  - **⚠️ The obvious assertion is near-vacuous.** `SimulationTick` and `WorldTime` are *part of* the canonical text and advance every tick, so "canonical text differs across ticks" passes **even with every agent frozen**. The load-bearing signal is a per-tick **agent position trace** — that agents actually moved. `FrozenAgentsFail` exists specifically to pin this gap. Do not treat a canonical-text difference as evidence of live simulation.
  - **1.7b [AGENT on a UE-capable machine] — SIM-001 FIXED; event stream now the only open signal.** `Automation RunTests NLT.FixtureCapture.PIE` starts its own PIE session (no manual Play step). After the 1.10 fix the capture is **no longer degenerate**: 600 tick blocks containing **600 unique**, canonical clock advancing tick 1 to 600, `WorldTime` 0.0166 to 10.0 min, and `Agents move: yes`. `Verdict` is still **FAIL** on one signal only — `Event stream non-empty: no (0 ticks with events)`.
    - **Correction 2026-10-02:** an earlier version of this entry attributed the empty stream to `UNLTEventBus` having *"zero writers in the module."* **That was wrong.** The bus has **four** writers, all in `UNLTWorkplaceEnvironmentSubsystem` (`NLTWorkplaceEnvironmentSubsystem.cpp:254,257,279,286`). The claim came from grepping for `Publish(`, which is not an API in this codebase; the real surface is `RaiseEvent` / `RaiseSimpleEvent` / `RaiseEnvironmentEvent`. Consequently *"wiring producers is new behaviour, outside the carve-out"* is also void — the producers already exist.
    - **Most likely explanation:** the capture ran a **non-Workplace** level, where no environment-event producer exists. Re-running on Workplace should clear the signal with **no behavioural change at all**. Verify that first — if the capture already used Workplace, the question becomes whether `UNLTWorkplaceEnvironmentSubsystem` ticks at all, given the clock was only just repaired in 1.10(a). See 1.13.
  - Current honest state: the test reports `Verdict: FAIL` on the event signal alone. **That is the correct result, not a test to be made to pass** — the three simulation signals are green on real data.
- [x] 1.8 **Retire the second, weaker hash — do not port it.** `UNLTScenarioManagerSubsystem::ComputeAgentStateHash()` is a separate FNV-1a over agent id + position quantised to 1/1000, distinct from `NLTSimulationStateHash`. It has no RNG, no events, no needs, and its comment calls 1/1000 "micrometers" when it is millimetres. The port ships **one** hash (v2, per 1.2); `ComputeAgentStateHash` is deleted, not reimplemented. Its `BeginHeadlessSelfTest` / `NLT_HEADLESS_TEST_COMPLETE` harness is kept and re-pointed at v2
- [x] 1.9 **DONE 2026-10-02.** `BuildCanonicalStateTextV2` narrowed agent position: it called `AppendFloatHex(…, Agent.Position.X)`, but `FNLTAgentState::Position` is an `FVector`, which is `FVector3d` under UE5 large-world coordinates — a silent 53-bit → 24-bit mantissa truncation inside the encoding whose purpose is bit-exactness. `WorldTime` correctly used `AppendDoubleHex` two lines earlier, so it read as an oversight. Now uses `AppendDoubleHex` for X/Y/Z, with the header documenting the encoding contract and warning that changing a width invalidates prior captures. **Confirmed empirically 2026-10-02** — two captures on seed 42, pre-fix `c4909e76;c4b87875;42c80000` vs post-fix `c09213cec0000000;c0970f0e9e0000000;4059000000000000` (8 hex chars float32 → 16 float64). **Consequence: the only fixture on disk was captured under the old encoding and is unusable.** It must be recaptured regardless of every other blocker
- [x] 1.10 **SIM-001 — FIXED 2026-10-02** in [#69](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/69) (`fix/sim-001-mass-ticking`, Cline). Two independent defects, both cases of documented behaviour not being true, so both inside the 1.6 carve-out.
  - **(a) Authoritative clock disconnected.** `UNLTSimulationSubsystem` owns the only real tick counter, but `UNLTSimulationStateSubsystem` — the state the emitter, hash, replay and HTTP surface all read — only ever had `SimulationTick` written by `ResetState`/`RestoreFromSnapshot`. Nothing subscribed to `OnSimulationTick`, so the canonical clock stayed 0 for entire runs. `StepTick` now publishes tick and time.
  - **(b) Every agent handed to a layer that owns nobody.** `NLTAgentSpawnerSubsystem` hardcoded `FNLTStateTreeBehaviorFragment::bEnabled = true`; both legacy processors skip StateTree-enabled entities, and there are **0 `.sttree` assets** in `Content/`, so the scenario froze — no decisions, no targets, no movement. Now defaults to `false`, so the legacy C++ processors (the documented live path) own the agent.
  - **Corrected the original diagnosis.** *"Mass is not initialized, no processor runs"* was **wrong**. Instrumenting `UNLTScenarioDecisionProcessor` showed it executing once per tick for all 600 ticks with valid `World`/`Sim`/`SmartWorld` pointers, yet never reaching `DecideTarget` — every entity was skipped at the StateTree guard. Mass was fine; the entity-level flag was the blocker. Note the **struct default was not the lever**: the spawner sets the field explicitly, so changing the default alone does nothing.
  - **Verified:** 600 tick blocks containing **600 unique** (was 1), clock tick 1 → 600, `WorldTime` 0.0166 → 10.0 min, agents move.
- [x] 1.11 **Three pre-existing capture-blocking crashes — FIXED 2026-10-02** in [#70](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/70) (`fix/scenario-movement-fragment-view`, `b2c487a`). Found by Cline; none introduced by this work. Each independently prevented any capture from completing:
  - Fragment view read before `ForEachEntityChunk` binds it — `NLTDemoScenarioProcessors.cpp:247`. Asserted on **every** scenario start. Traces to `d590bcb` (2026-09-25). `UNLTScenarioDecisionProcessor` has the same access but already reads it inside its lambda, so it was unaffected
  - `EndCapture` no-ops once the tick cap flips `bCapturing` — `NLTFixtureEmitterSubsystem.cpp:65`. 600 ticks collected in memory, **zero files written**
  - PIE capture test required a human to press Play — `NLTFixtureCapturePIETests.cpp`. Now requests its own play session, reusing one already running and **only stopping a session it started**. Needed `UnrealEd` under `Target.bBuildEditor` and `#if WITH_EDITOR` — a direct consequence of #61 forcing `WITH_DEV_AUTOMATION_TESTS=1` on the Game target
  - **#70 makes captures complete; #69 makes them meaningful; neither is sufficient alone**
- [x] 1.12 **Correct §6's framing of the fixture risk — DONE 2026-10-02.** The row was wrong twice before it was right: first *"fixtures never captured because UE stops building"* (build fragility), then *"no live fixture because Mass never ticks"* (also wrong — a teardown warning misread as a spawn failure). Re-framed and resolved; see §6.
- [ ] 1.13 **Coverage criteria are scenario-aware — the event signal only exists for Workplace.** 1.3 requires ≥3 scenarios, but `UNLTWorkplaceEnvironmentSubsystem` is the **only** `*EnvironmentSubsystem*` in the module, with four raise sites (`NLTWorkplaceEnvironmentSubsystem.cpp:254,257,279,286`). **Personal, Social and Academic have no environment event producers at all.** The event-stream comparison in Tier 2-scenario is therefore **meaningful for 1 of 3**; the other two compare two empty streams and prove nothing. **Whichever scenario is captured must be Workplace for the event signal to bite.** Either generalise the environment model, or record explicitly that event assertions apply only to the Workplace fixture. Do not let 1.3 claim coverage it does not have.
  - **Likely cheapest resolution:** re-run the capture on a Workplace level. Producers already exist, so this needs **no behavioural change at all** and stays inside the carve-out. Verify first whether the capture already used Workplace; if it did, the question becomes whether `UNLTWorkplaceEnvironmentSubsystem` ticks at all, given the clock was the thing 1.10(a) just repaired.
- [ ] 1.14 **Prior records of this phase were wrong; corrected here so they are not repeated.** Three: (1) *"Mass is not initialized / Mass never ticks"* — false, taken from a teardown log line; Mass ticked throughout. (2) *"the event bus has zero writers"* — **false**. `UNLTEventBus` is a 256-slot ring buffer with **four** writers, all in `UNLTWorkplaceEnvironmentSubsystem`. The claim came from grepping for `Publish(`, an API that does not exist in this codebase; the real surface is `RaiseEvent`/`RaiseSimpleEvent`/`RaiseEnvironmentEvent`. (3) *"wiring event producers is new behaviour, outside the carve-out"* — a conclusion drawn from (2), therefore void. **Verify a diagnosis from instrumentation, not from a log line's context.**

### Phase 2 — `NltWorldEngine.Core` + Tier 1 tests

Port these from UE, preserving semantics exactly:

- [ ] 2.1 `Rng.cs` — port `FNLTRandomStream` (LCG `Seed*1103515245+12345`, `GetFraction/GetRange/IntRange/Reset`) and this prototype's mulberry32 (`SimulationRng`). **Keep float ops in `float`/`double` with explicit `unchecked`**; UE used `float` on many paths
- [ ] 2.2 `CanonicalState.cs` — port `BuildCanonicalStateText`, emit v2 bit-exact, preserve the order-insensitive sort (agents and events sorted by name) so hashes stay stable
- [ ] 2.3 `StateHash.cs` — **the Tier 2 comparison key is the canonical state *text*, not the digest.** UE fixtures record `state_hash.txt` via BLAKE3; .NET has SHA-256 built in but no BLAKE3, so a digest comparison would fail by construction. Compare canonical text, RNG state, and event stream; treat the recorded digest as a UE-side integrity artifact only. If a matching digest is wanted, add `K4os.Blake3` to the core rather than changing the fixture. Tamper-check semantics preserved either way
- [ ] 2.4 `Replay.cs` — port `FNLTDeterministicReplay` (contract `nlt.world-engine.replay.v1`): per-action `NLT.Replay.Action.v1` and per-event `NLT.Replay.Event.v1` hashes, sequence + tamper validation, JSON round-trip
- [ ] 2.5 `EventBus.cs` — port the 256-entry ring buffer and all 30 `ENLTSimulationEventType` values. **Replace UE dynamic multicast delegates with plain C# events** so the core stays engine-free. **Correction 2026-10-02:** the bus is *not* dead — `UNLTWorkplaceEnvironmentSubsystem` raises four environment event types (`NLTWorkplaceEnvironmentSubsystem.cpp:254,257,279,286`), and those carry a per-tick seeded random walk over room lighting/noise, which exercises `FNLTRandomStream` and `ENLTSeedCategory` directly. That makes the event stream a **genuine Tier 2-core conformance signal**, not a formality. But producers exist for **Workplace only** — see 1.12
- [ ] 2.6 `Agents/` — port the 6 agent fragments, `FNLTStateTreeBehaviorFragment`, and the full behavior state machine from `NLTStateTreeBehaviorProcessor.cpp` (`Idle → EvaluateNeeds → SelectTarget → MoveToTarget → Arrived`, `FallbackWander`). **No StateTree equivalent is needed — there are no `.sttree` assets to port.** Port `NLTDemoScenarioUtils.h` candidate-sort ordering (score↓, dist↑, name↑) verbatim
- [ ] 2.6a **`Agents/IAgentController.cs`** — the controller seam. Define `IAgentController { Observe(agentId); Act(agentId, observation) }`, `AgentObservation`, `AgentAction` per §3. This is the port of `ULearningAgentsInteractor`'s observe/act contract, generalized so it is not RL-specific. **Do this in the same change as 2.6** — porting the behavior state machine without the seam leaves the world with no place for a model to act
- [ ] 2.6b **`Agents/DeterministicUtilityController.cs`** — wrap the 2.6 state machine as the seam's first implementation. It becomes the baseline *and* the controller the Phase 1 golden vectors are captured with. Guard with an invariant test that `AgentAction` carries no position/velocity fields
- [ ] 2.6c Declare `RLPolicyController` and `LlmCommandController` in the interface docs but **do not implement** — they are Phase D1 and Phase 9. Their existence in the design is what makes them drop-ins rather than rewrites
- [ ] 2.6d **`Agents/ITrainingEnvironment.cs`** — the training-environment surfaces, ported from `UNLTTrainingEnvironment`: `GatherAgentReward`, `GatherAgentCompletion`, `ResetAgentEpisode` (plus `OnAgentsAdded`). **In scope despite Decision 3**, because `../README.md:9` calls this repo *"the authoritative simulation training environment"* and agents must *"learn"* — a simulation you cannot learn in is not a training environment. Pure C#, no trainer dependency, cheap. Reward shaping and completion criteria need a real pass: UE's were never verified against the ADHD-trait intent
- [ ] 2.6e **Episode determinism invariant:** `ResetAgentEpisode` must restore the agent to a state reproducible from `(seed, tick)` alone, and must consume RNG in a fixed order. This is what lets a multi-episode training run replay identically, and it is what UE's `UNLTTrainingEnvironment.cpp:18` was reaching for ("restore the complete…") but never finished
- [ ] 2.7 `Noise.cs` — port `NLTNoiseLibrary` (mulberry32, `Noise2D`, `Fbm2D`, `GenerateTerrainHeight`, `ClassifyTerrainBiome`). **Fix the latent thread-safety risk** flagged in `ENV-TEX-001`: the static `Perm[512]` + `bPermInitialized` must become instance state. This supersedes the local `SimulationRng` in `WorldConstants.cs`
- [ ] 2.8 `VisualLodPolicy.cs` — port `NLTVisualLODPolicy` hysteresis math with the one `GetViewerLocation` call left as an interface seam
- [ ] 2.9 `Scenarios.cs` — port the 13 `UScenarioDataAsset` records (category, complexity, duration, aversiveness, cognitive demand, success rate, context params) out of `.uasset` into a versioned JSON resource. **Behavior-preserving data extraction from UE is required first** — do not hand-transcribe
- [ ] 2.10 `Persistence` — **replace all raw `FMemory::Memcpy` blobs with versioned JSON.** The UE binary blobs are struct-layout- and endianness-dependent and are not portable. Note: UE's `NLTPersistenceSubsystem::LoadGame` currently parses and **discards** the result — do not reproduce that bug
- [ ] 2.11 `Contracts/` — vendor `../_archive/world-engine/contracts/v1/*.schema.json` as the canonical schemas; validate emitted snapshots against them in tests
- [ ] 2.12 Tier 1 tests: port the 7 `NLT.Simulation` + 4 `NLT.VisualLOD.Policy` UE Automation cases, add canonical-text/golden-vector unit tests, add replay tamper tests

### Phase 3 — Python sidecar + Tier 3 conformance

- [ ] 3.1 `../sidecar/nlt_gateway/` — bind 8765 (HTTP) and 8766 (WS), stdlib only (`http.server` + `websockets`), per DESIGN.md §2 which already sanctioned a thin host
- [ ] 3.2 Reproduce the 7 routes with **byte-identical field names**: `/api/snapshot`, `/api/scene`, `/api/status`, `/api/control`, `/api/avatar/action`, `/api/avatar/state`, `/api/avatar/command` + OPTIONS CORS preflight (note: UE's OPTIONS list omits `/api/avatar/state` — reproduce the gap or fix it deliberately and record it)
- [ ] 3.3 Reproduce WS envelope fields exactly: request `protocol, protocol_version, session_id, message_id, message_type, agent_id, payload`; response `message_id, session_id, agent_id, payload`; errors set `session_id: "invalid"`
- [ ] 3.4 Enforce loopback-only on mutating routes (`127.0.0.1` / `::1`) in the sidecar
- [ ] 3.5 **Preserve the known metric-key inconsistency** — `/api/avatar/state` returns `burnout`/`fusion_ready` while `/api/snapshot` returns `burnout_risk`/`fusion_readiness`. Reproduce both exactly for parity and record it as a known issue; normalize later under a version bump, not now
- [ ] 3.6 **Implement WS broadcast for real.** UE never pushed events to clients. Godot + sidecar should, since a real WS server makes it trivial — record as an intentional, documented divergence (ADR), not a silent fix
- [ ] 3.7 Tier 3 gate: run the existing 9 `fusion_protocol.py` tests plus a new end-to-end conformance script against the sidecar with a stub core

### Phase 4 — Godot world shell (this directory)

- [ ] 4.1 Add `<ProjectReference Include="..\..\asfdk-csharp\src\Asfdk\Asfdk.csproj" />` to `world-engine-godot.csproj`, and a `ProjectReference` to `NltWorldEngine.Core`. See §9 — `asfdk-csharp` is cloned at `../asfdk-csharp` and **already retargeted to `net8.0`**
- [ ] 4.2 Align `WorldConstants.Seed` from `20260401` to **42** to match the captured fixtures, and move it into `NltSimConfig` so the core and the renderer read one value
- [ ] 4.3 Drive all builders (`TerrainBuilder`, `WaterBuilder`, `SkyBuilder`, `VegetationBuilder`, `SettlementBuilder`) from `NltWorldEngine.Core` noise/biome code instead of the prototype's local `SimulationRng` copy, so the world is reproducible from the core seed
- [ ] 4.4 Confirm `Daylight.cs` sampling is a pure function of sim time — it currently advances from wall-clock `delta` in `WorldView._Process` — and drive it from the deterministic clock instead

### Phase 5 — Interior scenarios

- [ ] 5.1 Rebuild Workplace / Personal / Social / Academic as **Godot sub-scenes instanced into one persistent world**, replacing UE's `.umap` + `TravelToLevel` + building-portal level streaming. This is a net simplification and removes the portal-streaming work that `ESC-001` deferred to Phase 3. **Also make the per-level scenario catalog live:** `EScenarioCategory` (`UScenarioDataAsset.h:10-16`) already partitions the 13 scenarios Workplace 5 / Personal 4 / Social 2 / Academic 2, and `UScenarioLibrary::GetScenariosByCategory()` already exists (`UScenarioLibrary.h:28`) — but `NLTDemoGameMode` resolves by a single `EditAnywhere DefaultScenarioId` defaulting to `wp_1` (line 84), so every interior runs one scenario. Bind category → interior sub-scene, and either make `LevelReference` that binding or delete it as dead weight (nothing reads it)
- [ ] 5.1a **Level extraction via FBX — geometry obtained 2026-10-02.** Godot 4.7 imports FBX natively via built-in **ufbx** (4.0–4.2 needed the external FBX2glTF CLI, unmaintained and no longer required). All four interiors were exported from UE and now live at `assets/levels/`; treat this as a **verification step, not an asset source**:
  - `OpenWorld_Level` **cannot be FBX-exported** — World Partition cells plus a Landscape heightfield, with the city, terrain and vegetation generated at runtime by `UNLTOpenWorldSubsystem::GenerateOpenWorld()` and the 12-entry `BuildingLayout` hardcoded at `../WorldEngine/Source/WorldEngine/Private/Scenarios/NLTDemoGameMode.cpp:53-66`. None of it is level data. Nothing is lost: Phase 4.3 rebuilds the outdoor world procedurally from the core seed
  - `Personal` / `Social` / `Academic` were exported from levels created by duplicating `Workplace_Level`, so expect the same geometry. **Confirm on first Godot import** rather than assume
  - Export carries geometry only: no lighting or baked GI, no Level Blueprint, no World Settings, no NavMesh volumes, no DataAsset references, no World Partition HLOD cells, no runtime-generated content
  - Interiors will need a baked `NavigationRegion3D`/`NavigationMesh` if the `AvatarAIController` path that used `UNavigationSystemV1` is ever ported
  - **Do not rescale on import.** If any fixture is ever captured from these levels, an import-time scale change shifts the canonical state text
  - **Do not let the export drive 5.2/5.4.** Rooms, props, affordances, smart-object locations and need scoring come from `NLTSmartObjectWorldSubsystem` and the scenario records — code, not assets
- [ ] 5.2 Port rooms, props, affordances, `NLTSmartObjectWorldSubsystem` location/need scoring (`ScoreLocation`, `MatchesNeed`), and `NLTRoomStateSubsystem` room state
- [ ] 5.3 Port scenario stressors and the `ScenarioGrowthMultiplier = 1 + aversiveness*0.5 + demand*0.5` rule
- [ ] 5.4 Wire the 13 scenario records from 2.9 as resources
- [ ] 5.5 **Scenario transitions** — `../README.md:5` promises agents *"transition between meaningful life scenarios"*, which is more than running one. UE only had `StartScenario`/`StopScenario`. Add a transition model: a scenario declares its successor conditions (lifecycle stage, `fusion_readiness` threshold, elapsed days), and the scenario manager can hand off mid-run, emitting a scenario-change event into the event bus so replays capture the transition

### Phase 5c — Character embodiment

`../README.md:7`: *"AI residents walk through this world with articulated bodies, animated walk cycles, and name labels."* UE never delivered this — `SM_SimBody_Base` is a static low-poly mesh and `CHAR-001` was blocked on missing mesh assets. In scope for the migration.

- [ ] 5c.1 **Articulated body** — source a rigged humanoid or author one in Blender, and import it as glTF (preferred: Godot's recommended interchange). FBX also works — Godot 4.7 imports it natively via built-in **ufbx** (4.0–4.2 needed the external FBX2glTF CLI, which is unmaintained and no longer required) — so a UE export is a valid fallback. Replaces `SM_SimBody_Base` + `AvatarCharacter`'s static-mesh path. **Validate on first import:** bone naming, skin-weight count, and that the skeleton is not rotated 90° with a 100× scale. That is the classic FBX axis failure, and 5c.2's procedural walk cycle is only as good as the skeleton it drives
- [ ] 5c.2 **Walk cycle** — drive animation **procedurally** from agent velocity and state, mirroring what UE's `NLTAvatarAnimInstance` did procedurally (`NativeUpdateAnimation` → `ApplyProceduralPose` with per-bone `FRotator` targets). This avoids authoring animation assets and keeps locomotion visually consistent with the semantic-action model in §3 — the animation reflects the sim's authoritative movement, never a model's opinion
- [ ] 5c.3 **Name labels** — `Label3D` per resident showing the agent name and current cognitive state, replacing UE's `UTextRenderComponent` door labels and `NLTAvatarVisualComponent` status ring. Also gives the spectator HUD a readable anchor
- [ ] 5c.4 Keep emotion→animation mapping, facial morph targets, and pair choreography **out** (see §8). If the emotion state machine is ported later, drive the walk-cycle parameters from it rather than porting `CHAR-001` wholesale

### Phase 6 — Simulation loop + Tier 2 golden vectors

- [ ] 6.1 Port the fixed-timestep clock (`FixedTimestepSeconds = 1/60`, `TicksPerMinute = 60`) with `AdvanceTick`/`AdvanceTicks` batch API and pace control (`pause/resume/step/toggle/pace`)
- [ ] 6.2 **No navmesh dependency for agents.** UE's Mass agents moved in straight lines closed-form; preserve that. Only `AvatarAIController` used `UNavigationSystemV1` — port that path separately or omit
- [ ] 6.3 Reproduce the UE processor execution order explicitly as a deterministic system list. `UNLTStateTreeBehaviorProcessor` declared `ExecuteInGroup="Tasks"`, `ExecuteAfter NLTScenarioNeedsProcessor`; keep needs-before-decide ordering — it is observable in state hashes
- [ ] 6.3a **Wire the tick loop through `IAgentController`**, so control is controller-agnostic: `for each agent: observation = Observe(); action = Act(observation); apply(action)`. The loop must not know which controller is mounted. Reproduce UE's three-mode switch (`ANLTTrainingGameMode` → training manager + RL, `bLLMControlActive` → LLM bridge, else deterministic) as a controller selection, not as branching logic in the loop
- [ ] 6.3b **Record every controller action into the replay stream**, including ML-originated ones. This is what keeps an ML-controlled run reproducible and is what makes 6.4a possible
- [ ] 6.4 **Tier 2 gate:** `NltWorldEngine.Core` must reproduce every captured fixture — identical canonical state text v2 per tick, identical RNG state, identical ordered event stream. This is the gate that retires UE. Captured and compared with `DeterministicUtilityController` mounted
- [ ] 6.4a **Tier 2b gate — recorded-action replay determinism.** Take a run whose actions came from a *non-deterministic* controller (an `LlmCommandController` stub or a fixture action stream), then re-run it from the recorded replay and assert identical canonical state text, RNG state and event stream. This proves an ML-controlled world is reproducible. It also **closes a known UE gap**: `../README.md:222` records that UE's replay *"verifies record integrity and observed final state but does not execute action payloads."* Tier 2b is not parity work — it is the gate UE never had, and it is the one that actually validates the embodied path
- [ ] 6.5 Port the Agent/Aide role manager (`NLTFusionRoleManager`: bond, fusion readiness, advocate assignment) and the episode manager completion rules
- [ ] 6.5a **Wire `ITrainingEnvironment` into the tick loop** so `Reward`/`IsComplete`/`Reset` are evaluated per agent per tick alongside the controller. Reward must derive from simulation state only (cognitive dims, needs, scenario progress, independence, burnout) — never from model output, or the training signal leaks model bias back into the environment
- [ ] 6.5b Add Tier 1 tests proving the training environment is deterministic across episode boundaries: run N episodes, replay the recorded actions, assert identical reward and completion sequences
- [ ] 6.6 Fix the documented UE findings rather than porting them: `SIM-001` reports the authoritative clock is disconnected and processors unregistered; `NLTPopulationScaler` is a stub that copies `FApp::GetDeltaTime()` twice and is never called — implement honestly or drop

### Phase 7 — Headless Godot + CI

- [ ] 7.1 Headless run mode: `--headless --fixed-fps` emitting the same `NLT_HEADLESS_TEST_COMPLETE`-style completion marker and canonical state text, so a Godot run is comparable to a UE run
- [ ] 7.2 New workflow `../.github/workflows/world-engine-godot-build.yml`: `dotnet build` + `dotnet test` on `NltWorldEngine.Core.Tests` (**no Godot install needed** — this is the gate that finally gives the repo a real regression net)
- [ ] 7.3 Optional `ubuntu-latest` Godot headless job for the Tier-4 run, using the mono build or a pinned export
- [ ] 7.4 Add a CI job for the Python sidecar + Tier-3 conformance (also currently untested by any workflow)

### Phase 8 — Governance boundary

- [ ] 8.1 `asfdk-csharp` is cloned at `../asfdk-csharp` on branch `feat/net8.0-target`. Port the ~40-line UE seam (`FAgentGovernanceState`) onto `NeuroLiftFoundation` — the mapping is 1:1:

  | UE `NLTGovernanceSubsystem` | `Asfdk.NeuroLiftFoundation` |
  |---|---|
  | `InitializeAgent` | `CreateFoundation.Create(config)` → `Initialize()` |
  | `ShutdownAgent` | `Shutdown()` |
  | `ProcessInteraction` | `ProcessInteraction(UserInteraction, Channel?)` |
  | `AssessAgent` | `AssessText(text, context?, channel?)` |
  | `GetGovernanceStatus` | `GetSystemStatus()` / `HealthCheck()` |

  Also available and unused by UE: `UpdatePreferences(prefs)` (TOI validation — throws on invalid), `PromptDefense.cs`, and per-component `ToiOtoi` / `Sleepwalker` / `Rrt` selected by `FoundationMode` (`Unified`, `CrisisOnly`, `ContinuityOnly`, `FrameworkOnly`, `Development`) with `FoundationComponents` overrides. That maps onto the `asfdk-profile: core_only` / `asfdk-mode: unified` frontmatter already in `../agents/*.md`.
- [ ] 8.2 Enforce the capability ≠ authority check on the action ingress path — not buried in the render loop
- [ ] 8.3 Write tests with a fake governance gate so the core stays testable without ASFDK present
- [ ] 8.4 Rewrite the `../mcp-config.yaml` governance note, which is written in UE-plugin terms, and replace the `unreal-mcp` entry with the Godot equivalent now present at `addons/godot_ai/` (see 0.8a–0.8d). The capability ≠ authority wording must survive the swap
- [ ] 8.5 Note: the UE plugin was **linked but dead** in the game module — a live check is a genuine improvement, not a parity obligation

### Phase 9 — Fusion wire

- [ ] 9.1 Implement `LlmCommandController` (the third `IAgentController`). Port the `UNLTLLMBridge` request/parse cycle under it. Godot is HTTP-**client** capable, so the LLM call direction is fine. Inference is far too slow for tick frequency, so this controller emits actions into the replay stream and they are applied **at tick boundaries** — do not block the tick loop on a network round trip
- [ ] 9.2 Preserve **provider neutrality** per OTOI §4.4 — no LLM provider hardcoded
- [ ] 9.3 Run end-to-end: `llm_avatar_agent.py` → sidecar → Godot → avatar moves; verify session/agent correlation, authorization, acks, and duplicate/timeout handling, which `../README.md:221` lists as unverified
- [ ] 9.4 Confirm the model stays on the semantic-action layer — `AgentAction` carries no position or velocity, per the invariant in §3 and `AvatarAIController.h:40-45`. A model that writes coordinates directly bypasses the movement authority and breaks replay

### Phase 10 — Cutover

- [ ] 10.1 **Preconditions for retiring UE — all three required.** Archiving the behavioural oracle is only safe when the port has been measured against it on behaviour, not just mechanics:
  1. **Tier 2-scenario passes** — multi-tick scenario behaviour reproduced from live UE fixtures. Requires SIM-001 (1.10) and a committed fixture set (1.5)
  2. **Tier 2-core passes** — core conformance. Available earlier; necessary but **not sufficient**
  3. **Tier 2b has run once with a real controller** — a learned policy's run replays identically from recorded actions

  **On (3):** 2b needs an ML controller, which lands in Phase D1. **As originally sequenced, D1 sits after Phase 10 — meaning UE could be retired before the embodied path has ever been validated.** For a repo whose vision is *"machine learning models inhabit a persistent world, **control their characters**"*, retiring the reference while that claim is unproven is premature by definition. **Therefore: a minimum viable forward-pass policy must land before 10.1.** Decision 3 still stands — the *PPO trainer* stays out-of-process and deferred; what is required here is only enough of a real policy to exercise 2b once. Consider promoting a minimal `RLPolicyController` from Phase D1 to before Phase 10.
- [ ] 10.2 Reverse `../docs/world-engine/DESIGN.md:15` and `:84` — they currently argue *against* Godot and are the strongest in-repo statement contradicting this plan
- [ ] 10.3 Rewrite `../AGENTS.md`, `../CLAUDE.md`, `../ARCHITECTURE.md`, `../README.md`, `../DEPLOYMENT.md`, `../ONBOARDING.md`, `../file-structure.md`, `../.hermes.md`; fix the stale `world-engine-v2/` and `world-engine/` root-directory entries (both are now under `_archive/`)
- [ ] 10.4 Remove the `unreal-mcp` entry from `../mcp-config.yaml` (superseded by `addons/godot_ai/`, see 0.8); re-check `../.claude/agents/` — the 5 Godot specialists currently fail because `../docs/engine-reference/godot/VERSION.md` is missing
- [ ] 10.5 Close `MIGRATE-001`; write handoff record to `../docs/agent-log/handoffs/`; note TRAIN-002 / DET-001 / LOD-001 / ST-001 status changes

---

## 5. Validation plan

| Tier | Gate | Needs a ticking world? | Blocks |
|---|---|---|---|
| 1 | `dotnet test` on `NltWorldEngine.Core.Tests` | No | Every later phase |
| **2-core** | Core-conformance vectors vs UE: RNG, canonical text v2, replay codec, event-bus ordering, LOD policy. These take explicit state inputs and do not read a live world | **No — available now** | Porting fidelity of the core (Phase 2) |
| **2-scenario** | Multi-tick scenario behaviour vs UE: agent movement, needs decay, decision ordering, stressor firing | **Yes — needs SIM-001 (1.10)** | **UE retirement (Phase 10)** |
| **2b** | Recorded-action replay determinism — an ML-controlled run replays identically | Yes, **and** needs an ML controller (Phase D1) | Declaring the embodied path reproducible — **and, per 10.1, UE retirement** |
| 3 | `fusion_protocol.py` + new conformance script vs sidecar | No | Phase 9 |
| 4 | Headless Godot run reproduces canonical state text | No | Cutover |

**Why Tier 2 is split.** It conflated two different things: the *encoding and mechanics* of the deterministic core, versus *scenario behaviour* over thousands of ticks. They have different prerequisites. Evidence that the core half is achievable today: **8/8 `NLT.Simulation` and 4/4 `NLT.VisualLOD.Policy` pass right now, with Mass never ticking** — those tests construct states directly instead of reading a ticking world.

**What the split buys.** Phases 2–5 are porting exactly those core functions, and they are verifiable against vectors UE can emit immediately. The earlier claim that "Phases 2–5 and UE retirement are all downstream of a gate that cannot yet be exercised" was **too strong**: retirement genuinely needs 2-scenario and 2b; Phases 2–5 do not.

**What the split does not buy, stated plainly.** 2-core catches RNG drift, hash mismatch, and replay corruption. It does **not** catch the errors most likely to bite — wrong needs decay, wrong decision ordering. Those live in 2-scenario. **2-core is necessary, not sufficient, and must never be read as a green light to retire UE.**

**Controller provenance — why 2-scenario needs no ML model.** Agent movement today is produced by `UNLTStateTreeBehaviorProcessor`, a deterministic state machine, not a learned policy. That is exactly why 2.6b makes `DeterministicUtilityController` both the baseline and the fixture controller: reproducible without a model. The ML controller arrives later behind the same `IAgentController` seam.

So what 2-scenario validates is **environment mechanics under a scripted policy** — not policy behaviour. Those are different gates and must not be conflated. **Policy reproducibility is 2b, and it is a separate claim.**

**Tier 2 is the load-bearing gate.** Until it passes, UE stays alive as the oracle. It is also the gate most sensitive to the float-representation decision in 1.2 — if canonical text stays `%.9g`, Tier 2 will produce false failures on float formatting rather than real divergence.

> **⚠️ Tier 2-scenario and 2b were unsatisfiable until SIM-001 was fixed (2026-10-02).** Every capture collapsed to a single unique state. **The original diagnosis was wrong** — recorded here so it is not repeated: it was *not* "Mass is not initialized / Mass never ticks". That came from a `DespawnAllAgents: MassEntity not initialized` log line emitted on **teardown**, not spawn. Mass was ticking throughout; instrumentation showed `UNLTScenarioDecisionProcessor` running once per tick with valid pointers. The real causes were (a) `UNLTSimulationStateSubsystem.SimulationTick` never written outside `ResetState`/`RestoreFromSnapshot` — nothing subscribed to `OnSimulationTick`, so the canonical clock stayed 0 — and (b) `NLTAgentSpawnerSubsystem` hardcoding `FNLTStateTreeBehaviorFragment::bEnabled = true`, which routes every agent to a behaviour layer that owns nobody, with **0 `.sttree` assets** in Content. **Lesson: the struct default was not the lever** — the spawner sets the field explicitly, so changing the default has no effect on spawned agents. Fixed in [#69](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/69): 600/600 unique blocks, clock 1→600, `WorldTime` 0→10 min, agents moving. Tier 1, 2-core, 3 and 4 were never blocked and remain valid.

**Tier 2b is what makes the vision testable.** Tier 2 proves the physics/logic port is faithful but runs with a scripted controller, so it says nothing about whether a model can actually drive the world reproducibly. Tier 2b is the gate that closes that question — and it is a stronger claim than UE ever made, since UE never executed replayed action payloads at all.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Float formatting divergence masquerading as logic divergence | High | Bit-exact IEEE-754 hex for canonical state text v2 (1.2) |
| **Live fixtures now produce; residual event-stream gap** — captures are live (600/600 unique blocks, agents move) after #69/#70, so the original blocker is **Resolved**. What remains is narrower: `UNLTEventBus` has **four** writers, all in `UNLTWorkplaceEnvironmentSubsystem`, so the event stream is non-empty **for Workplace only**. **This row was wrong twice before:** it read *"fixtures never captured because UE stops building"* (build fragility), then *"no live fixture because Mass never ticks"* (a teardown warning misread as a spawn failure), then *"the event bus has zero writers"* (grepped for `Publish(`, an API that does not exist here). | ~~High~~ → **Medium** | Re-run the capture on a Workplace level — producers exist, so this needs no behavioural change and stays inside the carve-out. Then decide whether to generalise the environment model to the other three scenarios, or record that event assertions apply only to the Workplace fixture (1.13) |
| Godot `.csproj` + `ProjectReference` headless test wiring fights the Godot SDK | Medium | Keep `NltWorldEngine.Core` a plain `net8.0` class library; only the Godot app references the SDK |
| C# web export unavailable | Medium | Accepted; native Godot app is the spectator (see §9) |
| `asfdk-csharp` is **pre-1.0** (v0.3.0, single merged PR) — API may move | Medium | Pin the commit; keep the governance seam behind `IGovernanceGate` so a bump cannot leak into the core |
| .NET 8 SDK unavailable on CI runners | Low | `actions/setup-dotnet` |
| Tier 2 exposes real divergence in needs decay / decision ordering | Medium | **Expected and valuable** — that is what the gate is for; fix the core, do not relax the fixture |
| Scope creep into cosmetics | Medium | See §8 — deliberately deferred |
| A model writes coordinates directly, bypassing the movement authority and breaking replay | Medium | `AgentAction` carries no position/velocity; invariant test at 2.6b, re-checked at 9.4 |
| Tick loop blocks on LLM inference (~100 ms–s) and stalls the sim | Medium | `LlmCommandController` is out-of-band and applies at tick boundaries; never await inside the tick |
| Tier 2 passes with the scripted controller while the embodied path is still unproven | Medium | That is what Tier 2b exists for (6.4a) — do not treat Tier 2 as evidence the ML path works |
| No product code is verified by any CI workflow (the one that existed is dead) | Low | Fixed in 0.6; Phase 7.2 replaces it with a live gate |

---

## 7. Known intentional divergences from UE

Record each in an ADR under `../docs/adr/`:

1. WS broadcast actually delivers events (UE never did)
2. Persistence is JSON, not raw memory blobs
3. `NLTPopulationScaler` implemented honestly or dropped (UE stub was never called)
4. Governance is a live check (UE's was linked but dead)
5. Interiors are instanced sub-scenes, not level-travel + portal streaming
6. Core state hash is SHA-256, not BLAKE3
7. **Replay records are actually executed.** UE's replay verified integrity and observed final state but never ran the action payloads (`../README.md:222`). Godot executes them, which is what Tier 2b depends on. This is a capability UE did not have — record it as such, not as a fix

---

## 8. Explicitly out of scope

- **RL / PPO trainer** — deferred per decision 3, but **not the seam that hosts it** (2.6a–2.6d) and **not the training-environment surfaces** (2.6d–2.6e, 6.5a–6.5b), both of which are in scope. Phase D1 adds `RLPolicyController` as a drop-in on an existing interface, running PPO out-of-process in Python over contract-v1, reusing `../WorldEngine/Scripts/train_nlt_ppo.py`. Do not adopt Godot `RLModules` + PyTorch Connect; it would break framework neutrality.
- **Asset re-import** — Fab Modern City GLBs, Blender desk kits, 4 WAV soundscape beds, and UE's `SM_SimBody_Base` (a static low-poly mesh, not a rig — 5c.1 brings its own humanoid). Anything trapped only in a `.uasset` can be recovered as `.uasset → UE export FBX → Godot (ufbx)`, which is geometry-only; see 5.1a for what that does and does not carry. Later mechanical pass, not a blocker.
- **Character work beyond embodiment** — emotion→animation mapping, facial morph targets, pair choreography (UE `CHAR-001`), MetaHuman. Deliberately excluded so 5c stays small; 5c.4 leaves a hook for the emotion state machine to drive walk-cycle parameters later.
- **Niagara VFX, PCG, MetaHuman, soundscape audio**
- **Population LOD / simulation-frequency LOD** — `NLTPopulationScaler` was a stub; `LOD-001` was explicitly visual-only.
- **Web spectator client** — see §9.
- **LLM provider selection** — guarded by OTOI §4.4.

---

## 9. Open question

**Spectator surface.** Not answered before planning. Recommended default: **the native Godot app is the spectator** — extend the existing `WorldView.cs` orbit camera with a HUD bound to live sim state, matching the already-recorded UE stance that "the human watches the same world in which the agents simulate and train" (`../ARCHITECTURE.md:26`). No web viewer required, and Godot 4 cannot export this C# project to web anyway.

If a browser-based spectator is wanted later, revive `../_archive/world-engine-v2` (Babylon.js) as a thin client against the sidecar. Note its logic layer must be rewritten from scratch: it contains **no `fetch`, no `WebSocket`, no `XMLHttpRequest`** — `simulation.ts` is a pure client-side timer and `data.ts` hardcodes all world data.

**`asfdk-csharp` — resolved 2026-10-02.** Cloned to `../asfdk-csharp` (main @ `4183298`, public).

| Property | Value |
|---|---|
| SDK | `Microsoft.NET.Sdk` (plain, **not** `Godot.NET.Sdk`) — consumes cleanly via `ProjectReference` |
| TFM | **`net8.0`** — retargeted from `net10.0` on branch `feat/net8.0-target`, matching the Godot project |
| Assembly / namespace | `Asfdk` |
| Version | `0.3.0` — pre-1.0, single merged PR (`feature/port-asfdk-csharp`) |
| Packaging | **No `PackageId`, no NuGet publish** — submodule or `ProjectReference` only |
| Tests | xUnit 2.4.2, **14/14 passing** on net8.0 |
| Build | Clean on net8.0; 2 pre-existing `CS8601` nullable warnings at `NeuroLiftFoundation.cs:160,216` (not TFM-dependent, not introduced by the retarget) |

Retarget decision: port `Asfdk` down to `net8.0` rather than bumping the Godot project to `net10.0`, so the whole stack shares one TFM (`Asfdk`, `NltWorldEngine.Core`, `NltWorldEngine.Core.Tests` all `net8.0`). A `net8.0` project cannot reference a `net10.0` project, so one side had to move; moving the library is the cheaper and more compatible direction.

API surface and the UE seam mapping are in 8.1. `CreateFoundation.Create` is async and `ProcessInteraction` is async, so the governance gate must not block the render loop — call it on the simulation tick path or via the sidecar ingress, not per frame.

---

## 10. Do not do

- Do not modify `../NLT-DEV-OTOI.md` — it is protected by OTOI §9
- Do not commit, push, or open a PR without explicit instruction; work lands on `feat/godot-migration` via PR per OTOI §4.4
- Do not retire or archive UE before Tier 2 passes
- Do not change any UE simulation behavior after Phase 1.6 — UE is a frozen oracle
- Do not change the wire contract (`nlt.fusion-unreal` 1.0 / `nlt.world-engine.v1`) — Fusion is an external consumer
- Do not hardcode an LLM provider
- **Do not install a third-party plugin.** Reserved to Joshua personally (2026-10-02). Not into the repository, not onto a machine, not via an MCP tool. Not delegable. If a task appears to need one, escalate and stop — do not add it as a convenience. `addons/godot_ai/` is the live case: already on `main` with no approval record, pending ratification under 0.8
- Do not exceed **100 changed files** in a single PR. CodeRabbit skips review entirely above that limit, so an over-sized PR ships with no automated review at all — which is how a correctness fix can end up unverified. Put mechanical churn (untracking build caches, relocating binary assets, regenerating lockfiles) in its own PR. Enforced as a checklist item in `.github/PULL_REQUEST_TEMPLATE.md`. PR #65 hit 123 files and was skipped; accepted as a one-off with human review in its place

---

## 11. README vision conformance

`../README.md:5-9` is a **target specification**, not a description of the current build. Audited claim-by-claim against this plan:

| README claim | Plan | Delivered by UE today? |
|---|---|---|
| embodied multi-agent simulation | ✓ | yes |
| ML models inhabit the world, control their characters | ✓ | yes (3 modes) |
| interact with environments | ✓ | yes (smart-object scoring) |
| **interact with other agents** | ✗ gap | **no agent↔agent interaction system** |
| **transition between meaningful life scenarios** | ✓ (5.5) | **no — only Start/StopScenario** |
| procedural terrain, water, sky, vegetation, settlement | ✓ | yes — exact 5-for-5 match with the prototype's 5 builders |
| live, **perceive**, act | ✓ | partially — observation existed, no perception surface |
| **learn** | ✓ (2.6d–2.6e, 6.5a–6.5b) | surfaces existed, never verified |
| **realistic graphics** | ✗ gap | primitives; Nanite/Lumen off |
| **articulated bodies, animated walk cycles, name labels** | ✓ (5c) | **no** — `SM_SimBody_Base` is static low-poly; `CHAR-001` blocked on missing assets |
| humans watch through a spectator viewer | ~ (§9) | no viewer |
| deterministic runtime; world state, space, time, objects, needs | ✓ | yes |
| **NPCs** | ✗ gap | **no NPC system** — "residents" are `AAvatarCharacter`, not NPCs |
| **authoritative simulation training environment** | ✓ (2.6d) | surfaces existed, unverified |
| scenario instantiation | ✓ | yes |
| intelligence in Fusion via **the agent interface** | ✗ gap | cross-repo seam unspecified |

### Gaps this migration does not close

Three claims are unmet **and unmet in UE** — the migration is not what blocked them, and fixing them here would scope-creep the port:

1. **Agent↔agent interaction.** Avatar↔Aide bonding exists via `NLTFusionRoleManager`, but there is no general interaction surface between arbitrary agents. Design needed, not just porting.
2. **NPCs.** Named in `README.md:9` as an owned subsystem. Does not exist. Needs a population model, a behaviour set, and needs to be present in the observation/action contract.
3. **Realistic graphics.** The prototype's procedural primitives are a deliberate, defensible answer; UE was not achieving realism either.

Each should get its own thread in `../docs/active-threads.md` rather than being silently inherited. If any is actually a blocker for you, say which and it moves into the migration as a named phase.

### The Fusion seam

`README.md:9` states intelligence *"lives in `neurolift-ai-fusion` and connects through **the agent interface**"* — a **cross-repo** contract, distinct from the in-process `IAgentController` of §3. The migration does not redefine it. It is served by: contract-v1 snapshots over `/api/snapshot`, the versioned `nlt.fusion-unreal` 1.0 action envelope, and `/api/control` for pace and scenario assignment. Pin all three as the Fusion-facing surface and add a Tier 3 conformance case per route so a Fusion upgrade cannot silently break.
