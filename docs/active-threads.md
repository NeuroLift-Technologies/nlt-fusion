# Active Threads — nlt-world-engine

> This file tracks active work threads. Agents must read this at session start and update it during and at the end of each session.

**Last updated:** 2026-09-24

---

## Active Threads

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
