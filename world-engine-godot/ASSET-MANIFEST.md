# Asset Provenance Manifest

Required by [`ART-PIPELINE.md`](ART-PIPELINE.md) **G2.1**. No asset lands without a row here.
Audited by **G3.2** — "confirm no license-incompatible asset is committed".

**Rule:** an asset with an unresolved `Licence` value does not ship. Do not guess a licence.

---

## Licence: Fab Standard License (Epic Games)

Confirmed by Joshua Dorsey, 2026-10-03: assets were purchased through the Epic Games Marketplace /
Fab under the **Standard License**, originally for use in Unreal Engine.

### What the licence permits

| Permission | Clause |
|---|---|
| **Use in Godot** | "Use the assets with any compatible tools (usage is not limited to Unreal Engine)." — the licence is **engine-agnostic**. Using them in Godot is permitted; the original Unreal use is not a restriction. |
| Modify / adjust | "Modify and adjust the assets in order to incorporate them into your Projects" |
| **Ship a built game** | "Commercially distribute your Projects with the Fab assets incorporated into it"; §4.2.1.c permits distributing a Project that incorporates Content as an included dependency, in object code, where end users cannot extract it |
| Share with collaborators | §5a — sharing is allowed with collaborators "either directly or through a third-party repository" **in a private online repository** |

### What the licence prohibits

| Prohibition | Clause |
|---|---|
| **Committing source assets to a public repo** | §5a — no Distribution of Content "on a standalone basis to third parties" except via a **private** repository. A public GitHub repo is third-party distribution. |
| Reselling / redistributing standalone | "You may not resell or redistribute the asset for free on a standalone basis" |

### The practical rule

> Source assets (`.uasset`, `.glb`, `.fbx`, `.tga`) stay **local and gitignored**, forever.
> Built artifacts (a Godot export with the art baked in) may be **shipped**.

This repo is `github.com/NeuroLift-Technologies/nlt-world-engine`, **visibility: PUBLIC**
(verified via GitHub API 2026-10-03). Therefore no Fab source asset may be tracked in it.

Tier note: Personal-tier eligibility is capped at USD 100,000 gross revenue in the preceding 12
months for the purchasing entity. NeuroLift Technologies' tier should be confirmed against Epic's
account; a Professional tier is required above that threshold. Not verifiable from the repo.

---

## Status: BLOCKED — existing public exposure

