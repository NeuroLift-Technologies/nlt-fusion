#!/usr/bin/env python3
"""
Verify DataAsset -> Level bindings using MCP tools.
Gets LevelReference property from all 13 DataAssets and validates
that the referenced level exists.
"""
import json
import urllib.request
import os
import sys

SESSION_ID = "01a05fdb5eb176e2bfb3a18d0bd1028c"
MCP_URL = "http://127.0.0.1:8001/mcp"

def mcp_call(tool_name, arguments=None, toolset_name=None, request_id=1):
    """Make an MCP tools/call request and return the parsed result."""
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "id": request_id,
        "params": {"name": "call_tool", "arguments": {}}
    }
    if toolset_name:
        payload["params"]["arguments"]["toolset_name"] = toolset_name
    payload["params"]["arguments"]["tool_name"] = tool_name
    if arguments:
        payload["params"]["arguments"]["arguments"] = arguments

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        MCP_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Mcp-Session-Id": SESSION_ID
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
            if "error" in result:
                return {"error": result["error"]}
            content = result.get("result", {}).get("content", [{}])[0]
            text = content.get("text", "")
            try:
                return json.loads(text)
            except:
                return {"text": text}
    except Exception as e:
        return {"error": str(e)}

# All 13 DataAsset paths (based on actual .uasset file names on disk)
ASSETS = [
    ("workplace_email_processing", "Email Processing", "Workplace", "Workplace/Wor_EmailProcessing.Wor_EmailProcessing"),
    ("workplace_report_writing", "Report Writing", "Workplace", "Workplace/Wor_ReportWriting.Wor_ReportWriting"),
    ("workplace_meeting_participation", "Meeting Participation", "Workplace", "Workplace/Wor_MeetingParticipation.Wor_MeetingParticipation"),
    ("workplace_code_review", "Code Review", "Workplace", "Workplace/Wor_CodeReview.Wor_CodeReview"),
    ("workplace_deadline_crunch", "Deadline Crunch", "Workplace", "Workplace/Wor_DeadlineCrunch.Wor_DeadlineCrunch"),
    ("personal_household_cleaning", "Household Cleaning", "Personal", "Personal/Per_HouseholdCleaning.Per_HouseholdCleaning"),
    ("personal_grocery_shopping", "Grocery Shopping", "Personal", "Personal/Per_GroceryShopping.Per_GroceryShopping"),
    ("personal_bill_paying", "Bill Paying", "Personal", "Personal/Per_BillPaying.Per_BillPaying"),
    ("personal_morning_routine", "Morning Routine", "Personal", "Personal/Per_MorningRoutine.Per_MorningRoutine"),
    ("social_phone_conversation", "Phone Conversation", "Social", "Social/Soc_PhoneConversation.Soc_PhoneConversation"),
    ("social_event", "Social Event", "Social", "Social/Soc_SocialEvent.Soc_SocialEvent"),
    ("academic_study_session", "Study Session", "Academic", "Academic/Aca_StudySession.Aca_StudySession"),
    ("academic_project_work", "Project Work", "Academic", "Academic/Aca_ProjectWork.Aca_ProjectWork"),
]

# Also map scenario IDs to expected level references
EXPECTED_LEVEL_REFS = {
    "Workplace": "/Game/Scenarios/Levels/Workplace_Level.Workplace_Level",
    "Personal": "/Game/Scenarios/Levels/Personal_Level.Personal_Level",
    "Social": "/Game/Scenarios/Levels/Social_Level.Social_Level",
    "Academic": "/Game/Scenarios/Levels/Academic_Level.Academic_Level",
}

# Content directory for disk-level checks
CONTENT_DIR = "D:/nlt-repos/nlt-fusion/WorldEngine/Content"

results = {
    "dataasset_bindings": [],
    "level_files_exist": {},
}

print("=" * 70)
print("PHASE 6c: DataAsset -> Level Binding Validation")
print("=" * 70)

