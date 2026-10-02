"""
NLT World Engine — Blender Kit Generator
Modular Desk/Workstation Kit with Visual States
States: clean, cluttered, after-hours

Run: blender --background --python build_workplace_kit.py
"""

import bpy
import math
import os

# --- Config ---
OUTPUT_DIR = "D:/nlt-repos/nlt-fusion/WorldEngine/Content/Kits/Workplace"
BLEND_FILE = os.path.join(OUTPUT_DIR, "WorkplaceKit.blend")
FBX_FILE = os.path.join(OUTPUT_DIR, "WorkplaceKit.fbx")

# UE-compatible units: 1 unit = 1 cm in UE, Blender default is 1m
# So we scale by 100 for FBX export to UE
EXPORT_SCALE = 100.0

# --- Clear existing scene ---
bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Create Collections for Visual States ---
def ensure_collection(name):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col

col_base = ensure_collection("KT_Base")          # Static geometry always visible
col_clean = ensure_collection("KT_Clean")        # Clean state props
col_cluttered = ensure_collection("KT_Cluttered")  # Cluttered state props
col_afterhours = ensure_collection("KT_AfterHours")  # After-hours state props

def set_collection_visibility(col, state_key):
    """Tag collection with custom property for UE DataLayer/visibility."""
    col["nlt_state"] = state_key

set_collection_visibility(col_base, "base")
set_collection_visibility(col_clean, "clean")
set_collection_visibility(col_cluttered, "cluttered")
set_collection_visibility(col_afterhours, "afterhours")

# --- Helper: create mesh object and assign to collection ---
def create_object(name, col, location=(0, 0, 0), rotation_z=0):
    obj = bpy.data.objects.new(name, None)
    obj.location = location
    obj.rotation_euler[2] = math.radians(rotation_z)
    col.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    return obj

def add_to_collection(obj, col):
    # Unlink from all current collections
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)

