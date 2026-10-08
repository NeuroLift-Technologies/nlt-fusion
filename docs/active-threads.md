# Active Threads — nlt-world-engine

> This file tracks active work threads. Agents must read this at session start and update it during and at the end of each session.

**Last updated:** 2026-10-08

---

## Active Threads
### 🔁 AGENT-LOOP-001 — Fusion semantic / Godot physical closed loop

- **Status:** transport-neutral protocol, governance gate, intent ingress, perception builder, and async loopback HTTP transport delivered; cross-process loop validated with a live smoke test; in-scene wiring and SessionOrchestrator remain.
- **Decision:** use a closed loop (engine-owned perception → Fusion semantic intent → engine-owned execution/result). **Transport decided 2026-10-08 (Joshua): asynchronous loopback HTTP request/response** — Godot POSTs each perception to a Fusion endpoint; Fusion returns a correlated intent. Chosen because it fits the single-avatar low-frequency decision cycle, is straightforward across C# and Python, and avoids a persistent WebSocket session. Revisit WebSockets only if later requirements need streaming or multiple high-rate channels. Constraints: model inference stays off the Godot physics/render thread; enforced timeouts; one in-flight request per avatar; stale ticks rejected; fail closed on transport errors. Godot still performs ASFDK governance, live-world validation, and physical execution.
- **Ownership:** Fusion owns semantic decisions; the world engine owns physical facts, target/affordance validation, movement, collision, and consequences; ASFDK-C# governs intents at engine ingress before physical execution.
- **Delivered:** `docs/contracts/agent-loop-v1.md` and its JSON Schema; `docs/agent-loop.md` feature overview; strict Godot DTO parsing/validation; Fusion-side injectable decision/validation seam; `Agents/GovernanceGate.cs` with real `asfdk-csharp` integration; `Agents/IntentIngress.cs` with contract validation, governance, live-world revalidation, and locomotion dispatch; `Agents/PerceptionBuilder.cs` with live avatar state, task anchors, and nearby-avatar observations; focused harness assertions. **Transport layer (2026-10-08):** `Agents/FusionHttpLink.cs` (async POST, background tasks, 5 s timeout, one-in-flight per avatar, correlated response validation, fail-closed on transport errors) + `Agents/AgentLoopDriver.cs` (per-avatar perception cadence → link → ingress); Fusion side `neurolift-ai-fusion/src/fusion/agent_loop_http.py` (FastAPI `POST /agent-loop/perception`, wraps `FusionAgentLoop`, inference via `asyncio.to_thread`, one-in-flight 429, `FUSION_GGUF_MODEL` or deterministic fallback). Verified: Godot build 0 errors, harness 36/36, Fusion pytest 19/19 (7 new HTTP + 12 seam), **live cross-process smoke test**: POST perception → 200 correlated intent (`observedTick: 42`, `approach`/`desk_1`, no physical fields); malformed body → 422 fail-closed.
- **Open:** Fusion seam is not wired into `SessionOrchestrator`; `AgentLoopDriver`/`FusionHttpLink` not yet instantiated in `Main.tscn` (needs `EnableLiveAvatars` + driver node); no GGUF model path wired for production decisions (fallback decision source used in smoke test); no cross-process automated smoke test in CI.
- **Next gate:** instantiate `AgentLoopDriver` in the Godot scene and run a full Godot↔Fusion loop with ASFDK governance in the path; connect Fusion `SessionOrchestrator` (Copilot); automate the cross-process smoke test. Keep the current engine-side governance, live-world checks, and physical ownership intact.

### 🧭 ENG-002 — Godot replaces UE

- **Status:** decision recorded; current repository docs now aligned.
- **Decision (2026-10-07, Joshua):** Godot replaces UE 5.8 in its entirety as the world engine's authoritative runtime. The UE tree remains frozen, non-authoritative historical reference material, not a conformance oracle.
- **Implementation scope:** Godot owns the complete physical simulation runtime, not just rendering. Fusion continues to own semantic cognition and intents; the transport-neutral boundary is tracked by `AGENT-LOOP-001`.
- **Historical plans:** `world-engine-godot/MIGRATION-PLAN.md` and `RENDERER-PLAN.md` describe superseded decisions and must not be used as current implementation instructions.

### 🧭 DIV-001 — Simulation ownership boundary (SUPERSEDED 2026-10-07)

- **Status:** superseded by Joshua's clarification the same day — the original principle stands: **Fusion owns semantics; `nlt-world-engine` owns the physical.** No joint-ownership rewrite is happening.
- **New requirement (2026-10-07, Joshua):** the AI must **"see" and interact with the physical world.** Concretely: agents need a perception surface (what they can see: nearby people, objects, places) and semantic actions (approach / look_at / use / sit / rest / communicate) whose physical effects — movement, collision, object state — are executed and owned by the world engine. This is the missing layer flagged in AGENT-SYSTEM.md gaps 1, 5, 6 and extends `AgentObservation` beyond its current self-state-only fields.

### 🧭 PHYS-001 — Jolt Physics as the engine's 3D physics backend

- **Status:** open — decision recorded; collision wiring still pending
- **Owner:** **Joshua** (decision), survey by Fledge (2026-10-07)
- **Decision (2026-10-07, Joshua):** the world engine's 3D physics engine is **Jolt**.
- **Survey result:** `world-engine-godot/project.godot` already declares `[physics] 3d/physics_engine="Jolt Physics"` (line ~41). No Jolt addon under `world-engine-godot/addons/` — Joshua confirms Jolt is built into the Godot build in use. Consistent.
- **Known gap this gates:** `AgentBrain` has no `CharacterBody3D`/physics body (AGENT-SYSTEM.md §8.6), `TerrainBuilderPhysics` is an empty placeholder — so movement still has no collision resolution. Wiring that up should target Jolt via `CharacterBody3D` + `move_and_slide()` and static level collision.
- **Update 2026-10-08 (Cline):** `AgentBrain` is now `CharacterBody3D` with `MoveAndSlide()` per-physics-tick + `AvatarCharacter : AgentBrain` capsule scene (`Agents/avatar.tscn`) + `Main.SyncLiveAvatars` spawning live Jolt bodies behind `EnableLiveAvatars=false`. `TerrainBuilderPhysics` still an empty placeholder; `EnsureAvatarGround` flat StaticBody3D covers levels without collision. AGENT-SYSTEM.md §8.6 is now stale and needs a refresh pass.
- **Next action:** when agent embodiment gains collision, verify against the Jolt server (not GodotPhysics) and note any `CharacterBody3D` behavioural differences.

### 🔭 OBS-001 — Phase D observer (Godot renderer + spectator)

- **Status:** open — D.1–D.5 delivered; **claimed by Kilo 2026-10-04**; mouse input and layout still need a human click-through
- **Owner:** **Kilo** (claimed 2026-10-04, authorised by Joshua — the previous owner could not be identified) · **Forked from:** `MIGRATE-001` · **Branch:** `main` ⚠️ *the thread's `feat/observer-phase-d` was merged (PR #83); uncommitted work now sits on `main`*
- **Started / Last updated:** 2026-10-03 · **claimed 2026-10-04**
- **Plan:** [`world-engine-godot/RENDERER-PLAN.md` §6](../world-engine-godot/RENDERER-PLAN.md)
- **Scope:** the six required panels, three reading levels, transport controls, accessibility, and the four-way burnout reading. Godot is a **renderer** here — it reads state and shows it, and computes no level, burnout verdict or fusion score (contract §2).
  - **Extended 2026-10-04 by Joshua's direction:** reading level now also governs *how much* of the observer exists at once (not only wording depth), and panels are user-resizable by drag or keyboard.
- **Delivered:**
  - `world-engine-godot/Observer/` — six panels, `ObserverRoot` layout, `AccessibilitySettings`, `BurnoutNarrative`, `PlainLanguage`, `Ui` (colour-safe palette + glyph vocabulary), `WorldViewHud`, `ObserverCapture`.
  - `world-engine-godot/Feed/` — a replay-capable reader and transport. **Reuses PR #80's model types unchanged**; adds only what Phase A's single-document loader does not do (a *sequence* of documents, and reporting problems instead of throwing).
  - `tools/make_replay_fixture.py` + `world-engine-godot/fixtures/replay/` — three multi-frame bundles that make the Learning Timeline and all four D.5 readings reachable. The StayAlert bundle's final frame is asserted content-equivalent to `state-feed.sample.json`, so the two fixtures describe one history.
  - Verification: 43-case feed harness (parse/validate against 18 mutated fixtures, every bundle, coherence check), `--selftest` layout assertions, rendered capture at all three reading levels.
