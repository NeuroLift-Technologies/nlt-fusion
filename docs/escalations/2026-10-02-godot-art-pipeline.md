# Escalation Record — Godot art & asset pipeline decisions (GRAPH-001)

**Date:** 2026-10-02T21:15:00Z
**Agent:** OpenCode
**Session:** `feat/openworld-atmosphere` (PR [#77](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/77))
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** medium

---

### Trigger

`RENDERER-PLAN.md` §0.3 (line 170) requires that the "realistic graphics" gap — unmet in UE, still unimplemented in Godot — **get its own thread**. Opening it immediately surfaces a decision that is not an agent's to make under OTOI §4.4: **the source and licensing terms of character art**, plus a budget authorisation.

Compounding it: the documented default asset source (Mixamo) has **redistribution terms that likely prohibit shipping the raw assets**, so the obvious path may be unusable.

---

### Situation

The Godot open world renders **entirely from runtime primitives**. `VegetationBuilder.cs` and `SettlementBuilder.cs` build `CylinderMesh` / `ConeMesh` / `BoxMesh` / `SphereMesh` at runtime; `TerrainBuilder.cs` is a `SurfaceTool` mesh with vertex colours. There is **not one imported mesh in the open world.** Set against the three.js spectator in `nlt-world-engine.html` — real foliage, real shoreline, full spectator HUD — it reads as a blockout.

Two things temper that, and both belong in the decision:

1. **The blockout is partly a real constraint.** `RENDERER-PLAN.md` §4 line 79: `OpenWorld_Level` **cannot** be FBX-exported from UE (World Partition + Landscape + runtime generation). That is why the open world is procedural at all. The four FBX files in `world-engine-godot/assets/levels/` are **interiors only**.
2. **Phase B does not ask for art fidelity.** `RENDERER-PLAN.md` §4 B.1–B.4 are sky, residents, building→interior mapping, and labels. None is art quality. This thread does not expand Phase B.

What makes it urgent is **B.2**: *"Open world renders residents — the agent population walking between buildings. This is where articulation and walk cycles earn their keep."* Line 44 specifies *"articulated bodies · walk cycles"*. Those cannot be built from primitives — they need a skinned mesh, a skeleton, and clips. **The asset decision is already blocking Phase B**, whether or not it is labelled "graphics".

Full plan: [`world-engine-godot/ART-PIPELINE.md`](../../world-engine-godot/ART-PIPELINE.md) · Thread: [`docs/active-threads.md`](../active-threads.md)

---

### Decision Required

1. **G1.1 — Character asset source, and its redistribution terms.** Mixamo is the documented default (`docs/design/realistic-viewer-architecture.md` §Asset Pipeline). Adobe's Mixamo terms have historically **not** permitted redistribution of the raw assets. 19–20 Avatar+Aide pairs (`RENDERER-PLAN.md` line 37) would need to ship in the repo or a build. **Is Mixamo actually usable here, or do we need a CC0 alternative / a purchase?**
2. **G1.5 — Budget.** Is this zero-cost (CC0-only) or is spend authorised? Determines whether option 1 in G1.1 is even on the table.
3. **G1.2 — Character count and LOD budget.** Animate all ~20 residents, or LOD to static/billboard beyond N metres? Cost profile differs substantially from the current `MultiMesh` approach.
4. **G1.3 — Animation source.** Clips baked into the GLB, or a separate animation set? Walk cycle only, or also idle / sit / converse?
5. **G1.4 — Hero prop policy.** Trees, rocks, street furniture: import CC0, or keep procedural? Recommendation is **keep procedural** — see below.
6. **Conflict resolution.** `RENDERER-PLAN.md` §9 lists agent↔agent interaction as **out of scope**; §0.3 says it **needs its own thread**. Those contradict. Which holds? (NPC population has the same problem.)

---

### Options Considered

**For G1.1 (character source):**

1. **Mixamo**
   - Description: Free Adobe library, the predecessor doc's stated default. Broad clip library, standard FBX.
   - Trade-offs: **Redistribution terms are the open question.** If residents ship in the repo or a build, this may not be permissible. Also: Mixamo characters are stylistically generic and read as "video game" rather than "a world people live in."

2. **CC0 character source** (e.g. Quaternius, Kenney, or Quixel/Megascans-tier free assets)
   - Description: Clean redistribution, no licence ambiguity.
   - Trade-offs: Smaller library, more art-direction effort to hit "realistic." Needs a provenance manifest either way.

3. **Purchase a character pack**
   - Description: Solves both realism and licensing outright.
   - Trade-offs: Requires budget authorisation (G1.5), which is why G1.1 and G1.5 are coupled.

4. **Keep procedural characters, improve shading only**
   - Description: No new assets, no licensing surface. Stylised, non-articulated residents.
   - Trade-offs: **Directly contradicts `RENDERER-PLAN.md` line 44** ("articulated bodies · walk cycles") and B.2's stated purpose. Cannot deliver B.2 as written.

**On scope (the recommendation):**

Import art **where art is genuinely required** — characters, and hero props near camera — **not as a blanket replacement.** Terrain as a vertex-coloured heightfield, the custom water shader, distant building massing under fog, and the existing wind shader are all legitimate techniques, not placeholders. A blanket "make it not blocks" sweep adds licensing surface and repo weight for little visual return, and would collide with the 100-file PR ceiling that stops CodeRabbit reviewing at all.

---

### Recommendation

- **Answer G1.1 and G1.5 together** — they are one decision in practice. If the answer is CC0-only, option 2; if spend is authorised, option 3 and the realism problem largely dissolves.
- **Do not treat Mixamo as free-to-redistribute.** Confirm before a single asset lands.
- **Keep G1.4 procedural.** It is the cheapest real win and the lowest-risk.
- **Close B.2 with a deliberately scoped subset first** — one character, one walk cycle, name label — so the pipeline is proven on a small surface before 20 are committed.
- **Resolve the §0.3-vs-§9 conflict** while deciding; graphics is now covered, the other two gaps are not, and one of the governing plan's sections says to ignore them.

---

### Blockers

| Blocked | Until |
|---|---|
| `GRAPH-001` Phase G2 — entire import/retarget/animation pipeline | G1.1 + G1.5 |
| `RENDERER-PLAN.md` **B.2** (residents, articulation, walk cycles) | G1.1 — cannot be built from primitives, by definition |
| `RENDERER-PLAN.md` **B.4** name labels tied to real agents | B.2 |
| **G2.4 specifically** — `RENDERER-PLAN.md` D.4 mandates *reduced motion*; unconditional walk cycles and the wind shader in `VegetationBuilder.cs` run against it | Needs a stated accessibility position, not a silent conflict |

Not blocked: B.1 (sky), B.3 (building→interior mapping), and all of Phase C/D. Phase A (state feed) is unaffected.

---

### Unrelated, but noted in the same session

`world-engine-godot/TerrainBuilderPhysics.cs` (created 2026-10-02 21:01:47, untracked) declares a **second** `public static class TerrainBuilder`, duplicating `TerrainBuilder.cs`. The two files are otherwise byte-identical apart from line endings. This **breaks the build**:

```
TerrainBuilderPhysics.cs(5,21): error CS0101: The namespace 'NltWorldEngine'
  already contains a definition for 'TerrainBuilder'
TerrainBuilderPhysics.cs(7,34): error CS0111: Type 'TerrainBuilder' already
  defines a member called 'Build' with the same parameter types
```

Left untouched — it appeared to be in-progress work. Flagged here so it is not mistaken for a clean build. Note that PR [#77](https://github.com/NeuroLift-Technologies/nlt-world-engine/pull/77) was opened **before** this file existed and its commit was verified clean, so the PR itself is unaffected.

---

### Resolution

*(To be filled in after Joshua responds)*

**Date resolved:**
**Decision:**
**Decided by:**
**Actions taken:**