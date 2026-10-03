# Pipeline Probe — Skeletal Character Import, Measured

**Thread:** `GRAPH-001` · **Date:** 2026-10-03 · **Agent:** Cline
**Answers:** feasibility evidence for **G1.2** (character count + LOD budget) and **G2.3** (retarget + optimise).

> **This is not art.** Self-authored primitive geometry, zero third-party rights.
> It exists to prove the Blender → glTF → Godot path works *before* G1.1 commits budget.
> Nothing here pre-empts a G1 decision.

---

## 1. Verdict

The skeletal pipeline **works end-to-end** and is **not** the risk. A 21-bone humanoid
with heat-map skinning and a looping walk cycle exports as valid glTF 2.0 that Godot's
importer will accept. Measured, not assumed:

| Check | Result |
|---|---|
| glTF container valid (`glTF` magic, v2) | ✅ |
| Skins exported | ✅ 1 skin, 22 joints |
| Inverse bind matrices present | ✅ |
| Animation exported | ✅ `WalkCycle`, 63 channels |
| Loop closes cleanly (f1 ≈ f13) | ✅ |
| Mesh deforms under the rig | ✅ verified via evaluated depsgraph |

**Implication for B.2:** `RENDERER-PLAN.md` B.2 is blocked on *licensing*, not on
*technical feasibility*. Answering G1.1 unblocks it; no engineering spike is needed.

---

## 2. Measurements

Rig: 21 bones, single root (`Hips`), Mixamo-conventional naming.
Body: 12 box segments joined → 96 verts, **144 tris**, heat-map weights.

### Export variants

| Variant | Size | Export time |
|---|---|---|
| Full (skin + animation) | 37,804 B | 0.095 s |
| Mesh + skin, no animation | 18,952 B | 0.017 s |
| Mesh only, no skin | 11,172 B | 0.013 s |

**Animation is ~50% of file size** (18.8 KB of the 37.8 KB). Directly relevant to
**G1.3** — if clips are shared across all residents rather than baked per-character,
that cost is paid once.

### Compression available

Both encoders are present in this Blender install and were exercised:

- **Draco** — working (logged `Draco encoder: Encoding mesh NLTBody.`)
- **Meshopt** — available (`bf_intern_meshopt_bridge.dll`)

Compression is therefore **not** a blocker for the G1.2 size budget.

### LOD budget at 144 tris/resident

`RENDERER-PLAN.md` line 37 specifies 19–20 Avatar+Aide pairs.

| Residents | Total tris | Skeletons animated | Anim channels |
|---|---|---|---|
| 1 | 144 | 1 | 63 |
| 10 | 1,440 | 10 | 630 |
| **20** | **2,880** | **20** | **1,260** |
| 40 | 5,760 | 40 | 2,520 |

**Finding for G1.2:** triangle count is a non-issue — 20 residents at this density is
2,880 tris, against the open world's existing 3,400 grass + 620 tree instances. **The cost
of B.2 is skeleton *count* and skinning, not geometry.** Real art at a realistic
density (typically 5–20k tris/character) would put 20 residents at 100–400k tris, which
changes the picture and is why G1.2 needs an actual density target, not a tri count.

## 3. Density sweep — measured ladder for G1.2

§2 could only say G1.2 "needs an actual density target, not a tri count."
This section supplies one. `lod_sweep.py` decimates a single body at seven
densities and exports each **geometry only** (no rig, no animation), so every
byte is attributable to mesh data. One headless Blender process.

**Reproduce:**

| Script | Role |
|---|---|
| `make_lods.py` | builds the `LOD_*` ladder from the probe `Body` mesh |
| `lod_sweep.py` | measures it, emits JSON between `LODSWEEP_JSON_START/END` |
| `verify_lod_sweep.cmd` | regression check for both the pass and fail paths |

```bat
blender -b <lod_source.blend> --python lod_sweep.py -- --out <dir>
```

The source `.blend` must contain all seven `LOD_*` objects. A missing one is a
**hard failure** (`LODSWEEP_ERROR:` sentinel, exit 2) rather than a silent skip —
Blender's `-b` otherwise swallows the exception and still exits 0, letting a
partial sweep report success.

| Tris | Verts | Plain | Draco | Meshopt |
|---|---|---|---|---|
| 6,000 | 3,002 | 109,244 | 19,736 | 52,072 |
| 4,500 | 2,252 | 82,244 | 15,392 | 40,600 |
| 3,000 | 1,502 | 55,244 | 11,028 | 28,788 |
| 2,100 | 1,052 | 39,044 | 8,360 | 21,036 |
| 1,500 | 752 | 28,236 | 6,508 | 15,692 |
| 900 | 452 | 17,436 | 4,532 | 10,376 |
| 480 | 242 | 9,876 | 3,116 | 6,400 |