- **🔴 Blocker — mouse input is unverified.** Synthetic `Input.ParseInputEvent` does not reach Godot's GUI in this environment: a bare probe `Button` outside the observer is equally unclickable, so a click-based test is a false negative and was discarded. Layout, popup geometry and shortcuts are asserted; **clicking needs a human.** Every control also has a keyboard shortcut (`1`/`2`/`3`, `Space`, `←`/`→`, `End`, `R`, `O`, `F1`–`F4`), so the observer is fully operable without a mouse.
- **Bugs found in existing work, reported not silently absorbed:**
  - `tools/validate_state_feed.py` **failed the shipped fixture** — the contract and fixture spell the assisted-recovery mode `rrt`, the validator accepted only `rt`. Fixed to accept `rrt` and warn on `rt`; which spelling Fusion emits is Joshua's call. See [`docs/escalations/2026-10-03-state-feed-recovery-mode-spelling.md`](escalations/2026-10-03-state-feed-recovery-mode-spelling.md).
  - **The Godot project cannot load its own C# assembly.** `project.godot` declares `dotnet/project/assembly_name="NLT World Engine (Godot)"`, but `world-engine-godot.csproj` never sets `AssemblyName`, so the build emits `world-engine-godot.dll` and Godot reports *"Cannot instantiate C# script … associated class could not be found"*. Present since the prototype landed; worked around for verification with `dotnet build -p:AssemblyName="NLT World Engine (Godot)"`. **The csproj needs the one-line fix** — nobody could run the project from a clean checkout without it.
    - **✅ RESOLVED in the working tree, 2026-10-04 (found during triage, not by the observer thread).** `world-engine-godot.csproj` now carries `<AssemblyName>NLT World Engine (Godot)</AssemblyName>`. The project builds and the C# observer runs, so this blocker can be closed once the change is committed. **A second, stray `NLT World Engine (Godot).csproj` and `NLT World Engine (Godot).sln` are untracked in the project root** — almost certainly editor-generated by accident. They are what makes a bare `dotnet build` fail with **MSB1011** ("folder contains more than one project or solution file"); every build since has had to name the csproj explicitly. Both are unrecoverable if deleted (untracked) and are **not** observer scope — reported, not touched.
  - **Pre-existing Phase B rendering errors**, untouched and out of scope: the wind shader fails (`INSTANCE_TRANSFORM` unknown in 4.7), and `VegetationBuilder` sets `MultiMesh.UseCustomData` *after* `InstanceCount`, which 4.7 rejects (*"Instance count must be 0 to toggle whether custom data is used"*) — every tree logs an error at startup.
