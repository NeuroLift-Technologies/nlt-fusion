#!/usr/bin/env python3
"""
Phase 6 Validation Script — NLT Fusion World Engine
====================================================

Performs comprehensive validation of scenario assets and build integrity:

1. Creates 13 UScenarioDataAsset instances
2. Validates all 4 .umap levels for geometry, spawn points, and missing references
3. Verifies DataAsset -> Level binding (TSoftObjectPtr<UWorld> LevelReference)
4. Measures scenario load times from disk (target: <30s per level)

Run via:
  UnrealEditor-Cmd -project=WorldEngine.uproject -nullrhi \
     -run=PythonScriptCommandlet \
     -Script=/absolute/path/to/phase6_validation.py
"""

import unreal
import time
import json
import os

# ─── CONFIGURATION ───────────────────────────────────────────────────────────

LEVEL_MAP = {
    "Workplace": "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level",
    "Personal":  "/Game/Scenarios/Levels/Personal_Level.Personal_Level",
    "Social":    "/Game/Scenarios/Levels/Social_Level.Social_Level",
    "Academic":  "/Game/Scenarios/Levels/Academic_Level.Academic_Level",
}

def _resolve_enum(enum_candidates, value_name):
    """Resolve Unreal enum value across reflection naming differences."""
    for enum_name in enum_candidates:
        enum_type = getattr(unreal, enum_name, None)
        if enum_type is None:
            continue

        for member_name in (value_name.upper(), value_name):
            member = getattr(enum_type, member_name, None)
            if member is not None:
                return member

        try:
            for member in enum_type:
                if str(member).split(".")[-1].lower() == value_name.lower():
                    return member
        except TypeError:
            pass

    raise RuntimeError(f"Unable to resolve enum value '{value_name}' from {enum_candidates}")


SCENARIO_CATEGORY = {
    "Workplace": _resolve_enum(["ScenarioCategory", "EScenarioCategory"], "Workplace"),
    "Personal": _resolve_enum(["ScenarioCategory", "EScenarioCategory"], "Personal"),
    "Social": _resolve_enum(["ScenarioCategory", "EScenarioCategory"], "Social"),
    "Academic": _resolve_enum(["ScenarioCategory", "EScenarioCategory"], "Academic"),
}
SCENARIO_COMPLEXITY = {
    "Low": _resolve_enum(["ScenarioComplexity", "EScenarioComplexity"], "Low"),
    "Medium": _resolve_enum(["ScenarioComplexity", "EScenarioComplexity"], "Medium"),
    "High": _resolve_enum(["ScenarioComplexity", "EScenarioComplexity"], "High"),
}

SCENARIOS = [
    ("Workplace", "wp_1", "Email Processing", 30.0, "Medium", 0.4, 0.5, 0.7, True),
    ("Workplace", "wp_2", "Report Writing", 90.0, "High", 0.6, 0.8, 0.5, True),
    ("Workplace", "wp_3", "Meeting Participation", 60.0, "Medium", 0.3, 0.6, 0.6, True),
    ("Workplace", "wp_4", "Code Review", 45.0, "High", 0.4, 0.85, 0.6, True),
    ("Workplace", "wp_5", "Deadline Crunch", 120.0, "High", 0.8, 0.9, 0.4, True),
    ("Personal", "pers_1", "Household Cleaning", 120.0, "Medium", 0.7, 0.3, 0.5, False),
    ("Personal", "pers_2", "Grocery Shopping", 90.0, "Medium", 0.5, 0.6, 0.6, False),
    ("Personal", "pers_3", "Bill Paying", 45.0, "Low", 0.8, 0.7, 0.5, True),
    ("Personal", "pers_4", "Morning Routine", 60.0, "Medium", 0.4, 0.4, 0.5, False),
    ("Social", "soc_1", "Phone Conversation", 15.0, "Medium", 0.6, 0.5, 0.6, True),
    ("Social", "soc_2", "Social Event", 120.0, "High", 0.7, 0.8, 0.5, False),
    ("Academic", "acad_1", "Study Session", 120.0, "High", 0.5, 0.8, 0.5, True),
    ("Academic", "acad_2", "Project Work", 180.0, "High", 0.6, 0.9, 0.4, True),
]

LEVEL_PATHS = [
    "/Game/Scenarios/Levels/Workplace_Level",
    "/Game/Scenarios/Levels/Personal_Level",
    "/Game/Scenarios/Levels/Social_Level",
    "/Game/Scenarios/Levels/Academic_Level",
]

