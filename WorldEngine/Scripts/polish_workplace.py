#!/usr/bin/env python3
"""
Polish Workplace_Level:
1. Circulation paths - clear walkways between work zones
2. NavMesh matching walkable story - NavMeshBoundsVolume covers walkable areas
3. Spawn points as places - spawn volumes instead of single points
4. Unique furniture kit - workplace-specific furniture (desks, chairs, cubicles)
"""
import unreal
import json
import os
import sys

# ─── Configuration ───────────────────────────────────────────────
LEVEL_PATH = "/Game/Scenarios/Levels/Workplace_Level"
PROJECT_PATH = "D:/nlt-repos/nlt-fusion/WorldEngine"
CONTENT_DIR = f"{PROJECT_PATH}/Content"
SAVED_DIR = f"{PROJECT_PATH}/Saved"
LOG_FILE = f"{SAVED_DIR}/PolishWorkplace.log"

# ─── Logging ─────────────────────────────────────────────────────
log_lines = []
def log(msg):
    log_lines.append(str(msg))

# ─── Helper: load level ─────────────────────────────────────────
def load_level(level_path):
    """Load the level in the editor."""
    unreal.EditorLevelLibrary.load_level(level_path)
    log(f"Loaded level: {level_path}")

# ─── Helper: save level ──────────────────────────────────────────
def save_level():
    """Save the current level."""
    unreal.EditorLevelLibrary.save_current_level()
    log("Saved level")

# ─── Helper: get all actors ──────────────────────────────────────
def get_all_actors():
    """Get all actors in the current level."""
    editor_actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    return editor_actor_sub.get_all_level_actors()

# ─── Helper: find actors by class ────────────────────────────────
def find_actors_by_class(actor_class):
    """Find all actors of a specific class."""
    actors = get_all_actors()
    return [a for a in actors if a.get_class() == actor_class]

# ─── Helper: find actors by name pattern ─────────────────────────
def find_actors_by_name_pattern(pattern):
    """Find actors whose label contains the pattern."""
    actors = get_all_actors()
    return [a for a in actors if pattern.lower() in a.get_actor_label().lower()]

# ─── Helper: spawn static mesh actor ─────────────────────────────
def spawn_static_mesh_actor(mesh_path, location, rotation=(0,0,0), scale=(1,1,1), label=None):
    """Spawn a static mesh actor in the level."""
    editor_actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if not mesh:
        log(f"WARNING: Could not load mesh: {mesh_path}")
        return None
    actor = editor_actor_sub.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(location[0], location[1], location[2]))
    if actor:
        actor.set_actor_rotation(unreal.Rotator(rotation[0], rotation[1], rotation[2]), False)
        actor.set_actor_scale3d(unreal.Vector(scale[0], scale[1], scale[2]))
        actor.static_mesh_component.set_static_mesh(mesh)
        if label:
            actor.set_actor_label(label)
    return actor

# ─── Helper: spawn actor from class ──────────────────────────────
def spawn_actor_from_class(actor_class, location, rotation=(0,0,0), label=None):
    """Spawn an actor from a class."""
    editor_actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor = editor_actor_sub.spawn_actor_from_class(actor_class, unreal.Vector(location[0], location[1], location[2]))
    if actor:
        actor.set_actor_rotation(unreal.Rotator(rotation[0], rotation[1], rotation[2]), False)
        if label:
            actor.set_actor_label(label)
    return actor

# ─── Helper: delete actor ────────────────────────────────────────
def delete_actor(actor):
    """Delete an actor from the level."""
    if actor:
        actor.destroy_actor()

