#!/usr/bin/env python3
"""
Cross-check migration-data/ue-scenarios.v1.json against the generator source.

The JSON is extracted from the .uasset; WorldEngine/Scripts/create_scenario_assets.py
is the script that claims to have written those assets. They are independent sources,
so comparing them catches two distinct classes of problem:

  1. An extraction bug  - value in JSON that does not match what was written.
  2. Provenance drift   - value in JSON that does not match what the generator intended,
                          i.e. the on-disk assets were produced by something else.

Run: python3 tools/verify_scenario_extraction.py
Exits non-zero on any mismatch.
"""
import ast
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(REPO, "migration-data", "ue-scenarios.v1.json")
GENERATOR = os.path.join(REPO, "WorldEngine", "Scripts", "create_scenario_assets.py")

# The generator's SCENARIOS table rows are tuples:
#   (cat, sid, name, desc, dur, cx, av, cog, suc, sf, ctx)
#
# Parsed with ast rather than a regex. A regex has to re-implement Python literal
# parsing for nested dicts and lists (e.g. pers_4's
# {"components": ["shower", "breakfast", "getting_ready"], ...}); literal_eval hands
# back the real objects, so ctx values stringify identically to the way the extractor
# stringifies them and nested structures compare correctly.
ROW_FIELDS = [
    "category", "scenarioId", "displayName", "description", "durationMinutes",
    "complexity", "aversiveness", "cognitiveDemand", "baseSuccessRate",
    "requiresSustainedFocus", "contextParams",
]


def parse_generator():
    """Return {scenarioId: {field: value}} from the generator's SCENARIOS table."""
    with open(GENERATOR, "r", encoding="utf-8") as handle:
        tree = ast.parse(handle.read())

    scenarios_node = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            getattr(target, "id", None) == "SCENARIOS" for target in node.targets
        ):
            scenarios_node = node.value
            break
    if scenarios_node is None:
        raise RuntimeError("Could not find the SCENARIOS table in {}".format(GENERATOR))

    rows = {}
    for entry in ast.literal_eval(scenarios_node):
        if len(entry) != len(ROW_FIELDS):
            raise RuntimeError(
                "Generator row has {} fields, expected {}: {!r}".format(
                    len(entry), len(ROW_FIELDS), entry[:2]
                )
            )
        row = dict(zip(ROW_FIELDS, entry))
        rows[row["scenarioId"]] = row
    return rows


def normalise_context(ctx):
    """Match the extractor's stringification exactly (see build_record)."""
    return {str(k): str(v) for k, v in ctx.items()}


def main():
    if not os.path.isfile(JSON_PATH):
        sys.exit("Missing {}".format(JSON_PATH))
    with open(JSON_PATH, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    problems = []

    # Reject duplicates BEFORE building the dict. Silently collapsing them would let a
    # catalog with, say, 13 rows but only 12 distinct ids pass with a PASS verdict.
    id_list = [r["scenarioId"] for r in payload["scenarios"]]
    duplicates = sorted({sid for sid in id_list if id_list.count(sid) > 1})
    if duplicates:
        sys.exit("Duplicate scenarioId values in the extracted catalog: {}".format(duplicates))

    records = {r["scenarioId"]: r for r in payload["scenarios"]}
    gen = parse_generator()

    print("extracted: {}   generator: {}".format(len(records), len(gen)))

    only_json = sorted(set(records) - set(gen))
    only_gen = sorted(set(gen) - set(records))
    for sid in only_json:
        problems.append("ONLY IN JSON (no generator row): {}".format(sid))
    for sid in only_gen:
        problems.append("ONLY IN GENERATOR (no asset): {}".format(sid))

    for sid in sorted(set(records) & set(gen)):
        rec, row = records[sid], gen[sid]
        checks = [
            ("category", rec["category"].upper(), row["category"].upper()),
            ("displayName", rec["displayName"], row["displayName"]),
            ("durationMinutes", rec["durationMinutes"], float(row["durationMinutes"])),
            ("complexity", rec["complexity"].upper(), row["complexity"].upper()),
            ("aversiveness", rec["aversiveness"], float(row["aversiveness"])),
            ("cognitiveDemand", rec["cognitiveDemand"], float(row["cognitiveDemand"])),
            ("baseSuccessRate", rec["baseSuccessRate"], float(row["baseSuccessRate"])),
            ("requiresSustainedFocus", rec["requiresSustainedFocus"],
             bool(row["requiresSustainedFocus"])),
            ("contextParams", rec["contextParams"], normalise_context(row["contextParams"])),
        ]
        for field, got, want in checks:
            if isinstance(got, float) and isinstance(want, float):
                ok = abs(got - want) < 1e-6
            else:
                ok = got == want
            if not ok:
                problems.append("{}.{}: json={!r} generator={!r}".format(sid, field, got, want))
        # Description is reported but not asserted: the on-disk assets use
        # "Auto-generated scenario: <name>", which differs from the generator text.
        if rec["description"] != row["description"]:
            print("  NOTE {} description differs:".format(sid))
            print("       json      = {!r}".format(rec["description"]))
            print("       generator = {!r}".format(row["description"]))

    print()
    if problems:
        print("MISMATCHES ({}):".format(len(problems)))
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("PASS - all comparable fields match the generator.")


main()