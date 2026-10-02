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
| `addons/godot_ai/` | — | Third-party Godot↔MCP bridge (`hi-godot/godot-ai`, MIT) | Keep — **see 0.8** |

### `addons/godot_ai/` — newly added, needs governance decisions

This is the Godot counterpart to the `unreal-mcp` entry in `../mcp-config.yaml`, so it closes the open item in 8.4/10.4. It was added outside the thread record and has not been reviewed here. Three things need decisions:

- [ ] **0.8a** OTOI §4.4 guardrail — *no external integrations without Joshua's approval.* This addon is third-party and auto-starts an MCP server. Confirm approval and record it in `../docs/escalations/2026-10-02-godot-migration.md`.
- [ ] **0.8b** It bootstraps a **Python server via `uv`** (`uv` is a new external toolchain dependency). Confirm it is acceptable for this repo, and that the dependency is pinned and reproducible.
- [ ] **0.8c** Add an `mcp-config.yaml` entry and rewrite the UE-specific governance note. The existing note draws a deliberate boundary — *"development-plane interface… does NOT grant simulated agents runtime authority"* — and that boundary must survive the swap: editor automation is a dev plane; runtime agent actions must still pass through the sidecar and the ASFDK-C# gate. Keep that wording; change only the UE nouns.
- [ ] **0.8d** Confirm it is compatible with Godot **4.7.2 mono + C#** before relying on it. Its README states 4.5+ / 4.7+ recommended but says nothing about the C# variant.

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
| Governance CI is **currently failing**: validator requires `workflows/validate-governance.yml`; actual path is `.github/workflows/…` | `../.nltotoi/scripts/validate-governance.sh:131`, `../nltotoi.json:35` |
| `.gitignore` has no Godot entries; this `.godot/` cache sits in the working tree | `../.gitignore` |
| **No CI builds UE, runs UE tests, tests Python, or builds Godot** — no safety net to break, no gate to preserve | `../.github/workflows/*` (2 files) |
| ASFDK on **Win64 is stubs only**; real `libasfdk.a` needed on Linux; ASFDK vendors two divergent `nlohmann/json.hpp` copies | `../WorldEngine/Plugins/NLTGovernanceSubsystem/` |

---

## 2. Settled decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Target state | **Staged.** Godot becomes authoritative only after a validated port; UE stays alive as the behavioral oracle until Tier 2 conformance passes | No CI safety net exists today; an untested rewrite is not verifiable |
| 2 | Language | **C# / .NET 8**, continuing this project | Prototype already C#; typed; xUnit gives the Tier-1 gate without launching Godot; closest float semantics to the C++ being ported |
| 3 | RL training | **Deferred out of the migration gate.** Deterministic state-machine agents first; PPO later as out-of-process Python over contract-v1 | UE RL was never verified end-to-end (`TRAIN-002` open); Godot has no Learning Agents equivalent; keeps OTOI §4.4 framework-neutrality |
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

---

## 4. Ordered phases

### Phase 0 — Governance and freeze the oracle (do this first, it is time-sensitive)

UE builds today; it may not tomorrow. Capturing golden fixtures is only possible while UE runs.

- [ ] 0.1 Add `.gitignore` entries in `../` **before the first commit**: `.godot/`, `.import/`, `export.cfg`, `export_presets.cfg`
- [ ] 0.2 Write escalation record `../docs/escalations/2026-10-02-godot-migration.md` from `../templates/escalation.md` — records Joshua's approval of the framework change per OTOI §4.4
- [ ] 0.3 File a `governance-proposal` issue for the core-principle amendment: *"Fusion owns semantic reality; Unreal owns physical reality"* → *"…Godot owns physical reality"* (appears in `../AGENTS.md`, `../CLAUDE.md`, `../ARCHITECTURE.md`, `../README.md`, `../DEPLOYMENT.md`, `../.hermes.md`)
- [ ] 0.4 Register thread `MIGRATE-001` in `../docs/active-threads.md`; write agent registration + intent log to `../docs/agent-log/`
- [ ] 0.5 Branch `feat/godot-migration`; commit this currently-untracked prototype as `[HUMAN] chore(godot): commit untracked Godot 4.7.2 C# prototype` (credit the unknown author — do not reattribute)
- [ ] 0.6 **Fix the two pre-existing CI breakages** (Phase 7 depends on working CI): `validate-governance.sh:131` + `nltotoi.json:35` path drift to `.github/workflows/…`; delete or re-point the dead `world-engine-v2-build.yml`
- [ ] 0.7 Document toolchain prerequisites: Godot **4.7.2 mono** + .NET 8 SDK; add `../docs/engine-reference/godot/VERSION.md` (the 5 imported `../.claude/agents/godot-*.md` specialists all fail their mandatory version check against this missing file)

### Phase 1 — Capture golden fixtures from UE

