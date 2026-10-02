#!/usr/bin/env python3
"""
Comprehensive Phase 6 MCP client.
Handles session refresh automatically and makes all MCP calls.
"""
import json
import urllib.request
import time

MCP_URL = "http://127.0.0.1:8001/mcp"
_session_id = None
_call_count = 0


def init_session():
    """Initialize a new MCP session."""
    global _session_id
    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "initialize",
        "id": 1,
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {"sampling": {}, "roots": {}},
            "clientInfo": {"name": "pool", "version": "1.0"}
        }
    }).encode()
    req = urllib.request.Request(
        MCP_URL, data=payload,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req, timeout=15)
    _session_id = resp.headers.get("Mcp-Session-Id", "")
    print("  New session: {}".format(_session_id))
    # Send initialized notification
    notif = json.dumps({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    }).encode()
    notif_req = urllib.request.Request(
        MCP_URL, data=notif,
        headers={"Content-Type": "application/json", "Mcp-Session-Id": _session_id}
    )
    try:
        urllib.request.urlopen(notif_req, timeout=5)
    except:
        pass


def mcp_call(toolset, tool_name, args, retry_on_expired=True):
    """Make an MCP tool call, refreshing session if needed."""
    global _call_count
    _call_count += 1

    payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "tools/call",
        "id": _call_count,
        "params": {
            "name": "call_tool",
            "arguments": {
                "toolset_name": toolset,
                "tool_name": tool_name,
                "arguments": args if isinstance(args, dict) else json.loads(args)
            }
        }
    }).encode()

    for attempt in range(2):
        headers = {"Content-Type": "application/json"}
        if _session_id:
            headers["Mcp-Session-Id"] = _session_id

        req = urllib.request.Request(MCP_URL, data=payload, headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            result = json.loads(resp.read().decode())
            if "error" in result:
                # Session might have expired
                if retry_on_expired and attempt == 0:
                    print("  Session expired, re-initializing...")
                    init_session()
                    headers["Mcp-Session-Id"] = _session_id
                    req = urllib.request.Request(MCP_URL, data=payload, headers=headers)
                    resp = urllib.request.urlopen(req, timeout=30)
                    result = json.loads(resp.read().decode())
                else:
                    return {"error": result.get("error", {}).get("message", "Unknown error")}
            
            if "result" in result and result["result"].get("content"):
                text = result["result"]["content"][0]["text"]
                try:
                    return json.loads(text)
                except:
                    return {"raw": text}
            return result
        except urllib.error.URLError as e:
            if retry_on_expired and attempt == 0:
                print("  Connection error, re-initializing...")
                init_session()
            else:
                return {"error": str(e)}

    return {"error": "Max retries exceeded"}


def get_retval(result):
    """Extract returnValue from result."""
    if isinstance(result, dict):
        if "returnValue" in result:
            return result["returnValue"]
    return result


# ─══━ Main workflow ──────────────────────────────────────────────────────
def main():
    init_session()
    print("MCP session initialized successfully!\n")

    results = {
        "level_duplication": {},
        "level_actors": {},
        "dataasset_properties": [],
        "binding_validation": [],
        "level_validation": {},
        "load_time": {},
        "asset_save": {},
        "summary": {},
    }

    ASSETS = [
        ("workplace_email_processing", "Email Processing", "Workplace",
         "/Game/Scenarios/Workplace/Wor_EmailProcessing.Wor_EmailProcessing",
         "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level", 45.0, "Medium", 0.3, 0.6, 0.7, True),
        ("workplace_report_writing", "Report Writing", "Workplace",
         "/Game/Scenarios/Workplace/Wor_ReportWriting.Wor_ReportWriting",
         "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level", 120.0, "High", 0.6, 0.9, 0.6, True),
        ("workplace_meeting_participation", "Meeting Participation", "Workplace",
         "/Game/Scenarios/Workplace/Wor_MeetingParticipation.Wor_MeetingParticipation",
         "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level", 60.0, "Medium", 0.4, 0.5, 0.75, False),
        ("workplace_code_review", "Code Review", "Workplace",
         "/Game/Scenarios/Workplace/Wor_CodeReview.Wor_CodeReview",
         "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level", 90.0, "High", 0.5, 0.8, 0.65, True),
        ("workplace_deadline_crunch", "Deadline Crunch", "Workplace",
         "/Game/Scenarios/Workplace/Wor_DeadlineCrunch.Wor_DeadlineCrunch",
         "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level", 180.0, "High", 0.9, 0.95, 0.5, True),
        ("personal_household_cleaning", "Household Cleaning", "Personal",
         "/Game/Scenarios/Personal/Per_HouseholdCleaning.Per_HouseholdCleaning",
         "/Game/Scenarios/Levels/Personal_Level.Personal_Level", 60.0, "Low", 0.4, 0.2, 0.85, False),
        ("personal_grocery_shopping", "Grocery Shopping", "Personal",
         "/Game/Scenarios/Personal/Per_GroceryShopping.Per_GroceryShopping",
         "/Game/Scenarios/Levels/Personal_Level.Personal_Level", 45.0, "Medium", 0.3, 0.4, 0.8, False),
        ("personal_bill_paying", "Bill Paying", "Personal",
         "/Game/Scenarios/Personal/Per_BillPaying.Per_BillPaying",
         "/Game/Scenarios/Levels/Personal_Level.Personal_Level", 20.0, "Low", 0.5, 0.6, 0.9, False),
        ("personal_morning_routine", "Morning Routine", "Personal",
         "/Game/Scenarios/Personal/Per_MorningRoutine.Per_MorningRoutine",
         "/Game/Scenarios/Levels/Personal_Level.Personal_Level", 30.0, "Low", 0.1, 0.3, 0.95, False),
        ("social_phone_conversation", "Phone Conversation", "Social",
         "/Game/Scenarios/Social/Soc_PhoneConversation.Soc_PhoneConversation",
         "/Game/Scenarios/Levels/Social_Level.Social_Level", 15.0, "Low", 0.7, 0.6, 0.7, False),
        ("social_event", "Social Event", "Social",
         "/Game/Scenarios/Social/Soc_SocialEvent.Soc_SocialEvent",
         "/Game/Scenarios/Levels/Social_Level.Social_Level", 120.0, "High", 0.85, 0.5, 0.6, True),
        ("academic_study_session", "Study Session", "Academic",
         "/Game/Scenarios/Academic/Aca_StudySession.Aca_StudySession",
         "/Game/Scenarios/Levels/Academic_Level.Academic_Level", 90.0, "Medium", 0.4, 0.8, 0.75, True),
        ("academic_project_work", "Project Work", "Academic",
         "/Game/Scenarios/Academic/Aca_ProjectWork.Aca_ProjectWork",
         "/Game/Scenarios/Levels/Academic_Level.Academic_Level", 150.0, "High", 0.5, 0.9, 0.65, True),
    ]

    LEVELS = [
        ("Workplace_Level", "/Game/Scenarios/Levels/Workplace_Level"),
        ("Personal_Level", "/Game/Scenarios/Levels/Personal_Level"),
        ("Social_Level", "/Game/Scenarios/Levels/Social_Level"),
        ("Academic_Level", "/Game/Scenarios/Levels/Academic_Level"),
    ]

    # ─══━ Step 1: Verify Workplace_Level exists ─────────────────────────────
    print("Step 1: Verify Workplace_Level exists")
    wp_exists = get_retval(mcp_call(
        "editor_toolset.toolsets.asset.AssetTools", "exists",
        {"path": "/Game/Scenarios/Levels/Workplace_Level"}
    ))
    print("  Workplace_Level exists: {}".format(wp_exists))

    # ─══━ Step 2: Duplicate for Personal, Social, Academic ───────────────────
    print("\nStep 2: Duplicating levels")
    source = "/Game/Scenarios/Levels/Workplace_Level"
    for level_name in ["Personal_Level", "Social_Level", "Academic_Level"]:
        target = "/Game/Scenarios/Levels/" + level_name
        exists = get_retval(mcp_call(
            "editor_toolset.toolsets.asset.AssetTools", "exists",
            {"path": target}
        ))
        if not exists:
            dup_result = mcp_call(
                "editor_toolset.toolsets.asset.AssetTools", "duplicate",
                {"path": source, "new_path": target}
            )
            r = get_retval(dup_result)
            print("  Duplicated {}: {}".format(level_name, r))
            results["level_duplication"][level_name] = {"success": r, "from": source}
        else:
            print("  {} already exists".format(level_name))
            results["level_duplication"][level_name] = {"status": "exists"}

    time.sleep(2)

    # ─══━ Step 3: Load each level, add actors, save ──────────────────────────
    print("\nStep 3: Adding actors to levels")
    for level_name, level_path in LEVELS:
        print("  --- {} ---".format(level_name))
        lvl_r = {}

        # Load level
        load_r = mcp_call(
            "editor_toolset.toolsets.scene.SceneTools", "load_level",
            {"level_path": level_path}
        )
        level_loaded = get_retval(load_r)
        lvl_r["loaded"] = level_loaded
        print("    Loaded: {}".format(level_loaded))

        # Small delay for level to fully load
        time.sleep(1)

        # Find existing PlayerStarts
        ps_r = mcp_call(
            "editor_toolset.toolsets.scene.SceneTools", "find_actors",
            {"actor_type": "PlayerStart"}
        )
        ps_list = ps_r.get("returnValue", []) if isinstance(ps_r, dict) else []
        if isinstance(ps_list, str):
            ps_list = [ps_list]
        ps_count = len(ps_list) if isinstance(ps_list, list) else 0
        lvl_r["existing_player_starts"] = ps_count
        print("    Existing PlayerStarts: {}".format(ps_count))

        # Find existing NavMesh
        nav_r = mcp_call(
            "editor_toolset.toolsets.scene.SceneTools", "find_actors",
            {"actor_type": "NavMeshBoundsVolume"}
        )
        nav_list = nav_r.get("returnValue", []) if isinstance(nav_r, dict) else []
        if isinstance(nav_list, str):
            nav_list = [nav_list]
        nav_count = len(nav_list) if isinstance(nav_list, list) else 0
        lvl_r["existing_navmesh"] = nav_count
        print("    Existing NavMesh: {}".format(nav_count))

        # Add PlayerStarts (need >=10)
        needed = max(0, 10 - ps_count)
        added_ps = []
        if needed > 0:
            for i in range(needed):
                x = float((i % 5) * 200 - 400)
                y = float((i // 5) * 200 - 200)
                z = 100.0
                xform = {"LocationX": x, "LocationY": y, "LocationZ": z,
                         "RotationX": 0, "RotationY": 0, "RotationZ": 0,
                         "ScaleX": 1.0, "ScaleY": 1.0, "ScaleZ": 1.0}
                try:
                    add_r = mcp_call(
                        "editor_toolset.toolsets.scene.SceneTools", "add_to_scene_from_class",
                        {"actor_type": {"refPath": "/Script/Engine.PlayerStart"},
                         "name": "PlayerStart_{}".format(i),
                         "xform": xform}
                    )
                    added_ps.append("PlayerStart_{}".format(i))
                except Exception as e:
                    added_ps.append("PlayerStart_{}_FAIL:{}".format(i, str(e)))
        lvl_r["added_player_starts"] = added_ps
        print("    Added {} PlayerStarts".format(len(added_ps)))

        # Add NavMesh if missing
        if nav_count == 0:
            xform = {"LocationX": 0.0, "LocationY": 0.0, "LocationZ": 0.0,
                     "RotationX": 0, "RotationY": 0, "RotationZ": 0,
                     "ScaleX": 1.0, "ScaleY": 1.0, "ScaleZ": 1.0}
            try:
                add_nav = mcp_call(
                    "editor_toolset.toolsets.scene.SceneTools", "add_to_scene_from_class",
                    {"actor_type": {"refPath": "/Script/Engine.NavMeshBoundsVolume"},
                     "name": "NavMeshBoundsVolume_0",
                     "xform": xform,
                     "snap_to_ground": False}
                )
                lvl_r["navmesh_added"] = get_retval(add_nav)
                print("    Added NavMesh: {}".format(lvl_r["navmesh_added"]))
            except Exception as e:
                lvl_r["navmesh_error"] = str(e)
                print("    NavMesh error: {}".format(str(e)))
        else:
            lvl_r["navmesh_added"] = "already_present"

        # Save level
        asset_path = level_path + "." + level_name
        save_r = mcp_call(
            "editor_toolset.toolsets.asset.AssetTools", "save_assets",
            {"asset_paths": [asset_path]}
        )
        lvl_r["save_result"] = save_r
        print("    Saved: {}".format(str(save_r)[:100]))
        results["level_actors"][level_name] = lvl_r

    # ─══━ Step 4: Set DataAsset properties ──────────────────────────────────
    print("\nStep 4: Setting DataAsset properties")
    for scenario_id, display_name, category, asset_path, level_ref, dur, comp, av, cog, succ, sust in ASSETS:
        values = {
            "scenarioId": scenario_id,
            "displayName": display_name,
            "description": "Auto-generated scenario: " + display_name,
            "category": category,
            "durationMinutes": dur,
            "complexity": comp,
            "aversiveness": av,
            "cognitiveDemand": cog,
            "baseSuccessRate": succ,
            "bRequiresSustainedFocus": sust,
            "levelReference": level_ref,
        }
        try:
            set_r = mcp_call(
                "editor_toolset.toolsets.object.ObjectTools", "set_properties",
                {"instance": {"refPath": asset_path}, "values": json.dumps(values)}
            )
            success = get_retval(set_r)
            ok = success is True or (isinstance(success, str) and success.lower() == "true")
            results["dataasset_properties"].append({
                "scenario_id": scenario_id, "success": ok, "result": str(set_r)[:200]
            })
            print("  [{}] {}".format("OK" if ok else "FAIL", scenario_id))
        except Exception as e:
            results["dataasset_properties"].append({
                "scenario_id": scenario_id, "success": False, "error": str(e)
            })
            print("  [ERROR] {}: {}".format(scenario_id, str(e)))

    # ─══━ Step 5: Save all DataAssets ───────────────────────────────────────
    print("\nStep 5: Saving DataAssets")
    all_paths = [a[3] for a in ASSETS]
    save_r = mcp_call(
        "editor_toolset.toolsets.asset.AssetTools", "save_assets",
        {"asset_paths": all_paths}
    )
    results["asset_save"]["result"] = save_r
    results["asset_save"]["count"] = len(all_paths)
    print("  Saved {} DataAssets: {}".format(len(all_paths), str(save_r)[:200]))

    # ─══━ Step 6: Verify bindings ───────────────────────────────────────────
    print("\nStep 6: Verifying DataAsset -> Level bindings")
    binding_ok = 0
    for scenario_id, display_name, category, asset_path, level_ref, dur, comp, av, cog, succ, sust in ASSETS:
        props_r = mcp_call(
            "editor_toolset.toolsets.object.ObjectTools", "get_properties",
            {"instance": {"refPath": asset_path}, "properties": ["levelReference"]}
        )
        retval = get_retval(props_r)
        if retval:
            try:
                parsed = json.loads(retval) if isinstance(retval, str) else retval
                if isinstance(parsed, dict):
                    actual_ref = parsed.get("levelReference", "")
                    if isinstance(actual_ref, dict):
                        actual_ref = actual_ref.get("refPath", "")
                    matches = (actual_ref == level_ref)
                else:
                    matches = False
                    actual_ref = str(retval)
            except:
                matches = False
                actual_ref = str(retval)
            
            if matches:
                binding_ok += 1
            results["binding_validation"].append({
                "scenario_id": scenario_id,
                "level_reference": actual_ref,
                "expected": level_ref,
                "matches": matches,
                "valid": matches
            })
            print("  {} [{}] -> {}".format(scenario_id, "OK" if matches else "MISMATCH", actual_ref))
        else:
            results["binding_validation"].append({
                "scenario_id": scenario_id, "valid": False, "error": "No return value"
            })
            print("  {} [FAIL] No return".format(scenario_id))

    print("\n  Valid bindings: {}/{}".format(binding_ok, len(ASSETS)))

    # ─══━ Step 7: Final level validation ────────────────────────────────────
    print("\nStep 7: Final level validation")
    for level_name, level_path in LEVELS:
        print("  --- {} ---".format(level_name))
        lvl_r = {}

        exists_r = mcp_call(
            "editor_toolset.toolsets.asset.AssetTools", "exists",
            {"path": level_path}
        )
        lvl_r["exists"] = get_retval(exists_r)

        # Time the load
        start = time.time()
        load_r = mcp_call(
            "editor_toolset.toolsets.scene.SceneTools", "load_level",
            {"level_path": level_path}
        )
        elapsed = time.time() - start
        lvl_r["load_success"] = get_retval(load_r)
        lvl_r["load_time"] = round(elapsed, 3)
        lvl_r["within_target"] = elapsed < 30.0
        results["load_time"][level_name] = {
            "seconds": round(elapsed, 3),
            "within_target": elapsed < 30.0,
            "success": lvl_r["load_success"]
        }
        print("    Load: {} in {:.3f}s".format(lvl_r["load_success"], elapsed))

        if lvl_r["load_success"]:
            time.sleep(1)

            # Actor counts
            ps_r = mcp_call(
                "editor_toolset.toolsets.scene.SceneTools", "find_actors",
                {"actor_type": "PlayerStart"}
            )
            ps_list = ps_r.get("returnValue", []) if isinstance(ps_r, dict) else []
            if isinstance(ps_list, str):
                ps_list = [ps_list]
            ps_count = len(ps_list) if isinstance(ps_list, list) else 0
            lvl_r["player_start_count"] = ps_count
            lvl_r["spawn_points_ok"] = ps_count >= 10

            sm_r = mcp_call(
                "editor_toolset.toolsets.scene.SceneTools", "find_actors",
                {"actor_type": "StaticMeshActor"}
            )
            sm_list = sm_r.get("returnValue", []) if isinstance(sm_r, dict) else []
            if isinstance(sm_list, str):
                sm_list = [sm_list]
            sm_count = len(sm_list) if isinstance(sm_list, list) else 0
            lvl_r["static_mesh_count"] = sm_count
            lvl_r["geometry_ok"] = sm_count > 0

            nav_r = mcp_call(
                "editor_toolset.toolsets.scene.SceneTools", "find_actors",
                {"actor_type": "NavMeshBoundsVolume"}
            )
            nav_list = nav_r.get("returnValue", []) if isinstance(nav_r, dict) else []
            if isinstance(nav_list, str):
                nav_list = [nav_list]
            nav_count = len(nav_list) if isinstance(nav_list, list) else 0
            lvl_r["navmesh_count"] = nav_count
            lvl_r["navmesh_ok"] = nav_count > 0

            all_r = mcp_call(
                "editor_toolset.toolsets.scene.SceneTools", "find_actors",
                {}
            )
            all_list = all_r.get("returnValue", []) if isinstance(all_r, dict) else []
            if isinstance(all_list, str):
                all_list = [all_list]
            total = len(all_list) if isinstance(all_list, list) else 0
            lvl_r["total_actors"] = total

            lvl_r["lighting_types"] = []
            for lt in ["DirectionalLight", "SkyLight", "SkyAtmosphere",
                       "ExponentialHeightFog", "VolumetricCloud"]:
                lt_r = mcp_call(
                    "editor_toolset.toolsets.scene.SceneTools", "find_actors",
                    {"actor_type": lt}
                )
                lt_list = lt_r.get("returnValue", []) if isinstance(lt_r, dict) else []
                if isinstance(lt_list, str):
                    lt_list = [lt_list]
                lt_count = len(lt_list) if isinstance(lt_list, list) else 0
                if lt_count > 0:
                    lvl_r["lighting_types"].append("{}({})".format(lt, lt_count))

            lvl_r["valid"] = (lvl_r["spawn_points_ok"] and lvl_r["geometry_ok"]
                             and lvl_r["navmesh_ok"])
            lvl_r["errors"] = []
            if ps_count < 10:
                lvl_r["errors"].append("PlayerStarts: {} (need >=10)".format(ps_count))
            if sm_count == 0:
                lvl_r["errors"].append("No geometry")
            if nav_count == 0:
                lvl_r["errors"].append("No NavMesh")

            print("    PS={}, SM={}, Nav={}, Total={}, Lighting={}".format(
                ps_count, sm_count, nav_count, total, lvl_r.get("lighting_types", [])))

        results["level_validation"][level_name] = lvl_r

    # ─══━ Summary ───────────────────────────────────────────────────────────
    props_set = sum(1 for d in results["dataasset_properties"] if d.get("success"))
    r["summary"] = {
        "dataassets_properties_set": props_set,
        "valid_bindings": binding_ok,
        "total_dataassets": len(ASSETS),
        "levels_validated": len(results["level_validation"]),
        "load_times_seconds": {
            name: data.get("seconds", 0) for name, data in results.get("load_time", {}).items()
        },
        "levels_load_within_target": {
            name: data.get("within_target", False) for name, data in results.get("load_time", {}).items()
        },
    }

    print("\n" + "=" * 70)
    print("PHASE 6 SUMMARY")
    print("=" * 70)
    print("  DataAsset properties set: {}/13".format(props_set))
    print("  Valid bindings: {}/{}".format(binding_ok, len(ASSETS)))
    print("  Levels validated: {}".format(len(results["level_validation"])))
    for name, data in results.get("load_time", {}).items():
        print("  Load time {}: {:.3f}s ({})".format(
            name, data["seconds"], "PASS" if data["within_target"] else "FAIL"))

    # Output final results as JSON
    print("\n=== FINAL RESULTS JSON ===")
    print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()
