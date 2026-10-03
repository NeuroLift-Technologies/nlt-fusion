"""Generate the LOD_* ladder used by lod_sweep.py.

Builds seven decimation levels of the probe body and saves them to a .blend
that lod_sweep.py then consumes. Kept separate because the two scripts answer
different questions: this one *creates* the ladder, lod_sweep.py *measures* it.

Usage:  blender -b --python make_lods.py -- --out <dir>
"""

import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.getcwd()
os.makedirs(OUT, exist_ok=True)

RATIOS = [1.0, 0.75, 0.5, 0.35, 0.25, 0.15, 0.08]

body = bpy.data.objects.get("Body")
if body is None:
    raise RuntimeError(
        "Source object 'Body' not found. Open the probe .blend (containing the "
        "21-bone Body mesh) or pass it explicitly.")

built = []
for r in RATIOS:
    name = "LOD_%03d" % int(r * 100)
    stale = bpy.data.objects.get(name)
    if stale:
        bpy.data.objects.remove(stale, do_unlink=True)

    me = body.data.copy()
    me.name = name
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

    if r < 1.0:
        mod = ob.modifiers.new("Dec", "DECIMATE")
        mod.ratio = r
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)

    built.append((name, sum(len(p.vertices) - 2 for p in me.polygons)))

blend = os.path.join(OUT, "lods.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend)

print("MAKELODS_OK")
for n, t in built:
    print("  %s  tris=%d" % (n, t))
print("BLEND=%s" % blend)