#!/usr/bin/env python3
"""
Phase 6 Final Validation Script — Direct MCP HTTP Client
========================================================
Handles the complete Phase 6 validation workflow:
1. Duplicate Workplace_Level → Personal/Social/Academic (with actors)
2. Save all levels
3. Validate all 4 levels (geometry, spawn points, NavMesh, missing refs)
4. Verify all 13 DataAsset → Level bindings
5. Measure load times (<30s per level)
6. Run cooking via RunUAT.sh
7. Generate final validation report

Uses only direct HTTP MCP calls (NOT execute_tool_script).
"""
import json
import time
import urllib.request
import urllib.error
import os
import subprocess
import sys
from pathlib import Path

# ─── Configuration ───
MCP_URL = "http://127.0.0.1:8001/mcp"
PROJECT_PATH = "D:/nlt-repos/nlt-fusion/WorldEngine"
UPROJECT = f"{PROJECT_PATH}/WorldEngine.uproject"
CONTENT_DIR = f"{PROJECT_PATH}/Content"
LEVELS_DIR_REL = "Content/Scenarios/Levels"
SAVED_DIR = f"{PROJECT_PATH}/Saved"

LEVELS = [
    ("Workplace_Level", "/Game/Scenarios/Levels/Workplace_Level"),
    ("Personal_Level", "/Game/Scenarios/Levels/Personal_Level"),
    ("Social_Level", "/Game/Scenarios/Levels/Social_Level"),
    ("Academic_Level", "/Game/Scenarios/Levels/Academic_Level"),
]

# (Name, Category, Expected Level)
DATA_ASSETS = [
    ("Wor_EmailProcessing",    "Workplace", "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level"),
    ("Wor_ReportWriting",      "Workplace", "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level"),
    ("Wor_MeetingParticipation","Workplace", "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level"),
    ("Wor_CodeReview",         "Workplace", "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level"),
    ("Wor_DeadlineCrunch",     "Workplace", "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level"),
    ("Per_HouseholdCleaning",  "Personal",  "/Game/Scenarios/Levels/Personal_Level.Personal_Level"),
    ("Per_GroceryShopping",    "Personal",  "/Game/Scenarios/Levels/Personal_Level.Personal_Level"),
    ("Per_BillPaying",         "Personal",  "/Game/Scenarios/Levels/Personal_Level.Personal_Level"),
    ("Per_MorningRoutine",     "Personal",  "/Game/Scenarios/Levels/Personal_Level.Personal_Level"),
    ("Soc_PhoneConversation",  "Social",    "/Game/Scenarios/Levels/Social_Level.Social_Level"),
    ("Soc_SocialEvent",        "Social",    "/Game/Scenarios/Levels/Social_Level.Social_Level"),
    ("Aca_StudySession",       "Academic",  "/Game/Scenarios/Levels/Academic_Level.Academic_Level"),
    ("Aca_ProjectWork",        "Academic",  "/Game/Scenarios/Levels/Academic_Level.Academic_Level"),
]

ENGINE_PATH = "/home/joshd/Documents/NLT/Engine"


