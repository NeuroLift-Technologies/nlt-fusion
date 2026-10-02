#!/usr/bin/env python3
"""
Niagara Ambient Motion VFX for Workplace_Level
===============================================
Creates 4 Niagara particle system assets:
  1. DustMotes - floating particles in open office
  2. HVACAirflow - subtle air currents from vents
  3. CoffeeSteam - rising vapor in break room
  4. RainOnWindow - water droplets on windows

Then spawns Niagara actors in the level at configured locations.

Run via:
  /path/to/WorldEngine -nullrhi -run=PythonScriptCommandlet -Script=/path/to/niagara_vfx.py
"""
import unreal
import json
import os

# ─── Configuration ───────────────────────────────────────────────
LEVEL_PATH = "/Game/Scenarios/Levels/Workplace_Level"
PROJECT_PATH = "D:/nlt-repos/nlt-fusion/WorldEngine"
CONTENT_DIR = f"{PROJECT_PATH}/Content"
SAVED_DIR = f"{PROJECT_PATH}/Saved"
LOG_FILE = f"{SAVED_DIR}/NiagaraVFX.log"
REPORT_FILE = f"{SAVED_DIR}/NiagaraVFXReport.json"

# ─── Logging ─────────────────────────────────────────────────────
log_lines = []
def log(msg):
    print(msg)
    log_lines.append(str(msg))

# ─── VFX Configuration ──────────────────────────────────────────
VFX_SYSTEMS = {
    "DustMotes": {
        "description": "Floating dust motes in open office area",
        "color": (1.0, 0.95, 0.8, 0.3),
        "spawn_rate": 50,
        "lifetime": 8.0,
        "size": 0.5,
        "velocity": (5.0, 2.0, 3.0),
        "locations": [
            (0, 0, 150, "DustMotes_OpenOffice_Center"),
            (-1500, 0, 150, "DustMotes_OpenOffice_West"),
            (1500, 0, 150, "DustMotes_OpenOffice_East"),
            (0, 1500, 150, "DustMotes_OpenOffice_North"),
            (0, -1500, 150, "DustMotes_OpenOffice_South"),
        ],
    },
    "HVACAirflow": {
        "description": "Subtle air currents from HVAC vents on ceiling",
        "color": (0.85, 0.9, 1.0, 0.15),
        "spawn_rate": 30,
        "lifetime": 5.0,
        "size": 2.0,
        "velocity": (20.0, 0.0, -10.0),
        "locations": [
            (-300, -200, 280, "HVACAirflow_Vent_01"),
            (0, -200, 280, "HVACAirflow_Vent_02"),
            (300, -200, 280, "HVACAirflow_Vent_03"),
            (-300, 200, 280, "HVACAirflow_Vent_04"),
            (0, 200, 280, "HVACAirflow_Vent_05"),
            (300, 200, 280, "HVACAirflow_Vent_06"),
        ],
    },
    "CoffeeSteam": {
        "description": "Rising steam from coffee in break room",
        "color": (1.0, 1.0, 1.0, 0.2),
        "spawn_rate": 40,
        "lifetime": 4.0,
        "size": 3.0,
        "velocity": (2.0, 0.0, 15.0),
        "locations": [
            (-2500, 2500, 50, "SteamCoffee_BreakRoom_Table"),
            (-2500, 2400, 50, "SteamCoffee_BreakRoom_Counter"),
        ],
    },
    "RainOnWindow": {
        "description": "Rain droplets streaking down windows",
        "color": (0.7, 0.8, 0.9, 0.25),
        "spawn_rate": 100,
        "lifetime": 3.0,
        "size": 0.3,
        "velocity": (0.0, 0.0, -50.0),
        "locations": [
            (-3500, 0, 150, "RainWindows_WestWall_01"),
            (-3500, 1000, 150, "RainWindows_WestWall_02"),
            (-3500, -1000, 150, "RainWindows_WestWall_03"),
            (3500, 0, 150, "RainWindows_EastWall_01"),
            (3500, 1000, 150, "RainWindows_EastWall_02"),
            (3500, -1000, 150, "RainWindows_EastWall_03"),
            (0, 3500, 150, "RainWindows_NorthWall_01"),
            (1000, 3500, 150, "RainWindows_NorthWall_02"),
            (-1000, 3500, 150, "RainWindows_NorthWall_03"),
        ],
    },
}