- [ ] 1.1 Add a UE-only fixture emitter: extend `UNLTScenarioManagerSubsystem::BeginHeadlessSelfTest` to write per-tick canonical state text, RNG state, ordered event stream, and replay JSON to `Saved/Fixtures/seed{N}/`. New emitter, existing subsystem — do not alter simulation behavior
- [ ] 1.2 Define **canonical state text v2** as **bit-exact hex of IEEE-754**, not `%.9g`/`%.17g` decimal. Rationale: printf `%g` and .NET `G9` differ in exponent formatting and trailing-zero suppression, so byte-exact text equality across C++ and C# is not achievable portably. Bit-exact encoding removes the whole class of float-formatting ambiguity. Bump the version string to `NLT.WorldEngine.State.v2`
- [ ] 1.3 Capture at seed **42** (matches the verified `standalone -game seed 42` run) for ≥3 scenarios and N ≥ 20,000 ticks, plus at least one case exercising stressors, needs saturation and Aide interventions
- [ ] 1.4 Capture the existing `NLT.VisualLOD.Policy` policy inputs as Tier-2 vectors too (currently 4/4 passing in UE)
- [ ] 1.5 Commit fixtures under `../fixtures/` with a `PROVENANCE.md` recording the exact UE build, commit, seed, tick count and command line used
- [ ] 1.6 **From here on, UE is frozen** — reference only. No UE behavior changes.

### Phase 2 — `NltWorldEngine.Core` + Tier 1 tests

Port these from UE, preserving semantics exactly:

- [ ] 2.1 `Rng.cs` — port `FNLTRandomStream` (LCG `Seed*1103515245+12345`, `GetFraction/GetRange/IntRange/Reset`) and this prototype's mulberry32 (`SimulationRng`). **Keep float ops in `float`/`double` with explicit `unchecked`**; UE used `float` on many paths
- [ ] 2.2 `CanonicalState.cs` — port `BuildCanonicalStateText`, emit v2 bit-exact, preserve the order-insensitive sort (agents and events sorted by name) so hashes stay stable
- [ ] 2.3 `StateHash.cs` — algorithm as an implementation detail. .NET has SHA-256 built in, not BLAKE3; use `System.Security.Cryptography.SHA256` and version the digest algorithm in the record. Tamper-check semantics preserved
- [ ] 2.4 `Replay.cs` — port `FNLTDeterministicReplay` (contract `nlt.world-engine.replay.v1`): per-action `NLT.Replay.Action.v1` and per-event `NLT.Replay.Event.v1` hashes, sequence + tamper validation, JSON round-trip
- [ ] 2.5 `EventBus.cs` — port the 256-entry ring buffer and all 30 `ENLTSimulationEventType` values. **Replace UE dynamic multicast delegates with plain C# events** so the core stays engine-free
- [ ] 2.6 `Agents/` — port the 6 agent fragments, `FNLTStateTreeBehaviorFragment`, and the full behavior state machine from `NLTStateTreeBehaviorProcessor.cpp` (`Idle → EvaluateNeeds → SelectTarget → MoveToTarget → Arrived`, `FallbackWander`). **No StateTree equivalent is needed — there are no `.sttree` assets to port.** Port `NLTDemoScenarioUtils.h` candidate-sort ordering (score↓, dist↑, name↑) verbatim
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

- [ ] 5.1 Rebuild Workplace / Personal / Social / Academic as **Godot sub-scenes instanced into one persistent world**, replacing UE's `.umap` + `TravelToLevel` + building-portal level streaming. This is a net simplification and removes the portal-streaming work that `ESC-001` deferred to Phase 3
- [ ] 5.2 Port rooms, props, affordances, `NLTSmartObjectWorldSubsystem` location/need scoring (`ScoreLocation`, `MatchesNeed`), and `NLTRoomStateSubsystem` room state
- [ ] 5.3 Port scenario stressors and the `ScenarioGrowthMultiplier = 1 + aversiveness*0.5 + demand*0.5` rule
- [ ] 5.4 Wire the 13 scenario records from 2.9 as resources

### Phase 6 — Simulation loop + Tier 2 golden vectors

- [ ] 6.1 Port the fixed-timestep clock (`FixedTimestepSeconds = 1/60`, `TicksPerMinute = 60`) with `AdvanceTick`/`AdvanceTicks` batch API and pace control (`pause/resume/step/toggle/pace`)
- [ ] 6.2 **No navmesh dependency for agents.** UE's Mass agents moved in straight lines closed-form; preserve that. Only `AvatarAIController` used `UNavigationSystemV1` — port that path separately or omit
- [ ] 6.3 Reproduce the UE processor execution order explicitly as a deterministic system list. `UNLTStateTreeBehaviorProcessor` declared `ExecuteInGroup="Tasks"`, `ExecuteAfter NLTScenarioNeedsProcessor`; keep needs-before-decide ordering — it is observable in state hashes
- [ ] 6.4 **Tier 2 gate:** `NltWorldEngine.Core` must reproduce every captured fixture — identical canonical state text v2 per tick, identical RNG state, identical ordered event stream. This is the gate that retires UE
- [ ] 6.5 Port the Agent/Aide role manager (`NLTFusionRoleManager`: bond, fusion readiness, advocate assignment) and the episode manager completion rules
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