# Check if .umap files exist on disk first
for cat, level_ref in EXPECTED_LEVEL_REFS.items():
    level_name = level_ref.split("/")[-1].replace(".umap", "")
    # Check for .umap and .umap.udim
    umap_path = level_ref.replace("/Game/", CONTENT_DIR + "/").replace(".", "/") + ".umap"
    exists = os.path.exists(umap_path)
    results["level_files_exist"][level_name] = {
        "disk_path": umap_path,
        "exists": exists,
    }
    print(f"  Level file: {level_name} -> {umap_path} [{'EXISTS' if exists else 'MISSING'}]")

# Verify each DataAsset's properties
print("\n--- Verifying all 13 DataAssets ---")
for scenario_id, display_name, category, rel_path in ASSETS:
    full_path = f"/Game/Scenarios/{rel_path}"
    expected_level = EXPECTED_LEVEL_REFS[category]

    print(f"\n  [{scenario_id}] {display_name} ({category})")
    print(f"  Asset path: {full_path}")

    # Get properties from the DataAsset
    props = mcp_call(
        "get_properties",
        {"instance": {"refPath": full_path}, "properties": ["scenarioId", "displayName", "category", "durationMinutes", "complexity", "aversiveness", "cognitiveDemand", "baseSuccessRate", "bRequiresSustainedFocus", "levelReference"]},
        toolset_name="editor_toolset.toolsets.object.ObjectTools",
        request_id=hash(scenario_id) % 10000
    )

    if "error" in props:
        print(f"  ERROR: {props['error']}")
        results["dataasset_bindings"].append({
            "scenario_id": scenario_id,
            "error": props["error"],
            "valid": False
        })
        continue

    scenario_id_val = props.get("scenarioId", "")
    category_val = props.get("category", "")
    level_ref = props.get("levelReference", {})
    level_ref_path = level_ref.get("refPath", "") if isinstance(level_ref, dict) else str(level_ref)

    # Check if LevelReference matches expected
    level_matches = (level_ref_path == expected_level)
    level_resolves = False

    if level_ref_path:
        # Check if the level file exists on disk
        level_disk_path = level_ref_path.replace("/Game/", CONTENT_DIR + "/").replace(".", "/") + ".umap"
        level_resolves = os.path.exists(level_disk_path)

    result = {
        "scenario_id": scenario_id,
        "display_name": display_name,
        "category": category,
        "category_value": category_val,
        "asset_path": full_path,
        "level_reference_soft": level_ref_path,
        "expected_level_ref": expected_level,
        "level_ref_matches_expected": level_matches,
        "level_resolves_on_disk": level_resolves,
        "duration_minutes": props.get("durationMinutes", 0),
        "complexity": props.get("complexity", ""),
        "aversiveness": props.get("aversiveness", 0),
        "cognitive_demand": props.get("cognitiveDemand", 0),
        "base_success_rate": props.get("baseSuccessRate", 0),
        "requires_sustained_focus": props.get("bRequiresSustainedFocus", False),
        "valid": level_matches and level_resolves,
    }
    results["dataasset_bindings"].append(result)

    status = "✓ VALID" if result["valid"] else "✗ INVALID"
    print(f"  LevelReference: {level_ref_path}")
    print(f"  Expected:      {expected_level}")
    print(f"  Match: {level_matches}, Resolves on disk: {level_resolves}")
    print(f"  Result: {status}")

# Summary
print("\n" + "=" * 70)
print("BINDING VALIDATION SUMMARY")
print("=" * 70)
valid_count = sum(1 for r in results["dataasset_bindings"] if r.get("valid"))
total = len(results["dataasset_bindings"])
print(f"  Valid bindings: {valid_count}/{total}")
if valid_count < total:
    for r in results["dataasset_bindings"]:
        if not r.get("valid"):
            print(f"  INVALID: {r['scenario_id']} - {r.get('error', 'LevelReference mismatch')}")

# Check all level files exist
all_levels_exist = all(r["exists"] for r in results["level_files_exist"].values())
print(f"\n  All 4 level files exist on disk: {all_levels_exist}")
for level_name, data in results["level_files_exist"].items():
    print(f"    {level_name}: {'EXISTS' if data['exists'] else 'MISSING'} ({data['disk_path']})")

# Save results
output_path = "D:/nlt-repos/nlt-fusion/WorldEngine/Saved/Phase6BindingValidation.json"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
with open(output_path, "w") as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nResults saved to: {output_path}")