# ─── MCP Client ───
class MCPClient:
    def __init__(self, url):
        self.url = url
        self.session_id = None

    def init_session(self):
        """Initialize a new MCP session."""
        req = urllib.request.Request(
            self.url,
            data=json.dumps({
                "jsonrpc": "2.0",
                "method": "initialize",
                "id": int(time.time() * 1000) % 100000,
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {"sampling": {}, "roots": {}},
                    "clientInfo": {"name": "pool", "version": "1.0"},
                },
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=20)
        self.session_id = resp.headers.get("Mcp-Session-Id", "").strip()
        resp.read()
        return self.session_id is not None

    def call_tool(self, toolset_name, tool_name, arguments=None):
        """Call a tool within a toolset. Auto-refreshes session if needed."""
        for retry in range(3):
            if not self.session_id:
                if not self.init_session():
                    time.sleep(2)
                    continue

            req = urllib.request.Request(
                self.url,
                data=json.dumps({
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "id": int(time.time() * 1000) % 100000,
                    "params": {
                        "name": "call_tool",
                        "arguments": {
                            "toolset_name": toolset_name,
                            "tool_name": tool_name,
                            "arguments": arguments or {},
                        },
                    },
                }).encode(),
                headers={
                    "Content-Type": "application/json",
                    "Mcp-Session-Id": self.session_id,
                },
                method="POST",
            )

            try:
                resp = urllib.request.urlopen(req, timeout=30)
                # Refresh session ID if returned
                new_sid = resp.headers.get("Mcp-Session-Id", "").strip()
                if new_sid:
                    self.session_id = new_sid
                data = json.loads(resp.read().decode())

                if "error" in data:
                    err = data["error"]
                    if "session" in str(err).lower():
                        self.session_id = None
                        time.sleep(1)
                        continue
                    return {"raw": str(err)}

                content = data.get("result", {}).get("content", [])
                if content and isinstance(content[0], dict) and "text" in content[0]:
                    text = content[0]["text"]
                    try:
                        return json.loads(text)
                    except (json.JSONDecodeError, TypeError):
                        return {"raw": text}
                return data

            except urllib.error.HTTPError as e:
                body = e.read().decode()[:300]
                if e.code in (401, 403, 404):
                    self.session_id = None
                    time.sleep(1)
                    continue
                return {"raw": f"HTTP {e.code}: {body}"}
            except Exception as e:
                print(f"  [MCP WARNING] {type(e).__name__}: {e}")
                if retry < 2:
                    self.session_id = None
                    time.sleep(2)
                    continue
                return {"raw": str(e)}

        return {"raw": "max_retries_exceeded"}

    def top_level_call(self, method, params=None):
        """Call a top-level MCP method (list_toolsets, describe_toolset)."""
        if not self.session_id:
            self.init_session()

        req = urllib.request.Request(
            self.url,
            data=json.dumps({
                "jsonrpc": "2.0",
                "method": "tools/call",
                "id": int(time.time() * 1000) % 100000,
                "params": {
                    "name": method,
                    "arguments": params or {},
                },
            }).encode(),
            headers={
                "Content-Type": "application/json",
                "Mcp-Session-Id": self.session_id,
            },
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=30)
        new_sid = resp.headers.get("Mcp-Session-Id", "").strip()
        if new_sid:
            self.session_id = new_sid
        data = json.loads(resp.read().decode())
        content = data.get("result", {}).get("content", [])
        if content and isinstance(content[0], dict) and "text" in content[0]:
            text = content[0]["text"]
            try:
                return json.loads(text)
            except (json.JSONDecodeError, TypeError):
                return {"raw": text}
        return data


def extract_retval(result):
    """Extract the return value from an MCP tool result.
    Returns (success: bool, value: any, raw: str)
    """
    if not isinstance(result, dict):
        return False, None, str(result)
    if "raw" in result:
        return False, None, result["raw"]
    if "returnValue" in result:
        return True, result["returnValue"], None
    if "returnValue" not in result:
        # Might still be success
        return True, None, None
    return False, None, str(result)


def get_actor_count(client, actor_class):
    """Count actors of a specific class in the current level."""
    ref_map = {
        "PlayerStart": "/Script/Engine.PlayerStart",
        "StaticMeshActor": "/Script/Engine.StaticMeshActor",
        "NavMeshBoundsVolume": "/Script/Engine.NavMeshBoundsVolume",
        "DirectionalLight": "/Script/Engine.DirectionalLight",
        "SkyAtmosphere": "/Script/Engine.SkyAtmosphere",
        "SkyLight": "/Script/Engine.SkyLight",
        "ExponentialHeightFog": "/Script/Engine.ExponentialHeightFog",
        "VolumetricCloud": "/Script/Engine.VolumetricCloud",
        "PointLight": "/Script/Engine.PointLight",
        "CameraActor": "/Script/Engine.CameraActor",
    }
    ref = ref_map.get(actor_class)
    if not ref:
        return 0

    result = client.call_tool(
        "editor_toolset.toolsets.scene.SceneTools",
        "find_actors",
        {"name": "", "tag": "", "collision_channels": [], "actor_type": {"refPath": ref}}
    )
    success, value, raw = extract_retval(result)

    if success and value is not None:
        if isinstance(value, list):
            return len(value)
        elif isinstance(value, int):
            return value
        elif isinstance(value, dict):
            # Might be a count or object
            return int(value.get("count", 0)) if "count" in value else 0
    return 0


def main():
    print("=" * 70)
    print("Phase 6 Final Validation — Direct MCP HTTP Client")
    print("=" * 70)
    overall_start = time.time()

    client = MCPClient(MCP_URL)

    # ─── Step 1: Initialize MCP session ───
    print("\n[Step 1] Initializing MCP session...")
    if not client.init_session():
        print("  FATAL: Cannot initialize MCP session!")
        sys.exit(1)
    print(f"  ✓ Session: {client.session_id[:16]}...")

    # ─── Step 2: Check which levels need duplication ───
    print("\n[Step 2] Checking level existence on disk...")
    
    # Save Workplace_Level first (ensure not dirty)
    print("  Saving Workplace_Level...")
    save_r = client.call_tool("editor_toolset.toolsets.asset.AssetTools", "save_assets", {
        "asset_paths": ["/Game/Scenarios/Levels/Workplace_Level"]
    })
    print(f"  save_assets result: {save_r}")

    for level_name, level_path in LEVELS:
        if level_name == "Workplace_Level":
            print(f"  {level_name}: already exists (source level)")
            continue

        exists_r = client.call_tool("editor_toolset.toolsets.asset.AssetTools", "exists", {
            "path": level_path
        })
        success, value, raw = extract_retval(exists_r)
        exists = bool(value) if success else False
        print(f"  {level_name}: exists={exists}")

        if not exists:
            print(f"  → Duplicating Workplace_Level → {level_name}...")
            dup_r = client.call_tool("editor_toolset.toolsets.asset.AssetTools", "duplicate", {
                "path": "/Game/Scenarios/Levels/Workplace_Level",
                "new_path": level_path
            })
            success2, value2, raw2 = extract_retval(dup_r)
            print(f"  → duplicate result: success={success2}, value={value2}, raw={raw2}")
            if not success2 or not value2:
                print(f"  ✗ DUPLICATE FAILED: {raw2}")

    # ─── Step 3: Save all levels ───
    print("\n[Step 3] Saving all duplicated levels...")
    all_level_paths = [lp for _, lp in LEVELS]
    save_r = client.call_tool("editor_toolset.toolsets.asset.AssetTools", "save_assets", {
        "asset_paths": all_level_paths
    })
    success, value, raw = extract_retval(save_r)
    print(f"  save_assets(all 4 levels): success={success}, value={value}")

    # ─── Step 4: Validate levels ───
    print("\n[Step 4] Validating all 4 levels (geometry, spawn points, NavMesh)...")
    validation_results = {}

    for level_name, level_path in LEVELS:
        print(f"\n  --- {level_name} ---")

        # Load the level (to get current actors)
        load_r = client.call_tool("editor_toolset.toolsets.scene.SceneTools", "load_level", {
            "level_path": level_path
        })
        load_success, load_val, load_raw = extract_retval(load_r)
        print(f"    load_level: success={load_success}, value={load_val}")

        # Save to clear dirty flag
        client.call_tool("editor_toolset.toolsets.asset.AssetTools", "save_assets", {
            "asset_paths": [level_path]
        })

        # Count actors
        actor_counts = {}
        for atype in ["PlayerStart", "StaticMeshActor", "NavMeshBoundsVolume",
                       "DirectionalLight", "SkyAtmosphere", "SkyLight",
                       "ExponentialHeightFog", "VolumetricCloud"]:
            count = get_actor_count(client, atype)
            actor_counts[atype] = count

        ps_count = actor_counts.get("PlayerStart", 0)
        nav_count = actor_counts.get("NavMeshBoundsVolume", 0)
        sm_count = actor_counts.get("StaticMeshActor", 0)
        floor_count = sm_count  # Floor is a StaticMeshActor

        print(f"    PlayerStart: {ps_count} (need ≥10)")
        print(f"    NavMeshBoundsVolume: {nav_count} (need ≥1)")
        print(f"    StaticMeshActor/Floor: {sm_count}")
        print(f"    DirectionalLight: {actor_counts.get('DirectionalLight', 0)}")
        print(f"    SkyAtmosphere: {actor_counts.get('SkyAtmosphere', 0)}")
        print(f"    SkyLight: {actor_counts.get('SkyLight', 0)}")

        validation_results[level_name] = {
            "level_path": level_path,
            "load_success": load_success,
            "load_value": load_val,
            "actor_counts": actor_counts,
            "player_starts": ps_count,
            "navmesh_volume": nav_count,
            "static_mesh_count": sm_count,
            "valid_geometry": sm_count > 0,  # Has floor/static mesh = has geometry
            "spawn_points_ok": ps_count >= 10,
            "navmesh_ok": nav_count >= 1,
            "lighting_ok": (
                actor_counts.get("DirectionalLight", 0) >= 1 and
                actor_counts.get("SkyAtmosphere", 0) >= 1 and
                actor_counts.get("SkyLight", 0) >= 1
            ),
        }

    # ─── Step 5: Verify DataAsset → Level bindings ───
    print("\n\n[Step 5] Verifying DataAsset → Level bindings (13 DataAssets)...")
    binding_results = {}

    for asset_name, category, expected_level in DATA_ASSETS:
        asset_path = f"/Game/Scenarios/{category}/{asset_name}.{asset_name}"

        # Get properties
        props_r = client.call_tool("editor_toolset.toolsets.object.ObjectTools", "get_properties", {
            "instance": {"refPath": asset_path},
            "properties": ["levelReference", "scenarioId", "category", "displayName",
                           "durationMinutes", "complexity", "aversiveness", "cognitiveDemand",
                           "baseSuccessRate", "bRequiresSustainedFocus"]
        })
        success, value, raw = extract_retval(props_r)

        level_ref = None
        scenario_id = None
        all_props = {}

        if success and value is not None:
            if isinstance(value, str):
                try:
                    all_props = json.loads(value)
                except:
                    all_props = {"raw": value}
            elif isinstance(value, dict):
                all_props = value

            level_ref = all_props.get("levelReference")
            scenario_id = all_props.get("scenarioId")

        # Normalize levelReference to string for comparison
        ref_str = str(level_ref) if level_ref else ""
        if isinstance(level_ref, dict) and "refPath" in level_ref:
            ref_str = level_ref["refPath"]

        # Check binding matches expected level
        binding_ok = expected_level in ref_str if ref_str else False

        # Check .umap file exists on disk
        expected_level_name = expected_level.split(".")[-1] if "." in expected_level else expected_level.split("/")[-1]
        umap_file = os.path.join(PROJECT_PATH, LEVELS_DIR_REL, f"{expected_level_name}.umap")
        umap_exists = os.path.exists(umap_file)

        binding_results[asset_name] = {
            "category": category,
            "asset_path": asset_path,
            "levelReference": ref_str,
            "scenarioId": scenario_id,
            "expected_level": expected_level,
            "binding_matches": binding_ok,
            "umap_exists": umap_exists,
            "binding_ok": binding_ok and umap_exists,
        }

        status = "✓" if binding_ok and umap_exists else "✗"
        print(f"  {status} {asset_name}: ref={ref_str}")

    # ─── Step 6: Load time measurement ───
    print("\n[Step 6] Measuring load times (<30s per level)...")

    # Save current level first
    client.call_tool("editor_toolset.toolsets.asset.AssetTools", "save_assets", {
        "asset_paths": ["/Game/Scenarios/Levels/Workplace_Level"]
    })

    load_times = {}
    for level_name, level_path in LEVELS:
        start = time.time()
        load_r = client.call_tool("editor_toolset.toolsets.scene.SceneTools", "load_level", {
            "level_path": level_path
        })
        elapsed = time.time() - start

        # Save to clear state
        client.call_tool("editor_toolset.toolsets.asset.AssetTools", "save_assets", {
            "asset_paths": [level_path]
        })

        load_times[level_name] = round(elapsed, 3)
        target_ok = "✓ PASS" if elapsed < 30 else "✗ FAIL"
        print(f"  {level_name}: {elapsed:.3f}s {target_ok}")

    # ─── Step 7: Check .umap files on disk ───
    print("\n[Step 7] Checking .umap files on disk...")
    level_file_results = {}

    for level_name, _ in LEVELS:
        umap_path = os.path.join(PROJECT_PATH, LEVELS_DIR_REL, f"{level_name}.umap")
        exists = os.path.exists(umap_path)
        size = os.path.getsize(umap_path) if exists else 0

        package_name = None
        if exists and size > 0:
            try:
                with open(umap_path, "rb") as f:
                    content = f.read()
                    for line in content.split(b"\n"):
                        line = line.strip()
                        if line.startswith(b"/Game/") and b"Scenarios/Levels" in line:
                            # Extract just the package name
                            try:
                                text_line = line.decode("utf-8", errors="replace")
                                # Find the package path
                                for candidate in text_line.split():
                                    if candidate.startswith("/Game/Scenarios/Levels/"):
                                        package_name = candidate.strip().strip('"').strip("'")
                                        break
                                if not package_name:
                                    package_name = text_line.strip().strip('"').strip("'")
                                break
                            except:
                                pass
            except Exception as e:
                package_name = f"error: {e}"

        expected_pkg = f"/Game/Scenarios/Levels/{level_name}"
        correct = package_name == expected_pkg

        level_file_results[level_name] = {
            "file_path": umap_path,
            "exists": exists,
            "size_bytes": size,
            "internal_package": package_name,
            "expected_package": expected_pkg,
            "package_correct": correct,
        }
        print(f"  {level_name}: exists={exists}, size={size}, package={package_name}, correct={correct}")

    # ─── Step 8: Check DataAsset .uasset files on disk ───
    print("\n[Step 8] Checking DataAsset .uasset files...")
    uasset_results = {}
    for asset_name, category, _ in DATA_ASSETS:
        uasset_path = os.path.join(PROJECT_PATH, f"Content/Scenarios/{category}", f"{asset_name}.uasset")
        exists = os.path.exists(uasset_path)
        size = os.path.getsize(uasset_path) if exists else 0
        uasset_results[asset_name] = {
            "exists": exists,
            "size_bytes": size,
            "category": category,
        }
        status = "✓" if exists and size > 0 else "✗"
        print(f"  {status} {asset_name}.{category}: exists={exists}, size={size}")

    # ─── Step 9: Run cooking verification ───
    print("\n[Step 9] Running cooking verification (RunUAT.sh)...")
    map_arg = ",".join([lp for _, lp in LEVELS])
    uat_cmd = [
        f"{ENGINE_PATH}/Build/BatchFiles/RunUAT.sh",
        "BuildCookRun",
        f"-project={UPROJECT}",
        "-noP4",
        "-platform=Linux",
        "-clientconfig=Development",
        "-serverconfig=Development",
        "-cook",
        f"-map={map_arg}",
        "-nocompileeditor",
        "-nop4",
    ]

    cook_log_path = os.path.join(SAVED_DIR, "phase6-cook.log")
    print(f"  Running: {' '.join(uat_cmd)}")
    print(f"  Log: {cook_log_path}")

    cook_start = time.time()
    try:
        cook_proc = subprocess.Popen(
            uat_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=PROJECT_PATH,
        )
        cook_output = []
        # Wait with timeout
        try:
            output, _ = cook_proc.communicate(timeout=120)
            cook_output = output
            cook_exit = cook_proc.returncode
        except subprocess.TimeoutExpired:
            cook_proc.kill()
            output, _ = cook_proc.communicate()
            cook_output = (output or "") + "\n[TIMEOUT: 120s exceeded]"
            cook_exit = -1

        cook_time = round(time.time() - cook_start, 2)

        # Save cook log
        with open(cook_log_path, "w") as f:
            f.write(cook_output)

        # Check for errors
        has_errors = "ERROR" in cook_output or cook_exit != 0
        has_missing_refs = "missing" in cook_output.lower() and "referenc" in cook_output.lower()

        cooking_results = {
            "command": " ".join(uat_cmd),
            "exit_code": cook_exit,
            "elapsed_seconds": cook_time,
            "has_errors": has_errors,
            "has_missing_references": has_missing_refs,
            "log_path": cook_log_path,
            "output_tail": cook_output[-500:] if cook_output else "",
        }
        print(f"  Cooking: exit_code={cook_exit}, time={cook_time}s, errors={has_errors}")

    except FileNotFoundError:
        cooking_results = {
            "command": " ".join(uat_cmd),
            "exit_code": -1,
            "error": "RunUAT.sh not found",
            "elapsed_seconds": round(time.time() - cook_start, 2),
            "has_errors": True,
            "has_missing_references": False,
            "log_path": cook_log_path,
            "output_tail": "",
        }
        print(f"  ✗ RunUAT.sh not found at {ENGINE_PATH}/Build/BatchFiles/RunUAT.sh")
    except Exception as e:
        cooking_results = {
            "command": " ".join(uat_cmd),
            "exit_code": -1,
            "error": str(e),
            "elapsed_seconds": round(time.time() - cook_start, 2),
            "has_errors": True,
            "has_missing_references": False,
            "log_path": cook_log_path,
            "output_tail": "",
        }
        print(f"  ✗ Cooking error: {e}")

    # ─── Step 10: Generate final report ───
    print("\n[Step 10] Generating Phase 6 validation report...")

    total_ps = sum(v["player_starts"] for v in validation_results.values())
    total_navmesh = sum(v["navmesh_ok"] for v in validation_results.values())
    total_spawns_ok = sum(v["spawn_points_ok"] for v in validation_results.values())
    total_geom_ok = sum(v["valid_geometry"] for v in validation_results.values())
    total_lighting_ok = sum(v["lighting_ok"] for v in validation_results.values())
    bindings_ok = sum(1 for v in binding_results.values() if v["binding_ok"])
    uassets_ok = sum(1 for v in uasset_results.values() if v["exists"] and v["size_bytes"] > 0)
    packages_correct = sum(1 for v in level_file_results.values() if v["package_correct"])
    load_times_ok = sum(1 for t in load_times.values() if t < 30)

    all_pass = (
        total_geom_ok == 4 and
        total_spawns_ok == 4 and
        total_navmesh == 4 and
        total_lighting_ok == 4 and
        bindings_ok == 13 and
        uassets_ok == 13 and
        packages_correct == 4 and
        load_times_ok == 4
    )

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "phase": "Phase 6: Validation (Kilo + Pool)",
        "engine": "UE 5.8.2",
        "project": "WorldEngine",
        "overall_status": "PASS" if all_pass else "NEEDS_ATTENTION",
        "results": {
            "level_validation": validation_results,
            "level_files": level_file_results,
            "dataasset_bindings": binding_results,
            "uasset_files": uasset_results,
            "load_times": load_times,
            "cooking": cooking_results,
        },
        "summary": {
            "levels_total": 4,
            "levels_valid_geometry": total_geom_ok,
            "levels_spawn_points_ok": total_spawns_ok,
            "levels_navmesh_ok": total_navmesh,
            "levels_lighting_ok": total_lighting_ok,
            "total_player_starts": total_ps,
            "total_navmesh_volumes": total_navmesh,
            "dataassets_total": 13,
            "dataassets_binding_ok": bindings_ok,
            "uassets_on_disk": uassets_ok,
            "level_packages_correct": packages_correct,
            "load_times_ok": f"{load_times_ok}/4",
            "max_load_time_seconds": max(load_times.values()) if load_times else 0,
            "cooking_exit_code": cooking_results.get("exit_code", "N/A"),
            "cooking_has_errors": cooking_results.get("has_errors", True),
            "elapsed_total_seconds": round(time.time() - overall_start, 2),
        },
    }

    report_path = os.path.join(SAVED_DIR, "Phase6ValidationReport.json")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)

    # Print summary
    print("\n" + "=" * 70)
    print("PHASE 6 VALIDATION REPORT")
    print("=" * 70)
    s = report["summary"]
    print(f"  Levels with valid geometry:    {s['levels_valid_geometry']}/4")
    print(f"  Levels with ≥10 PlayerStarts:  {s['levels_spawn_points_ok']}/4 (total: {s['total_player_starts']})")
    print(f"  Levels with NavMesh:           {s['levels_navmesh_ok']}/4")
    print(f"  Levels with valid lighting:    {s['levels_lighting_ok']}/4")
    print(f"  .umap packages correct:        {s['level_packages_correct']}/4")
    print(f"  DataAssets binding OK:         {s['dataassets_binding_ok']}/{s['dataassets_total']}")
    print(f"  .uasset files on disk:         {s['uassets_on_disk']}/13")
    print(f"  Load times <30s:               {s['load_times_ok']}/4")
    print(f"  Max load time:                 {s['max_load_time_seconds']:.3f}s")
    print(f"  Cooking exit code:             {s['cooking_exit_code']}")
    print(f"  Cooking has errors:            {s['cooking_has_errors']}")
    print(f"  Total elapsed:                 {s['elapsed_total_seconds']}s")
    print("=" * 70)
    print(f"  Overall: {'✓ PASS' if all_pass else '✗ NEEDS ATTENTION'}")
    print("=" * 70)
    print(f"\n  Report saved to: {report_path}")

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