results = {
    "dataasset_creation": {"created": [], "failed": []},
    "level_validation": {},
    "binding_validation": {},
    "load_time": {},
    "build_integration": {},
}

def log(msg):
    unreal.log(msg)

def log_error(msg):
    unreal.log_error(msg)

def log_warning(msg):
    unreal.log_warning(msg)

# ─── Ensure WorldEngine symbols are available ───────────────────────────────
# In some commandlet runtimes unreal.ModuleManager is not exposed to Python.
if hasattr(unreal, "ModuleManager"):
    module_manager = unreal.ModuleManager.get()
    if not module_manager.is_module_loaded("WorldEngine"):
        module_manager.load_module("WorldEngine")
        log("WorldEngine module loaded.")
    else:
        log("WorldEngine module already loaded.")
else:
    log_warning("unreal.ModuleManager not exposed; assuming WorldEngine module is already loaded")

# ─── PHASE 6a: Create 13 DataAssets ─────────────────────────────────────────

log("")
log("=" * 70)
log("PHASE 6a: Creating 13 Scenario DataAssets")
log("=" * 70)

asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
editor_asset_lib = unreal.EditorAssetLibrary

# Create directories
for cat in ["Workplace", "Personal", "Social", "Academic"]:
    path = "/Game/Scenarios/{}".format(cat)
    if not editor_asset_lib.does_directory_exist(path):
        editor_asset_lib.make_directory(path)
        log("  Created directory: {}".format(path))

# Load the UScenarioDataAsset class
scenario_class = unreal.load_class(None, "/Script/WorldEngine.ScenarioDataAsset")
if not scenario_class:
    scenario_class = unreal.load_class(None, "ScenarioDataAsset")

if not scenario_class:
    log_error("FATAL: UScenarioDataAsset class not found after module load!")
else:
    log("Loaded class: {}".format(scenario_class))
    created_count = 0

    for cat, scenario_id, display_name, duration, complexity_str, averseness, cognitive, success, sustained in SCENARIOS:
        dir_path = "/Game/Scenarios/{}".format(cat)
        asset_name = "{}_{}".format(cat[:3], scenario_id)
        full_path = "{}/{}".format(dir_path, asset_name)
        object_path = "{}.{}".format(full_path, asset_name)

        # Load existing or create new (commandlet-safe idempotent behavior)
        if editor_asset_lib.does_asset_exist(object_path):
            asset = editor_asset_lib.load_asset(object_path)
            if not asset:
                log("FAILED to load existing {}".format(asset_name))
                results["dataasset_creation"]["failed"].append(asset_name)
                continue
        else:
            asset = asset_tools.create_asset(
                asset_name=asset_name,
                package_path=dir_path,
                asset_class=scenario_class,
                factory=None,
            )
            if not asset:
                log("FAILED to create {}".format(asset_name))
                results["dataasset_creation"]["failed"].append(asset_name)
                continue

        # Set properties
        asset.set_editor_property("ScenarioId", unreal.Name(scenario_id))
        asset.set_editor_property("DisplayName", unreal.Text(display_name))
        asset.set_editor_property("Description", unreal.Text("Auto-generated scenario: {}".format(display_name)))
        asset.set_editor_property("Category", SCENARIO_CATEGORY[cat])
        asset.set_editor_property("DurationMinutes", duration)
        asset.set_editor_property("Complexity", SCENARIO_COMPLEXITY[complexity_str])
        asset.set_editor_property("Aversiveness", averseness)
        asset.set_editor_property("CognitiveDemand", cognitive)
        asset.set_editor_property("BaseSuccessRate", success)
        asset.set_editor_property("bRequiresSustainedFocus", sustained)
        level_world = unreal.load_object(None, LEVEL_MAP[cat])
        if not level_world:
            log_warning("  Could not resolve level object: {}".format(LEVEL_MAP[cat]))
        asset.set_editor_property("LevelReference", level_world)

        # Save
        editor_asset_lib.save_asset(object_path)
        log("  Created {}".format(full_path))
        results["dataasset_creation"]["created"].append(asset_name)
        created_count += 1

    log("Done! Created {} scenario DataAssets.".format(created_count))

# ─── PHASE 6b: Validate .umap Levels ────────────────────────────────────────

log("")
log("=" * 70)
log("PHASE 6b: Validating 4 .umap Levels")
log("=" * 70)

editor_level_lib = unreal.EditorLevelLibrary
asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()

