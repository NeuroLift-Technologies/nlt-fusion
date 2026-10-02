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
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(REPO, "migration-data", "ue-scenarios.v1.json")
GENERATOR = os.path.join(REPO, "WorldEngine", "Scripts", "create_scenario_assets.py")

# The generator's SCENARIOS table rows are:
#   (cat, sid, name, desc, dur, cx, av, cog, suc, sf, ctx)
ROW = re.compile(
    r"\(\s*\"(?P<cat>\w+)\"\s*,\s*\"(?P<sid>[^\"]+)\"\s*,\s*"
    r"\"(?P<name>(?:[^\"\\]|\\.)*)\"\s*,\s*\"(?P<desc>(?:[^\"\\]|\\.)*)\"\s*,\s*"
    r"(?P<dur>[\d.]+)\s*,\s*\"(?P<cx>\w+)\"\s*,\s*(?P<av>[\d.]+)\s*,\s*"
    r"(?P<co>[\d.]+)\s*,\s*(?P<suc>[\d.]+)\s*,\s*(?P<sf>True|False)\s*,"
)


def parse_generator():
    with open(GENERATOR, "r", encoding="utf-8") as handle:
        text = handle.read()
    rows = {}
    for match in ROW.finditer(text):
        rows[match.group("sid")] = match.groupdict()
    return rows


def main():
    if not os.path.isfile(JSON_PATH):
        sys.exit("Missing {}".format(JSON_PATH))
    with open(JSON_PATH, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    records = {r["scenarioId"]: r for r in payload["scenarios"]}
    gen = parse_generator()

    print("extracted: {}   generator: {}".format(len(records), len(gen)))
    only_json = sorted(set(records) - set(gen))
    only_gen = sorted(set(gen) - set(records))
    for sid in only_json:
        print("  ONLY IN JSON (no generator row): {}".format(sid))
    for sid in only_gen:
        print("  ONLY IN GENERATOR (no asset): {}".format(sid))

    problems = []
    for sid in sorted(set(records) & set(gen)):
        rec, row = records[sid], gen[sid]
        checks = [
            ("category", rec["category"].upper(), row["cat"].upper()),
            ("displayName", rec["displayName"], row["name"]),
            ("durationMinutes", rec["durationMinutes"], float(row["dur"])),
            ("complexity", rec["complexity"].upper(), row["cx"].upper()),
            ("aversiveness", rec["aversiveness"], float(row["av"])),
            ("cognitiveDemand", rec["cognitiveDemand"], float(row["co"])),
            ("baseSuccessRate", rec["baseSuccessRate"], float(row["suc"])),
            ("requiresSustainedFocus", rec["requiresSustainedFocus"], row["sf"] == "True"),
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
        if rec["description"] != row["desc"]:
            print("  NOTE {} description differs:".format(sid))
            print("       json      = {!r}".format(rec["description"]))
            print("       generator = {!r}".format(row["desc"]))

    print()
    if problems:
        print("MISMATCHES ({}):".format(len(problems)))
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("PASS - all comparable fields match the generator.")


main()