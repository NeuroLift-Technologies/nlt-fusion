#!/usr/bin/env python3
"""
Time-of-Day Lighting System for Workplace_Level
===============================================
Creates two lighting states:
  - 08:00 (morning fluorescents + monitor glow)
  - 21:00 (evening practicals)

Run via:
  UnrealEditor-Cmd WorldEngine.uproject -nullrhi -run=PythonScriptCommandlet -Script=/path/to/workplace_lighting.py
"""
import unreal
import json
import os

# ─── CONFIGURATION ───────────────────────────────────────────────────────────

WORKPLACE_LEVEL_PATH = "/Game/Scenarios/Levels/Workplace_Level"
SAVE_DIR = "D:/nlt-repos/nlt-fusion/WorldEngine/Saved"

# ─── LIGHTING STATE DEFINITIONS ─────────────────────────────────────────────

LIGHTING_STATES = {
    "08:00": {
        "description": "Morning fluorescents + monitor glow",
        "directional_light": {
            "intensity": 2.5,
            "light_color": (255, 245, 230),
            "rotation": (-45.0, 30.0, 0.0),
            "temperature": 5500,
        },
        "sky_light": {
            "intensity": 1.0,
            "light_color": (200, 220, 255),
        },
        "fluorescent_panels": {
            "intensity": 800.0,
            "light_color": (240, 248, 255),
            "temperature": 6500,
            "attenuation_radius": 150.0,
        },
        "monitor_glow": {
            "intensity": 300.0,
            "light_color": (180, 200, 255),
            "temperature": 7000,
            "attenuation_radius": 80.0,
        },
        "ambient": {
            "intensity": 0.3,
            "color": (200, 210, 230),
        },
    },
    "21:00": {
        "description": "Evening practicals",
        "directional_light": {
            "intensity": 0.1,
            "light_color": (180, 200, 255),
            "rotation": (-80.0, 45.0, 0.0),
            "temperature": 8000,
        },
        "sky_light": {
            "intensity": 0.15,
            "light_color": (100, 120, 180),
        },
        "fluorescent_panels": {
            "intensity": 200.0,
            "light_color": (255, 220, 180),
            "temperature": 4000,
            "attenuation_radius": 120.0,
        },
        "monitor_glow": {
            "intensity": 500.0,
            "light_color": (150, 180, 255),
            "temperature": 7500,
            "attenuation_radius": 100.0,
        },
        "ambient": {
            "intensity": 0.05,
            "color": (80, 90, 120),
        },
    },
}


def log(msg):
    unreal.log(f"[WorkplaceLighting] {msg}")


def load_level(level_path):
    """Load a level into the editor."""
    level_editor_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    result = level_editor_subsystem.load_level(level_path)
    if result:
        log(f"Loaded level: {level_path}")
    else:
        log(f"FAILED to load level: {level_path}")
    return result


def get_world():
    """Get the current world."""
    return unreal.EditorLevelLibrary.get_editor_world()


def find_actors_by_class(world, actor_class):
    """Find all actors of a given class in the world."""
    return unreal.GameplayStatics.get_all_actors_of_class(world, actor_class)


def create_directional_light(world, state_name):
    """Create a directional light for the lighting state."""
    location = unreal.Vector(0, 0, 500)
    rotation = unreal.Rotator(0, 0, 0)
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.DirectionalLight,
        location,
        rotation
    )
    actor.set_actor_label(f"DirectionalLight_{state_name}")
    log(f"Created DirectionalLight: {actor.get_name()}")
    return actor


def create_sky_light(world, state_name):
    """Create a sky light for the lighting state."""
    location = unreal.Vector(0, 0, 400)
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.SkyLight,
        location
    )
    actor.set_actor_label(f"SkyLight_{state_name}")
    log(f"Created SkyLight: {actor.get_name()}")
    return actor


def create_point_light(world, name, location, intensity, color, radius, temperature=None):
    """Create a point light for practical lighting."""
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.PointLight,
        location
    )
    actor.set_actor_label(name)
    
    comp = actor.point_light_component
    comp.set_intensity(intensity)
    comp.set_light_color(unreal.LinearColor(color[0]/255.0, color[1]/255.0, color[2]/255.0, 1.0))
    comp.set_attenuation_radius(radius)
    if temperature:
        comp.set_use_temperature(True)
        comp.set_temperature(temperature)
    
    log(f"Created PointLight: {name}")
    return actor


def create_rect_light(world, name, location, rotation, intensity, color, width=60, height=20):
    """Create a rect light for fluorescent panels."""
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.RectLight,
        location,
        rotation
    )
    actor.set_actor_label(name)
    
    comp = actor.rect_light_component
    comp.set_intensity(intensity)
    comp.set_light_color(unreal.LinearColor(color[0]/255.0, color[1]/255.0, color[2]/255.0, 1.0))
    comp.set_source_width(width)
    comp.set_source_height(height)
    
    log(f"Created RectLight: {name}")
    return actor


def setup_fluorescent_panels(world, state_name, config):
    """Create fluorescent panel lights (rect lights on ceiling)."""
    lights = []
    panel_positions = [
        unreal.Vector(-300, -200, 280),
        unreal.Vector(0, -200, 280),
        unreal.Vector(300, -200, 280),
        unreal.Vector(-300, 200, 280),
        unreal.Vector(0, 200, 280),
        unreal.Vector(300, 200, 280),
    ]
    
    for i, pos in enumerate(panel_positions):
        light = create_rect_light(
            world,
            name=f"Fluorescent_{state_name}_{i}",
            location=pos,
            rotation=unreal.Rotator(0, 0, 0),
            intensity=config["intensity"],
            color=config["light_color"],
            width=80,
            height=30
        )
        lights.append(light)
    
    return lights