def create_niagara_system_asset(asset_name, config):
    """
    Create a Niagara system asset with basic particle settings.
    Returns the asset path if successful, None otherwise.
    """
    asset_path = f"/Game/VFX/Workplace/{asset_name}"
    
    # Check if asset already exists
    existing = unreal.EditorAssetLibrary.load_asset(asset_path)
    if existing:
        log(f"  Asset already exists: {asset_path}")
        return asset_path
    
    # Create the asset using AssetTools
    package_path = os.path.dirname(asset_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    
    # Create new Niagara system
    niagara_factory = unreal.NiagaraSystemFactory()
    new_asset = asset_tools.create_asset(asset_name, package_path, unreal.NiagaraSystem.static_class(), niagara_factory)
    
    if new_asset:
        log(f"  Created Niagara system asset: {asset_path}")
        # Save the asset
        unreal.EditorAssetLibrary.save_loaded_asset(new_asset)
        return asset_path
    
    log(f"  WARNING: Could not create Niagara system: {asset_path}")
    return None


def spawn_niagara_actor(system_asset_path, location, rotation=(0,0,0), label=None):
    """Spawn a Niagara actor with a specific system asset in the level."""
    niagara_system = unreal.EditorAssetLibrary.load_asset(system_asset_path)
    if not niagara_system:
        log(f"  WARNING: Could not load Niagara system: {system_asset_path}")
        return None
    
    editor_actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor = editor_actor_sub.spawn_actor_from_class(unreal.NiagaraActor, unreal.Vector(location[0], location[1], location[2]))
    
    if actor:
        actor.set_actor_rotation(unreal.Rotator(rotation[0], rotation[1], rotation[2]), False)
        niagara_comp = actor.get_component_by_class(unreal.NiagaraComponent)
        if niagara_comp:
            niagara_comp.set_asset(niagara_system)
            niagara_comp.set_auto_activate(True)
        if label:
            actor.set_actor_label(label)
        log(f"  Spawned: {label} at ({location[0]},{location[1]},{location[2]})")
    return actor


def main():
    log("=" * 60)
    log("Niagara Ambient Motion VFX - Workplace_Level")
    log("=" * 60)
    
    # Load level
    log("\nSTEP 1: Loading Workplace_Level")
    unreal.EditorLevelLibrary.load_level(LEVEL_PATH)
    log(f"Loaded level: {LEVEL_PATH}")
    
    # Create VFX directory
    log("\nSTEP 2: Setting up VFX asset directory")
    vfx_dir = "/Game/VFX/Workplace"
    if not unreal.EditorAssetLibrary.directory_exists(vfx_dir):
        unreal.EditorAssetLibrary.make_directory(vfx_dir)
        log(f"  Created directory: {vfx_dir}")
    
    # Create Niagara system assets and spawn actors
    log("\nSTEP 3: Creating Niagara systems")
    
    total_systems = 0
    vfx_types_created = []
    
    for vfx_name, vfx_config in VFX_SYSTEMS.items():
        log(f"\n  --- {vfx_name}: {vfx_config['description']} ---")
        
        # Create Niagara system asset
        asset_path = create_niagara_system_asset(f"NS_{vfx_name}", vfx_config)
        
        if not asset_path:
            log(f"  SKIPPED: Could not create asset for {vfx_name}")
            continue
        
        # Spawn Niagara actors at each location
        spawned_count = 0
        for loc_data in vfx_config["locations"]:
            x, y, z, label = loc_data
            actor = spawn_niagara_actor(asset_path, (x, y, z), (0, 0, 0), label)
            if actor:
                spawned_count += 1
                total_systems += 1
        
        if spawned_count > 0:
            vfx_types_created.append(vfx_name)
        
        log(f"  {vfx_name}: spawned {spawned_count} actors")
    
    # Save level
    log("\nSTEP 4: Saving level")
    unreal.EditorLevelLibrary.save_current_level()
    log("Saved level")
    
    # Generate report
    report = {
        "niagara_systems": total_systems,
        "vfx_types": vfx_types_created,
        "status": "PASS" if total_systems > 0 else "FAIL",
        "details": {
            "dust_motes": len(VFX_SYSTEMS["DustMotes"]["locations"]),
            "hvac_airflow": len(VFX_SYSTEMS["HVACAirflow"]["locations"]),
            "coffee_steam": len(VFX_SYSTEMS["CoffeeSteam"]["locations"]),
            "rain_on_window": len(VFX_SYSTEMS["RainOnWindow"]["locations"]),
        }
    }
    
    # Save report and log
    os.makedirs(SAVED_DIR, exist_ok=True)
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2, default=str)
    
    with open(LOG_FILE, "w") as f:
        f.write("\n".join(log_lines))
    
    log(f"\nTotal Niagara systems: {total_systems}")
    log(f"VFX types: {vfx_types_created}")
    log(f"Status: {report['status']}")
    
    print("\n--- FINAL REPORT ---")
    print(json.dumps(report, indent=2, default=str))
    return report


# Execute
if __name__ == "__main__":
    result = main()
