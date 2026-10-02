#!/usr/bin/env python3
"""Validate a nlt.state-feed.v1 document against the schema contract.

Usage:
    python3 tools/validate_state_feed.py world-engine-godot/fixtures/state-feed.sample.json
    python3 tools/validate_state_feed.py --stdin        # read one JSON doc from stdin

Fails loudly on a missing required key. A silently-defaulted `needs` map would
make burnout undetectable, because burnout is a conjunction over all five needs.
Unknown keys are ignored: the schema is closed, not open.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "nlt.state-feed.v1"

NEEDS = ("quiet", "rest", "social", "stimulation")
LEVELS = (
    "attentionEnergy",
    "stressLevel",
    "confidence",
    "cognitiveLoad",
    "independenceScore",
    "supportNeedLevel",
)
NAMED_STATES = {
    "settled",
    "drifting",
    "resisting",
    "hyperfocus",
    "overwhelmed",
    "recovering",
    "coached",
}
AGENT_KEYS = (
    "id",
    "name",
    "role",
    "scene",
    "position",
    "velocity",
    "levels",
    "needs",
    "state",
    "currentTask",
    "burnout",
)
EVENT_KINDS = {
    "scene_enter",
    "scene_exit",
    "task_start",
    "task_complete",
    "task_failed",
    "struggle_detected",
    "aide_intervention",
    "strategy_internalised",
    "self_recognition",
    "burnout_entered",
    "burnout_recovered",
    "fusion_ready",
}


class Errors(list):
    def check(self, cond: bool, msg: str) -> None:
        if not cond:
            self.append(msg)


class Warnings(list):
    """Non-fatal. Forward-compatible: Fusion may legitimately add needs later,
    but a need that UE could never hold (see contract 4.3) is worth surfacing."""


def validate(doc: Any) -> tuple[Errors, Warnings]:
    err = Errors()
    warn = Warnings()
    err.check(isinstance(doc, dict), "top level must be an object")
    if not isinstance(doc, dict):
        return err, warn

    err.check(doc.get("schemaVersion") == SCHEMA_VERSION,
              f"schemaVersion must be {SCHEMA_VERSION!r}, got {doc.get('schemaVersion')!r}")
    err.check(isinstance(doc.get("tick"), int), "tick must be an integer")

    scene = doc.get("scene")
    err.check(isinstance(scene, dict), "scene must be an object")
    if isinstance(scene, dict):
        err.check(scene.get("kind") in ("open_world", "interior"),
                  f"scene.kind must be open_world|interior, got {scene.get('kind')!r}")

    tick = doc.get("tick") or 0
    agents = doc.get("agents")
    err.check(isinstance(agents, list), "agents must be an array")
    scene_id = scene.get("id") if isinstance(scene, dict) else None

    if isinstance(agents, list):
        # Empty only during a transition; see contract section 9.
        err.check(len(agents) > 0, "agents is empty — permitted only during a scene transition")
        ids: set[str] = set()
        for i, a in enumerate(agents):
            where = f"agents[{i}]"
            if not isinstance(a, dict):
                err.append(f"{where} must be an object")
                continue
            for k in AGENT_KEYS:
                err.check(k in a, f"{where} missing required key {k!r}")
            aid = a.get("id")
            err.check(isinstance(aid, str) and aid != "", f"{where}.id must be a non-empty string")
            if aid in ids:
                err.append(f"{where}.id duplicates {aid!r}")
            ids.add(aid)

            # velocity is required: walk animation cannot be derived from position alone.
            for vec in ("position", "velocity"):
                v = a.get(vec)
                err.check(isinstance(v, dict) and all(k in v for k in "xyz"),
                          f"{where}.{vec} must have x, y and z")

            for lvl in LEVELS:
                val = a.get("levels", {}).get(lvl)
                err.check(isinstance(val, (int, float)) and 0.0 <= val <= 1.0,
                          f"{where}.levels.{lvl} must be a number in 0..1, got {val!r}")

            needs = a.get("needs")
            if not isinstance(needs, dict):
                err.append(f"{where}.needs must be an object")
            else:
                for n in NEEDS:
                    val = needs.get(n)
                    err.check(isinstance(val, (int, float)) and 0.0 <= val <= 1.0,
                              f"{where}.needs.{n} must be a number in 0..1, got {val!r}")
                for extra in sorted(set(needs) - set(NEEDS)):
                    warn.append(
                        f"{where}.needs has non-agent-need key {extra!r} — UE's "
                        f"FNLTScenarioNeedsFragment holds only {', '.join(NEEDS)}; "
                        f"privacy is a location affordance axis, not an agent need "
                        f"(contract 4.3)"
                    )

            err.check(a.get("state") in NAMED_STATES,
                      f"{where}.state {a.get('state')!r} not in {sorted(NAMED_STATES)}")
            err.check(a.get("role") in ("avatar", "aide", "advocate"),
                      f"{where}.role must be avatar|aide|advocate, got {a.get('role')!r}")
            err.check(a.get("scene") == scene_id,
                      f"{where}.scene {a.get('scene')!r} disagrees with envelope scene.id {scene_id!r}")
            err.check(isinstance(a.get("burnout"), bool), f"{where}.burnout must be a boolean")

        for p in doc.get("pairs") or []:
            for role in ("avatarId", "aideId"):
                pid = p.get(role)
                err.check(pid in ids, f"pairs[].{role} {pid!r} does not match any agent id")

    for i, ep in enumerate(doc.get("burnoutEpisodes") or []):
        where = f"burnoutEpisodes[{i}]"
        err.check(ep.get("startTick") is not None, f"{where}.startTick required")
        sev = ep.get("severity")
        err.check(isinstance(sev, (int, float)) and 0.0 <= sev <= 1.0,
                  f"{where}.severity must be a number in 0..1")
        rt = ep.get("recoveredTick")
        if rt is not None:
            err.check(isinstance(rt, int) and rt >= ep.get("startTick", 0),
                      f"{where}.recoveredTick must be >= startTick")
            err.check(ep.get("recoveryMode") in ("solo", "rt"),
                      f"{where}.recoveryMode must be solo|rt when recovered")
        else:
            # Open episode: recoveryMode must be absent, not null.
            err.check("recoveryMode" not in ep,
                      f"{where} is open but carries recoveryMode; omit the field instead")

    for i, sr in enumerate(doc.get("selfRecognitions") or []):
        where = f"selfRecognitions[{i}]"
        err.check(sr.get("tick") is not None, f"{where}.tick required")
        err.check(isinstance(sr.get("actedOn"), bool), f"{where}.actedOn must be a boolean")
        err.check(sr.get("ledTo") in ("prevented", "delayed", "ignored"),
                  f"{where}.ledTo must be prevented|delayed|ignored")

    for i, ev in enumerate(doc.get("events") or []):
        where = f"events[{i}]"
        err.check(ev.get("kind") in EVENT_KINDS, f"{where}.kind {ev.get('kind')!r} unknown")
        err.check(isinstance(ev.get("text"), str) and ev.get("text", "").strip() != "",
                  f"{where}.text required and must be non-empty — a feed emitting only "
                  f"kind has failed this contract")
        t = ev.get("tick")
        err.check(isinstance(t, int) and t <= tick, f"{where}.tick must be <= envelope tick {tick}")

    return err, warn


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", help="path to a state-feed JSON document")
    ap.add_argument("--stdin", action="store_true", help="read one JSON document from stdin")
    args = ap.parse_args()

    if args.stdin:
        raw = sys.stdin.read()
        origin = "<stdin>"
    elif args.path:
        p = Path(args.path)
        if not p.is_file():
            print(f"FAIL: no such file: {p}", file=sys.stderr)
            return 2
        raw = p.read_text(encoding="utf-8")
        origin = str(p)
    else:
        ap.error("provide a path or --stdin")

    try:
        doc = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"FAIL: {origin}: not valid JSON: {exc}", file=sys.stderr)
        return 2

    errs, warns = validate(doc)
    for w in warns:
        print(f"WARN: {w}", file=sys.stderr)
    if errs:
        print(f"FAIL: {origin}: {len(errs)} problem(s)", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1

    n = len(doc.get("agents") or [])
    suffix = f", {len(warns)} warning(s)" if warns else ""
    print(f"OK: {origin} — {SCHEMA_VERSION}, tick {doc['tick']}, {n} agent(s), "
          f"{len(doc.get('events') or [])} event(s){suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())