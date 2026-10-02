# Blender headless: split Grid System glTF into per-node GLBs, crash-safe
# Usage: blender --background --python split_grid_system.py -- <in.gltf> <out_dir>
import bpy, os, sys, json

argv = sys.argv[sys.argv.index("--") + 1:]
in_gltf = argv[0]
out_dir = argv[1]
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
print("=== Importing glTF:", in_gltf)
bpy.ops.import_scene.gltf(filepath=in_gltf)
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()

roots = sorted(
    [o for o in bpy.data.objects if o.parent is None and o.type == "MESH"],
    key=lambda o: o.name.lower(),
)
print(f"=== {len(roots)} top-level mesh roots ===")

report = []
for obj in roots:
    entry = {"name": obj.name}
    try:
        entry["polygons"] = len(obj.data.polygons)
        entry["verts"] = len(obj.data.vertices)
    except Exception as e:
        entry["error"] = str(e)
    report.append(entry)
    print(f"NODE {obj.name}: {entry}")

with open(os.path.join(out_dir, "_report.json"), "w") as f:
    json.dump(report, f, indent=2)

for obj in roots:
    name = obj.name
    if name == "Grass":
        print(f"SKIP {name}: ground plane, not needed")
        continue
    try:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        kids = obj.children_recursive
        for c in kids:
            c.select_set(True)
        safe = name.replace(" ", "_")
        out_path = os.path.join(out_dir, f"{safe}.glb")
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            use_selection=True,
            export_format="GLB",
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
        )
        print(f"EXPORT {name} -> {safe}.glb ({os.path.getsize(out_path)/1e6:.1f} MB, {len(kids)} children)")
    except Exception as e:
        print(f"ERR {name}: {e}")

print("=== DONE ===")