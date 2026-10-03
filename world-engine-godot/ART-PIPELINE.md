# NLT World Engine — Godot Art & Asset Pipeline

**Status:** opened 2026-10-02. Thread `GRAPH-001`. Extends [`RENDERER-PLAN.md`](RENDERER-PLAN.md).
**Thread:** `GRAPH-001` (forked from `MIGRATE-001`)
**Owner:** Joshua W. Dorsey, Sr. · **Authority:** OTOI §4.4
**Predecessor:** [`../docs/design/realistic-viewer-architecture.md`](../docs/design/realistic-viewer-architecture.md) — **stale**, see §2

---

## 1. Why this thread exists

`RENDERER-PLAN.md` §0.3 (line 170) records three intent-vs-gate gaps that survived the UE → Godot move because they were never implemented in UE to begin with:

> NPCs, agent↔agent interaction, and **"realistic graphics"** were unmet in UE and remain unimplemented. **Each needs its own thread.**

`docs/active-threads.md` already carries the same finding under MIGRATE-001:

> **Named gaps the migration does not close** (unmet in UE too — own threads needed, not inherited): agent↔agent interaction, NPC population (no NPC system exists), realistic graphics.

This document is that thread for **graphics only**. NPCs and agent↔agent interaction are separate threads and are **out of scope here**.

### 1.1 The observation that triggered it

The Godot open world currently renders entirely from engine primitives. `VegetationBuilder.cs` and `SettlementBuilder.cs` build `CylinderMesh`, `ConeMesh`, `BoxMesh` and `SphereMesh` at runtime; `TerrainBuilder.cs` is a `SurfaceTool` mesh with vertex colours. There is **not one imported mesh in the open world.** Against the three.js spectator in [`../nlt-world-engine.html`](../nlt-world-engine.html) — which has real foliage, a real shoreline, and a full spectator HUD — the Godot world reads as a blockout.

That comparison is fair. It is also not, by itself, an argument for imported art everywhere. §4 explains why.

---

## 2. What this thread supersedes

[`../docs/design/realistic-viewer-architecture.md`](../docs/design/realistic-viewer-architecture.md) is the prior art on this question and it is **orphaned**. It specifies a Three.js viewer under `world-engine-3d/` talking to `server.py` / `world_engine.py` over a WebSocket bridge carrying `contract-v1`. Per `RENDERER-PLAN.md` §9 that browser spectator is superseded by the native app.

**Do not implement against it.** Two things in it survive and are adopted here:

| Adopted | From |
|---|---|
| **CC0-only asset sourcing** — Mixamo for characters, Poly Haven for textures and HDRs | §Asset Pipeline, line 256-260 |
| **Explicit perf targets** — 60 FPS, 10–20 animated characters, <16 ms frame time | §Performance Targets, line 249-254 |

Everything else in that document describes an architecture that no longer exists.

---

## 3. Current renderer state (2026-10-02)

| Element | Implementation | Notes |
|---|---|---|
| Terrain | `TerrainBuilder.cs` — 208² grid, `SurfaceTool`, vertex-coloured | `CastShadow = Off`. No splat/normal maps. |
| Water | `WaterBuilder.cs` — 2600 m plane, custom `spatial` shader, 4 summed sine waves, fresnel + sun glitter | Vertex-displaced in-shader |
| Sky | `SkyBuilder.cs` — `SphereMesh` r=1500, custom gradient shader + analytic sun disc | Driven by `Daylight.cs` |
| Day/night | `Daylight.cs` — analytic, drives sun colour/energy/dir, fog, sky and water uniforms | **Owns the sun** |
| Vegetation | `VegetationBuilder.cs` — `MultiMesh`, wind `ShaderMaterial`, per-instance `INSTANCE_CUSTOM` tint | Trunks `CylinderMesh` 6-seg; canopy 3× `ConeMesh` 8-seg |
| Settlement | `SettlementBuilder.cs` — `BoxMesh`/`CylinderMesh` houses, roads, well, benches, desks | |
| Camera | `WorldView.cs` — orbit, drag + wheel | |
| Environment | ACES tonemap, glow, exp² fog, one shadow-casting `DirectionalLight3D` | |

**The four imported FBX files in `assets/levels/` are interiors only** — `Academic_Level.fbx`, `Personal_Level.fbx`, `Social_Level.fbx`, `Workplace_Level.fbx`, exported from UE. Per `RENDERER-PLAN.md` §4 line 79, `OpenWorld_Level` **cannot** be FBX-exported (World Partition + Landscape + runtime generation), which is why the open world is procedural at all.

So: the blockout is a *consequence of a real constraint*, not laziness. That constraint does not extend to foliage, props, or characters.

---

## 4. Scope — what actually forces the decision

`RENDERER-PLAN.md` Phase B is four items (lines 85-88) and **none of them is art fidelity**. This thread does not expand Phase B. What it does is identify the item that makes art unavoidable.

| Phase B item | Art required? |
|---|---|
| B.1 Settle the sky — `SkyBuilder.cs` vs `addons/sky_3d/` | **No** — third-party plugin, not art. Tracked in `RENDERER-PLAN.md` §0.1, where Sky3D is already recommended. |
| B.2 **Open world renders residents — agent population walking between buildings. "This is where articulation and walk cycles earn their keep."** | **Yes. This is the forcing function.** |
| B.3 Building→interior mapping | No |
| B.4 `Label3D` name labels + named-state indicator | No |