- [ ] 9.1 Port `UNLTLLMBridge` request/parse cycle. Godot is HTTP-**client** capable, so the LLM call direction is fine
- [ ] 9.2 Preserve **provider neutrality** per OTOI §4.4 — no LLM provider hardcoded
- [ ] 9.3 Run end-to-end: `llm_avatar_agent.py` → sidecar → Godot → avatar moves; verify session/agent correlation, authorization, acks, and duplicate/timeout handling, which `../README.md:221` lists as unverified

### Phase 10 — Cutover

- [ ] 10.1 Only after Tier 2 passes: move `../WorldEngine/` (UE) to archive; delete the UE-only plugins (`McpAutomationBridge` ~50 files, `VisualStudioTools`)
- [ ] 10.2 Reverse `../docs/world-engine/DESIGN.md:15` and `:84` — they currently argue *against* Godot and are the strongest in-repo statement contradicting this plan
- [ ] 10.3 Rewrite `../AGENTS.md`, `../CLAUDE.md`, `../ARCHITECTURE.md`, `../README.md`, `../DEPLOYMENT.md`, `../ONBOARDING.md`, `../file-structure.md`, `../.hermes.md`; fix the stale `world-engine-v2/` and `world-engine/` root-directory entries (both are now under `_archive/`)
- [ ] 10.4 Remove the `unreal-mcp` entry from `../mcp-config.yaml` (superseded by `addons/godot_ai/`, see 0.8); re-check `../.claude/agents/` — the 5 Godot specialists currently fail because `../docs/engine-reference/godot/VERSION.md` is missing
- [ ] 10.5 Close `MIGRATE-001`; write handoff record to `../docs/agent-log/handoffs/`; note TRAIN-002 / DET-001 / LOD-001 / ST-001 status changes

---

## 5. Validation plan

| Tier | Gate | Runs where | Blocks |
|---|---|---|---|
| 1 | `dotnet test` on `NltWorldEngine.Core.Tests` | CI, stock runner, no Godot | Every later phase |
| 2 | Golden-vector equality vs fixtures from Phase 1 | CI, headless | **UE retirement** |
| 3 | `fusion_protocol.py` + new conformance script vs sidecar | CI, no engine | Phase 9 |
| 4 | Headless Godot run reproduces canonical state text | CI with Godot | Cutover |

**Tier 2 is the load-bearing gate.** Until it passes, UE stays alive as the oracle. It is also the gate most sensitive to the float-representation decision in 1.2 — if canonical text stays `%.9g`, Tier 2 will produce false failures on float formatting rather than real divergence.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Float formatting divergence masquerading as logic divergence | High | Bit-exact IEEE-754 hex for canonical state text v2 (1.2) |
| Fixtures never captured because UE stops building | High | Phase 0/1 first, before anything else |
| Godot `.csproj` + `ProjectReference` headless test wiring fights the Godot SDK | Medium | Keep `NltWorldEngine.Core` a plain `net8.0` class library; only the Godot app references the SDK |
| C# web export unavailable | Medium | Accepted; native Godot app is the spectator (see §9) |
| `asfdk-csharp` is **pre-1.0** (v0.3.0, single merged PR) — API may move | Medium | Pin the commit; keep the governance seam behind `IGovernanceGate` so a bump cannot leak into the core |
| .NET 8 SDK unavailable on CI runners | Low | `actions/setup-dotnet` |
| Tier 2 exposes real divergence in needs decay / decision ordering | Medium | **Expected and valuable** — that is what the gate is for; fix the core, do not relax the fixture |
| Scope creep into cosmetics | Medium | See §8 — deliberately deferred |
| CI governance validator still failing | Low | Fixed in 0.6 |

---

## 7. Known intentional divergences from UE

Record each in an ADR under `../docs/adr/`:

1. WS broadcast actually delivers events (UE never did)
2. Persistence is JSON, not raw memory blobs
3. `NLTPopulationScaler` implemented honestly or dropped (UE stub was never called)
4. Governance is a live check (UE's was linked but dead)
5. Interiors are instanced sub-scenes, not level-travel + portal streaming
6. Core state hash is SHA-256, not BLAKE3

---

## 8. Explicitly out of scope

- **RL / PPO** — deferred per decision 3. Later: out-of-process Python trainer over contract-v1, reusing `../WorldEngine/Scripts/train_nlt_ppo.py`. Do not adopt Godot `RLModules` + PyTorch Connect; it would break framework neutrality.
- **Asset re-import** — Fab Modern City GLBs, Blender desk kits, `SM_SimBody_Base` skeletal rig, 4 WAV soundscape beds. Godot imports glTF natively, so this is a later mechanical pass, not a blocker.
- **Cosmetic character work** — skeletal animation, emotion state machine → animation mapping, facial morph targets, pair choreography (UE `CHAR-001`). All cosmetic; `AVATARS` in the archived viewer was already `never[]`.
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
