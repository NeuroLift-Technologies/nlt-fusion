# Canonical Godot Toolchain Version

Target toolchain for `MIGRATE-001`:

- **Engine:** Godot **4.7.2 Mono** (.NET-enabled build)
- **Language:** C#
- **.NET SDK:** **8** (target framework `net8.0`)

This file is the canonical version reference for the Godot specialists. Migration
scope and conformance gates are defined in the
[migration plan](../../../world-engine-godot/MIGRATION-PLAN.md).
# Godot — Engine Reference

Pinned engine version for the NLT World Engine migration. Every Godot-specialist agent in
`.claude/agents/` (`godot-*.md`) performs a mandatory version check against this file at
session start. **If this file is missing or the version does not match the installed editor,
those agents abort.** It was absent until 2026-10-02, which is why all five specialists were
failing their check.

---

## Pinned version

**Godot 4.7.2, .NET (mono) build.**

| Component | Value |
|---|---|
| Engine version | 4.7.2 |
| Variant | **.NET / mono** — required for the C# authoritative simulation |
| .NET SDK | 8.0 (`net8.0` target framework) |
| C# SDK | `Godot.NET.Sdk/4.7.2` |
| Project file | `world-engine-godot/project.godot` |
| Project name | `world-engine-godot` |
| Config name | `Godot_v4.7-stable_mono` |

The whole stack shares one target framework: `NltWorldEngine.Core`, `NltWorldEngine.Core.Tests`,
the Godot app, and `asfdk-csharp` are all `net8.0`. A `net8.0` project cannot reference a
`net10.0` project, which is why `asfdk-csharp` was retargeted downward rather than the Godot
project upward.

---

## Why mono and not standard

Godot 4 does **not** support C# web export. The authoritative simulation is C#, so the
spectator view must be the native desktop app rather than a browser client. See §9 of the
migration plan.

---

## Asset import

| Format | Support |
|---|---|
| **glTF 2.0** (`.gltf` / `.glb`) | Native, recommended interchange |
| **FBX** (`.fbx`) | Native since 4.3 via built-in **ufbx** — no plugin, no external binary, no FBX SDK |
| `.blend` | Supported 4.0+ by calling Blender's glTF export transparently (requires Blender installed) |
| DAE, OBJ | Supported |

Godot 4.0–4.2 required the external **FBX2glTF** CLI for FBX. That path is unmaintained and no
longer needed on 4.3+. A file imported by a project created in 4.2 or earlier keeps using
FBX2glTF until its importer is changed in that file's import settings.

FBX import can be disabled under **Filesystem → Import → FBX → Enabled** in advanced project
settings.

**Known FBX pitfall:** imported skeletons frequently arrive rotated 90° with a 100× scale.
Validate bone naming, skin-weight count, and axis orientation on first import before building
anything on top.

### 3D assets in this project

| Path | Contents |
|---|---|
| `world-engine-godot/assets/levels/` | `Workplace_Level.fbx`, `Personal_Level.fbx`, `Social_Level.fbx`, `Academic_Level.fbx` — UE level geometry exports |
| `world-engine-godot/addons/godot_ai/` | Third-party Godot↔MCP bridge (`hi-godot/godot-ai`, MIT) — external integration, see escalation |

`OpenWorld_Level` has no FBX export and is intentionally absent: its terrain, city, vegetation
and 12-building layout are generated at runtime by the UE subsystem, and on the Godot side are
rebuilt procedurally from the core seed (migration plan §4.3).

Other FBX sources already in the repository, usable directly via ufbx:

| Path | Size | Use |
|---|---|---|
| `WorldEngine/Content/Kits/SimBody/Source/SM_SimBody_Base.fbx` | 30 KB | Low-poly static body, **not a rig** — migration plan 5c.1 needs an articulated rig |
| `WorldEngine/Content/Kits/Workplace/WorkplaceKit.fbx` | 247 KB | Interior props (plan 5.2) |
| `WorldEngine/Content/Kits/Workplace/SK_Desk_01/{Clean,Cluttered,AfterHours}.fbx` | 42–82 KB | Scenario dressing variants (plan 5.2) |

---

## Toolchain prerequisites

1. **Godot 4.7.2 .NET (mono)** — the standard build cannot load `Godot.NET.Sdk`.
2. **.NET 8 SDK** — required to build the C# project and to run the Tier 1 xUnit gate.
3. **Git LFS** — only one `.uasset` is currently LFS-tracked (`.gitattributes`). FBX/GLB assets
   are stored as ordinary blobs; revisit when the Fab Modern City GLBs land (plan §8).

Nothing in the repository currently builds Godot. Phase 7.2 adds
`.github/workflows/world-engine-godot-build.yml`.

---

## Repo hygiene

`.godot/` (build cache, editor state, shader cache, `mono/temp` MSBuild output) is ignored and
untracked as of 2026-10-02. A `.gitignore` entry alone was insufficient — 119 cache files had
already been committed before the rule existed, and gitignore does not apply retroactively to
tracked files.

---

## Related

- Migration plan: `world-engine-godot/MIGRATION-PLAN.md`
- Escalation: `docs/escalations/2026-10-02-godot-migration.md`
- Thread: `MIGRATE-001` in `docs/active-threads.md`
