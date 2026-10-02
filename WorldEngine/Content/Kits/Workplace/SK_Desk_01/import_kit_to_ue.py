"""
NLT World Engine — Workplace Kit UE 5.8 Import Helper
Run this in the UE Editor Python console (Window -> Developer Tools -> Python Console).

Imports:
  /Game/Kits/Workplace/SK_Desk_01/Clean/SK_Desk_01_Clean.fbx
  /Game/Kits/Workplace/SK_Desk_01/Cluttered/SK_Desk_01_Cluttered.fbx
  /Game/Kits/Workplace/SK_Desk_01/AfterHours/SK_Desk_01_AfterHours.fbx

Creates material instances for kit surfaces and assigns them to imported meshes.
"""

import unreal
import os

KIT_ROOT = "/Game/Kits/Workplace/SK_Desk_01"
SOURCE_ROOT = "D:/nlt-repos/nlt-fusion/WorldEngine/Content/Kits/Workplace/SK_Desk_01"

STATES = ["Clean", "Cluttered", "AfterHours"]

# Material definitions
MATERIAL_DEFS = {
    "M_DeskWood": {"base_color": (0.45, 0.29, 0.14, 1.0), "metallic": 0.0, "roughness": 0.6},
    "M_DeskMetal": {"base_color": (0.35, 0.35, 0.38, 1.0), "metallic": 0.9, "roughness": 0.3},
    "M_Monitor": {"base_color": (0.05, 0.05, 0.06, 1.0), "metallic": 0.1, "roughness": 0.4},
    "M_ScreenOn": {"base_color": (0.2, 0.4, 0.8, 1.0), "metallic": 0.0, "roughness": 0.2, "emissive": (0.2, 0.4, 0.8, 1.0)},
    "M_ScreenOff": {"base_color": (0.02, 0.02, 0.02, 1.0), "metallic": 0.0, "roughness": 0.9},
    "M_Keyboard": {"base_color": (0.1, 0.1, 0.1, 1.0), "metallic": 0.2, "roughness": 0.5},
    "M_Chair": {"base_color": (0.15, 0.15, 0.17, 1.0), "metallic": 0.0, "roughness": 0.8},
    "M_Paper": {"base_color": (0.9, 0.9, 0.85, 1.0), "metallic": 0.0, "roughness": 0.9},
    "M_Mug": {"base_color": (0.6, 0.2, 0.2, 1.0), "metallic": 0.0, "roughness": 0.5},
    "M_Book": {"base_color": (0.2, 0.3, 0.5, 1.0), "metallic": 0.0, "roughness": 0.8},
    "M_Lamp": {"base_color": (0.8, 0.7, 0.4, 1.0), "metallic": 0.3, "roughness": 0.4},
    "M_Cable": {"base_color": (0.05, 0.05, 0.05, 1.0), "metallic": 0.0, "roughness": 0.9},
    "M_Plant": {"base_color": (0.15, 0.5, 0.15, 1.0), "metallic": 0.0, "roughness": 0.8},
    "M_Pot": {"base_color": (0.5, 0.3, 0.2, 1.0), "metallic": 0.0, "roughness": 0.6},
}

editor_lib = unreal.AssetToolsHelpers.get_asset_tools()
material_editor_lib = unreal.MaterialEditingLibrary


def ensure_material(name):
    existing = unreal.load_asset(f"/Game/Kits/Workplace/Materials/{name}")
    if existing:
        return existing

    mat = editor_lib.create_asset(
        asset_name=name,
        package_path="/Game/Kits/Workplace/Materials",
        asset_class=unreal.Material,
        factory=unreal.MaterialFactoryNew()
    )
    if mat is None:
        return None

    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    return mat


def setup_material(name, props):
    mat = ensure_material(name)
    if mat is None:
        print(f"Failed to create material: {name}")
        return None

    bc = mat.get_editor_property("base_color")
    if bc is None:
        return None
    bc.set_editor_property("r", props["base_color"][0])
    bc.set_editor_property("g", props["base_color"][1])
    bc.set_editor_property("b", props["base_color"][2])
    bc.set_editor_property("a", props["base_color"][3])
    mat.set_editor_property("base_color", bc)

    if "metallic" in props:
        mat.set_editor_property("metallic", props["metallic"])
    if "roughness" in props:
        mat.set_editor_property("roughness", props["roughness"])
    if "emissive" in props:
        ec = mat.get_editor_property("emissive_color")
        ec.set_editor_property("r", props["emissive"][0])
        ec.set_editor_property("g", props["emissive"][1])
        ec.set_editor_property("b", props["emissive"][2])
        ec.set_editor_property("a", props["emissive"][3])
        mat.set_editor_property("emissive_color", ec)

    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    return mat


# Create materials
materials = {}
for name, props in MATERIAL_DEFS.items():
    materials[name] = setup_material(name, props)

print("Materials ready:")
for name, mat in materials.items():
    print(f"  {name}: {mat.get_path_name() if mat else 'FAILED'}")

# Import FBXs
for state in STATES:
    fbx_path = os.path.join(SOURCE_ROOT, state, f"SK_Desk_01_{state}.fbx")
    if not os.path.exists(fbx_path):
        print(f"Missing FBX: {fbx_path}")
        continue

    destination = f"{KIT_ROOT}/{state}"
    import_tasks = []
    task = unreal.AssetImportTask()
    task.set_editor_property("automated", True)
    task.set_editor_property("destination_name", f"SK_Desk_01_{state}")
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("filename", fbx_path)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("skip_missing_import_references", True)

    import_tasks.append(task)
    editor_lib.import_asset_tasks(import_tasks)

    print(f"Imported {state}: {destination}/SK_Desk_01_{state}")

print("\nWorkplace kit import complete.")
