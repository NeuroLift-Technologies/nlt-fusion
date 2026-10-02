#!/usr/bin/env python3
"""
Extract the 13 UScenarioDataAsset records to versioned JSON (migration plan 2.9).

Plan 2.9 requires behaviour-preserving extraction from UE - "do not hand-transcribe".
This loads the .uasset objects through UE's own reflection and serialises every
UPROPERTY, so the emitted JSON is what UE actually holds, not what the generator
script intended.

Run (from repo root):
  "C:\\Program Files\\Epic Games\\UE_5.8\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" ^
    WorldEngine\\WorldEngine.uproject -nullrhi -unattended -nosplash ^
    -run=PythonScriptCommandlet -Script=WorldEngine\\Scripts\\extract_scenario_data.py

Output: migration-data/ue-scenarios.v1.json

Asset paths are DISCOVERED by walking /Game/Scenarios rather than hardcoded, because
the hardcoded list in verify_bindings.py went stale when the assets were renamed
(Wor_EmailProcessing -> Wor_wp_1). Discovery is immune to that class of drift.
"""
import json
import os
import re
import sys

import unreal

SCENARIO_ROOT = "/Game/Scenarios"
OUTPUT_PATH = "migration-data/ue-scenarios.v1.json"
SCHEMA_VERSION = "nlt.world-engine.scenarios.v1"

# Properties mirrored from UScenarioDataAsset.h. Any UPROPERTY(EditAnywhere) added to
# that class MUST be added here too, or it silently disappears from the port data.
# check_property_coverage() below fails loudly if the reflected class gains a property
# this script does not know about.
PROPERTY_NAMES = [
    "ScenarioId",
    "DisplayName",
    "Description",
    "Category",
    "DurationMinutes",
    "Complexity",
    "Aversiveness",
    "CognitiveDemand",
    "BaseSuccessRate",
    "bRequiresSustainedFocus",
    "ContextParams",
    "LevelReference",
]