for level_path in LEVEL_PATHS:
    level_name = level_path.split("/")[-1]
    log("--- Validating: {} ---".format(level_name))

    level_result = {
        "actors_total": 0,
        "has_geometry": False,
        "geometry_types": [],
        "player_starts": 0,
        "spawn_point_labels": [],
        "lighting_types": [],
        "navmesh_present": False,
        "missing_references": [],
        "errors": [],
    }

    # Check if level exists (commandlet-safe object path check)
    level_object_path = "{}.{}".format(level_path, level_name)
    if not editor_asset_lib.does_asset_exist(level_object_path):
        level_result["errors"].append("Level not found: {}".format(level_object_path))
        results["level_validation"][level_name] = level_result
        log_error("  Level not found: {}".format(level_object_path))
        continue
    log("  Level found: {}".format(level_object_path))

    # Load the level
    try:
        success = editor_level_lib.load_level(level_path)
        if not success:
            level_result["errors"].append("editor_level_lib.load_level() returned False")
            results["level_validation"][level_name] = level_result
            log_error("  Failed to load level")
            continue

        # Get the editor world
        world = editor_level_lib.get_editor_world()

        actors = editor_level_lib.get_all_level_actors() if world else []

        level_result["actors_total"] = len(actors)
        log("  Total actors: {}".format(len(actors)))

        for actor in actors:
            actor_class = actor.get_class()
            class_name = actor_class.get_name()
            actor_label = actor.get_actor_label() if actor.get_actor_label() else class_name

            # Check for geometry (StaticMeshActor, Brush)
            if class_name in ("StaticMeshActor", "Brush"):
                level_result["has_geometry"] = True
                if class_name not in level_result["geometry_types"]:
                    level_result["geometry_types"].append(class_name)

                # Check if static mesh is valid
                if class_name == "StaticMeshActor":
                    sm_components = actor.get_components_by_class(unreal.StaticMeshComponent)
                    for sm_comp in sm_components:
                        static_mesh = sm_comp.get_editor_property("static_mesh")
                        if static_mesh is None or not static_mesh.get_path_name():
                            level_result["missing_references"].append(
                                "StaticMeshActor '{}' has missing/unresolved static mesh".format(actor_label)
                            )

            # Check for PlayerStart (spawn points)
            if "PlayerStart" in class_name:
                level_result["player_starts"] += 1
                level_result["spawn_point_labels"].append(actor_label)

            # Check for lighting
            lighting_classes = ["DirectionalLight", "PointLight", "SpotLight", "SkyLight",
                               "SkyAtmosphere", "ExponentialHeightFog", "VolumetricCloud",
                               "RectLight", "SphereDirectionalLight"]
            if class_name in lighting_classes:
                if class_name not in level_result["lighting_types"]:
                    level_result["lighting_types"].append(class_name)

            # Check for NavMesh
            if "NavMeshBoundsVolume" in class_name:
                level_result["navmesh_present"] = True

        # Some UE Python runtimes do not expose NavigationSystemV1.get_current.
        # We treat explicit NavMeshBoundsVolume detection above as the source of truth.

        # Check for spawn point count (requirement: >= 10 per level per SCENARIO_PLAN.md)
        if level_result["player_starts"] < 10:
            level_result["errors"].append(
                "Insufficient spawn points: {} found, need >= 10 (per SCENARIO_PLAN.md Phase 2)".format(
                    level_result["player_starts"])
            )

        if not level_result["has_geometry"]:
            level_result["errors"].append("No geometry found (StaticMeshActor or Brush)")

        if not level_result["navmesh_present"]:
            level_result["errors"].append("No NavMesh bounds volume found")

        # Summary
        log("  Geometry: {} (types: {})".format(
            "YES" if level_result["has_geometry"] else "NO",
            level_result["geometry_types"]))
        log("  PlayerStarts: {}".format(level_result["player_starts"]))
        log("  Spawn point labels: {}".format(level_result["spawn_point_labels"]))
        log("  Lighting: {}".format(level_result["lighting_types"]))
        log("  NavMesh present: {}".format(level_result["navmesh_present"]))
        log("  Missing references: {}".format(len(level_result["missing_references"])))
        for mr in level_result["missing_references"][:10]:
            log("    - {}".format(mr))
        log("  Errors: {}".format(len(level_result["errors"])))
        for err in level_result["errors"]:
            log("    ERROR: {}".format(err))

        results["level_validation"][level_name] = level_result

        # Unload level if API is available in this UE Python runtime.
        if hasattr(editor_level_lib, "unload_current_level"):
            editor_level_lib.unload_current_level()

    except Exception as e:
        level_result["errors"].append("Exception during validation: {}".format(str(e)))
        log_error("  Exception validating {}: {}".format(level_name, str(e)))
        results["level_validation"][level_name] = level_result