def setup_monitor_glow(world, state_name, config):
    """Create monitor screen glow lights (point lights near desks)."""
    lights = []
    monitor_positions = [
        unreal.Vector(-250, -150, 100),
        unreal.Vector(50, -150, 100),
        unreal.Vector(350, -150, 100),
        unreal.Vector(-250, 150, 100),
        unreal.Vector(50, 150, 100),
        unreal.Vector(350, 150, 100),
    ]
    
    for i, pos in enumerate(monitor_positions):
        light = create_point_light(
            world,
            name=f"MonitorGlow_{state_name}_{i}",
            location=pos,
            intensity=config["intensity"],
            color=config["light_color"],
            radius=config["attenuation_radius"],
            temperature=config.get("temperature")
        )
        lights.append(light)
    
    return lights


def setup_directional_light(actor, config):
    """Configure directional light for time of day."""
    comp = actor.directional_light_component
    comp.set_intensity(config["intensity"])
    comp.set_light_color(unreal.LinearColor(
        config["light_color"][0]/255.0,
        config["light_color"][1]/255.0,
        config["light_color"][2]/255.0,
        1.0
    ))
    if "temperature" in config:
        comp.set_use_temperature(True)
        comp.set_temperature(config["temperature"])
    
    rotation = unreal.Rotator(config["rotation"][0], config["rotation"][1], config["rotation"][2])
    actor.set_actor_rotation(rotation, False)
    
    log(f"DirectionalLight configured: intensity={config['intensity']}")


def setup_sky_light(actor, config):
    """Configure sky light."""
    comp = actor.sky_light_component
    comp.set_intensity(config["intensity"])
    comp.set_light_color(unreal.LinearColor(
        config["light_color"][0]/255.0,
        config["light_color"][1]/255.0,
        config["light_color"][2]/255.0,
        1.0
    ))
    log(f"SkyLight configured: intensity={config['intensity']}")


def create_lighting_state(world, state_name, config):
    """Create a lighting state by placing and configuring all lights."""
    log(f"\nCreating lighting state: {state_name} - {config['description']}")
    
    # Create directional (sun/moon) light
    dir_light = create_directional_light(world, state_name)
    setup_directional_light(dir_light, config["directional_light"])
    
    # Create sky light
    sky_light = create_sky_light(world, state_name)
    setup_sky_light(sky_light, config["sky_light"])
    
    # Create fluorescent panels
    fluo_lights = setup_fluorescent_panels(world, state_name, config["fluorescent_panels"])
    
    # Create monitor glow
    monitor_lights = setup_monitor_glow(world, state_name, config["monitor_glow"])
    
    total_lights = 2 + len(fluo_lights) + len(monitor_lights)
    log(f"State '{state_name}' created with {total_lights} lights")
    
    return {
        "directional": dir_light,
        "sky": sky_light,
        "fluorescents": fluo_lights,
        "monitors": monitor_lights,
        "total": total_lights,
    }


def save_level(world):
    """Save the current level."""
    try:
        level_editor_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        result = level_editor_subsystem.save_current_level()
        if result:
            log("Level saved successfully")
        else:
            log("WARNING: Could not save level")
        return result
    except Exception as e:
        log(f"WARNING: Could not save level: {str(e)}")
        return False


def save_lighting_states_to_json():
    """Save lighting state definitions to JSON for runtime use."""
    output_path = os.path.join(SAVE_DIR, "WorkplaceLightingStates.json")
    os.makedirs(SAVE_DIR, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(LIGHTING_STATES, f, indent=2)
    
    log(f"Lighting states saved to: {output_path}")
    return output_path


def main():
    log("=" * 60)
    log("Workplace_Level Time-of-Day Lighting Setup")
    log("=" * 60)
    
    # Load the workplace level
    if not load_level(WORKPLACE_LEVEL_PATH):
        return {"status": "error", "message": "Could not load Workplace_Level"}
    
    world = get_world()
    if not world:
        return {"status": "error", "message": "Could not get world"}
    
    log(f"World: {world.get_name()}")
    
    # Create lighting states
    created_states = {}
    
    for state_name, config in LIGHTING_STATES.items():
        try:
            lights = create_lighting_state(world, state_name, config)
            created_states[state_name] = {
                "status": "created",
                "light_count": lights["total"],
                "description": config["description"],
            }
        except Exception as e:
            log(f"ERROR creating state {state_name}: {str(e)}")
            created_states[state_name] = {"status": "error", "message": str(e)}
    
    # Save level
    save_level(world)
    
    # Save JSON definition
    json_path = save_lighting_states_to_json()
    
    # Output results
    results = {
        "lighting_states": len(LIGHTING_STATES),
        "state_names": list(LIGHTING_STATES.keys()),
        "status": "completed",
        "details": created_states,
        "json_path": json_path,
    }
    
    log("=" * 60)
    log("LIGHTING SETUP COMPLETE")
    log(f"States created: {results['lighting_states']}")
    log(f"State names: {results['state_names']}")
    log("=" * 60)
    
    return results


# Execute
if __name__ == "__main__":
    result = main()
    print(f"\n=== RESULT ===")
    print(json.dumps(result, indent=2))