def enum_to_str(value):
    """Render a UENUM value as its C++ enumerator name (e.g. 'Workplace').

    A UE 5.8 enum instance stringifies as "<ScenarioCategory.WORKPLACE: 0>" and also
    exposes .name / .value. Splitting on '.' yields "WORKPLACE: 0>" - i.e. the numeric
    suffix leaks into the data - so prefer .name and fall back to a regex that strips
    the ": N" ordinal. An unrecognised value raises rather than guessing, because a
    silently wrong enum string would corrupt the port data.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return value

    name = getattr(value, "name", None)
    if isinstance(name, str) and name:
        return name

    match = re.search(r"\.([A-Za-z_][A-Za-z0-9_]*)\s*:\s*-?\d+>?", str(value))
    if match:
        return match.group(1)
    raise RuntimeError("Cannot render enum value {!r} as a string".format(value))


def text_to_str(value):
    if value is None:
        return ""
    if hasattr(value, "to_string"):
        return value.to_string()
    return str(value)


def soft_path(value):
    """Render a TSoftObjectPtr<UWorld> as its object path, or None if unresolved."""
    if value is None:
        return None
    if hasattr(value, "get_path_name"):
        return value.get_path_name()
    return str(value)


def load_scenario_class():
    scenario_class = unreal.load_class(None, "/Script/WorldEngine.ScenarioDataAsset")
    if not scenario_class:
        scenario_class = unreal.load_class(None, "ScenarioDataAsset")
    if not scenario_class:
        raise RuntimeError("UScenarioDataAsset class not found - is the module compiled?")
    return scenario_class
def properties_from_header(header_path):
    """Parse UPROPERTY names straight out of UScenarioDataAsset.h.

    UE 5.8's Python `Class` exposes no property enumeration (getattr on the class
    returns None; only get_editor_property on an *instance* works), so the header is
    the only available source of truth for "which fields exist". Parsing it means
    adding a UPROPERTY and forgetting to update PROPERTY_NAMES fails loudly instead
    of silently dropping the field from the port data.
    """
    with open(header_path, "r", encoding="utf-8") as handle:
        text = handle.read()
    text = re.sub(r"//[^\n]*", "", text)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)

    # UPROPERTY(...) tolerates one nesting level for meta = (ClampMin = "0.0")
    pattern = re.compile(r"UPROPERTY\s*\((?:[^()]|\([^()]*\))*\)\s*([^;]+);")
    names = []
    for match in pattern.finditer(text):
        decl = match.group(1).strip()
        ident = re.search(r"([A-Za-z_]\w*)\s*(?:=[^;]*)?$", decl)
        if ident:
            names.append(ident.group(1))
    return names


def check_property_coverage(header_path):
    """Fail if the C++ class has UPROPERTYs this script does not serialise."""
    declared = properties_from_header(header_path)
    missing = sorted(set(declared) - set(PROPERTY_NAMES))
    if missing:
        raise RuntimeError(
            "UScenarioDataAsset declares UPROPERTYs this extractor does not "
            "serialise: {}. Add them to PROPERTY_NAMES.".format(missing)
        )
    unreal.log("Property coverage OK: {} UPROPERTYs declared, all serialised.".format(len(declared)))


def collect_asset_paths(scenario_class):
    """Walk /Game/Scenarios and return every UScenarioDataAsset object path."""
    paths = []
    assets = unreal.EditorAssetLibrary.list_assets(
        SCENARIO_ROOT, recursive=True, include_folder=False
    )
    want_name = scenario_class.get_name()
    for asset_path in assets:
        # list_assets returns OBJECT paths ("/Game/.../Aca_acad_1.Aca_acad_1"), not
        # filenames, so do NOT filter on a ".uasset" suffix - nothing matches it.
        obj_path = asset_path
        asset = unreal.EditorAssetLibrary.load_asset(obj_path)
        if asset is None:
            unreal.log_warning("  could not load {}".format(obj_path))
            continue
        if asset.get_class().get_name() != want_name:
            continue
        paths.append(obj_path)
    return sorted(paths)


def build_record(asset):
    ctx = asset.get_editor_property("ContextParams") or {}
    # TMap iteration order is not guaranteed; sort so output is byte-stable.
    ctx_sorted = {str(k): str(v) for k, v in sorted(ctx.items(), key=lambda kv: str(kv[0]))}
    return {
        "scenarioId": str(asset.get_editor_property("ScenarioId")),
        "displayName": text_to_str(asset.get_editor_property("DisplayName")),
        "description": text_to_str(asset.get_editor_property("Description")),
        "category": enum_to_str(asset.get_editor_property("Category")),
        "durationMinutes": float(asset.get_editor_property("DurationMinutes")),
        "complexity": enum_to_str(asset.get_editor_property("Complexity")),
        "aversiveness": float(asset.get_editor_property("Aversiveness")),
        "cognitiveDemand": float(asset.get_editor_property("CognitiveDemand")),
        "baseSuccessRate": float(asset.get_editor_property("BaseSuccessRate")),
        "requiresSustainedFocus": bool(asset.get_editor_property("bRequiresSustainedFocus")),
        "contextParams": ctx_sorted,
        "levelReference": soft_path(asset.get_editor_property("LevelReference")),
        "_sourceAsset": asset.get_path_name(),
    }


def main():
    scenario_class = load_scenario_class()
    header_path = os.path.join(
        unreal.Paths.project_dir(), "Source", "WorldEngine", "Public",
        "Scenarios", "UScenarioDataAsset.h",
    )
    if not os.path.isfile(header_path):
        raise RuntimeError("Cannot find UScenarioDataAsset.h at {}".format(header_path))
    check_property_coverage(header_path)

    obj_paths = collect_asset_paths(scenario_class)
    unreal.log("Found {} UScenarioDataAsset objects under {}".format(len(obj_paths), SCENARIO_ROOT))
    if len(obj_paths) != 13:
        # Not fatal - a partial dump is still useful - but it must not pass silently.
        unreal.log_warning(
            "Expected 13 scenario assets, found {}. Verify before porting.".format(len(obj_paths))
        )

    records = []
    for obj_path in obj_paths:
        asset = unreal.EditorAssetLibrary.load_asset(obj_path)
        record = build_record(asset)
        records.append(record)
        unreal.log("  extracted {} ({})".format(record["scenarioId"], record["category"]))

    by_category = {}
    for record in records:
        by_category[record["category"]] = by_category.get(record["category"], 0) + 1
    unreal.log("By category: {}".format(by_category))

    payload = {
        "schema": SCHEMA_VERSION,
        "source": "extracted from UScenarioDataAsset .uasset via UE reflection",
        "extractedBy": "WorldEngine/Scripts/extract_scenario_data.py",
        "class": "/Script/WorldEngine.ScenarioDataAsset",
        "count": len(records),
        "byCategory": by_category,
        "scenarios": records,
    }

    # project_dir() is RELATIVE (../../../../Users/...), so it must be made absolute
    # before joining, or the output lands somewhere unreachable.
    project_dir = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    out_path = os.path.normpath(os.path.join(project_dir, "..", OUTPUT_PATH))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    unreal.log("Wrote {} scenario records to {}".format(len(records), out_path))


main()