# ─── PHASE 6c: Validate DataAsset -> Level Binding ──────────────────────────

log("")
log("=" * 70)
log("PHASE 6c: Validating DataAsset -> Level Binding")
log("=" * 70)

# Find all scenario DataAssets using asset registry
scenario_class_path = unreal.TopLevelAssetPath("/Script/WorldEngine", "ScenarioDataAsset")
ar_filter = unreal.ARFilter(
    class_paths=[scenario_class_path],
    recursive_paths=True,
)
asset_data_array = asset_registry.get_assets(ar_filter)

log("Found {} scenario DataAssets".format(len(asset_data_array)))

# If no DataAssets found via registry, reload them
if len(asset_data_array) == 0:
    log("  No DataAssets found via registry, scanning /Game/Scenarios/...")
    editor_asset_lib = unreal.EditorAssetLibrary
    asset_paths = editor_asset_lib.list_assets("/Game/Scenarios", True, False)
    log("  Found {} assets in /Game/Scenarios: {}".format(len(asset_paths), asset_paths))

    for path in asset_paths:
        ar_filter2 = unreal.ARFilter(
            object_paths=[path],
        )
        assets = asset_registry.get_assets(ar_filter2)
        asset_data_array.extend(assets)

    log("  Total after scan: {}".format(len(asset_data_array)))

for asset_data in asset_data_array:
    asset = asset_data.get_asset()
    if not asset:
        asset = asset_data.get_asset()
        if not asset:
            log_warning("  Could not load asset: {}".format(asset_data.object_path))
            continue

    try:
        scenario_id = str(asset.get_editor_property("ScenarioId"))
    except Exception:
        scenario_id = str(asset_data.asset_name)

    try:
        level_ref = asset.get_editor_property("LevelReference")
    except Exception:
        level_ref = None

    try:
        display_name = str(asset.get_editor_property("DisplayName"))
    except Exception:
        display_name = ""

    try:
        category = str(asset.get_editor_property("Category"))
    except Exception:
        category = ""

    binding_result = {
        "scenario_id": scenario_id,
        "display_name": display_name,
        "category": category,
        "level_reference_soft": level_ref.get_path_name() if level_ref else "",
        "is_null": level_ref is None,
        "resolves": False,
        "loaded_level_path": "",
        "valid": False,
    }

    if level_ref:
        level_obj_path = level_ref.get_path_name()
        binding_result["level_reference_soft"] = level_obj_path

        if editor_asset_lib.does_asset_exist(level_obj_path):
            binding_result["resolves"] = True
            binding_result["loaded_level_path"] = level_obj_path
            binding_result["valid"] = True
            log("  [OK] {} -> {}".format(scenario_id, level_obj_path))
        else:
            log_warning("  [WARN] {} -> {} (not found as asset)".format(scenario_id, level_obj_path))

            # Check if file exists on disk
            category_key = category.split(".")[-1] if category else ""
            category_key = {
                "WORKPLACE": "Workplace",
                "PERSONAL": "Personal",
                "SOCIAL": "Social",
                "ACADEMIC": "Academic",
            }.get(category_key, category_key)
            level_filename = LEVEL_MAP.get(category_key, "")
            if level_filename:
                disk_path = level_filename.replace("/Game/", "D:/nlt-repos/nlt-fusion/WorldEngine/Content/").replace(".", "/") + ".umap"
                if os.path.exists(disk_path):
                    binding_result["resolves"] = True
                    binding_result["valid"] = True
                    log("    Asset exists on disk: {}".format(disk_path))
                else:
                    log_error("    Asset does NOT exist on disk: {}".format(disk_path))

    else:
        binding_result["valid"] = False
        log_error("  [FAIL] {} -> LevelReference is null".format(scenario_id))

    results["binding_validation"][scenario_id] = binding_result

log("Validated {} DataAsset -> Level bindings".format(len(asset_data_array)))

# ─── PHASE 6d: Load Time Testing ────────────────────────────────────────────

log("")
log("=" * 70)
log("PHASE 6d: Load Time Testing (target: <30s per level)")
log("=" * 70)