**B.2 is the whole argument.** `RENDERER-PLAN.md` line 44 specifies *"agents · articulated bodies · walk cycles · name labels"*, and line 44's counterpart at B.4 requires per-agent identity. An articulated character with a walk cycle **cannot be assembled from `CylinderMesh` and `BoxMesh`**. It requires a skinned mesh, a skeleton, and animation clips.

So the asset decision lands at B.2 whether or not anyone files it under "realistic graphics". Opening the thread now, before B.2, is the cheap time to do it.

### 4.1 What does *not* need imported art

Being honest about the other direction — these are fine as procedural primitives and importing meshes here would be wasted effort and wasted bytes:

- Terrain — vertex-coloured heightfield is a legitimate technique, not a placeholder
- Water — custom shader is already doing more than a mesh would
- Buildings at distance, roads, roofs — blockout massing reads correctly under fog
- The vegetation wind shader — already a real technique

**Recommendation: import art where art is genuinely required (characters, and hero props near camera), not as a blanket replacement.** A blanket "make it not blocks" sweep would add licensing surface and repo weight for little visual return.

---

## 5. Work items

### Phase G1 — Decisions (Joshua; blocking)

- [ ] **G1.1 Character asset source.** Mixamo (Adobe, free, redistribution terms need confirming per-asset) vs CC0 alternatives vs purchased. **Mixamo's licence has historically not permitted redistribution of the raw assets** — if residents ship in this repo or a build, that needs a real answer, not an assumption.
- [ ] **G1.2 Character count and LOD budget.** 19–20 Avatar+Aide pairs (`RENDERER-PLAN.md` line 37). 20 skinned meshes with animation is a different cost from 20 `MultiMesh` cones. Do we animate all of them, or LOD to billboard/static beyond N metres?
- [ ] **G1.3 Animation source.** Bake clips into the GLB, or ship a separate animation set? Walk cycle only, or also idle/sit/converse per the state machine in the stale design doc §5?
- [ ] **G1.4 Hero prop policy.** Trees, rocks, street furniture — import CC0, or keep procedural? §4.1 argues keep; this is the call.
- [ ] **G1.5 Budget.** Is this zero-cost (CC0 only), or is spend authorised? Per OTOI §4.4 this is Joshua's decision, not an agent's.

### Phase G2 — Pipeline (agent-executable, after G1)

- [ ] **G2.1 Provenance manifest.** Every imported asset gets a row: source URL, licence, licence text location, retrieval date, author. `RENDERER-PLAN.md` §0.2 sets the precedent — *"Do not commit `RenderStripped.*` or `SK_SimBody_Base.fbx` blind — untracked, unexamined."* No asset lands without a manifest row.
- [ ] **G2.2 Import settings.** Godot import config for skinned meshes: bone compression, LOD generation, shadow casting, texture filter/compression. Must be committed — `.import` files are currently untracked in `assets/levels/`.
- [ ] **G2.3 Retarget + optimise.** Source → Blender → glTF, per the predecessor's pipeline. Reduce to what ships.
- [ ] **G2.4 `AnimationPlayer` + state machine.** `IDLE → WALK → ARRIVE → USE → SIT → CONVERSE`, per predecessor §5. Needs **velocity** off the state feed — `RENDERER-PLAN.md` A.2 line 70 already calls this out: *"`simPosition()` returning only `{x,y,z}` will not animate."*
- [ ] **G2.5 Performance gate.** Measure against the inherited targets (§2) before claiming B.2 done.

### Phase G3 — Verification (agent-executable)

- [ ] **G3.1 Frame-time capture** at 20 animated residents.
- [ ] **G3.2 Confirm no license-incompatible asset is committed** — manifest audit.

---

## 6. Constraints this thread inherits

| Constraint | Source |
|---|---|
| Godot is a **renderer, not a simulation** | `RENDERER-PLAN.md` §1 — *"The game renderer must not become the source of truth."* |
| **No determinism required** in the renderer | `RENDERER-PLAN.md` §1.3 — PPO is Fusion's |
| Third-party plugins reserved to Joshua personally | `RENDERER-PLAN.md` §0.1, `MIGRATION-PLAN.md` §10 |
| Unexamined assets not to be committed blind | `RENDERER-PLAN.md` §0.2 |
| **Accessibility is a renderer constraint, not a later pass** | `RENDERER-PLAN.md` §6 D.4 — reduced motion, colour-safe indicators, minimal flashing |
| PR ≤100 changed files | `MIGRATION-PLAN.md` §10 — CodeRabbit skips review above it |

**G3 note:** `RENDERER-PLAN.md` D.4's *reduced motion* requirement is in direct tension with animated walk cycles and wind sway. The wind shader in `VegetationBuilder.cs` is unconditional. That conflict needs resolving when G2.4 lands, not after.

---

## 7. Explicitly out of scope

- PPO, RL policies, fusion scoring — Fusion's, permanently
- Determinism, replay, fixtures, oracle validation — retired per `RENDERER-PLAN.md` §1
- NPC population and agent↔agent interaction — separate threads per §0.3
- Phase B items B.1, B.3, B.4 — tracked in `RENDERER-PLAN.md`
- The browser spectator — superseded per `RENDERER-PLAN.md` §9

---

## 8. Open question this thread cannot answer alone

`RENDERER-PLAN.md` §0.3 lumps three gaps together and says "each needs its own thread". Graphics is now that thread. **NPC population and agent↔agent interaction still have no owner and no thread.** `RENDERER-PLAN.md` §9 lists agent↔agent interaction as out of scope entirely, while §0.3 says it needs a thread. Those two statements are in conflict and only Joshua can resolve which holds.

---

*Opened under OTOI §4.4. Thread `GRAPH-001`.*