# --- Material Helper ---
def create_material(name, color, metallic=0.0, roughness=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

# --- Materials ---
mat_desk_wood = create_material("M_DeskWood", (0.45, 0.29, 0.14, 1.0), metallic=0.0, roughness=0.6)
mat_desk_metal = create_material("M_DeskMetal", (0.35, 0.35, 0.38, 1.0), metallic=0.9, roughness=0.3)
mat_monitor = create_material("M_Monitor", (0.05, 0.05, 0.06, 1.0), metallic=0.1, roughness=0.4)
mat_screen_on = create_material("M_ScreenOn", (0.2, 0.4, 0.8, 1.0), metallic=0.0, roughness=0.2)
mat_screen_off = create_material("M_ScreenOff", (0.02, 0.02, 0.02, 1.0), metallic=0.0, roughness=0.9)
mat_keyboard = create_material("M_Keyboard", (0.1, 0.1, 0.1, 1.0), metallic=0.2, roughness=0.5)
mat_chair = create_material("M_Chair", (0.15, 0.15, 0.17, 1.0), metallic=0.0, roughness=0.8)
mat_paper = create_material("M_Paper", (0.9, 0.9, 0.85, 1.0), metallic=0.0, roughness=0.9)
mat_mug = create_material("M_Mug", (0.6, 0.2, 0.2, 1.0), metallic=0.0, roughness=0.5)
mat_book = create_material("M_Book", (0.2, 0.3, 0.5, 1.0), metallic=0.0, roughness=0.8)
mat_lamp = create_material("M_Lamp", (0.8, 0.7, 0.4, 1.0), metallic=0.3, roughness=0.4)
mat_cable = create_material("M_Cable", (0.05, 0.05, 0.05, 1.0), metallic=0.0, roughness=0.9)
mat_plant = create_material("M_Plant", (0.15, 0.5, 0.15, 1.0), metallic=0.0, roughness=0.8)
mat_pot = create_material("M_Pot", (0.5, 0.3, 0.2, 1.0), metallic=0.0, roughness=0.6)

# --- Geometry Builders ---

def build_box(name, size, location, parent=None, mat=None):
    """Build a box primitive."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj

def build_cylinder(name, radius, depth, location, parent=None, mat=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj

# ============================================================================
# KIT ASSEMBLY
# ============================================================================

# --- Desk (Base geometry - always visible) ---
desk_assembly = create_object("Desk_Assembly", col_base)

# Desktop surface
desktop = build_box(
    "Desk_Top",
    size=(1.6, 0.04, 0.8),
    location=(0, 0.75, 0),
    parent=desk_assembly,
    mat=mat_desk_wood
)

# Desk legs
leg_positions = [(-0.72, 0.375, -0.32), (0.72, 0.375, -0.32),
                (-0.72, 0.375, 0.32), (0.72, 0.375, 0.32)]
for i, pos in enumerate(leg_positions):
    build_box(
        f"Desk_Leg_{i}",
        size=(0.05, 0.75, 0.05),
        location=pos,
        parent=desk_assembly,
        mat=mat_desk_metal
    )

# Cross bar
build_box(
    "Desk_CrossBar",
    size=(1.4, 0.03, 0.03),
    location=(0, 0.15, 0),
    parent=desk_assembly,
    mat=mat_desk_metal
)

# --- Monitor (Base) ---
monitor_assembly = create_object("Monitor_Assembly", col_base, location=(0, 0.77, -0.25))

monitor_body = build_box(
    "Monitor_Body",
    size=(0.6, 0.36, 0.03),
    location=(0, 0.18, 0),
    parent=monitor_assembly,
    mat=mat_monitor
)

# Stand base
build_box(
    "Monitor_StandBase",
    size=(0.25, 0.01, 0.15),
    location=(0, 0.0, 0.05),
    parent=monitor_assembly,
    mat=mat_desk_metal
)

# Stand neck
build_box(
    "Monitor_StandNeck",
    size=(0.03, 0.12, 0.03),
    location=(0, 0.06, 0.0),
    parent=monitor_assembly,
    mat=mat_desk_metal
)

# Screen surface (separate object for state-dependent material)
screen = build_box(
    "Monitor_Screen",
    size=(0.56, 0.32, 0.005),
    location=(0, 0.18, 0.018),
    parent=monitor_assembly,
    mat=mat_screen_off  # default: off
)

# --- Keyboard (Base) ---
keyboard = build_box(
    "Keyboard",
    size=(0.44, 0.02, 0.14),
    location=(0, 0.77, 0.15),
    parent=None,
    mat=mat_keyboard
)
add_to_collection(keyboard, col_base)

# --- Mouse (Base) ---
build_box(
    "Mouse",
    size=(0.06, 0.02, 0.1),
    location=(0.32, 0.77, 0.15),
    parent=None,
    mat=mat_monitor
)
mouse = bpy.context.active_object
add_to_collection(mouse, col_base)

# --- Chair (Base) ---
chair_assembly = create_object("Chair_Assembly", col_base, location=(0, 0, 0.6), rotation_z=180)

# Seat
build_box(
    "Chair_Seat",
    size=(0.5, 0.05, 0.5),
    location=(0, 0.45, 0),
    parent=chair_assembly,
    mat=mat_chair
)

# Backrest
build_box(
    "Chair_Back",
    size=(0.46, 0.55, 0.04),
    location=(0, 0.72, -0.23),
    parent=chair_assembly,
    mat=mat_chair
)

# Chair post
build_cylinder(
    "Chair_Post",
    radius=0.025,
    depth=0.4,
    location=(0, 0.25, 0),
    parent=chair_assembly,
    mat=mat_desk_metal
)

# Chair base (5-star)
chair_base = build_cylinder(
    "Chair_Base",
    radius=0.3,
    depth=0.02,
    location=(0, 0.05, 0),
    parent=chair_assembly,
    mat=mat_desk_metal
)

# Armrests
for x_offset in [-0.23, 0.23]:
    build_box(
        f"Chair_Armrest_{'L' if x_offset < 0 else 'R'}",
        size=(0.04, 0.25, 0.04),
        location=(x_offset, 0.55, 0.08),
        parent=chair_assembly,
        mat=mat_chair
    )

# ============================================================================
# CLEAN STATE - tidy, minimal props
# ============================================================================

# Pen holder
pen_holder = build_cylinder(
    "Clean_PenHolder",
    radius=0.035,
    depth=0.08,
    location=(-0.55, 0.79, 0.25),
    parent=None,
    mat=mat_desk_metal
)
add_to_collection(pen_holder, col_clean)

# Pen
build_cylinder(
    "Clean_Pen",
    radius=0.008,
    depth=0.14,
    location=(-0.55, 0.82, 0.25),
    parent=None,
    mat=mat_monitor
)
pen = bpy.context.active_object
add_to_collection(pen, col_clean)

# Notebook
build_box(
    "Clean_Notebook",
    size=(0.2, 0.01, 0.28),
    location=(-0.5, 0.77, 0.0),
    parent=None,
    mat=mat_paper
)
notebook = bpy.context.active_object
add_to_collection(notebook, col_clean)

# Small plant
pot = build_cylinder(
    "Clean_PlantPot",
    radius=0.05,
    depth=0.08,
    location=(0.55, 0.79, 0.25),
    parent=None,
    mat=mat_pot
)
add_to_collection(pot, col_clean)

plant = build_cylinder(
    "Clean_PlantLeaves",
    radius=0.04,
    depth=0.1,
    location=(0.55, 0.84, 0.25),
    parent=None,
    mat=mat_plant
)
add_to_collection(plant, col_clean)

# Screen ON for clean state (we'll swap material - using separate object)
# Actually, we have a screen object with mat_screen_off by default.
# For clean state, we want screen ON. We'll create a duplicate or use material swap.
# Better approach: Create separate screen objects per state.
# Remove the original screen from base and put screen-on in clean, screen-off in base.

# Remove default screen from base
bpy.data.objects.remove(screen, do_unlink=True)

# Screen ON (clean state)
screen_on = build_box(
    "Clean_ScreenOn",
    size=(0.56, 0.32, 0.005),
    location=(0, 0.95, -0.232),
    parent=None,
    mat=mat_screen_on
)
add_to_collection(screen_on, col_clean)

# Screen OFF (after-hours)
screen_off = build_box(
    "AfterHours_ScreenOff",
    size=(0.56, 0.32, 0.005),
    location=(0, 0.95, -0.232),
    parent=None,
    mat=mat_screen_off
)
add_to_collection(screen_off, col_afterhours)

# ============================================================================
# CLUTTERED STATE - messy desk items
# ============================================================================

# Stacked papers
paper_y = 0.77
for i in range(5):
    offset_x = (i % 3) * 0.02 - 0.02
    offset_z = (i // 3) * 0.01
    build_box(
        f"Cluttered_Paper_{i}",
        size=(0.21, 0.003, 0.3),
        location=(0.3 + offset_x, paper_y + i * 0.003, -0.1 + offset_z),
        parent=None,
        mat=mat_paper
    )
    p = bpy.context.active_object
    p.rotation_euler[2] = math.radians(5 + i * 3)
    add_to_collection(p, col_cluttered)

# Coffee mug (second)
mug2 = build_cylinder(
    "Cluttered_Mug2",
    radius=0.04,
    depth=0.09,
    location=(0.45, 0.79, 0.15),
    parent=None,
    mat=mat_book
)
add_to_collection(mug2, col_cluttered)

# Books stack
for i in range(3):
    build_box(
        f"Cluttered_Book_{i}",
        size=(0.15, 0.03, 0.22),
        location=(-0.4 - i * 0.02, 0.77 + i * 0.03, 0.2),
        parent=None,
        mat=mat_book
    )
    b = bpy.context.active_object
    b.rotation_euler[2] = math.radians(i * 8)
    add_to_collection(b, col_cluttered)

# Scattered cables
for i in range(4):
    build_cylinder(
        f"Cluttered_Cable_{i}",
        radius=0.005,
        depth=0.3 + i * 0.05,
        location=(-0.2 + i * 0.08, 0.76, -0.15 + i * 0.02),
        parent=None,
        mat=mat_cable
    )
    c = bpy.context.active_object
    c.rotation_euler[0] = math.radians(90)
    c.rotation_euler[2] = math.radians(i * 20)
    add_to_collection(c, col_cluttered)

# Sticky notes
for i in range(3):
    build_box(
        f"Cluttered_StickyNote_{i}",
        size=(0.075, 0.001, 0.075),
        location=(-0.55 + i * 0.08, 0.771, -0.1),
        parent=None,
        mat=mat_mug
    )
    s = bpy.context.active_object
    add_to_collection(s, col_cluttered)

# Phone
build_box(
    "Cluttered_Phone",
    size=(0.07, 0.008, 0.14),
    location=(0.2, 0.775, 0.25),
    parent=None,
    mat=mat_monitor
)
phone = bpy.context.active_object
add_to_collection(phone, col_cluttered)

# Earbuds
build_cylinder(
    "Cluttered_Earbuds",
    radius=0.025,
    depth=0.01,
    location=(-0.3, 0.771, 0.22),
    parent=None,
    mat=mat_monitor
)
earbuds = bpy.context.active_object
add_to_collection(earbuds, col_cluttered)

# ============================================================================
# AFTER-HOURS STATE - lights dimmed, personal items out
# ============================================================================

# Desk lamp
lamp_assembly = create_object("AfterHours_Lamp", col_afterhours, location=(-0.6, 0.77, -0.1))

# Lamp base
lamp_base = build_cylinder(
    "AfterHours_LampBase",
    radius=0.08,
    depth=0.02,
    location=(-0.6, 0.78, -0.1),
    parent=None,
    mat=mat_desk_metal
)
add_to_collection(lamp_base, col_afterhours)

# Lamp arm 1
build_box(
    "AfterHours_LampArm1",
    size=(0.02, 0.25, 0.02),
    location=(-0.6, 0.90, -0.1),
    parent=None,
    mat=mat_desk_metal
)
arm1 = bpy.context.active_object
arm1.rotation_euler[0] = math.radians(-20)
add_to_collection(arm1, col_afterhours)

# Lamp arm 2
build_box(
    "AfterHours_LampArm2",
    size=(0.02, 0.2, 0.02),
    location=(-0.6, 1.02, -0.05),
    parent=None,
    mat=mat_desk_metal
)
arm2 = bpy.context.active_object
arm2.rotation_euler[0] = math.radians(30)
add_to_collection(arm2, col_afterhours)

# Lamp head / shade
build_cylinder(
    "AfterHours_LampShade",
    radius=0.06,
    depth=0.08,
    location=(-0.6, 1.12, 0.02),
    parent=None,
    mat=mat_lamp
)
shade = bpy.context.active_object
shade.rotation_euler[0] = math.radians(45)
add_to_collection(shade, col_afterhours)

# Wine glass
build_cylinder(
    "AfterHours_WineGlass_Stem",
    radius=0.005,
    depth=0.08,
    location=(0.4, 0.81, -0.15),
    parent=None,
    mat=mat_desk_metal
)
stem = bpy.context.active_object
add_to_collection(stem, col_afterhours)

build_cylinder(
    "AfterHours_WineGlass_Bowl",
    radius=0.035,
    depth=0.05,
    location=(0.4, 0.86, -0.15),
    parent=None,
    mat=mat_pot
)
bowl = bpy.context.active_object
add_to_collection(bowl, col_afterhours)

# Open book (face-down)
build_box(
    "AfterHours_OpenBook",
    size=(0.3, 0.025, 0.22),
    location=(-0.35, 0.775, 0.15),
    parent=None,
    mat=mat_paper
)
open_book = bpy.context.active_object
add_to_collection(open_book, col_afterhours)

# Reading glasses
for i, x_off in enumerate([-0.02, 0.02]):
    build_cylinder(
        f"AfterHours_Glasses_Lens_{i}",
        radius=0.022,
        depth=0.003,
        location=(0.25 + x_off, 0.772, 0.0),
        parent=None,
        mat=mat_screen_on
    )
    lens = bpy.context.active_object
    lens.rotation_euler[1] = math.radians(90)
    add_to_collection(lens, col_afterhours)

# Jacket draped over chair
build_box(
    "AfterHours_Jacket",
    size=(0.5, 0.08, 0.55),
    location=(0, 0.85, 0.55),
    parent=None,
    mat=mat_book
)
jacket = bpy.context.active_object
jacket.rotation_euler[0] = math.radians(-10)
add_to_collection(jacket, col_afterhours)

# Empty energy drink can
build_cylinder(
    "AfterHours_EnergyDrink",
    radius=0.033,
    depth=0.12,
    location=(0.5, 0.81, 0.0),
    parent=None,
    mat=mat_desk_metal
)
can = bpy.context.active_object
add_to_collection(can, col_afterhours)

# ============================================================================
# FBX EXPORT PREP
# ============================================================================

# Apply all transforms so FBX exports correctly
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
bpy.ops.object.select_all(action='DESELECT')

# --- Save .blend ---
bpy.ops.wm.save_as_mainfile(filepath=BLEND_FILE)
print(f"BLEND SAVED: {BLEND_FILE}")

# --- Export FBX for UE 5.8 ---
# FBX export with UE-compatible settings
bpy.ops.object.select_all(action='SELECT')

bpy.ops.export_scene.fbx(
    filepath=FBX_FILE,
    use_selection=True,
    global_scale=EXPORT_SCALE,
    apply_unit_scale=True,
    apply_scale_options='FBX_SCALE_ALL',
    axis_forward='-Z',
    axis_up='Y',
    use_mesh_modifiers=True,
    mesh_smooth_type='FACE',
    use_mesh_edges=False,
    use_tspace=True,
    use_custom_props=True,
    add_leaf_bones=False,
    primary_bone_axis='Y',
    secondary_bone_axis='X',
    use_armature_deform_only=False,
    bake_anim=False,
    path_mode='AUTO',
    embed_textures=False,
    batch_mode='OFF'
)

print(f"FBX SAVED: {FBX_FILE}")

# --- Report ---
print("\n=== NLT WORLD ENGINE KIT BUILD COMPLETE ===")
print(f"Kit: Workplace (Desk/Workstation)")
print(f"Visual States: 3 (clean, cluttered, after-hours)")
print(f"Collections:")
for col in [col_base, col_clean, col_cluttered, col_afterhours]:
    count = len(col.objects)
    print(f"  {col.name} [{col.get('nlt_state', 'unknown')}]: {count} objects")
print(f"\nOutput:")
print(f"  .blend: {BLEND_FILE}")
print(f"  .fbx:   {FBX_FILE}")
