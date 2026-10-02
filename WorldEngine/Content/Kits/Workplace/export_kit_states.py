"""
Export workplace kit states from WorkplaceKit.blend into per-state FBX files
for UE 5.8 import.

Output:
  /WorldEngine/Content/Kits/Workplace/SK_Desk_01/Clean/SK_Desk_01_Clean.fbx
  /WorldEngine/Content/Kits/Workplace/SK_Desk_01/Cluttered/SK_Desk_01_Cluttered.fbx
  /WorldEngine/Content/Kits/Workplace/SK_Desk_01/AfterHours/SK_Desk_01_AfterHours.fbx
"""

import bpy
import os

BLEND_FILE = "D:/nlt-repos/nlt-fusion/WorldEngine/Content/Kits/Workplace/WorkplaceKit.blend"
OUT_BASE = "D:/nlt-repos/nlt-fusion/WorldEngine/Content/Kits/Workplace/SK_Desk_01"

STATES = {
    "Clean": "KT_Clean",
    "Cluttered": "KT_Cluttered",
    "AfterHours": "KT_AfterHours",
}

# Open the blend file
bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)

# UE unit conversion: Blender meters -> UE cm
EXPORT_SCALE = 100.0

for state_name, collection_name in STATES.items():
    out_dir = os.path.join(OUT_BASE, state_name)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f"SK_Desk_01_{state_name}.fbx")

    col = bpy.data.collections.get(collection_name)
    if col is None:
        print(f"Missing collection: {collection_name}")
        continue

    bpy.ops.object.select_all(action='DESELECT')

    for obj in col.objects:
        obj.select_set(True)
        obj.hide_viewport = False
        obj.hide_render = False

    bpy.ops.export_scene.fbx(
        filepath=out_file,
        use_selection=True,
        axis_forward='-Z',
        axis_up='Y',
        apply_scale_options='FBX_SCALE_UNITS',
        apply_unit_scale=True,
        mesh_smooth_type='FACE',
        use_mesh_modifiers=True,
        use_triangles=False,
        add_leaf_bones=False,
        bake_anim=False,
        path_mode='COPY',
        embed_textures=False,
        use_custom_props=False,
        global_scale=EXPORT_SCALE,
    )

    print(f"Exported {state_name}: {out_file} ({len(col.objects)} objects)")

print("Done")