**Draco is the right encoder.** It beats Meshopt by **2.1–2.6×** and
uncompressed by **3.2–5.5×** at every level. Ratio degrades at low density
(3,116 B at 480 tris is mostly container overhead) — real, but small in
absolute terms.

### At 20 residents, geometry only

**These are compressed GLB sizes on disk, not GPU memory.** `lod_sweep.py`
measures exported file bytes. Godot imported the files successfully, but this
sweep did **not** measure the imported GPU vertex buffers, so it does not
establish a GPU memory budget for G1.2.

| Tris/resident | One Draco GLB (on disk) |
|---|---|
| 6,000 | 19.7 KB |
| 3,000 | 11.0 KB |
| 1,500 | 6.5 KB |

What can be said: **sharing one mesh avoids duplicating the mesh resource per
resident.** If residents instance the same `Mesh`, the geometry resource is held
once rather than copied 20 times — so §2's linear reading of "20 residents ×
per-character size" overstates duplication. That is a structural argument about
resource sharing, *not* a measurement of what the GPU ends up holding, and the
actual figure depends on vertex format, Godot's import-side compression, and
whether the mesh is uploaded once or per-instance.

§2's figures assumed size scales linearly with population. For shared geometry
that assumption is pessimistic, but **the size on disk and the resident GPU
allocation are different quantities and only the former was measured.** Skeletons,
animation tracks, and per-instance CPU skinning still scale with population and
remain the real cost.

## 5. Godot 4.7.2 import verification

All 21 exported GLBs imported headlessly against the project's actual editor:

```
Godot_v4.7.2-stable_mono_win64_console.exe --headless --path <project> --import --quit
```

**22 `.import` files, zero errors, zero warnings.** Draco and Meshopt variants
both import cleanly, so the encoder choice is safe on the Godot side.

One benign log line, recorded so a future reader does not chase it:

```
ERROR: Blender path is invalid or not set ... Cannot configure blender path in headless mode.
```

That is Godot's optional `.blend` re-import path. It does not affect glTF
import and is not actionable headless.

---

## 3. Reproduction

Blender 5.2.2 LTS, `io_scene_gltf2` enabled. Reproducible in-session via the Blender MCP
bridge; the essential steps, and the two traps hit:

1. **Create the armature in a dedicated scene.** Bone creation needs edit mode, which is
   bound to `context.window.scene` — building in the user's open scene would mutate it.
2. **Skin with `ARMATURE_AUTO`** (heat-map weights) — produced 21 vertex groups cleanly.
3. **Build a 4-key walk cycle over 24 frames @ 24fps**, closing the loop with frame 25 ≡ frame 1,
   plus a `CYCLES` F-modifier per curve.
4. **Export GLB** with `export_skins=True, export_animations=True, export_yup=True`.

### Traps

- **Blender 5.x layered actions.** Creating an `Action` and assigning it is *not* enough —
  `action.fcurves` does not exist and every `keyframe_insert` silently no-ops. You must build
  `slot → layer → strip → channelbag` explicitly, or you get an action with `n_layers == 0`
  and no animation, with **no error raised**.
- **`PoseBone` has `.matrix`, not `.matrix_world`.** The latter raises `AttributeError`.

---

## 6. Blender 5.2 API breaks found while building this

Three, all silent or misleading. Two were already recorded in §3; this adds the
third and a fourth trap that is not an API break but is worse.

| Break | Symptom |
|---|---|
| `bpy.ops.wm.gltf` → `bpy.ops.export_scene.gltf` | `KeyError: 'get_rna_type("WM_OT_gltf")' not found` |
| `export_use_meshopt` → `export_meshopt_compression_enable` | `keyword "export_use_meshopt" unrecognized` |
| **`Action.fcurves` removed** (layered actions) | `AttributeError: 'Action' object has no attribute 'fcurves'`. Walk `action.layers[].strips[].channelbags[].fcurves`. **Raised live during this work**, confirming §3. |

### `use_selection=True` is silently ignored by this build

The most expensive trap, because it fails quietly and produces plausible-looking
numbers. Selecting one object and passing `use_selection=True` still exports
**every mesh in the file**:

```
INFO: Extracting primitive: LOD_008
INFO: Extracting primitive: torso.003      <- not selected
INFO: Extracting primitive: seg_0          <- not selected
```

Early sweeps returned ~497 KB across a 12× triangle range. That was
contamination, not a result. **Isolate by deleting the other objects, not by
selecting them.** `lod_sweep.py` does this.

### `temp_override` destabilises the interactive bridge

`temp_override(...)` over the MCP socket killed the addon's listener twice
(`WinError 10054`, `TimeWait` sockets left behind). Blender itself survived (PID 13332); only the addon server died,
then recovered. For heavy work prefer a separate headless
`blender -b --python` process, which also yields a clean file per export. The
interactive session is unsaved and was lost once to this.

## 7. Honest limitations

