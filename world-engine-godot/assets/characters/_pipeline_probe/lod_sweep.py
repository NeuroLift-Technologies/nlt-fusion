"""Headless LOD density sweep for G1.2.

Runs one Blender process per decimation level so each export contains exactly one
mesh with no rig, no animation, and no sibling objects. `use_selection=True` is
NOT sufficient -- this build ignores it and re-exports every mesh in the file.

Usage:
    blender -b <lod_source.blend> --python lod_sweep.py -- --out <dir>

The source .blend must contain all seven LOD_* objects. A missing object is a
hard error, not a skip -- silently dropping a level would report a successful
partial sweep.
"""

import json
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.getcwd()
os.makedirs(OUT, exist_ok=True)

RATIOS = [1.0, 0.75, 0.5, 0.35, 0.25, 0.15, 0.08]


def wipe():
    """Strip the default scene down to nothing."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                 bpy.data.actions, bpy.data.images):
        for db in list(coll):
            if db.users == 0 or True:
                try:
                    coll.remove(db)
                except Exception:
                    pass


def emit(me, name, tag, **kw):
    """Export exactly one mesh datablock, geometry only.

    Two traps, both hit while building this:
      * `use_selection=True` is not sufficient -- this build ignores it and
        re-exports every mesh in the file.
      * `bpy.ops.wm.read_factory_settings()` invalidates StructRNA handles, so
        meshes snapshotted before the reset are dead by the time we use them.
        Deleting objects instead keeps the mesh datablocks alive for the
        duration of the session.
    """
    path = os.path.join(OUT, "%s_%s.glb" % (name, tag))
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    bpy.context.view_layer.objects.active = new
    new.select_set(True)
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB",
                                  export_animations=False, **kw)
        return os.path.getsize(path)
    except Exception as exc:
        return "ERR: %s" % exc


# Snapshot every mesh we need BEFORE any factory reset.
targets = []
for r in RATIOS:
    name = "LOD_%03d" % int(r * 100)
    src = bpy.data.objects.get(name)
    if src is None:
        # Blender's -b swallows Python exceptions and still exits 0, so the
        # message alone would not fail a CI step. Print a sentinel the caller
        # can grep, then hard-exit non-zero.
        msg = ("Required LOD object is missing: %s. Pass the source .blend that "
               "contains all %d LOD_* objects: blender -b <lod_source.blend> "
               "--python lod_sweep.py -- --out <dir>"
               % (name, len(RATIOS)))
        print("LODSWEEP_ERROR: %s" % msg)
        sys.stdout.flush()
        sys.exit(2)
    targets.append({
        "ratio": r,
        "name": name,
        "mesh": src.data,
        "verts": len(src.data.vertices),
        "tris": sum(len(p.vertices) - 2 for p in src.data.polygons),
    })

rows = []
for t in targets:
    row = {"ratio": t["ratio"], "name": t["name"],
           "verts": t["verts"], "tris": t["tris"]}
    row["plain"] = emit(t["mesh"], t["name"], "plain")
    row["draco"] = emit(t["mesh"], t["name"], "draco",
                        export_draco_mesh_compression_enable=True)
    row["meshopt"] = emit(t["mesh"], t["name"], "meshopt",
                          export_meshopt_compression_enable=True)
    rows.append(row)

print("LODSWEEP_JSON_START")
print(json.dumps(rows))
print("LODSWEEP_JSON_END")