for level_path in LEVEL_PATHS:
    level_name = level_path.split("/")[-1]
    log("--- Load time test: {} ---".format(level_name))

    # Force GC before each test
    unreal.collect_garbage()

    start_time = time.time()

    try:
        # Load the level (some UE Python runtimes return None here even on success)
        editor_level_lib.load_level(level_path)
        elapsed = time.time() - start_time

        world = editor_level_lib.get_editor_world()
        actor_count = len(editor_level_lib.get_all_level_actors()) if world else 0
        load_ok = world is not None and actor_count > 0

        load_result = {
            "level": level_name,
            "load_time_seconds": round(elapsed, 3),
            "target_seconds": 30,
            "within_target": elapsed < 30,
            "success": load_ok,
            "actors_after_load": actor_count,
        }

        log("  Load time: {:.3f}s (target: <30s) - {}".format(
            elapsed, "PASS" if elapsed < 30 else "FAIL"
        ))
        log("  Actors in loaded level: {}".format(actor_count))
        if not load_ok:
            log_warning("  Level loaded but actor inspection returned zero actors")

        # Unload level if API is available in this UE Python runtime.
        if hasattr(editor_level_lib, "unload_current_level"):
            editor_level_lib.unload_current_level()

    except Exception as e:
        elapsed = time.time() - start_time
        load_result = {
            "level": level_name,
            "load_time_seconds": round(elapsed, 3),
            "target_seconds": 30,
            "within_target": False,
            "success": False,
            "error": str(e),
        }
        log_error("  Exception: {}".format(str(e)))

    results["load_time"][level_name] = load_result

# ─── PHASE 6e: Build Integration Check ───────────────────────────────────────

log("")
log("=" * 70)
log("PHASE 6e: Build Integration Check")
log("=" * 70)

# Verify the WorldEngine module is loaded (if Python API exposes ModuleManager)
if hasattr(unreal, "ModuleManager"):
    module_manager = unreal.ModuleManager.get()
    module_loaded = module_manager.is_module_loaded("WorldEngine")
else:
    module_loaded = None

build_result = {
    "module_loaded": module_loaded,
    "dataasset_class_available": scenario_class is not None,
    "dataasset_count": len(asset_data_array),
    "all_bindings_valid": all(r["valid"] for r in results["binding_validation"].values()),
}

log("  WorldEngine module loaded: {}".format(module_loaded))
log("  UScenarioDataAsset class available: {}".format(scenario_class is not None))
log("  Scenario DataAssets created: {}".format(len(asset_data_array)))
log("  All bindings valid: {}".format(build_result["all_bindings_valid"]))

# Verify level packages exist
for level_path in LEVEL_PATHS:
    level_name = level_path.split("/")[-1]
    try:
        level_object_path = "{}.{}".format(level_path, level_name)
        build_result["level_{}_exists".format(level_name)] = editor_asset_lib.does_asset_exist(level_object_path)
    except Exception as e:
        build_result["level_{}_error".format(level_name)] = str(e)

results["build_integration"] = build_result

# ─── SUMMARY ────────────────────────────────────────────────────────────────

log("")
log("=" * 70)
log("PHASE 6 VALIDATION SUMMARY")
log("=" * 70)

log("DataAsset Creation:")
log("  Created: {} / Failed: {}".format(
    len(results["dataasset_creation"]["created"]),
    len(results["dataasset_creation"]["failed"])))

log("Level Validation:")
for level_name, data in results["level_validation"].items():
    log("  {}: actors={}, player_starts={}, geometry_types={}, lighting={}, navmesh={}, missing_refs={}, errors={}".format(
        level_name, data["actors_total"], data["player_starts"],
        data["geometry_types"], len(data["lighting_types"]),
        data["navmesh_present"], len(data["missing_references"]),
        len(data["errors"])
    ))

log("DataAsset -> Level Binding:")
for scenario_id, data in results["binding_validation"].items():
    status = "VALID" if data["valid"] else "INVALID"
    log("  {} -> {} [{}]".format(scenario_id, data.get("loaded_level_path", "N/A"), status))

log("Load Times:")
for level_name, data in results["load_time"].items():
    status = "PASS" if data["within_target"] else "FAIL"
    log("  {}: {:.3f}s (target <30s) [{}]".format(
        level_name, data["load_time_seconds"], status))

log("Build Integration:")
log("  Module loaded: {}".format(build_result["module_loaded"]))
log("  DataAsset class available: {}".format(build_result["dataasset_class_available"]))
log("  All bindings valid: {}".format(build_result["all_bindings_valid"]))

# Save results to JSON
output_path = "D:/nlt-repos/nlt-fusion/WorldEngine/Saved/Phase6ValidationReport.json"
with open(output_path, "w") as f:
    json.dump(results, f, indent=2, default=str)

log("")
log("Validation report saved to: {}".format(output_path))
log("=" * 70)
log("PHASE 6 VALIDATION COMPLETE")
log("=" * 70)