**745 files / ~1,321 MB of Epic Fab source content is currently tracked in a public repository**,
introduced by commit `f3cc818` on 2026-09-25 (*"content(fab): add imported city and environment
assets"*) and publicly retrievable since. Sizes are on-disk working-tree measurements.

| Path | Files | Content |
|---|---|---|
| `WorldEngine/Content/Fab/Modern_City_Environment/` | 178 | Fab city pack, UE native `.uasset` |
| `WorldEngine/Content/Fab/Wooden_House_3D_Asset/` | 46 | Fab cottage pack, incl. 33 texture `.uasset` |
| `WorldEngine/Content/City/Grid/CityGridTextured/` | 491 | Fab-derived textures (`seaworn_*`, `roofingtiles*`, `tree_*`, `zzaple*`) |
| `WorldEngine/Imports/FabCity/` | 30 | 16 `.glb`, 2 `.fbx`, 3 `.tga` (40 MB), split scripts |
| **Total tracked** | **745** | **~1,321 MB** |

### Remediation status: forward-only, applied 2026-10-03

`.gitignore` now covers all four paths, verified to block untracked additions. **This stops nothing
retrospectively** — gitignore has no effect on already-tracked files, so all 745 remain tracked and
will continue to be committed in future commits until `git rm -r --cached` is run on them. History
rewrite was considered and declined on 2026-10-03; the past exposure is **recorded, not remediated**.

Note: `WorldEngine/Imports/.gitignore` states *"~1.6 GB total are NOT versioned"*. On-disk Fab
content totals ~1.3 GB, much of it versioned. Its patterns (`FabCity/*/*.glb`) use a single `*`,
which does not cross directory boundaries, so every file under `splits_geo/` matches nothing. The
file's own comment states committing the geometry-only splits is deliberate, so that is a decision
to revisit rather than a broken pattern.

---

## Imported

| Asset | Source | Author | Licence | Licence text | Retrieved | Triangles | Size |
|---|---|---|---|---|---|---|---|
| `assets/props/Parking_Entrance.glb` | Fab — `Modern_City_Environment`, via `WorldEngine/Imports/FabCity/Sidewalk/splits_geo/`. Original Fab listing URL still unrecorded. | **UNKNOWN** | Fab Standard License | <https://www.fab.com/eula> | **UNKNOWN** — not recorded at download | 2,450 | 157 KB |

Still missing for a complete G2.1 row: **author** and **retrieval date**. The licence text location
is now known. These two gaps should be filled from the Fab library ("Recently purchased" in the
Epic launcher) rather than guessed.

Derived, not authored here: the GLB is a re-export produced by `WorldEngine/Imports/FabCity/split_grid_system.py`.
Textures were stripped by `strip-gltf-textures.js` (materials replaced with hashed constant colours),
so **this asset renders untextured**.

---

## Evaluated and rejected — 2026-10-03

`WorldEngine/Imports/FabCity`, 16 GLB / 2,959,902 triangles / 179.2 MB. All valid glTF 2.0, no
extensions, consistent metre scale, correct bounds. Rejected on the criteria below.

### Rejected: scale

World is 460 m across (`WorldConstants.World`); settlement is 38 m radius (`WorldConstants.SettleR`).
These are **city-block ground tiles**, not props. Each is a single merged mesh (1 node / 1 mesh /
1 primitive), so the ground plane and the props share one transform and **cannot be scaled apart**.

| Asset | Bounds X | % of world | Verdict |
|---|---|---|---|
| `Road.glb` | 255.4 m | 56% | 6.7x wider than settlement |
| `Sidewalk.glb` | 259.7 m | 56% | 6.8x wider |
| `Building_Base.glb` | 238.3 m | 52% | 6.3x wider |
| `Fences.glb` | 238.3 m | 52% | 6.3x wider |
| `Trash_Bins_and_Path_Lights.glb` | 238.3 m | 52% | 6.3x wider |

### Rejected: triangle budget

Against the inherited target of 60 FPS / 10–20 animated residents (ART-PIPELINE.md §2), on hardware
where the browser compositor already falls back to `d3d11-warp-webgl` software rendering.

| Asset | Triangles | Note |
|---|---|---|
| `WoodenHouse.glb` | 860,590 | also duplicated as a 21 MB FBX in the same folder |
| `Traffic_Lights.glb` | 671,976 | single merged mesh, not separable |
| `Grass.glb` | 308,225 | `split_grid_system.py` logs `SKIP Grass: ground plane, not needed` — still present at 30 MB |
| `Path_And_Imperfections.glb` | 257,673 | |
| `Building_13.glb` | 232,698 | |
| `Building_11.glb` | 221,898 | |
| `CityGrid.glb` | 155,703 | only file with >1 primitive (6) |
| `Building_12.glb` | 86,631 | |

### Deferred: needs Blender re-split

Not rejected outright — unusable as exported, recoverable with work.

`split_grid_system.py` splits by **top-level root mesh**. Each of these sources has exactly one such
root, so the script emitted one merged output per file. To extract individual props, re-split by
**loose parts** or **material** so ground plane and props become separate meshes, then decimate.
Candidates worth re-splitting: `Trash_Bins_and_Path_Lights`, `Fences`, `Grid_Trees_(Low_Poly)`
(46,874 tris), `Mat_025_grass` — the last of these is the **only FabCity asset that kept its
textures** (4 textures, 7.6 MB) and would be the strongest candidate to restore.

---

## Open decisions

Per ART-PIPELINE.md G1.5 and OTOI §4.4, these are Joshua's calls, not an agent's:

- **G1.1 — resolved in favour of Fab.** Fab Standard License permits Godot use and shipping built
  artifacts. The constraint is *distribution of source*, which is a repo-hygiene problem, not a
  "must replace with CC0" problem. No CC0 substitution is required.
- **Remediation of the existing public exposure.** 745 files / ~1,321 MB since 2026-09-25. Forward-only
  `.gitignore` applied 2026-10-03 (blocks new additions only). Options not yet taken:
  `git rm -r --cached` to untrack going forward, or a full history rewrite plus GitHub support
  request to purge dangling objects. **Not actioned** — destructive, needs authorisation.
  Reassess exposure risk with Epic if the repo's audience matters.
- **Authoritative copy.** The UE project remains the source of truth for Fab content. Godot builds
  consume locally-imported GLB from `WorldEngine/Imports/`, which stays gitignored.
- **G1.4 — hero prop policy.** Still open: import CC0, or keep procedural? ART-PIPELINE.md §4.1
  argues keep. Unaffected by the licence question.
- **G1.5 — spend.** Unchanged. If CC0 art is adopted for *any* reason (performance, tri budget,
  taste), it is zero-cost.
- **Personal vs Professional tier.** Confirm NeuroLift Technologies' revenue against Epic's USD
  100,000 12-month threshold. Not answerable from the repo.
