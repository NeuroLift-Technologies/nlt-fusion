# Asset Provenance Manifest — NLT World Engine (Godot renderer)

**Thread:** `GRAPH-001` · **Owner:** Joshua W. Dorsey, Sr. · **Authority:** OTOI §4.4
**Rule this file exists to enforce:** `RENDERER-PLAN.md` §0.2 — *"Do not commit `RenderStripped.*` or `SK_SimBody_Base.fbx` blind — untracked, unexamined."* **No asset lands in this repo without a row here.**

**Status: no third-party asset has been imported.** Every row below is either
self-authored (no third-party rights) or blocked pending a G1 decision.

---

## How to add a row

Every imported asset needs **all six** fields. A row with a blank licence field is
not a draft — it is a violation. If you cannot fill it in, do not commit the asset.

| Field | Meaning |
|---|---|
| `Asset` | Path relative to repo root |
| `Source` | Where it came from — URL, or `self-authored` |
| `Licence` | SPDX-ish identifier, or the licence name verbatim |
| `Licence text` | Where the full licence text lives in-repo |
| `Retrieved` | ISO date |
| `Author` | Original author/artist |

---

## Rows

| Asset | Source | Licence | Licence text | Retrieved | Author |
|---|---|---|---|---|---|
| `world-engine-godot/assets/levels/Academic_Level.fbx` | self-authored (UE export) | project-owned | [`LICENSE`](../../LICENSE) | 2026-09-24 | NeuroLift |
| `world-engine-godot/assets/levels/Personal_Level.fbx` | self-authored (UE export) | project-owned | [`LICENSE`](../../LICENSE) | 2026-09-24 | NeuroLift |
| `world-engine-godot/assets/levels/Social_Level.fbx` | self-authored (UE export) | project-owned | [`LICENSE`](../../LICENSE) | 2026-09-24 | NeuroLift |
| `world-engine-godot/assets/levels/Workplace_Level.fbx` | self-authored (UE export) | project-owned | [`LICENSE`](../../LICENSE) | 2026-09-24 | NeuroLift |
| `world-engine-godot/assets/characters/_pipeline_probe/*` | self-authored (Blender, procedural) | project-owned | [`LICENSE`](../../LICENSE) | 2026-10-03 | NeuroLift (agent-generated) |

**Note on the four FBX rows:** these are UE exports of project-owned interiors. They are
recorded here so the manifest is complete, not because their provenance is in doubt.

---

## Not imported — and why

| Candidate | Status | Blocker |
|---|---|---|
| Mixamo characters | **NOT imported** | **G1.1** — Mixamo's terms have historically not permitted redistribution of raw assets. Unresolved. Do not assume CC0. |
| Poly Haven HDRs/textures | **NOT imported** | **G1.5** — budget not authorised. CC0, so viable, but not retrieved. |
| Purchased character pack | **NOT imported** | **G1.5** — requires spend authorisation. |
| `RenderStripped.*`, `SK_SimBody_Base.fbx` | **NOT imported, NOT tracked** | `RENDERER-PLAN.md` §0.2 — unexamined. |

---

## Blender probe — self-authored, carries no third-party rights

`_pipeline_probe/` holds a **deliberately primitive** humanoid built procedurally in
Blender 5.2 to prove the skeletal import path end-to-end. It exists so that the moment
G1.1/G1.5 land, the pipeline is known-good rather than hypothetical.

It is **not** a candidate resident asset and carries **no third-party licence surface** —
every vertex was generated in-session from box primitives. See
[`PIPELINE-PROBE.md`](PIPELINE-PROBE.md) for measurements and the reproduction recipe.

**If a real character set is imported later, delete `_pipeline_probe/` in the same PR**
or it will be mistaken for art.