- **Single mesh, single body.** Says nothing about a character *set* — multiple
  meshes per character, or per-character unique geometry, change the sharing
  maths entirely.
- **No skinning in these numbers.** Geometry only by design. A skinned mesh adds
  inverse-bind matrices and joint indices that scale with *bone count*, not
  triangle count.
- **Decimation, not authored LODs.** One mesh at seven densities. Real LOD chains
  hand-author silhouette and features; a decimated high-res mesh is the worst
  case for silhouette retention.
- **Still not G3.1.** No frame-time measurement here, and probe geometry would not
  predict real performance regardless.
- **Not a GPU memory budget.** Every byte figure in this document is a compressed
  GLB file size on disk. Godot's successful import proves the files load, not what
  they occupy once resident on the GPU. G1.2's memory half needs a separate capture.
- Two probe errors in this session were **mine, not Blender's** (`vertex_groups`
  lives on `Object`, not `Mesh`). Noted so the transcript is not misread.

---

## 8. Accessibility conflict — narrowed by upstream, still open

**Re-verified after rebasing onto `origin/main` @ `095ee74` (PR #80).** Upstream
has since added a partial fix, so this section is narrower than the previous
revision. The D.4 violation is **not** resolved.

### What upstream added

`WorldView.cs` now carries a reduced-motion toggle:

```csharp
private bool _skyPaused;          // line 43
public bool SkyPaused { ... }     // lines 45-50
```

guarding Sky3D's clock advance (line 128):

```csharp
if (!_skyPaused) { _sky3d.Set("current_time", hours); }
```

That is a genuine improvement, and `SkyBuilder.cs` has been retired in favour of
the now-ratified `addons/sky_3d/` (per §4 B.1).

### What is still unconditional — and worse than before

Two motion sources remain **outside** the guard:

```csharp
// line 146 — water
_waterMat.SetShaderParameter("u_time", (float)_simT);

// lines 153-154 — vegetation wind sway
foreach (var m in VegetationBuilder.WindMats)
    m.SetShaderParameter("u_time", (float)_simT);
```

`_simT += delta` (line 123) advances unconditionally, so both keep animating
with `SkyPaused = true`. `VegetationBuilder.cs` sets `u_sway` per-material at
construction (line 77, range `0.03`–`0.22`) and has no pause path.

A walk cycle under G2.4 adds a **third** unconditional source. So the count went
up, not down: sky is fixed; water and wind are not.

Grepping `*.cs` for `reduced_motion`, `prefers_reduced`, `MotionPrefs`,
`ReducedMotion` returns **nothing** — there is still no user-facing preference,
no persisted setting, and no UI to set it. `SkyPaused` is a public field with no
caller anywhere in the tree.

**Recommendation:** extend the existing toggle rather than invent a parallel one.
A `MotionPrefs` static scaling `u_sway` and animation speed to zero — and gating
both `u_time` writes on `_skyPaused` — is ~10 lines and closes the remaining D.4
gap. Land it **with** G2.4, not after.

---

## 9. What this settles for G1.2

**Answered.** §2 previously could only say G1.2 "needs an actual density target, not
a tri count." Now:

- A density ladder exists with **measured, monotonic, Godot-verified** numbers at
  480–6,000 tris.
- **Draco is decided** — 2.1–2.6× better than Meshopt at every level.
- **§2's linear 20-resident reading was overstated.** Sharing one `Mesh` avoids
  duplicating the geometry resource per resident. Those are **on-disk GLB sizes,
  not measured GPU memory** — the GPU budget remains unmeasured and would need a
  separate capture.
- **The remaining cost is skeleton count and skinning**, confirming §2 at higher
  density. That is a `Skeleton3D`/animation budget question, answerable without art.

**Still Joshua's call, unchanged:** G1.1 character source · G1.3 clip sharing ·
G1.4 hero props · G1.5 budget. Nothing here pre-empts any of them, and **no
third-party asset was retrieved this session.**

**Suggested density target, for the owner to accept or override:** LOD0 at
3,000–6,000 tris with Draco, dropping to ~1,500 beyond walking distance. A
defensible "reads as a person" density without pretending to be art.

## 10. Provenance note for this session

The live Blender session contained 41 orphan mesh datablocks with UE/Mixamo-style
names (`arm_L`, `crotch_L`, `torso`) that looked like an undeclared import.
**Checked and cleared** — they are agent-generated procedural geometry:

- **No UV layers** on any of them (imported art would have them).
- Uniform `610 verts / 640 polys` repeated across body parts — generated
  primitives, not sculpted or scanned.
- No linked libraries, no image textures, no corresponding file on disk.
- Both committed GLBs report `generator: Khronos glTF Blender I/O v5.2.40` with
  **no `copyright` field and no images**.

The UE-style naming is convention a prior agent adopted for rig compatibility.
`ASSET-MANIFEST.md`'s `_pipeline_probe/*` row remains accurate. No licensing
surface was introduced.

