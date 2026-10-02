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

- [ ] A.1 **Publish the state schema.** `docs/contracts/state-feed-v1.md`. Two projections from one source, per the vertical slice's own rule (`simulation state → renderer projection → observer UI`):

  | Projection | Shape | Consumer |
  |---|---|---|
  | **Scalar** | `attentionEnergy`, `stressLevel`, `confidence`, `cognitiveLoad`, `independenceScore`, `supportNeedLevel` | PPO policy, numeric readouts |
  | **Structured** | named states, `currentGoal`, `currentTask`, `struggleSignals`, `learnedStrategies`, `interventionHistory` | metacognitive self-model, LLM coach, observer panels |

- [ ] A.2 **Envelope.** `agents[]` (id, name, position, velocity, levels, currentScene), `scene`, `needs`, `burnout`, `events[]`, `timestamp`. Include **velocity** — walk cycles require it, and `simPosition()` returning only `{x,y,z}` will not animate.
- [ ] A.3 **Burnout episodes.** `burnoutEpisodes[]`: `{ startTick, severity, peakBelow, recoveredTick, recoveryMode: solo | rrt }`. Serves both the reward and the Learning Timeline.
- [ ] A.4 **Self-recognition events.** `selfRecognitions[]`: `{ tick, riskAtRecognition, actedOn, ledTo: prevented | delayed | ignored }`. `actedOn: false` is the failure signal — it distinguishes self-awareness from self-report.
- [ ] A.5 **Fixture provider** — static JSON standing in for Python, so the whole chain works before the bridge exists. Schema-validated on load.

---

## 4. Phase B — Open world

Godot generates the open world procedurally. **Do not reproduce UE's generation code.** The review found it to be known-bad, and reproducing it would import the defects:

- `Fbm2D` returns **signed ≈±0.71**, not `[0,1]` as both open-world docs claim. The live callers compensate with `Max(0,(n+0.3)*0.7)` and `Clamp(0.5+n*0.5,0,1)`.
- Noise has a **hard 256-unit lattice period** (coordinates are cm), so terrain repeats every **2.56 m** across the whole 200 m world.
- `GenerateLandscape` returns without applying the heightmap — UE renders **flat ground**. Under default config no ground plane is spawned either; the city slab *is* the ground.

- [ ] B.1 Settle the **sky**: `SkyBuilder.cs` (prototype shader) vs `addons/sky_3d/` (Sky3D v2.1, atmospheric day/night). `Daylight.cs` and `WorldView.cs` currently drive the custom shader. Recommend Sky3D for the open world, custom shader retained only if interiors need it. Record the choice.
- [ ] B.2 Open world renders **residents** — the agent population walking between buildings. This is where articulation and walk cycles earn their keep.
- [ ] B.3 Building→interior mapping. Four interior scenes, mapped by building type: Office→Workplace, Shop→Social, Apartment→Personal, School→Academic. Matches the UE portal map.
- [ ] B.4 Name labels (`Label3D`) and the first named-state indicator, colour-safe, no flashing.

---

## 5. Phase C — Interiors

Four scenes exist (`workplace_level.tscn`, `personal_level.tscn`, `social_level.tscn`, `academic_level.tscn`), each a thin wrapper around FBX geometry imported through ufbx. Geometry is in; the scaffolding is not.

- [ ] C.1 **Collision.** FBX export dropped UE's collision volumes. Agents walk through walls.
- [ ] C.2 **Entry point and return door.** Where an agent appears on arrival, and the transition back.
- [ ] C.3 **Task anchors** carrying the affordance axes. Port the model from `NLTSmartObjectWorldSubsystem.cpp` — it is complete but never populated (`RegisterLocation` has zero callers, so `Locations` is always empty and need-driven targeting always falls back to wander):

  | Need | Matches | Score |
  |---|---|---|
  | `Quiet` | `NoiseLevel < 0.3` | `1 − NoiseLevel` |
  | `Social` | `SocialDensity > 0.6` | `SocialDensity` |
  | `Rest` | `Privacy > 0.5` | `Privacy` |
  | `Privacy` | `Privacy > 0.7` | `Privacy` |
  | `Stimulation` | `SocialDensity > 0.5 \|\| NoiseLevel > 0.5` | `SocialDensity + NoiseLevel·0.5` |

  Five needs — `Privacy` is distinct from `Rest` and gates at a stricter threshold.
- [ ] C.4 **Render the axes.** An observer watching an Avatar deliberately walk to the quiet corner rather than the nearest chair is watching the need model work. No chart required.
- [ ] C.5 Resolve `workplace.tscn` (8 lines) vs `workplace_level.tscn` (19 lines) — which is live.

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

- [ ] 0.1 **Ratify two third-party plugins.** Both were installed by Joshua personally, which is correct — installation is reserved to them. Neither is recorded.

  | Path | Identity | Status |
  |---|---|---|
  | `addons/godot_ai/` | MCP bridge, v4.2.3, `hi-godot/godot-ai`, MIT. Upstream's own install path is a **signed exact-tree archive** with `release_verifier.gd`; the vendored tree is **missing `docs/v4-migration.md`**, so it is incomplete against its own docs, and no evidence exists the verifier was run | Unratified |
  | `addons/sky_3d/` | Sky3D v2.1, Cory Petkovsek et al. Atmospheric day/night | Unratified |

  Record approval and provenance, pin versions, add `mcp-config.yaml` entries preserving the existing dev-plane wording verbatim (*"development-plane interface… does NOT grant simulated agents runtime authority"*), and confirm compatibility with **4.7.2 mono + C#** — neither README addresses the C# variant. `addons/.godot_ai_update/` is update staging and should be ignored.
- [ ] 0.2 **Do not commit** `RenderStripped.*` or `SK_SimBody_Base.fbx` blind — untracked, unexamined, and `strip_fbx.gd` shows FBX post-processing is in play.
- [ ] 0.3 Confirm the intent-vs-gate gaps recorded in the previous plan: NPCs, agent↔agent interaction, and "realistic graphics" were unmet in UE and remain unimplemented. Each needs its own thread.

---

## 9. Out of scope

- PPO, RL policies, fusion scoring — Fusion's, permanently
- Determinism, replay codecs, golden fixtures, oracle validation
- Agent↔agent interaction, NPC population
- Cross-repo normalisation: `base_success_rate` is consumed by Fusion's orchestrator but has zero C++ readers in UE, and `task_type` exists in neither schema. Reconcile inside Fusion.
- The browser spectator (`useWorldPolling.ts` / `WorldView.ts`, 832 lines) — superseded by the native app, though its state schemas and panel design remain worth reading