- **Next action:** human click-through of the top bar and transport. Then an `experienceVolume` count on the wire if Fusion wants the timeline to show progress against the target of 50 (schema bump, Fusion's call), and B.2/B.4 agent pins in the 3D scene once GRAPH-001's G1 decisions land.

### 🔭 OBS-001 — inherited working tree (triaged 2026-10-04, Kilo)

Claiming this thread surfaced **five** interleaved workstreams in one working tree, not one. Recorded separately so nothing is silently absorbed and nothing is claimed that belongs to another owner.

| Workstream | Files | Owner | Note |
|---|---|---|---|
| **Observer density + resize** | `Observer/ObserverRoot.cs` (+252/−25) | **Kilo** | The reason the claim was needed. Builds clean, 0 warnings. **Unverified on screen** — the resize and the `Coach`/`Technical` layouts still need a visual check |
| **Agent pins + assembly-name fix** | `WorldView.cs`, `Main.cs`, `world-engine-godot.csproj` | unidentified peer | The B.2/B.4 pins named in *Next action* above, plus the csproj `AssemblyName` fix. **Working — left untouched** |
| **Color grading / compositor** | `Compositor/`, `addons/Color grading/`, `assets/characters/PIPELINE-PROBE.md` | **unowned** | Belongs to `GRAPH-001`, which is itself blocked on Joshua's G1 decisions. Overlaps `addons/Color grading/` (an installed addon with its own `plugin.cfg`) with a hand-built `Compositor/Color grading/` — **possible duplication, not resolved here** |
| **godot_ai plugin update** | 26 files under `addons/godot_ai/` | third-party updater | Mid-flight, as already flagged. `.godot_ai_update/` held backups for 3.2.1 and 4.2.3; `plugin.cfg` version-bumped. **Review before committing** — this is vendor code, not project code |
| **Stray duplicates** | `NLT World Engine (Godot).csproj` / `.sln` | accidental | Break bare `dotnet build` (MSB1011). Untracked, so unrecoverable if deleted. **Joshua's call** |

Also uncommitted and unrelated to the observer: the `MIGRATE-PLAN.md` / `RENDERER-PLAN.md` pointers to `NLT-SIM-HUMAN-ROLE-1.0.0` (Kilo), and the `project.godot` fennara autoload line that makes `addons/fennara/` a tracked-file dependency.

**Defects found in the inherited observer, still open:**
- **Status bar contradicts itself** — the title reads `REPLAY — NOT A LIVE SIMULATION` while the timeline header and footer both read `live`. Cause: `StateFeedLoader` loads `fixtures/state-feed.sample.json` while the observer's `Feed/` reader loads `fixtures/replay/stayalert-day.json`, and both sit at tick 1187.
- **Panel content clipping** — several panels cut text mid-line at the old fixed sizes. Reduced by the density change; not re-checked since.
- **World view does not match the scenario** — the fixture is the StayAlert *apartment morning routine*; the rendered world is an outdoor village. `GRAPH-001` scope, not observer scope.
- **`--selftest` cannot check layout headlessly** — it compares absolute control positions against a viewport headless reports as 64×64, so it reports ~15 false failures. Pre-existing; means layout verification needs a real window.

### 🔀 MIGRATE-001 — UE 5.8 → Godot 4.7.2 engine migration (SUPERSEDED)

- **Status:** superseded by Joshua's ENG-002 decision (2026-10-07). Historical record only; no migration/conformance work remains active under this thread.
- **Owner:** Kilo · **Joined by:** Hermes (Phase 1)
- **Started:** 2026-10-02
- **Last updated:** 2026-10-02
- **Branch:** `fix/hash-v2-double-precision` · **Escalation:** [`docs/escalations/2026-10-02-godot-migration.md`](escalations/2026-10-02-godot-migration.md) — ✅ **RESOLVED 2026-10-02** by Joshua (framework change approved under OTOI §4.4) · **Governance proposal:** [#64](https://github.com/NeuroLift-Technologies/nlt-world-engine/issues/64) (core-principle amendment, awaiting written approval per OTOI §9)
- **Historical scope:** The former plan treated Godot as a fidelity port and UE as a frozen behavioral oracle. ENG-002 supersedes both assumptions: Godot replaces UE in its entirety, and UE is not a conformance oracle.
- **Plan:** `.kilo/plans/1790898229735-ue-to-godot-migration-plan.md` (canonical), mirrored at `world-engine-godot/MIGRATION-PLAN.md`
- **Settled terms:** staged validated port · C#/.NET 8 with an engine-agnostic `net8.0` core · training-environment surfaces in scope but PPO deferred · Python sidecar owns ports 8765/8766 · 4 interior scenarios rebuilt procedurally as instanced sub-scenes · governance via in-process `asfdk-csharp` · four-tier validation gate · character embodiment in scope.
- **Delivered:**
  - Phase 1.1–1.2 merged in [#61](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/61) (`ca98e54f`…`248874ea`): `NLTFixtureEmitterSubsystem`, `BuildCanonicalStateTextV2` / `ComputeStateHashV2` (bit-exact IEEE-754 hex, signed-zero and NaN canonicalisation), console command + editor/PIE capture tests, `WITH_DEV_AUTOMATION_TESTS` on both targets. 8/8 `NLT.Simulation` + 4/4 `NLT.VisualLOD.Policy` green.
  - `asfdk-csharp` cloned to a sibling repo and retargeted `net10.0` → `net8.0` (PR [#2](https://github.com/NeuroLift-Technologies/asfdk-csharp/pull/2)); library builds clean, 14/14 xUnit tests pass on net8.0.
  - Four interior level FBX exports obtained from UE (`Workplace`, `Personal`, `Social`, `Academic`) and relocated to `world-engine-godot/assets/levels/`. `OpenWorld_Level` cannot be FBX-exported (World Partition + Landscape + runtime generation) and is rebuilt procedurally instead.
  - **Plan 1.7a complete** (`a0a41d2`): `UNLTFixtureEmitterSubsystem::ValidateNonDegeneracy` — a pure, headlessly-testable assertion over the three per-tick series, with a per-tick agent position trace so "did anything move" is answerable without re-parsing canonical text. Six `NLT.FixtureCapture.NonDegeneracy.*` cases, 6/6 passing. `PROVENANCE.md` now carries a PASS/FAIL verdict.
  - **Three pre-existing crash defects fixed**, each of which independently prevented any capture from completing: a fragment view read before `ForEachEntityChunk` binds it (`b2c487a`, from `d590bcb` 2026-09-25); `EndCapture` silently no-op'ing once the tick cap flips `bCapturing`, so 600 ticks were collected and discarded (`b7cb482`); and the PIE capture test requiring a human to press Play (`7abedc7`). Capture now runs end-to-end headlessly and writes all six files.
- **⛔ Blocker (2026-10-02):** with those fixed, the capture still produces a **degenerate** fixture — 600 tick blocks containing **1 unique**, 0 events, no agent movement. Mass never ticks: `LogNLTAgentSpawner: Warning: DespawnAllAgents: MassEntity not initialized`. This is **SIM-001**, deferred by the plan to Phase 6.6.
  - The 1.7 assertion detects this automatically and reports `Verdict: FAIL`, so the failure is now mechanical rather than a matter of inspection.
  - Plan items **1.5** and **1.7b** cannot complete. Fixing Mass requires changing UE simulation behaviour, which plan §10 forbids after 1.6 ("UE is a frozen oracle") — the same circularity the freeze exists to prevent.
  - Escalation: [`docs/escalations/2026-10-02-ue-cannot-produce-golden-fixture.md`](escalations/2026-10-02-ue-cannot-produce-golden-fixture.md) — **awaiting Joshua's decision**. Tracking issue: [#67](https://github.com/NeuroLift-Technologies/nlt-world-engine/issues/67) (`escalation`, `agent-action-required`, assigned JDUB1216). Recommendation: hold the freeze, land the crash fixes, amend decision 7 to state that Tier 2 is unavailable and what replaces it.
  - **Scope note:** Tier 2 is the gate that retires UE, and decision 7 defines validation in terms of it. That assumption does not hold, so this affects Phase 6 and Phase 10 planning, not only 1.5/1.7b.
  - **Do not commit** the existing `WorldEngine/Saved/Fixtures/seed42/` capture — it is gitignored and degenerate.
- **✅ Resolved 2026-10-02 — SIM-001 fixed, capture now live.** Two defects, both "documented behaviour was not true", both inside the narrowed 1.6 carve-out. PR [#69](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/69) (`f1c3efd`, `b28a027`).
  - (a) **Clock disconnected** — nothing subscribed to `OnSimulationTick`, so `CurrentState.SimulationTick` stayed 0 for whole runs. `StepTick` now publishes tick and time.
  - (b) **Agents frozen** — `NLTAgentSpawnerSubsystem` hardcoded `FNLTStateTreeBehaviorFragment::bEnabled = true`, and both legacy processors skip StateTree-enabled entities. With **0 `.sttree` assets**, ownership passed to a layer that owns nobody. Now defaults to `false`.
  - **My earlier diagnosis was wrong** — "Mass never ticks" came from a `DespawnAllAgents: MassEntity not initialized` line emitted on **teardown**, not spawn. Instrumenting the decision processor showed it running once per tick for all 600 ticks with valid subsystem pointers, yet never reaching `DecideTarget`. Mass was fine; the entity-level flag was the blocker.
  - **Verified:** 600 tick blocks containing **600 unique** (was 1), clock 1 → 600, `WorldTime` 0.0166 → 10.0 min, `Agents move: yes`. Suite 18/19.
- **✅ Three pre-existing crash bugs fixed** — PR [#70](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/70) (`b2c487a`, `b7cb482`, `7abedc7`), plan item 1.11. Each independently prevented any capture from completing: a fragment view read before the query bound it (asserted on every scenario start), `EndCapture` silently discarding 600 collected ticks, and the PIE test requiring a human to press Play.
- **✅ 1.12 done** — §6's fixture risk re-framed and **re-rated High → Medium**. Residual risk is the empty event stream. **Corrected 2026-10-02:** this previously read *"`UNLTEventBus` has zero writers, so … no producers to exercise."* Both halves were wrong — writers exist (`UNLTWorkplaceEnvironmentSubsystem::RefreshRooms` / `PublishTimeOfDay`) and the real cause is an **undriven producer chain**: `StepEnvironmentSimulation` has zero call sites, and it is the only caller of `UNLTSimulationClockSubsystem::AdvanceTick()`, the only broadcaster of `OnAuthoritativeTick`. Same defect class as SIM-001, so **inside** the 1.6 carve-out, not outside it.
- **⏭ Remaining on the UE machine:** 1.4 (VisualLOD vectors need emitter support). **Open decisions:** event-stream scope — gate golden vectors on the three green signals and record the gap, or scope producer wiring as new behaviour outside the carve-out; and **oracle determinism** — see below.
- **⚠️ Fixtures committed but NOT yet Tier-2 trustworthy (plan 1.5).** Four captures — `seed42_{wp_1,pers_1,soc_1,acad_1}`, one per category, seed 42, 2,000 ticks, ≈ 13.8 MB — now live at repo-root `fixtures/` with machine-generated provenance (real UE version/changelist, source commit via `-NltFixtureCommit=`, world name, verbatim `FCommandLine`, and a PIE-vs-editor capture-context field). **But the oracle is not deterministic run-to-run:** re-running the identical command diverges at tick 59 (just before `DecisionIntervalTicks = 60`) and 1941 of 2000 ticks then differ, while ticks 0–58 are byte-identical. `DecideTarget` seeds on `(AgentId, SimulationTick)` so this is not the RNG — it is an ordering race between Mass processors and `ANLTDemoGameMode::Tick`. **These vectors must not be wired into Tier 2 yet**; a port divergence measured against a nondeterministic baseline is uninterpretable. Next step: pin the capture read point in the Mass pipeline and add a capture-twice/assert-byte-equality gate — item 1.7's non-degeneracy check catches a *static* simulation but says nothing about a *nondeterministic* one, which is the gap this exposed.
  - Fixed `double`→`float` narrowing of `Agent.Position` in `BuildCanonicalStateTextV2` — `FVector` is `FVector3d` under UE5 LWC, so v2 was truncating a 53-bit mantissa to 24 bits inside the bit-exact encoding.
  - Untracked 119 committed Godot build-cache files and relocated the level FBX assets.
- **Blockers / human-owned:**
  - **1.5 — fixtures must be committed** under `fixtures/` with `PROVENANCE.md`. **Ownership corrected 2026-10-02** from `[HUMAN]` to `[AGENT — requires a UE-capable machine]`: the constraint is UE access, not a human in the loop. **Phase 1 is not complete, and `MIGRATE-001` must not close, until these land in git** — infrastructure shipping without vectors is a false green.
  - **1.7b — non-degeneracy must be *proven*,** not just asserted. Editor-context capture yields static state, so a fixture can be N byte-identical ticks encoding no behaviour. #69 now yields 600/600 unique blocks with agents moving; the remaining `Verdict: FAIL` is the **event-stream** signal alone, and 1.12 explains why.
  - **1.12 [NEW] — coverage must be scenario-aware.** `UNLTWorkplaceEnvironmentSubsystem` is the only environment-event producer in the module (four raise sites at `NLTWorkplaceEnvironmentSubsystem.cpp:254,257,279,286`). **Personal, Social and Academic have none.** Since 1.3 requires ≥3 scenarios, the event-stream comparison in Tier 2-scenario is meaningful for 1 of 3 — the rest compare two empty streams. Either generalise the environment model or record that event assertions apply only to the Workplace fixture. Most likely the capture ran a non-Workplace level, so re-running on Workplace may clear it with no behavioural change.
  - `asfdk-csharp` is pre-1.0 (v0.3.0, single merged PR) — pin the commit.
  - ~~`addons/godot_ai/` third-party MCP bridge added outside any thread: OTOI §4.4 external-integration approval unrecorded~~ — **closed 2026-10-03.** §4.4 approval recorded for all five third-party addons (`godot_ai`, `sky_3d`, `fennara`, `godotopenxrvendors`, `beehave`) in [`docs/escalations/2026-10-03-addons-external-integration-approval.md`](../escalations/2026-10-03-addons-external-integration-approval.md). NobodyWho approved for **Fusion-side use only** and removed from this project (see that record for the boundary/§4.4/Phase-9 rationale). **Still open on `godot_ai`:** bootstraps Python via `uv`; C#/mono compatibility unverified.
  - **🔴 Fresh-clone blocker (found 2026-10-03, Kilo — same class as the `sky_3d` one below, different addon).** The **uncommitted** `project.godot` adds autoload `_fennara_game_capture` → `res://addons/fennara/runtime/game_capture_helper.gd`, but `addons/fennara/` is **untracked**. `HEAD:world-engine-godot/project.godot` has only the `_mcp_game_helper` autoload (→ `godot_ai`, which *is* tracked), so the committed tree is self-consistent today — but committing `project.godot` without also committing `addons/fennara/` hands every fresh clone an autoload pointing at a missing script. **These two must land in the same commit, or the fennara autoload line must be dropped from `project.godot`.**
- **Corrected twice on 2026-10-02 — do not repeat:** (1) *"Mass is not initialized / Mass never ticks"* was false, taken from a **teardown** log line; Mass ticked throughout. (2) *"the event bus has zero writers"* was false, taken from grepping `Publish(`, an API that does not exist — the surface is `RaiseEvent`/`RaiseSimpleEvent`/`RaiseEnvironmentEvent`. (3) *"wiring event producers is new behaviour"* followed from (2), so it is void too. **Verify a diagnosis from instrumentation, not from a log line's context.**
- **Named gaps the migration does not close** (unmet in UE too — own threads needed, not inherited): agent↔agent interaction, NPC population (no NPC system exists), realistic graphics.
  - **Realistic graphics → now owned by [`GRAPH-001`](#-graph-001--godot-art--asset-pipeline-realistic-graphics), opened 2026-10-02** (`RENDERER-PLAN.md` §0.3 requires each gap to get its own thread).
  - **NPC population and agent↔agent interaction still have no thread and no owner.** Note these are also in conflict internally: `RENDERER-PLAN.md` §9 lists agent↔agent interaction as **out of scope**, while §0.3 says it **needs its own thread**. Unresolved — Joshua's call.
- **Phase C (interiors) started 2026-10-03.** `RENDERER-PLAN.md` §5. **C.5 resolved** — `workplace_level.tscn` is canonical, `workplace.tscn` is orphaned and left in place (untracked, unrecoverable if deleted). **C.3 model delivered** — `world-engine-godot/TaskAnchor.cs` ports `NLTSmartObjectWorldSubsystem.h/.cpp`: affordance axes, reservation/occupancy, and `NeedMatching.Matches/Score/FindBest` with UE thresholds held byte-identical. `dotnet build` clean, 0 warnings.
  - **Corrected a live contradiction:** §5 previously specified **five** needs and read `Privacy` as an agent need gating at a stricter threshold than `Rest`. That is wrong and contradicts contract §4.3, which establishes **four** needs and `privacy` as a *location affordance axis*. The UE `Privacy` branches (`.cpp:129-130`, `:152-153`) cannot fire and were deliberately not ported.
  - **C.1, C.2, C.4 all blocked on B.2/B.3** — no residents are rendered (B.2, awaiting GRAPH-001 G1 decisions) and no interior scene is ever loaded (B.3 owns the building→interior wiring). C.3a (anchor *placement*) needs the imported FBX geometry read, which needs a Godot-capable session.
  - **🔴 Fresh-clone blocker (raised 2026-10-03, escalated by B.1).** `addons/sky_3d/` is still **untracked** in git, and `WorldView.cs` loads it via `GD.Load<GDScript>` in `_Ready()`. `run/main_scene` (`Main.tscn`) therefore depends on files not in the repository — a fresh clone will not start, and `dotnet build` cannot catch it because the path is a runtime string. The plugin is now ratified and recorded in plan §0.1 with provenance, so the *reference* is legitimate; the *commit* is what is missing.
    - **Correction 2026-10-03 (Kilo):** this blocker appears **already resolved** — `addons/sky_3d/` is now fully tracked (43 files tracked, 43 on disk, no untracked leftovers under the path). @B.1 should confirm and close it rather than re-chase it.
- **⚠️ Concurrent-agent collision observed 2026-10-03.** A second agent session (codex + a live `Godot_v4.7.2-stable_mono_win64` editor) rewrote `world-engine-godot/WorldView.cs` at 01:23 and deleted `SkyBuilder.cs` / `Daylight.cs` to adopt Sky3D, landing concurrently with this Phase C work. The edits are disjoint — Phase C §5 versus B.1/§0.1 — and no peer work was overwritten, but the repo now has two agents mutating `RENDERER-PLAN.md` and the Godot tree at once. Per the multi-agent coordination protocol this warrants a check-in before further parallel work on either thread.
- **Next action:** Phase 2 (`NltWorldEngine.Core` + Tier 1 xUnit gate), unblocked now that #69 and #70 exist — Tier 1 and 2-core were never blocked. Retirement of UE remains gated on 2-scenario, 2b, and a minimum viable RL policy before Phase 10 (see plan 10.1).

### 🎨 GRAPH-001 — Godot art & asset pipeline (realistic graphics)
- **Status:** open — decisions pending with Joshua (Phase G1 blocking)
- **Owner:** Joshua (decisions) · **Plan:** [`world-engine-godot/ART-PIPELINE.md`](../world-engine-godot/ART-PIPELINE.md)
- **Started:** 2026-10-02 · **Last updated:** 2026-10-02
- **Forked from:** `MIGRATE-001`, per `RENDERER-PLAN.md` §0.3 — *"realistic graphics were unmet in UE and remain unimplemented. Each needs its own thread."*
- **Scope:** Close the realistic-graphics gap in the Godot renderer. **Only** the graphics gap — NPC population and agent↔agent interaction are separate threads and out of scope here.
- **Trigger:** the Godot open world renders entirely from runtime primitives (`CylinderMesh`/`ConeMesh`/`BoxMesh`/`SphereMesh`) with **zero imported meshes**; against the three.js spectator (`nlt-world-engine.html`) it reads as a blockout.
- **Key finding — the blockout is partly a real constraint.** `OpenWorld_Level` **cannot** be FBX-exported from UE (World Partition + Landscape + runtime generation), which is why the open world is procedural at all (`RENDERER-PLAN.md` §4). The four FBX files in `assets/levels/` are **interiors only**. That constraint does *not* extend to characters or hero props.
- **The forcing function is `RENDERER-PLAN.md` B.2**, not aesthetics: *"Open world renders residents — the agent population walking between buildings. This is where articulation and walk cycles earn their keep."* Line 44 specifies *"articulated bodies · walk cycles"*, which **cannot** be assembled from primitives. The asset decision lands at B.2 whether or not it is filed under graphics.
- **Recommendation on scope:** import art where art is genuinely required (characters, hero props near camera), **not** as a blanket replacement. Terrain, water, buildings-at-distance and the vegetation wind shader are legitimate as-is; sweeping them would add licensing surface and repo weight for little visual return.
- **Adopted from the stale predecessor** `docs/design/realistic-viewer-architecture.md` (Three.js-era, orphaned — do not implement against): **CC0-only sourcing** (Mixamo/Poly Haven) and **perf targets** 60 FPS · 10–20 animated characters · <16 ms frame time.
- **⚠️ Licence risk flagged, not resolved (G1.1):** Mixamo's terms have historically **not permitted redistribution of the raw assets**. If residents ship in this repo or a build, that needs a real answer. Do not assume CC0.
- **⚠️ Constraint conflict (G2.4):** `RENDERER-PLAN.md` D.4 mandates *reduced motion*; animated walk cycles and the unconditional wind shader in `VegetationBuilder.cs` run against it. Must resolve when animation lands, not after.
- **Historical constraints from the superseded renderer plan:** renderer-only scope and no-determinism assumptions no longer apply after ENG-002. Third-party plugins remain reserved to Joshua; **no asset is committed without provenance**; accessibility remains a system requirement.
- **Next action:** Joshua to answer G1.1–G1.5 (asset source & redistribution, character count + LOD budget, animation source, hero-prop policy, budget authorisation). G2 pipeline work is blocked until G1.1 and G1.5 land.

### 📐 RENDERER-001 — Godot renderer plan (Phase A state feed)
- **Status:** Phase A complete · Phase B–D open
- **Owner:** Cline (handoff from Kiro, 2026-10-08) · **Plan:** [`world-engine-godot/RENDERER-PLAN.md`](../world-engine-godot/RENDERER-PLAN.md)
- **Started:** 2026-10-03 · **Last updated:** 2026-10-08
- **Scope:** Implement the Godot renderer per `RENDERER-PLAN.md`: state feed, open world residents, interior scenes, observer panels.
- **Delivered (2026-10-03):**
  - **Phase A complete (A.1–A.5).** Contract doc `docs/contracts/state-feed-v1.md` published (A.1); envelope with velocity (A.2); burnout episodes (A.3); self-recognition (A.4); all present in `fixtures/state-feed.sample.json`.
  - **A.5 — `world-engine-godot/StateFeedLoader.cs`** (491 lines): loads `fixtures/state-feed.sample.json` at startup, validates schema version, all required keys, four canonical need keys + range, warns on unknown need keys, warns on empty agent list. Wired into `WorldView._Ready()`. Build: 0 errors, 0 warnings.
  - **B.1 sky swap complete (2026-10-03).** Sky3D (`addons/sky_3d/`) adopted; `WorldView.cs` instantiates Sky3D, disables its internal clock, and drives `current_time` from sim time. `SkyBuilder.cs` and `Daylight.cs` are **deleted**. Reduced-motion (D.4) pauses the sim-time write via `SkyPaused`.
  - **C.1 collision enabled (2026-10-03).** All four level FBX `.import` files set `meshes/create_shapes=3` (trimesh). Reimport pending next editor open / `--headless --import`.
  - **Fixed pre-existing `TerrainBuilderPhysics.cs`** — file was a copy of `TerrainBuilder.cs` with the same class name, causing a duplicate-class compile error. Replaced with a placeholder stub reserving the class for Phase C.1 (interior collision).
- **Blockers / human-owned:**
  - **Phase B.2 (residents / walk cycles)** is blocked on GRAPH-001 G1 decisions (character asset source, LOD budget, animation source).
  - **§8 item 0.1 `addons/godot_ai/`** — still unratified (provenance unverified, C#/mono compatibility unconfirmed, `mcp-config.yaml` entry missing). Joshua's decision.
  - ~~Sky3D ratification~~ — resolved 2026-10-03. B.1 implementation (swap `SkyBuilder.cs` → Sky3D) is now unblocked.
  - **Phase C** (interior collision, entry points, task anchors) has no scheduled date.
  - **Phase D** (observer panels) depends on state feed being live from Fusion, which depends on the Python bridge (not yet built; transport for A.5 is undecided per contract §10).
- **Next action:** B.1 swap (`SkyBuilder.cs` → Sky3D) is **complete**; C.5 resolved — the `<Name>_level.tscn` convention wins; `workplace.tscn` is superseded (early-iteration wrapper with a stray offset). B.3 (building→interior mapping) and B.4 (Label3D name labels) remain unblocked.

### 🧪 DET-001 — Deterministic state verification and headless build foundation
- **Status:** open
- **Owner:** Cline
- **Started:** 2026-09-25
- **Last updated:** 2026-09-25
- **Branch:** `cline/d8d52`
- **Summary:** Added a versioned UE-side BLAKE3 canonical state hash, deterministic RNG reset metadata with legacy seed-save compatibility, project AutomationTests, a dedicated server target/config, dedicated-server guards, and a versioned JSON replay record/verifier with action/event integrity and observed final-state comparison.
- **Blockers:** None for the primary UE Editor build/train/watch path. The installed UE 5.8 distribution cannot create `WorldEngineServer`, but Dedicated Server is optional later infrastructure and is not a release blocker. The Editor target builds successfully with `ASFDK_ROOT=D:\nlt-repos\asfdk-cplus`; UE automation tests pass 7/7 using `UnrealEditor-Cmd.exe -DisablePython`.
- **Next action:** Validate the rendered UE Editor/standalone-game training path and live visual LOD transitions. Revisit source-built Dedicated Server compilation and CI only if headless infrastructure is later approved as a separate effort. Add approved action semantics before implementing replay action execution.

### 👁️ LOD-001 — Shared visual LOD policy for Mass and actor residents
- **Status:** open
- **Owner:** Cline
- **Started:** 2026-09-25
- **Last updated:** 2026-09-25
- **Branch:** `cline/d8d52`
- **Summary:** Added a shared configurable visual LOD policy with distance thresholds, hysteresis, viewer fallback, Mesh/HISM/fallback representation selection, and explicit visual-only semantics. Integrated it into Mass HISM visualization and actor-resident mesh visibility without changing simulation fragments, movement, cognition, or update rates.
- **Blockers:** None for the primary UE Editor build/train/watch path. The installed UE 5.8 distribution cannot create the Dedicated Server target, but that target is optional later infrastructure. LOD policy automation passes 4/4 and the Editor build succeeds.
- **Next action:** Validate visual transitions in a representative rendered UE scene with Mass/actor residents, then add a CI job when a UE-capable runner is selected. Simulation-frequency LOD remains out of scope.


### 🔧 BUILD-WIN64-001 — Win64 build repair: ASFDK wiring + hot-reload state
- **Status:** resolved
- **Owner:** Cline
- **Started:** 2026-09-21
- **Last updated:** 2026-09-24
- **Branch:** `fix/win64-asfdk-stubs` · **PR:** [#50](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/50)
- **Blockers:** None for the Win64 editor build. Two decisions remain with Joshua: (1) build a
  real Win64 ASFDK library — the Win64 stubs remain the verified interim; (2) the
  C:-build-tree ↔ canonical-repo sync story. Linux builds are additionally blocked until
  `libasfdk.a` exists in the ASFDK checkout; the module now fails with repair guidance at
  rule-evaluation time instead of a bare linker error.
- **Summary:** User's Visual Studio `WorldEngineEditor Win64 Development` build failed with C1083
  (`asfdk/ASFDK.h`), LNK1104 (`UnrealEditor-WorldEngine-0002.lib.rsp` missing), and MSB3073.
  Root causes: (1) the `ThirdParty/ASFDK` junction in the C: UE build tree pointed at the
  pre-move `C:\...\nlt-repos\asfdk-cplus` location (nlt-repos now on D:); (2) legacy
  hot-reload-from-IDE re-applying a stale, inconsistent `HotReloadState.json` while
  `UnrealEditor.exe` was running. The canonical repo additionally had a dangling gitlink
  (no `.gitmodules` mapping) for the ASFDK submodule.
- **Delivered (verified):** hardened `NLTGovernanceSubsystem.Build.cs` (ASFDK_ROOT override +
  loud BuildException, duplicate-nlohmann guard, and a fatal guard when `libasfdk.a` is
  absent on Linux); `ASFDK_Win64Stubs.cpp` rewritten and proven
  compile/link-clean against the real headers (standalone MSVC probe + full UBT builds);
  `.gitmodules` added and submodule restored at pinned `55b21fe`; forensic write-up at
  `WorldEngine/docs/building/LNK1104-rsp-diagnosis.md`. Both `WorldEngine` and
  `WorldEngineEditor` targets build `Result: Succeeded` in the C: build tree.
- **Handoff:** `docs/agent-log/handoffs/2026-09-21-cline-win64-asfdk-build-repair.json`
- **Next action:** PR [#50](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/50)
  is open with all 8 CodeRabbit review comments addressed (2026-09-24). Awaiting Joshua's
  decisions on a real Win64 ASFDK library build and on the C:-build-tree ↔ canonical-repo
  sync story.

### 🏙️ ESC-001 — UE Open-World Expansion (Fab Modern City assets as outdoor layer)
- **Agent:** OpenCode (Poolside) · **Opened:** 2026-09-20 · **Branch:** `main` (uncommitted)
- **Scope:** Port `openworld-engine` outdoor rendering into UE WorldEngine — buildings as level
  portals to indoor `.umap` scenarios, upgraded building/ground geometry with AI-usable Fab
  `Modern_City_Environment` assets, procedural determinism (seed → world) preserved.
- **Delivered (verified in standalone `-game`, seed 42):**
  - Geometry-only GLB splits imported per mesh (12 portals, **9 city-grid pieces**; 6 original + 3 new: Building_Base plaza, Building_13 podium, Grass cover); merged block aligns all pieces via the shared Fab scene origin.
  - `NLTBuildingPortalActor`: `SceneRoot` added; `UpdateBuildingMesh()` assigns Fab meshes per type with bounds-aware scaling, base-on-spawn anchoring, roof labels, footprint-sized interaction volumes. Cube fallback retained (Hut / load failure).
  - `NLTOpenWorldSubsystem`: `SpawnCityScenery()` + `bPlaceCityScenery` + `ClearOpenWorld` cleanup. Log: `City scenery: placed 9 Fab Modern City grid pieces (scale 0.770, base Z 0, world 20000x20000)`, `Open world generation complete: 12 buildings, 12 residents`; portal overlap → level streaming verified live.
  - **Baked Blender block positions (2026-09-20):** `FNLTOpenWorldConfig.BuildingLayout` (BP-editable list of type + exact location + yaw) now baked from the Fab block in Blender — Building 11 tower center (52.2, -21.7) m → Office at (4020, -1671) cm; Building 12 tower center (118.1, -65.7) m → Apartment at (9094, -5059) cm; shared scenery scale 0.770 (WorldHalf 10000 / max piece half-extent 12985). Default 12 authored buildings spread across enlarged **200×200 m** world, pre-verified footprint-clear (min center distance 2600 cm, min clearance 400 cm — logged at spawn). World size default 5000 → 20000. School + Office always spawn now. Shared `GetTargetHalfExtent()`/`GetFootprintRadius()` tables on the portal actor.
  - **Vegetation HISM upgraded:** `SM_Mobile_Trees` mesh wired (Fab "Mobile Trees" pack); per-instance scale normalized to native mesh bounds (native ~24 m → target 3-6 m) with base-on-terrain anchoring (corrects pivot offset).
  - **Hut mesh wired:** merged WoodenHouse kitbash (Blender temp scene, 391 parts → 436 K verts, 17.2×13.7×6.4 m cottage) imported as `/Game/City/Huts/DoorWoodenHouse/WoodenHouse/StaticMeshes/WoodenHouse.WoodenHouse` — fallback to cube if load fails.
- **Escalation record:** `docs/escalations/2026-09-20-openworld-expansion.md` (Progress Update section).
- **Blocker for PIE:** MCP `control_editor.play` catalog bug (rejects `control` param; console `PIE.Start` blocked as dangerous) — verification done via standalone `-game` instead.
- **Known issues (asset paths, not code):** Path_And_Imperfections and Traffic_Lights GLB imports created assets with different naming conventions (multi-mesh GLBs); WoodenHouse merged GLB re-import asset path needs verification — both are asset registry issues, not code.
- **Next action:** commit; optional follow-ups: vegetation-HISM `ensure` cleanup, NavMesh for imported meshes, texture pass on NLT_Gray geometry.
### 🚪 ENV-002 — Relocate Personal_Level Teleporter Doors (UE WorldEngine)
- **Agent:** OpenCode · **Opened:** 2026-09-20 · **Branch:** `feat/personal-level-door-relocation`
- **Scope:** The three runtime-spawned `NLTDoorActor` teleporters in `Personal_Level` were hidden in PIE — the Academic door sat behind the kitchen cabinet/stove line and the Social door behind the `Corridor_Wall_E4` corner, both hard to see/reach.
- **Delivered:** `SpawnLevelDoors()` in `NLTDemoGameMode.cpp` now spawns the doors as a visible row along the open south wall (Y=-885), clear of `Front_Door` and player starts, with yaw 180 so labels face north into the room. `Social_Level`/`Academic_Level` spawn behavior unchanged.
- **Blocker note:** Doors are code-spawned (not map actors), so the change requires a module rebuild + PIE restart to take effect; `set_transform` is edit-mode-only and cannot move PIE actors.
- **Next action:** Review PR; rebuild module, run PIE, verify door visibility/labels.

### 📄 DOC-MCP-001 — Unreal MCP Integration Documentation
- **Agent:** OpenCode · **Opened:** 2026-09-19 · **Branch:** `main`
- **Scope:** Register the unreal-mcp server config and document the WorldEngine integration. Global OpenCode MCP registration (`http://127.0.0.1:8001/mcp`, ✓ connected).
- **Delivered:** `unreal-mcp` entry + governance note added to `mcp-config.yaml`; `docs/world-engine/UNREAL-MCP-INTEGRATION.md` created.
- **Blockers:** `McpAutomationBridge` plugin not yet installed in `WorldEngine/Plugins/` — its native MCP port must be set to **8001** to match.
- **Next action:** Install plugin into WorldEngine (copy or external plugin dir), set native MCP port to 8001, enable Native MCP, restart editor.

### 🎯 CHAR-001 — Character Animation & Emotion System (UE WorldEngine)
- **Agent:** Claude Code (Poolside) · **Opened:** 2026-09-13 · **Branch:** `feat/character-animation-emotion-system`
- **Scope:** Build emotion-driven character animation system in the UE WorldEngine project. Swap static-mesh SimBody characters for rigged SkeletalMesh characters with an emotion state machine wired to cognitive values (focus/stress/cogLoad/burnout), an animation state machine with smooth transitions, Avatar↔Aide social choreography, and a procedural animation fallback via UAnimInstance.
- **Delivered:** NLTEmotionStateComponent (emotion state machine), UNLTAvatarAnimInstance (procedural pose data provider + facial morph targets), NLTCharacterAnimationComponent (animation state machine with montage + static-mesh fallback), NLTPairChoreographyComponent (Avatar↔Aide social choreography), AvatarCharacter integration (emotion→animation→visuals pipeline).
- **Blockers:** No UE editor runtime available; limited to UBT headless compilation. No SkeletalMesh or AnimAssest assets exist yet — procedural UAnimInstance fallback required.
- **Next action:** Update PLAN.md with emotion-animation phase documentation. Create NLTAideCharacter class. Wire OnSimulationTick delegate for sim-synchronized cognitive decay.

### 📄 ESC-001 — Procedural Open-World Layer (Path B)
- **Agent:** OpenCode · **Opened:** 2026-09-20 · **Status:** In development (Phase 1 complete)
- **Scope:** Outdoor open-world layer where buildings are level portals to existing indoor `.umap` scenario levels (Workplace, Personal, Social, Academic). Procedural approach — ported from Three.js `openworld-engine/src/world/` into UE5 C++.
- **Escalation:** `docs/escalations/2026-09-20-openworld-expansion.md` — ✅ RESOLVED 2026-09-20 by Joshua (Fab assets inaccessible → procedural approach approved).
- **Delivered:** `NLTNoiseLibrary` (mulberry32 + Noise2D + Fbm2D ported from `noise.js`); `NLTAtmosphereSubsystem` enhanced with procedural cloud/star noise + HDRI cubemap support; `PostProcessVolumeActor` LUT support with procedural fallback; Water plugin enabled in `.uproject` + `Build.cs`; Content directory structure created; docs at `WorldEngine/docs/procedural-openworld.md`. Phase 2 (terrain) started by Pool: `ETerrainBiome` enum + `GenerateTerrainHeight`/`ClassifyTerrainBiome` added to `NLTNoiseLibrary`; faithful port of `terrain.js` createHeightField/baseHeight + biome bands; UBT incremental build (UE5.8) — 0 errors in all touched TUs.
- **Next action:** Port `terrain.js` heightfield to PCG/Landscape — IN PROGRESS (C++ heightfield port done & compiles clean; Landscape mesh instantiation deferred — requires UE editor runtime not available on this box). Building-to-level portal streaming bridge — deferred Phase 3 (cross-lane: requires Codex + Poolside coordination per escalation; NOT started by this agent). See `ENV-TEX-001` below for details.

---


### 🛠 AGENT-HARNESS-001 — Agent action-interface harness committed in world-engine-godot

- **Agent:** Solar Mini4 · **Opened:** 2026-10-07
- **Status:** ✅ COMPLETE (merged in PR-equivalent local commit `9735006`)
- **Plan:** option B of the 2026-10-07 plan-mode discussion — commit the
  out-of-engine action-interface harness inside `world-engine-godot/` instead
  of leaving it thrown away or moving it to neurolift-ai-fusion.
- **Delivered:**
  - `world-engine-godot/AgentHarness/AgentHarness.csproj` — standalone
    `Microsoft.NET.Sdk` console project referencing the Godot build's
    `GodotSharp.dll` + `NLT World Engine (Godot).dll` (relative HintPaths).
  - `world-engine-godot/AgentHarness/Program.cs` — drives
    `ActionAssertions.RunAll()`; exits 0 on all-pass.
  - `world-engine-godot/world-engine-godot.csproj` — one-line glob exclusion
    `<Compile Remove="AgentHarness/**/*.cs" />` so the harness sources are
    never compiled into the Godot assembly.
  - `world-engine-godot/AGENT-SYSTEM.md` — §5.2 rewritten: in-repo `dotnet
    build` + `dotnet run --project AgentHarness/AgentHarness.csproj`
    instructions replacing the "keep outside the project" note.
- **Verification:**
  - `dotnet build world-engine-godot.csproj` → 0 errors (2 pre-existing
    CS8601 warnings in WorldView.cs, untouched).
  - `dotnet build AgentHarness/AgentHarness.csproj` → 0 errors, 0 warnings.
  - `dotnet run --project AgentHarness/AgentHarness.csproj` →
    **12 passed, 0 failed — RESULT: all assertions passed**.
- **Note:** the Godot assembly's existing `.gitignore` (`*.dll`, `.godot/`)
  plus root `.gitignore` (`world-engine-godot/**/obj/`) cover the harness
  build output, so only the four source files were committed under
  `world-engine-godot/`. The harness still depends on the Godot build's DLLs
  being produced first (relative HintPaths), same as before.
### 🌋 ENV-TEX-001 — Procedural Terrain Heightfield Port (ESC-001 Phase 2)
- **Agent:** Pool (Poolside) · **Opened:** 2026-09-20 · **Branch:** `fix/win64-asfdk-stubs`
- **Scope:** Port `openworld-engine/src/world/terrain.js` heightfield (`createHeightField`/`baseHeight`) + biome classification (`buildTerrain` bands) into WorldEngine C++, additive on `NLTNoiseLibrary`, deterministic, NO Landscape mesh (headless).
- **Delivered:** `ETerrainBiome` enum; `UNLTNoiseLibrary::GenerateTerrainHeight` (continental island falloff + layered hill/mountain fBm — faithful port of `baseHeight` using `NLTNoiseLibrary::Fbm2D`); `UNLTNoiseLibrary::ClassifyTerrainBiome` (sand/grass/rock/snow bands adapted from `buildTerrain`). Files: `Source/WorldEngine/Public/Core/NLTNoiseLibrary.h`, `Source/WorldEngine/Private/Core/NLTNoiseLibrary.cpp`. **UBT incremental build (UE5.8, `WorldEngine Win64 Development`) — 0 errors / 0 warnings** in all touched TUs (`NLTNoiseLibrary.cpp`; `NLTAtmosphereSubsystem.cpp` recompiled against the changed header). Build overall fails ONLY on pre-existing Phase-3 `NLTBuildingPortalActor.cpp` (`StreamingHandle`) / `NLTOpenWorldSubsystem.cpp` (`GetBuildingTypeFromFName`) — not touched by this agent.
- **Blockers:** No UE editor runtime (headless UBT only) — cannot create Landscape heightmap `.umap`/PCG assets or visually verify terrain. Phase 3 portal-streaming bridge is cross-lane and explicitly out of scope for this agent.
- **Next action:** (Next session, with UE editor access) Wire `GenerateTerrainHeight` into `NLTWorldGeneratorSubsystem` → UE5 Landscape (or PCG heightfield node) → blend materials by `ClassifyTerrainBiome`. Refactor note: `NLTNoiseLibrary`'s static `Perm[512]` + `bPermInitialized`/`CurrentPermSeed` is a latent thread-safety risk if terrain and atmosphere call concurrently (see handoff).

---

### 🔍 SIM-001 — Simulation activation and runtime lifecycle trace
- **Status:** resolved
- **Owner:** Kilo
- **Started:** 2026-09-25
- **Last updated:** 2026-09-25
- **Summary:** Traced default-map startup, open-world generation, indoor scenario activation, Mass Entity spawning, simulation clocks, web/HTTP control, LLM command paths, and PPO training activation. Confirmed the default `OpenWorld_Level` path generates scenery and resident actors but does not start the Mass simulation; indoor levels spawn Mass agents and start the simulation. Identified documentation/code mismatches, including the disconnected authoritative clock, unregistered Mass processors, HTTP-only web server, and separate internal/external LLM control paths.
- **Blockers:** None for the investigation. Runtime verification remains unavailable because no UE editor runtime is present in this session.
- **Next action:** None; findings are ready for integration planning or documentation correction.

### 🌲 ST-001 — StateTree Behavior Layer on Mass Entities (augment)
- **Status:** active (editor build succeeds; deterministic reference tests pass; native runtime StateTree verification pending)
- **Owner:** Claude Code (Poolside)
- **Started:** 2026-09-25
- **Last updated:** 2026-09-25
- **Branch:** `pr/statetree-behavior-layer-clean` · **PR:** [#57](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/57)
- **Summary:** Augment the custom Mass needs/decision/movement processors (`UNLTScenarioNeedsProcessor`, `UNLTScenarioDecisionProcessor`, `UNLTScenarioMovementProcessor`) with a deterministic behavior processor and StateTree task/condition reference definitions. Native Mass StateTree execution and authored `.sttree` assets remain follow-up work.
- **Blockers:** Runtime StateTree execution, `.sttree` authoring, and UE automation coverage remain pending; editor compilation now succeeds.
- **Delivered:**
  - **C++:** `NLTStateTreeFragments.h` (StateTree behavior fragment + state enum); `NLTDemoStateTreeBehavior.h/.cpp` (data asset with default state configs); `NLTStateTreeBehaviorProcessor.h/.cpp` (Mass processor with full state machine: Idle → EvaluateNeeds → SelectTarget → MoveToTarget → Arrived → Idle, FallbackWander branch); `NLTStateTreeTasks.h/.cpp` (custom StateTree task references); `NLTStateTreeSchema.h/.cpp` (schema with typed external-data bindings); `NLTStateTreeBehaviorTest.h` (inline C++ test harness); `NLTDemoScenarioUtils.h` (shared helpers extracted: candidate sort, need ranking, intent mapping, location scoring); `WorldEngine.cpp` updated with module startup; `NLTAgentSpawnerSubsystem.cpp` updated to spawn StateTree fragments; legacy processors marked deprecated + early-out when the behavior layer is active.
  - **Build fixes (UE 5.8 compatibility):**
    - `Build.cs`: `"StateTree"` → `"StateTreeModule"` (module name in `.uplugin`)
    - StateTree tasks/conditions: UCLASS → USTRUCT pattern (`FMassStateTreeTaskBase`/`FMassStateTreeConditionBase`), handle-based external data access
    - Include path fixes: `"NLTStateTreeFragments.h"` → `"Agents/NLTStateTreeFragments.h"` across 4 files
    - Added missing includes (`Agents/NLTAgentFragments.h`)
    - Removed duplicate local utility functions from `NLTDemoScenarioProcessors.cpp` (now uses shared `NLTDemoScenarioUtils.h`)
    - Fixed narrowing conversion C2397 (brace-init → field-by-field assignment) in `NLTStateTreeTasks.cpp`, `NLTStateTreeBehaviorProcessor.cpp`, `NLTDemoScenarioProcessors.cpp`
    - Fixed C3493 lambda capture: added `this` to capture list in `NLTStateTreeBehaviorProcessor.cpp::Execute`
    - Fixed UE 5.8 `TEnumAsByte` static_assert: replaced `UEnum::GetValueAsString<EnumType>()` with `StaticEnum<EnumType>()->GetNameStringByValue((int64)...)` in `NLTEventBus.cpp` and `NLTStateTreeBehaviorProcessor.cpp`
    - Fixed Mass `static_assert` fragment traits: added `TMassFragmentTraits<FNLTStateTreeBehaviorConfigFragment>` specialization (TSoftObjectPtr not trivially copyable)
  - **Fusion/Wire:** `WorldEngine/Scripts/fusion_protocol.py` (versioned envelope codec, action allow-list, atomic multi-tick replay executor, and result comparison); `test_fusion_protocol.py` + `test_fusion_protocol_regression.py` (9 passing reference tests); UE WebSocket listener hardened with safe field access, required action type/target, malformed-JSON rejection, and game-thread dispatch.
  - **Build result:** `WorldEngineEditor Win64 Development` — `Result: Succeeded`, 0 errors (clean PR worktree, verified 2026-09-25).
  - **Build.cs:** Uses the UE 5.8 `StateTreeModule` dependency.
  - **Python reference:** `src/statetree/__init__.py` (enums, constants, `deterministic_hash`, `FRandomStream`); `src/statetree/behavior.py` (full state machine processor); `src/statetree/conditions.py` (3 conditions); `src/statetree/tasks.py` (4 tasks).
  - **Python tests:** 21 tests — 12 deterministic transition tests + 9 fallback/determinism tests. All passing: `cd _archive\world-engine && python -m unittest tests.test_statetree_transitions tests.test_statetree_fallback -v` → 21 passed.
  - **Docs:** `WorldEngine/docs/architecture/statetree-behavior-layer.md` (full design doc); `unreal-simulation-architecture.md` §9 open item #2 → "In progress".
  - **Build script:** `build_statetree.bat` created at repo root for UBT invocation.
- **Build limitations (verified 2026-09-25):** a clean PR worktree build succeeds; native Mass StateTree execution, authored `.sttree` assets, and registered UE Automation coverage remain pending.
- **Next action:** (1) Integrate `UMassStateTreeProcessor` and author a `.sttree` asset; (2) register and run the behavior checks as UE Automation tests; (3) run live Python↔UE wire conformance; (4) collect rendered PIE evidence for Mass/actor LOD transitions.

### 🎯 Next: Integration & Testing

- **Agent:** — · **Opened:** — · **Branch:** `main`
- **Scope:** Wire together the now-merged subsystems into a coherent end-to-end flow: LLM-driven avatar → web server → Mass Entity sim → training loop.
- **Delivered:** —
- **Next baton:** 
  1. Restart editor/headless sim to pick up HTTP status-code fix (`509dc0c`)
  2. Run `python3 llm_avatar_agent.py --task "..."` against local or hosted OpenAI-compatible endpoint
  3. Verify ASFDK governance plugin loads correctly in editor
  4. Test Learning Agents PPO training pipeline with Avatar/Aide pairs

---

## Resolved Threads (2026-09)

### Thread: TRAIN-001
**Status:** resolved
**Owner:** Codex (2026-09-13 session)
**Started:** 2026-09-13
**Last updated:** 2026-09-13
**Summary:** PPO training in `run_nlt_training.sh` failing with `RuntimeError: The size of tensor a (3) must match the size of tensor b (4)` at `ppo.py:99` in `Denormalize.forward`. Root cause: `ppo.py` line 71 had hardcoded `self.act_enc_num = 3`, overriding the schema-derived value of 10 (Interaction=4 + MoveDirection=6). Removed the override so `act_enc_num` correctly reads 10 from `action_schema['EncodedSize']`. Verified end-to-end: first training iteration completed successfully with PPO train profile (5501ms), Iter: 0 stats logged, networks sent/received.
**Blockers:** None — Python crash resolved. Secondary C++ restart issue identified (see TRAIN-002).
**Next action:** Recompile C++ and re-run training to verify the secondary fix (TRAIN-002).

### Thread: TRAIN-002
**Status:** open
**Owner:** Codex (pending verification)
**Started:** 2026-09-13
**Last updated:** 2026-09-13
**Summary:** After the PPO tensor fix, the first training iteration completes successfully but UE's `NLTTrainingManager::Tick()` calls `Trainer->RunTraining()` every 0.1s with `NumberOfIterations=1`. After the first iteration, the Python subprocess exits cleanly ("Done!"). On the next Tick, UE attempts to start a new training session (NLTTraining7/Configs) but the Python process is gone, producing "Error sending policy to trainer: Unexpected communication received" and repeated "Training has failed" spam.
**Fix applied:** Added `bTrainingCompleted` flag to `ANLTTrainingManager`. First Tick with `bTrain=true` (one training step); subsequent Ticks use `bTrain=false` (inference only, no Python communication). Also added `ResetAgentEpisode_Implementation` override to `UNLTTrainingEnvironment` to resolve the "ResetAgentEpisode function must be overridden!" error.
**Blockers:** Cannot recompile/verify on this machine — no UE build environment available. Requires recompilation and re-run of `run_nlt_training.sh`.
**Next action:** Recompile project and re-run training to verify both fixes work end-to-end.

| Thread | Agent | Date | PR | Summary |
|---|---|---|---|---|
| LLM → Avatar Control | Cline | 2026-09-05 | — | `AAvatarAIController` with `bLLMControlActive`, `ExecuteLLMCommand()` dispatcher; `UNLTWebServerSubsystem` `/api/avatar/command` endpoint; `llm_avatar_agent.py` stdlib-only tool-calling controller. HTTP status-code fix in `509dc0c`. |
| Secret-purge + Code Scanning | Codex | 2026-09-05 | [#36](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/36) | Purged 3 leaked API keys from git history; resolved 7 code-scanning alerts (workflow permissions + postMessage origin verification). |
| M2/M3 VFX + Security Fix | OpenCode | 2026-09-05 | [#27](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/27) | Fixed VFX asset name/path alignment; refined NS_HVACAirflow; removed SecurityToken credential violation. |
| Web Server + SimBody | OpenCode | 2026-09-03 | [#28](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/28) | `UNLTWebServerSubsystem` with `/api/snapshot`, `/api/scene`, `/api/status`, `/api/control`; SimBody kit at real-world cm scale. |
| UE 5.8 World Engine + Babylon.js v2 | Hermes | 2026-09-02 | [#24](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/24) | 115 files, 66MB content: C++ simulation kernel, Mass Entity agent system, 13 scenario DataAssets, 4 level templates, Babylon.js v2 viewer. |
| Graphics/Atmosphere/Character Visuals | OpenCode | 2026-09-02 | [#33](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/33) | Atmosphere subsystem, world object renderer, avatar visuals, cinematic post-process. |
| Training Infrastructure | Hermes | 2026-09-05 | [#38](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/38) | Learning Agents plugin integration, RL dependencies, NLTTrainingManager. |
| NLTGovernanceSubsystem + ASFDK-C++ | Hermes | 2026-09-05 | [#39](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/39) | Plugin sources finalized, ThirdParty ASFDK symlink, core module wiring, OTOI compliance. |
| Docs + README + Template Sync | OpenCode / Kilo | 2026-09-05 | [#40](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/40), [#41](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/41) | README updates reflecting in-engine LLM bridge + NLTGovernanceSubsystem; agent-contribution template sync. |
| CodeRabbit Review Fixes | Hermes | 2026-09-05 | [#42](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/42) | Addressed review comments on NLTTrainingManager and plugin build wiring. |

---

## Resolved Threads (2026-06)

| Thread | Agent | Date | PR | Summary |
|---|---|---|---|---|
| Engine direction — Python simulation engine stub implementation | Claude Code | 2026-06-04 | In progress | Created minimal stub implementations of the four missing modules (base_avatar, base_aide, readiness_assessor, supabase_client) to unblock syntax validation. Engine now compiles cleanly but is not executable end-to-end (stubs raise NotImplementedError). Package structure established. Awaiting architectural decisions. |
| Dev environment setup | Cursor Cloud Agent | 2026-05-29 | [#5](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/5) | Set up Cursor Cloud dev environment, documented lint/test/run commands in AGENTS.md, verified governance validation and frontend prototype |
| Fusion Studio research and replay contracts | Codex | 2026-06-04 | [#8](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/8) | Adopted the supplied Claude Design Studio shell without overwriting the canonical World Engine, documented the Hugging Face and GitHub landscape, and added a draft v1 simulation/replay contract with a passing deterministic fixture. Visual browser smoke testing remains outstanding because the in-app browser runtime was unavailable. |
| World Engine Phase 6: Asset & Build Validation | Poolside Agent | 2026-09-02 | N/A | Created 13 Scenario DataAssets (UScenarioDataAsset with TSoftObjectPtr<UWorld> LevelReference); created 4 .umap levels (Workplace, Personal, Social, Academic) with ≥10 PlayerStarts, NavMesh, and full lighting; verified all 13 DataAsset→Level bindings resolve correctly; cooking via RunUAT.sh completed with 0 errors; load times 0.1–0.2s (well under 30s target). Full report at `WorldEngine/Saved/Phase6ValidationReport.json`. |
