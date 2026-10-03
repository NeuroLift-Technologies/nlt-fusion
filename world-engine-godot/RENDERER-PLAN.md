# NLT World Engine — Godot Renderer & Spectator Plan

**Status:** rewritten 2026-10-02. Supersedes the port-and-fidelity plan.
**Thread:** `MIGRATE-001`
**Owner:** Joshua W. Dorsey, Sr. · **Authority:** OTOI §4.4

---

## 1. What changed, and why this document was rewritten

This plan previously described **porting a UE 5.8 simulation to Godot 4.7.2 in C#** with a four-tier deterministic validation gate. That scope is withdrawn. Three decisions removed it:

1. **Godot is a renderer, not a simulation.** `docs/game-engine-vertical-slice.md` (Joshua, 2026-04-29) states the rule that never changed across Phaser → UE → Godot: *"The game renderer must not become the source of truth."* Fusion's Python owns the simulation; Godot owns the visual world and the spectator.
2. **Hardware forces the engine change.** UE was chosen partly for hardware capability; it no longer fits. Godot is the renderer for that reason.
3. **PPO is Fusion's.** Training lives in Fusion's Python, against Fusion's Python world. The Godot renderer is not on the training path, so it needs no determinism.

Consequently the following work is **retired, not deferred** — it existed to prove a renderer reproduced a simulation faithfully, and no such proof is needed:

| Retired | Reason |
|---|---|
| `NltWorldEngine.Core` deterministic library (`Rng`, `CanonicalState`, `StateHash`, `Replay`, `EventBus`, `Noise`) | Python owns determinism; hashing and replay are Fusion's concern |
| Tier 2 / 2-core / 2b conformance gates and the UE oracle | No fidelity requirement |
| Phase 1 fixture apparatus (1.3–1.14): golden vectors, `ValidateNonDegeneracy`, SIM-001, the three crash bugs | Solved a problem that no longer exists. The fixes that landed in [#65](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/65), [#69](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/69) and [#70](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/70) remain correct on `main` and harmless; they simply no longer gate anything |
| Phase 3 Python sidecar owning ports 8765/8766 | The wire contract was never consumed by Fusion and is not frozen |
| Phase 4.3 open-world rebuild from UE noise | Godot generates the open world; UE's noise code is known-bad (see §4) |
| Phase 6 `ITrainingEnvironment` in C#, `IAgentController` in C# | Both live in Fusion, behind PPO |
| Phase 10 UE retirement gates | Nothing to retire — UE stays as historical reference |

**What remains is smaller:** render the habitat, animate the agents, label them, and make executive-function state legible to someone who lives with those functions.

---

## 2. Architecture

```
Fusion (Python) — AUTHORITATIVE
  world simulation · per-agent policies (1 per Avatar, 1 per Aide, 19–20 pairs)
  PPO training · RRT core · fusion gate · observer state schemas
        │
        │  state feed (~1 Hz)
        ▼
nlt-world-engine (Godot 4.7.2 C#) — RENDERER + SPECTATOR ONLY
  open world (procedural)  +  4 interior scenes (imported FBX)
  agents · articulated bodies · walk cycles · name labels
  6 observer panels · Simple / Coach / Technical · accessibility
```

**The one interface to define** is the Python → Godot state feed. It is this plan's first deliverable.

### Where cognition lives

The boundary is drawn in both READMEs and both agree:

- **World engine owns physical reality** — tick, world state, space, time, objects, needs, NPCs, scenario instantiation.
- **Fusion owns semantic reality** — ADHD trait modelling, coaching expertise, fusion.

Consequence: **`FNLTAgentState`'s `BurnoutRisk`, `Independence` and `FusionReadiness` are a boundary violation.** Fusion computes all three in `src/fusion/readiness_assessor.py`, from entirely different inputs. WorldEngine must **not** send them; Fusion derives them from observed state.

---

## 3. Phase A — State feed (blocks everything)

- [x] A.1 **Publish the state schema.** `docs/contracts/state-feed-v1.md`. ✅ *Done 2026-10-02.* Two projections from one source, per the vertical slice's own rule (`simulation state → renderer projection → observer UI`):

  | Projection | Shape | Consumer |
  |---|---|---|
  | **Scalar** | `attentionEnergy`, `stressLevel`, `confidence`, `cognitiveLoad`, `independenceScore`, `supportNeedLevel` | PPO policy, numeric readouts |
  | **Structured** | named states, `currentGoal`, `currentTask`, `struggleSignals`, `learnedStrategies`, `interventionHistory` | metacognitive self-model, LLM coach, observer panels |

  Contract published at `docs/contracts/state-feed-v1.md`. Covers envelope, both projections, four-need model (with the privacy/location-axis distinction recorded — §4.3), walk animation requirement, burnout threshold predicate, self-recognition, events, and validation rules. Transport left open — schema is transport-agnostic.

- [x] A.2 **Envelope.** ✅ *Done 2026-10-02.* `agents[]` (id, name, position, **velocity**, levels, currentScene), `scene`, `needs`, `burnoutEpisodes[]`, `selfRecognitions[]`, `events[]`, `tick`, `simTimeIso`, `pairs[]`. Velocity is present; see contract §4.4. Appearance carries `walkPhase` so Fusion can supply it; renderer falls back to velocity integration.
- [x] A.3 **Burnout episodes.** ✅ *Done 2026-10-02.* `burnoutEpisodes[]`: `{ startTick, severity, peakBelow, recoveredTick?, recoveryMode?: solo | rrt }`. Open episode omits `recoveredTick` / `recoveryMode`. Defined in contract §6 and present in `fixtures/state-feed.sample.json`.
- [x] A.4 **Self-recognition events.** ✅ *Done 2026-10-02.* `selfRecognitions[]`: `{ tick, riskAtRecognition, actedOn, ledTo: prevented | delayed | ignored }`. `actedOn: false` is the failure signal. Defined in contract §7 and present in sample.
- [x] A.5 **Fixture provider.** ✅ *Done 2026-10-02.* `world-engine-godot/StateFeedLoader.cs` — loads `fixtures/state-feed.sample.json` at startup, validates it against the contract schema (required keys, field types, need-key set, version string), and surfaces the parsed envelope as `StateFeedLoader.Current`. Fails loudly on any required-key absence. Cross-reference: `docs/contracts/state-feed-v1.md §9`.

---

## 4. Phase B — Open world

Godot generates the open world procedurally. **Do not reproduce UE's generation code.** The review found it to be known-bad, and reproducing it would import the defects:

- `Fbm2D` returns **signed ≈±0.71**, not `[0,1]` as both open-world docs claim. The live callers compensate with `Max(0,(n+0.3)*0.7)` and `Clamp(0.5+n*0.5,0,1)`.
- Noise has a **hard 256-unit lattice period** (coordinates are cm), so terrain repeats every **2.56 m** across the whole 200 m world.
- `GenerateLandscape` returns without applying the heightmap — UE renders **flat ground**. Under default config no ground plane is spawned either; the city slab *is* the ground.

- [x] B.1 **Sky decision recorded.** ✅ *Done 2026-10-03 (updated from 2026-10-02 on ratification).*

  **Decision: adopt Sky3D (`addons/sky_3d/`) for the open world. Retire `SkyBuilder.cs` once the swap is in.**

  Rationale:
  - `addons/sky_3d/` (Sky3D v2.1, TokisanGames, MIT) is now **ratified** — installed by Joshua personally 2026-10-03, provenance and licence confirmed (§8 item 0.1).
  - Sky3D's Rayleigh/Mie scattering atmospheric cycle is the right long-term choice for the open world over the current analytic gradient shader.
  - Sky3D is pure GDScript — compatible with Godot 4.7.2 mono + C# by design.
  - Interiors do not use the sky; the swap is open-world-only.
  - ⚠️ **Reduced motion flag (RENDERER-PLAN.md D.4):** Sky3D drives a continuously rotating day/night cycle. This is the same constraint conflict as the vegetation wind shader — it must be honoured by a system-level reduced-motion toggle that pauses the sky rotation, not by disabling Sky3D. Resolve before shipping.

  **Implementation steps (agent-executable, now unblocked):**
  1. ~~Replace `SkyBuilder.Build()` call in `WorldView.cs` with a Sky3D `Sky3D` node (added as a child via `AddChild`, or wired through the scene tree).~~ ✅ Done.
  2. ~~Remove `_skyMat` field and its uniform updates from `WorldView._Process()`.~~ ✅ Done.
  3. ~~Wire `TimeOfDay` (Sky3D's clock node) to `Daylight.cs`'s elapsed time, or let Sky3D drive time independently and remove `Daylight.cs` if it becomes redundant.~~ ✅ Done — Sky3D's `game_time_enabled` is set `false`; `WorldView._Process` drives `current_time` from `_simT` mapped to hours [0, 24).
  4. ~~Delete `SkyBuilder.cs` once the scene runs without it.~~ ✅ Done — `SkyBuilder.cs` and `Daylight.cs` deleted.
  5. Confirm star-map attribution is included in any shipped build or public demo (§8 0.1 note).

  **B.1 is fully implemented.** Build: 0 errors, 0 warnings. `SkyBuilder.cs` and `Daylight.cs` are deleted. `WorldView.cs` now instantiates Sky3D via `GD.Load<GDScript>`, drives `current_time` from sim elapsed time, and reads `SunLight` direction/colour for water and vegetation shader uniforms. `SkyPaused` property honours reduced-motion (D.4).
- [ ] B.2 Open world renders **residents** — the agent population walking between buildings. This is where articulation and walk cycles earn their keep.
- [ ] B.3 Building→interior mapping. Four interior scenes, mapped by building type: Office→Workplace, Shop→Social, Apartment→Personal, School→Academic. Matches the UE portal map.
- [ ] B.4 Name labels (`Label3D`) and the first named-state indicator, colour-safe, no flashing.

---

## 5. Phase C — Interiors

Four scenes exist (`workplace_level.tscn`, `personal_level.tscn`, `social_level.tscn`, `academic_level.tscn`), each a thin wrapper around FBX geometry imported through ufbx. Geometry is in; the scaffolding is not.

- [x] C.1 **Collision.** ✅ *Done 2026-10-03.* All four FBX `.import` files now set `meshes/create_shapes=3` (Trimesh — concave collision, static, which fits level geometry). Godot regenerates trimesh collision shapes on the next import (editor open or `--headless --import`). `TerrainBuilderPhysics.cs` remains an intentional empty placeholder. B.2 (residents) can now be exercised against the imported levels.
- [ ] C.2 **Entry point and return door.** Where an agent appears on arrival, and the transition back. Blocked on B.3 — arrival is triggered by the building→interior mapping, which is a Phase B item.
- [x] C.3 **Task anchors** carrying the affordance axes — **model done, placement open.** `TaskAnchor.cs` ports `NLTSmartObjectWorldSubsystem.h/.cpp`: `AffordanceAxes` (noiseLevel / socialDensity / privacy), `TaskAnchor` with reservation and occupancy, and `NeedMatching.Matches/Score/FindBest` with UE's thresholds and formulas held byte-identical.

  **This section previously specified five needs and was wrong.** `Privacy` is not an agent need — see [`docs/contracts/state-feed-v1.md` §4.3](../docs/contracts/state-feed-v1.md). Four needs, three location axes:

  | Need (Fusion → feed) | Matches | Score |
  |---|---|---|
  | `Quiet` | `NoiseLevel < 0.3` | `1 − NoiseLevel` |
  | `Social` | `SocialDensity > 0.6` | `SocialDensity` |
  | `Rest` | `Privacy > 0.5` | `Privacy` |
  | `Stimulation` | `SocialDensity > 0.5 \|\| NoiseLevel > 0.5` | `SocialDensity + NoiseLevel·0.5` |

  The UE `Privacy` branches (`.cpp:129-130`, `:152-153`) are **deliberately not ported** — they cannot fire, because no agent holds a `Privacy` need. `Privacy` survives as a location *axis*, which is the role `Rest` and `Stimulation` read. Porting those branches forward would import a known dead path.

  Two occupancy behaviours carried over deliberately: an anchor occupied by someone else is skipped rather than scored down, and an agent that already holds its target keeps it (otherwise an agent whose target fills mid-approach thrashes every tick).

  - [ ] **C.3a — anchor placement.** Blocked: the FBX interiors have no authored anchors, and placing them requires reading the imported geometry. Needs a Godot-capable session or Joshua's room layout. UE gives no help — `RegisterLocation` has zero callers, so `Locations` was always empty and need-driven targeting always fell back to wander.
  - [ ] **C.3b — C.4 groundwork.** `FindBest` returns the chosen anchor; nothing consumes it yet, because no agent exists to walk there.
- [ ] C.4 **Render the axes.** An observer watching an Avatar deliberately walk to the quiet corner rather than the nearest chair is watching the need model work. No chart required. Blocked on B.2 (no residents rendered) and C.3a (no anchors to render).
- [x] C.5 **Resolved — `workplace_level.tscn` is canonical; `workplace.tscn` is orphaned.** ✅ *Done 2026-10-03.*

  Neither file was live. `run/main_scene` is `Main.tscn` → `WorldView`, which builds only the procedural open world; **no code path loads any interior scene** (`LoadScene` / `ChangeScene` / `PackedScene` have zero hits in the C# sources). "Which is live" was therefore moot until B.3 wires them.

  `workplace_level.tscn` wins because the other three interiors follow the `<Name>_level.tscn` convention that mirrors the FBX export names, and this section already names that convention.

  `workplace.tscn` differs in kind: it is a `Node3D` wrapper that instances the FBX as a *child* at a stray offset (`0.51, -0.67, 0.14`), and it carries none of the sky configuration the other three have. It is not a variant to preserve — it looks like an early export iteration.

  **Not deleted.** It is untracked, so removing it is unrecoverable, and it is not blocking anything. Left for Joshua.

  - **⚠️ `workplace_level.tscn` attaches a Sky3D script.** It binds `res://addons/sky_3d/src/SkyDome.gd` to `SM_SkySphere`. The plugin itself is now ratified and recorded (§0.1), so the reference is legitimate — but see the fresh-clone blocker below, which now affects the main scene too. The other three interiors are clean: their `sky_mode = 2` is a Godot built-in on `DirectionalLight3D`, **not** a Sky3D property.
  - **🔴 Fresh-clone blocker — now on the main scene, not just this one.** `addons/sky_3d/` is still **untracked** in git, and `WorldView.cs` loads it via `GD.Load<GDScript>` at `_Ready()`. So `res://Main.tscn` — the `run/main_scene` — depends on files that are not in the repository. A fresh clone will not start, and `dotnet build` will not catch it because the path is a runtime string, not a compile-time reference. This was scoped to one interior scene until B.1 landed; it is now project-wide. Needs `addons/sky_3d/` committed before anything ships.

---

## 6. Phase D — Observer

The audience is **people with ADHD**. Per the vertical slice: they must *"watch and understand the simulation without needing to parse a dense analytics dashboard."* That makes accessibility a renderer constraint, not a later pass.

**Behaviour is the primary channel; numbers are the third detail level.** Meters and charts belong at `Technical`.

| Level | Content |
|---|---|
| `Simple` | Named state + plain-language events. *"Drifting — hasn't started for a few minutes."* |
| `Coach` | The above, plus what the Aide did and whether it helped |
| `Technical` | Numbers, graphs, timelines |

- [ ] D.1 **Six panels.** `World View` · `Avatar State` · `Aide Intervention Log` (when / which strategy / why chosen / whether it helped) · `Learning Timeline` · `Independence Meter` · `Fusion Gate`.
- [ ] D.2 **Learning Timeline is the most valuable panel.** `EXPERIENCE_VOLUME_TARGET = 50` means a pair must accumulate 50 experiences before fusion. Fifty repetitions are not comprehensible in real time — the timeline, step-through and replay are what make a training history legible. It should show burnout episodes marked, severity as depth, recovery arcs, and whether each recovery was solo or assisted.
- [ ] D.3 **Fusion Gate** is a pure render of `FusionReadiness.to_dict()` — per-dimension score and pass, overall, `blocking_dimensions`, `recommendations`. No world data needed.
- [ ] D.4 **Accessibility from frame one:** reduced motion · colour-safe indicators · minimal flashing or surprise animation · plain-language events · clear visual hierarchy · pause/resume/step/replay · adjustable speed.
- [ ] D.5 **Four-way reading of burnout**, and it must be phrased for a human:

  | | Reading |
  |---|---|
  | Never approached burnout | Strong — but possibly untested |
  | Approached, **self-recovered** | **The goal** |
  | Approached, needed RRT | Needed rescue — legitimate, costs readiness |
  | Collapsed repeatedly | Still struggling |

  The permanent `crisis_interventions` penalty means a pair with a hard life is systematically disadvantaged in fusion. The panel has an obligation to explain that as *"not ready yet"*, not *"failed"* — the audience will recognise themselves in the struggling Avatar.

---

## 7. Objectives the renderer must make visible

Four, all already specified in Fusion. The renderer does not compute them; it **shows** them.

1. **Self-sufficiency** — independence rising across attempts.
2. **Burnout minimisation** — incidence, severity and time-to-recovery over the run.
3. **Self-recognition** — the Avatar notices its own decline and acts before collapse. Metacognition is track 7 of 19 (`SelfMonitor / AwareMate`) and **is not measured by the fusion gate**; consider a seventh dimension, or the behaviour most characteristic of the method is trained but never graded.
4. **Coached recovery** — the Aide's RRT core steps in when burnout occurs.

The legible narrative is a contrast:

> risk rising → Avatar notices → Avatar acts  ← the skill being installed
> risk rising → nothing → collapse → RRT  ← what it looks like without it

---

## 8. Governance — Phase 0, still outstanding

- [x] 0.1 **Ratify third-party plugins.** Installation is reserved to Joshua personally — both were installed by Joshua.

  | Path | Identity | Status |
  |---|---|---|
  | `addons/sky_3d/` | Sky3D v2.1, TokisanGames (Cory Petkovsek, J. Cuéllar, contributors). MIT. Source: `https://github.com/TokisanGames/Sky3D` | ✅ **Ratified 2026-10-03 — installed by Joshua personally** |
  | `addons/godot_ai/` | MCP bridge, v4.2.3, `hi-godot/godot-ai`, MIT. Upstream's own install path is a **signed exact-tree archive** with `release_verifier.gd`; the vendored tree is **missing `docs/v4-migration.md`**, so it is incomplete against its own docs, and no evidence exists the verifier was run | ⚠️ **Still unratified** — see below |

  **Sky3D ratification record:**
  - Installed by: Joshua W. Dorsey (OTOI §4.4 — only he installs third-party plugins)
  - Date: 2026-10-03
  - Source: `https://github.com/TokisanGames/Sky3D`, version 2.1, tag/release in `plugin.cfg`
  - Licence: MIT — `addons/sky_3d/LICENSE.txt` present in tree
  - Compatibility: Supports Godot 4.3+; the plugin is pure GDScript with no C# interop surface. GDScript plugins run independently of the C# (.NET mono) runtime — compatible with 4.7.2 mono + C# by design.
  - ⚠️ **Star map attribution required.** The star map assets under `addons/sky_3d/assets/thirdparty/textures/milkyway/` carry a separate attribution requirement documented at their own `LICENSE.md`. This is not a redistribution blocker but the attribution must appear if the skybox is shown in any shipped build or public demo.
  - No `mcp-config.yaml` entry needed — Sky3D is a scene-level Godot plugin, not a server.

  **Sky3D adoption — now unblocked.** B.1 decision updated below.

  **`addons/godot_ai/` — still outstanding:**
  - Provenance unverified (missing `docs/v4-migration.md` vs upstream docs; no evidence `release_verifier.gd` was run)
  - Bootstraps a Python server via `uv`; auto-starts WebSocket MCP server; mutates cursor/claude/codex/cline/etc. client config files — machine-level reach beyond this repo
  - Exposes Godot editor action handlers over MCP (inspect scenes, create nodes, modify properties, run tests)
  - `mcp-config.yaml` entry needed; existing `unreal-mcp` governance note wording (*"development-plane interface… does NOT grant simulated agents runtime authority"*) must be preserved verbatim — change only the UE nouns
  - C#/mono compatibility unconfirmed
  - `addons/.godot_ai_update/` is update staging and should be ignored by git
- [ ] 0.2 **Do not commit** `RenderStripped.*` or `SK_SimBody_Base.fbx` blind — untracked, unexamined, and `strip_fbx.gd` shows FBX post-processing is in play.
- [ ] 0.3 Confirm the intent-vs-gate gaps recorded in the previous plan: NPCs, agent↔agent interaction, and "realistic graphics" were unmet in UE and remain unimplemented. Each needs its own thread.

---

## 9. Out of scope

- PPO, RL policies, fusion scoring — Fusion's, permanently
- Determinism, replay codecs, golden fixtures, oracle validation
- Agent↔agent interaction, NPC population
- Cross-repo normalisation: `base_success_rate` is consumed by Fusion's orchestrator but has zero C++ readers in UE, and `task_type` exists in neither schema. Reconcile inside Fusion.
- The browser spectator (`useWorldPolling.ts` / `WorldView.ts`, 832 lines) — superseded by the native app, though its state schemas and panel design remain worth reading