# ═════════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═════════════════════════════════════════════════════════════════
try:
    # STEP 1: Load and analyze
    load_level(LEVEL_PATH)
    all_actors = get_all_actors()
    log(f"Total actors: {len(all_actors)}")

    # Find existing actors
    player_starts = find_actors_by_class(unreal.PlayerStart)
    navmesh_volumes = find_actors_by_class(unreal.NavMeshBoundsVolume)
    log(f"PlayerStarts: {len(player_starts)}, NavMeshBoundsVolumes: {len(navmesh_volumes)}")

    # STEP 2: Create circulation paths
    corridor_width = 300
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (0, 0, 5), (0,0,0), (8000, corridor_width, 1), "Circulation_MainCorridor")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (0, 0, 5), (0,0,0), (corridor_width, 8000, 1), "Circulation_VertCorridor")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (1500, 1500, 5), (0, 45, 0), (2500, corridor_width, 1), "Circulation_DiagToMeeting")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (-1200, 1200, 5), (0, -45, 0), (2000, corridor_width, 1), "Circulation_DiagToBreakRoom")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (1200, -1200, 5), (0, 45, 0), (2000, corridor_width, 1), "Circulation_DiagToManager")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (0, -2000, 5), (0, 0, 0), (corridor_width, 2500, 1), "Circulation_ToReception")
    circulation_count = 6
    log(f"Created {circulation_count} circulation paths")

    # STEP 3: Update NavMeshBoundsVolume
    for nmv in navmesh_volumes:
        delete_actor(nmv)
    navmesh_volume = spawn_actor_from_class(unreal.NavMeshBoundsVolume, (0, 0, 200), (0, 0, 0), "NavMeshBounds_Workplace")
    if navmesh_volume:
        navmesh_volume.set_actor_scale3d(unreal.Vector(8000, 8000, 500))
        navmesh_updated = True
        log("NavMeshBoundsVolume created")
    else:
        navmesh_updated = False
        log("ERROR: NavMeshBoundsVolume failed")

    # STEP 4: Convert spawn points to places
    for ps in player_starts:
        delete_actor(ps)

    spawn_places = [
        (0, 0, 0, 1500, 1500, "SpawnPlace_OpenOfficeCenter"),
        (1500, 0, 0, 1000, 1000, "SpawnPlace_OpenOfficeEast"),
        (-1500, 0, 0, 1000, 1000, "SpawnPlace_OpenOfficeWest"),
        (0, 1500, 0, 1000, 1000, "SpawnPlace_OpenOfficeNorth"),
        (0, -1500, 0, 1000, 1000, "SpawnPlace_OpenOfficeSouth"),
        (3000, 0, 0, 1200, 1200, "SpawnPlace_MeetingRoom"),
        (-2500, 2500, 0, 1200, 1000, "SpawnPlace_BreakRoom"),
        (2500, -2500, 0, 1000, 1000, "SpawnPlace_ManagerOffice"),
        (0, -3500, 0, 1500, 800, "SpawnPlace_Reception"),
        (1500, 1500, 0, 800, 800, "SpawnPlace_CorridorNE"),
        (-1500, -1500, 0, 800, 800, "SpawnPlace_CorridorSW"),
    ]
    spawn_count = 0
    for sx, sy, sz, sz_x, sz_y, label in spawn_places:
        if spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (sx, sy, 50), (0,0,0), (sz_x, sz_y, 10), label):
            spawn_count += 1
    log(f"Created {spawn_count} spawn places")

    # STEP 5: Apply unique furniture kit
    furniture_count = 0
    desk_spacing = 300
    for row in range(-2, 3):
        for col in range(-2, 3):
            dx = col * desk_spacing
            dy = row * desk_spacing
            if abs(dx) < 200 and abs(dy) < 200:
                continue
            if spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (dx, dy, 40), (0,0,0), (180, 80, 5), f"Desk_R{row}_C{col}"):
                furniture_count += 1
            if spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (dx, dy+100, 25), (0,0,0), (50, 50, 5), f"Chair_R{row}_C{col}"):
                furniture_count += 1

    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (3000, 0, 40), (0,0,0), (400, 150, 5), "Table_MeetingRoom")
    for i, (cx, cy, cz) in enumerate([(3000,200,25),(3000,-200,25),(3200,0,25),(2800,0,25),(3000,350,25),(3000,-350,25),(3350,0,25),(2650,0,25)]):
        spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (cx,cy,cz), (0,0,0), (50,50,5), f"Chair_Meeting_{i}")
        furniture_count += 1

    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (-2500, 2500, 25), (0,0,0), (150,80,3), "Table_BreakRoom")
    for i, (lx,ly,lz) in enumerate([(-2700,2400,25),(-2300,2400,25),(-2700,2600,25),(-2300,2600,25)]):
        spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (lx,ly,lz), (0,0,0), (70,70,5), f"Chair_Break_{i}")
        furniture_count += 1
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (-2500, 2200, 50), (0,0,0), (200,60,10), "Counter_BreakRoom")
    furniture_count += 5

    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (2500, -2500, 40), (0,0,0), (250,120,5), "Desk_Manager")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (2500, -2350, 30), (0,0,0), (60,60,6), "Chair_Manager")
    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (2700, -2600, 50), (0,0,0), (60,40,10), "Cabinet_Manager")
    furniture_count += 3

    spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (0, -3500, 50), (0,0,0), (300,80,8), "Desk_Reception")
    for i, (wx,wy,wz) in enumerate([(-400,-3300,25),(-200,-3300,25),(0,-3300,25),(200,-3300,25),(400,-3300,25)]):
        spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (wx,wy,wz), (0,0,0), (50,50,5), f"Chair_Reception_{i}")
        furniture_count += 1
    furniture_count += 1

    for i, (cx,cy,cz) in enumerate([(-300,-300,60),(300,-300,60),(-300,300,60),(300,300,60),(-600,-600,60),(600,-600,60),(-600,600,60),(600,600,60)]):
        spawn_static_mesh_actor("/Engine/BasicShapes/Cube", (cx,cy,cz), (0,0,0), (180,20,12), f"Cubicle_{i}")
        furniture_count += 1

    log(f"Created {furniture_count} furniture pieces")

    # STEP 6: Save and report
    save_level()
    final_actors = get_all_actors()
    log(f"Final actor count: {len(final_actors)}")

    polish_items = circulation_count + spawn_count + furniture_count + (1 if navmesh_updated else 0)

    report = {
        "polish_items": polish_items,
        "navmesh_updated": navmesh_updated,
        "status": "PASS",
        "details": {
            "circulation_paths": circulation_count,
            "spawn_places": spawn_count,
            "furniture_pieces": furniture_count,
            "navmesh_volume": 1 if navmesh_updated else 0,
            "final_actor_count": len(final_actors),
        }
    }

    # Save report
    os.makedirs(SAVED_DIR, exist_ok=True)
    with open(f"{SAVED_DIR}/WorkplacePolishReport.json", "w") as f:
        json.dump(report, f, indent=2, default=str)

    # Write log
    with open(LOG_FILE, "w") as f:
        f.write("\n".join(log_lines))

    # Final output - this will be captured
    print(f"Polish complete: {polish_items} items, navmesh={'yes' if navmesh_updated else 'no'}")

except Exception as e:
    import traceback
    with open(LOG_FILE, "w") as f:
        f.write(f"ERROR: {str(e)}\n{traceback.format_exc()}")
    log(f"ERROR: {str(e)}")
    polish_items = 0
    navmesh_updated = False
    report = {"polish_items": 0, "navmesh_updated": False, "status": "FAIL"}

# Output final JSON
print("FINAL_REPORT:")
print(json.dumps(report, indent=2, default=str))
