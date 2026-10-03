#!/usr/bin/env python3
"""Author the multi-frame state-feed replay fixtures used by the Phase D observer.

Why this exists
---------------
Phase D.2 (Learning Timeline) and D.4 (pause / step / replay / adjustable speed) need a
*history*. `fixtures/state-feed.sample.json` is one snapshot, so it can show a state but not a
run. A.5 already licenses the answer: *"static JSON standing in for Python, so the whole chain
works before the bridge exists."*

The output bundles wrap complete `nlt.state-feed.v1` documents — one per frame, each valid on its
own. Nothing is derived at runtime by the renderer: the frames the observer displays were written
here, at authoring time, and are validated by the same rules the runtime enforces.

Two bundles are produced:

  fixtures/replay/stayalert-day.json   ticks 600-1187, four-state arc. Its final frame is
                                       content-equivalent to state-feed.sample.json, so the two
                                       fixtures describe one continuous history rather than two
                                       unrelated stories.
  fixtures/replay/collapse-only.json   ticks 200-380, three unresolved episodes. Exists so the
                                       "collapsed repeatedly" reading (D.5) is reachable; the
                                       StayAlert bundle never triggers it.

Usage:
    python3 tools/make_replay_fixture.py
    python3 tools/make_replay_fixture.py --check     # verify committed output is up to date
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "world-engine-godot" / "fixtures" / "replay"
SAMPLE = REPO / "world-engine-godot" / "fixtures" / "state-feed.sample.json"

REPLAY_VERSION = "nlt.state-feed.replay.v1"

AVATAR_ID = "avatar_01"
AIDE_ID = "aide_01"
SCENE_ID = "personal_1"
SCENE_KIND = "interior"

# The window of recent events a frame carries. Each frame is a feed document as a spectator would
# receive it, not an archive: 150 ticks at the contract's ~1 Hz is the recent past, while
# burnoutEpisodes[] and selfRecognitions[] are cumulative history and are always complete.
EVENT_WINDOW_TICKS = 150

SIM_START = datetime(2026, 10, 2, 7, 30, 0, tzinfo=timezone.utc)


# --------------------------------------------------------------------------------------- helpers


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def r2(v: float) -> float:
    """Round a 0..1 scalar, clamped. Only for levels, needs, scores and severities."""
    return round(max(0.0, min(1.0, v)), 3)


def r3(v: float) -> float:
    """Round a world coordinate or velocity. NOT clamped.

    This exists because clamping unit scalars and clamping positions are different operations. Using
    r2 for a coordinate pins every agent inside a 1 m square at the origin, which is invisible in the
    generator and obvious in the observer: the agents never move, and their pins sit on top of each
    other. A negative velocity is impossible under a 0..1 clamp too.
    """
    return round(v, 3)


# Keys that must not be interpolated numerically. `stateSince` is a tick, not a quantity: blending
# it means an agent appears to have entered its state at a fractional tick, and clamping it to 0..1
# makes every agent look like it changed state on tick 1 — so "in this state for 709 seconds".
DISCRETE_KEYS = {"stateSince"}


def blend(before: dict, after: dict, t: float) -> dict:
    """Interpolate every numeric leaf; take non-numeric leaves from `before` until `after` lands.

    `stateSince` snaps at the start of the interval, which is how a state change actually behaves:
    the tick it began is fixed, and only the next keyframe can move it.
    """
    out = {}
    for key in set(before) | set(after):
        bv, av = before.get(key), after.get(key)
        if key in DISCRETE_KEYS:
            out[key] = copy.deepcopy(av if t >= 0.5 else bv)
        elif isinstance(bv, (int, float)) and isinstance(av, (int, float)) and not isinstance(bv, bool):
            out[key] = r2(lerp(float(bv), float(av), t))
        else:
            out[key] = copy.deepcopy(bv if t < 0.5 else av)
    return out


def at_keyframes(keys: list[dict], tick: int) -> dict:
    """Value of a keyframed channel at `tick`, smoothstepped between the two bracketing keys."""
    if tick <= keys[0]["tick"]:
        return strip_tick(keys[0])
    if tick >= keys[-1]["tick"]:
        return strip_tick(keys[-1])
    for a, b in zip(keys, keys[1:]):
        if a["tick"] <= tick <= b["tick"]:
            span = b["tick"] - a["tick"]
            return blend(strip_tick(a), strip_tick(b), smooth((tick - a["tick"]) / span))
    return strip_tick(keys[-1])


def strip_tick(key: dict) -> dict:
    return {k: v for k, v in key.items() if k != "tick"}


def lerp_point(a: list[float], b: list[float], t: float) -> list[float]:
    """Paths are authored as [x, z] in the scene's plane; the feed wants a full [x, y, z]."""
    return [r3(lerp(a[0], b[0], t)), 0.0, r3(lerp(a[1], b[1], t))]


def position_at(keys: list[dict], tick: int, speed_scale: float = 1.0) -> tuple[list[float], list[float]]:
    """Position plus a velocity vector. A parked keyframe reports zero velocity: a stationary
    agent must not animate, and velocity is what the renderer animates from (contract §4.4)."""
    pts = [(k["tick"], k["pos"]) for k in keys]
    if tick <= pts[0][0]:
        return lerp_point(pts[0][1], pts[0][1], 0.0), [0.0, 0.0, 0.0]
    if tick >= pts[-1][0]:
        return lerp_point(pts[-1][1], pts[-1][1], 0.0), [0.0, 0.0, 0.0]

    lo = hi = 0
    for i in range(len(pts) - 1):
        if pts[i][0] <= tick <= pts[i + 1][0]:
            lo, hi = i, i + 1
            break
    t0, p0 = pts[lo]
    t1, p1 = pts[hi]
    span = max(1, t1 - t0)
    t = (tick - t0) / span
    parked = keys[hi].get("parked", False)
    vel = [0.0, 0.0, 0.0]
    if not parked:
        # Metres per tick, signed. The contract's cadence is ~1 Hz (section 3), so one tick is about
        # one second and no conversion factor applies: dividing by the span is already m/s. The ×60
        # that used to be here assumed 60 Hz ticks and reported every resident as a sprinter.
        vel = [r3((p1[0] - p0[0]) / span * speed_scale),
               0.0,
               r3((p1[1] - p0[1]) / span * speed_scale)]
    return lerp_point(p0, p1, t), vel


def cumulative(rows: list[dict], tick: int, key: str = "startTick") -> list[dict]:
    """Rows whose key is at or before `tick`, newest first, matching the snapshot fixture's order."""
    return [copy.deepcopy(r) for r in sorted(rows, key=lambda r: r[key], reverse=True)
            if r[key] <= tick]


def windowed(rows: list[dict], tick: int) -> list[dict]:
    """Recent events only, oldest first, as a live feed would carry them."""
    lo = tick - EVENT_WINDOW_TICKS
    return [copy.deepcopy(r) for r in sorted(rows, key=lambda r: r["tick"])
            if lo <= r["tick"] <= tick]


def iso_at(tick: int, origin_tick: int) -> str:
    return (SIM_START + timedelta(seconds=tick - origin_tick)).strftime("%Y-%m-%dT%H:%M:%SZ")


def dims(*rows: tuple[str, float, bool]) -> dict:
    """Dimensions are authored as (score, passes) pairs; pair_block does the shaping."""
    return {name: (score, passes) for name, score, passes in rows}


def build_frames(story: dict) -> list[dict]:
    first_tick = story["avatar"][0]["tick"]
    last_tick = max(story["avatar"][-1]["tick"], story["aide"][-1]["tick"],
                    story["pair"][-1]["tick"])
    step = story.get("step", 10)
    origin = first_tick

    frames = []
    # Regular steps plus the final tick. The snapshot fixture lives at 1187 and 587 is prime, so no
    # integer step from 600 lands on it; the last frame must be that tick for the two fixtures to
    # describe the same history.
    ticks = list(range(first_tick, last_tick + 1, step))
    if ticks[-1] != last_tick:
        ticks.append(last_tick)
    for tick in ticks:
        av = at_keyframes(story["avatar"], tick)
        ai = at_keyframes(story["aide"], tick)
        pair = at_keyframes(story["pair"], tick)

        apos, avel = position_at(story["avatar_path"], tick)
        ipos, ivel = position_at(story["aide_path"], tick)

        # independenceScore is Fusion's value. It is per-pair in substance — the snapshot fixture
        # shows the same number on both agents — so both read from the same keyframed channel.
        independence = r2(pair["independence"])
        for a in (av, ai):
            a["levels"]["independenceScore"] = independence

        feed = {
            "schemaVersion": "nlt.state-feed.v1",
            "tick": tick,
            "simTimeIso": iso_at(tick, origin),
            "scene": {"id": SCENE_ID, "kind": SCENE_KIND},
            "agents": [
                agent(AVATAR_ID, "Jamie", "avatar", apos, avel, av),
                agent(AIDE_ID, "Focus Aide", "aide", ipos, ivel, ai),
            ],
            "pairs": [pair_block(pair)],
            "burnoutEpisodes": cumulative(story["episodes"], tick),
            "selfRecognitions": cumulative(story["recognitions"], tick, key="tick"),
            "events": windowed(story["events"], tick),
        }

        for a in feed["agents"]:
            interventions = [i for i, e in enumerate(feed["events"])
                             if e["kind"] == "aide_intervention"]
            a["supportIndex"] = interventions[-1] if interventions else -1

        frames.append(feed)
    return frames


def agent(aid: str, name: str, role: str, pos, vel, k: dict) -> dict:
    return {
        "id": aid,
        "name": name,
        "role": role,
        "scene": SCENE_ID,
        "position": {"x": pos[0], "y": pos[1], "z": pos[2]},
        "velocity": {"x": vel[0], "y": vel[1], "z": vel[2]},
        "appearance": {"body": f"{role}_{aid.split('_')[-1]}", "walkPhase": 0.0},
        "levels": dict(k["levels"]),
        "needs": dict(k["needs"]),
        "state": k["state"],
        # Ticks are integers on the wire. Keyframe blending produces floats, so this is the one
        # place the contract's integer requirement has to be reasserted.
        "stateSince": int(round(k["stateSince"])),
        "currentGoal": k["goal"],
        "currentTask": k["task"],
        "struggleSignals": list(k["signals"]),
        "learnedStrategies": list(k["strategies"]),
        "burnout": k["burnout"],
    }


def pair_block(k: dict) -> dict:
    return {
        "avatarId": AVATAR_ID,
        "aideId": AIDE_ID,
        "ready": k["ready"],
        "overallScore": k["overall"],
        "blockingDimensions": list(k["blocking"]),
        "dimensions": {name: {"score": s, "passes": p} for name, (s, p) in k["dimensions"].items()},
        "recommendations": list(k["recommendations"]),
    }


# -------------------------------------------------------------------------------- StayAlert day
#
# A working morning for Jamie and Focus Aide. The arc the observer is meant to make legible:
# drifting -> a burnout the Aide rescues -> a second burnout Jamie handles alone -> independence
# up across attempts. The two burnout episodes and three self-recognitions are exactly those in
# fixtures/state-feed.sample.json, so the bundle's last frame is that fixture.

STAYALERT = {
    "step": 10,
    "avatar_path": [
        {"tick": 600, "pos": [4.2, -1.8]},
        {"tick": 700, "pos": [-1.6, -3.2]},
        {"tick": 861, "pos": [1.2, -2.6]},
        {"tick": 934, "pos": [-1.2, -0.8]},
        {"tick": 1020, "pos": [4.2, -1.8], "parked": True},
        {"tick": 1102, "pos": [2.4, -3.0]},
        {"tick": 1187, "pos": [4.2, -1.8], "parked": True},
    ],
    "aide_path": [
        {"tick": 600, "pos": [5.1, -1.1]},
        {"tick": 700, "pos": [-0.7, -2.6]},
        {"tick": 861, "pos": [2.1, -1.9]},
        {"tick": 934, "pos": [-0.3, -0.2]},
        {"tick": 1020, "pos": [5.1, -1.1], "parked": True},
        {"tick": 1102, "pos": [3.3, -2.3]},
        {"tick": 1187, "pos": [5.1, -1.1], "parked": True},
    ],
    "avatar": [
        {"tick": 600, "state": "settled", "stateSince": 596, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": [], "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .52, "stressLevel": .34, "confidence": .48, "cognitiveLoad": .40,
                    "independenceScore": .34, "supportNeedLevel": .48},
         "needs": {"quiet": .62, "rest": .55, "social": .60, "stimulation": .58}},
        {"tick": 640, "state": "settled", "stateSince": 596, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": ["time_pressure"], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .48, "stressLevel": .40, "confidence": .44, "cognitiveLoad": .46,
                    "independenceScore": .35, "supportNeedLevel": .50},
         "needs": {"quiet": .58, "rest": .52, "social": .58, "stimulation": .60}},
        {"tick": 660, "state": "drifting", "stateSince": 646, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": ["sustained_attention_dip", "time_pressure"],
         "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .42, "stressLevel": .46, "confidence": .38, "cognitiveLoad": .56,
                    "independenceScore": .36, "supportNeedLevel": .54},
         "needs": {"quiet": .52, "rest": .48, "social": .56, "stimulation": .60}},
        {"tick": 700, "state": "resisting", "stateSince": 660, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": ["sustained_attention_dip", "task_drift"],
         "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .36, "stressLevel": .54, "confidence": .32, "cognitiveLoad": .68,
                    "independenceScore": .38, "supportNeedLevel": .58},
         "needs": {"quiet": .44, "rest": .40, "social": .50, "stimulation": .58}},
        {"tick": 780, "state": "resisting", "stateSince": 660, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": ["sustained_attention_dip", "task_drift",
                                                              "time_pressure"],
         "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .30, "stressLevel": .60, "confidence": .28, "cognitiveLoad": .74,
                    "independenceScore": .40, "supportNeedLevel": .64},
         "needs": {"quiet": .34, "rest": .30, "social": .44, "stimulation": .56}},
        {"tick": 861, "state": "overwhelmed", "stateSince": 861, "goal": "Get ready for the work meeting",
         "task": "Get dressed and eat something", "signals": ["sustained_attention_dip", "task_drift",
                                                              "overload"],
         "strategies": [], "burnout": True,
         "levels": {"attentionEnergy": .16, "stressLevel": .82, "confidence": .20, "cognitiveLoad": .88,
                    "independenceScore": .42, "supportNeedLevel": .72},
         "needs": {"quiet": .18, "rest": .14, "social": .30, "stimulation": .44}},
        {"tick": 900, "state": "coached", "stateSince": 866, "goal": "Get ready for the work meeting",
         "task": "Pack work items, one step at a time", "signals": ["overload"],
         "strategies": [], "burnout": True,
         "levels": {"attentionEnergy": .34, "stressLevel": .62, "confidence": .34, "cognitiveLoad": .74,
                    "independenceScore": .46, "supportNeedLevel": .60},
         "needs": {"quiet": .30, "rest": .26, "social": .40, "stimulation": .48}},
        {"tick": 934, "state": "recovering", "stateSince": 934, "goal": "Get ready for the work meeting",
         "task": "Finish the last packing step", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .48, "stressLevel": .46, "confidence": .46, "cognitiveLoad": .58,
                    "independenceScore": .50, "supportNeedLevel": .52},
         "needs": {"quiet": .44, "rest": .40, "social": .52, "stimulation": .54}},
        {"tick": 1020, "state": "settled", "stateSince": 960, "goal": "Get ready for the work meeting",
         "task": "Put the bag by the door", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .56, "stressLevel": .38, "confidence": .54, "cognitiveLoad": .46,
                    "independenceScore": .56, "supportNeedLevel": .44},
         "needs": {"quiet": .56, "rest": .52, "social": .58, "stimulation": .52}},
        {"tick": 1102, "state": "overwhelmed", "stateSince": 1102, "goal": "Get ready for the work meeting",
         "task": "Pack work items", "signals": ["sustained_attention_dip", "time_pressure"],
         "strategies": ["task_chunking"], "burnout": True,
         "levels": {"attentionEnergy": .14, "stressLevel": .86, "confidence": .18, "cognitiveLoad": .90,
                    "independenceScore": .58, "supportNeedLevel": .66},
         "needs": {"quiet": .16, "rest": .12, "social": .28, "stimulation": .42}},
        {"tick": 1140, "state": "recovering", "stateSince": 1186, "goal": "Get ready for the work meeting",
         "task": "Pack work items", "signals": ["sustained_attention_dip"],
         "strategies": ["task_chunking", "reset_prompt"], "burnout": False,
         "levels": {"attentionEnergy": .32, "stressLevel": .60, "confidence": .40, "cognitiveLoad": .70,
                    "independenceScore": .60, "supportNeedLevel": .52},
         "needs": {"quiet": .34, "rest": .30, "social": .44, "stimulation": .46}},
        {"tick": 1187, "state": "recovering", "stateSince": 1186, "goal": "Get ready for the work meeting",
         "task": "Pack work items", "signals": ["sustained_attention_dip", "time_pressure"],
         "strategies": ["body_doubling", "time_box_25", "reset_prompt"], "burnout": False,
         "levels": {"attentionEnergy": .44, "stressLevel": .38, "confidence": .61, "cognitiveLoad": .52,
                    "independenceScore": .63, "supportNeedLevel": .22},
         "needs": {"quiet": .71, "rest": .58, "social": .66, "stimulation": .52}},
    ],
    "aide": [
        {"tick": 600, "state": "settled", "stateSince": 596, "goal": None,
         "task": "Keep the morning moving without taking over", "signals": [], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .88, "stressLevel": .14, "confidence": .84, "cognitiveLoad": .18,
                    "independenceScore": .34, "supportNeedLevel": .34},
         "needs": {"quiet": .74, "rest": .70, "social": .66, "stimulation": .62}},
        {"tick": 861, "state": "coached", "stateSince": 866, "goal": None,
         "task": "Support Jamie's recovery without taking over", "signals": [], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .84, "stressLevel": .22, "confidence": .80, "cognitiveLoad": .26,
                    "independenceScore": .42, "supportNeedLevel": .42},
         "needs": {"quiet": .76, "rest": .72, "social": .64, "stimulation": .60}},
        {"tick": 934, "state": "coached", "stateSince": 866, "goal": None,
         "task": "Step back once Jamie is moving again", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .90, "stressLevel": .12, "confidence": .86, "cognitiveLoad": .16,
                    "independenceScore": .50, "supportNeedLevel": .36},
         "needs": {"quiet": .78, "rest": .74, "social": .68, "stimulation": .62}},
        {"tick": 1187, "state": "coached", "stateSince": 1183, "goal": None,
         "task": "Support Jamie's recovery without taking over", "signals": [],
         "strategies": ["task_chunking", "environmental_simplification"], "burnout": False,
         "levels": {"attentionEnergy": .91, "stressLevel": .08, "confidence": .88, "cognitiveLoad": .12,
                    "independenceScore": .63, "supportNeedLevel": .22},
         "needs": {"quiet": .82, "rest": .79, "social": .70, "stimulation": .64}},
    ],
    "pair": [
        {"tick": 600, "ready": False, "overall": .29, "independence": .34,
         "blocking": ["EXPERIENTIAL_DEPTH", "COACHING_EFFECTIVENESS", "INDEPENDENCE_LEVEL",
                      "EMOTIONAL_RESILIENCE", "STRATEGY_INTERNALISATION"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .18, False), ("COACHING_EFFECTIVENESS", .34, False),
                            ("INDEPENDENCE_LEVEL", .30, False), ("EMOTIONAL_RESILIENCE", .41, False),
                            ("STRATEGY_INTERNALISATION", .22, False), ("BURNOUT_MANAGEMENT", .52, True)),
         "recommendations": ["Need more experiences (current: 18%, target: 60%)",
                             "No strategy has been internalised yet"]},
        {"tick": 861, "ready": False, "overall": .42, "independence": .42,
         "blocking": ["EXPERIENTIAL_DEPTH", "INDEPENDENCE_LEVEL", "EMOTIONAL_RESILIENCE",
                      "STRATEGY_INTERNALISATION", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .31, False), ("COACHING_EFFECTIVENESS", .52, True),
                            ("INDEPENDENCE_LEVEL", .41, False), ("EMOTIONAL_RESILIENCE", .46, False),
                            ("STRATEGY_INTERNALISATION", .38, False), ("BURNOUT_MANAGEMENT", .34, False)),
         "recommendations": ["Need more experiences (current: 31%, target: 60%)",
                             "Jamie has not tried a strategy on their own yet"]},
        {"tick": 934, "ready": False, "overall": .51, "independence": .50,
         "blocking": ["EXPERIENTIAL_DEPTH", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .40, False), ("COACHING_EFFECTIVENESS", .63, True),
                            ("INDEPENDENCE_LEVEL", .50, True), ("EMOTIONAL_RESILIENCE", .55, True),
                            ("STRATEGY_INTERNALISATION", .55, True), ("BURNOUT_MANAGEMENT", .38, False)),
         "recommendations": ["Need more experiences (current: 40%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
        {"tick": 1102, "ready": False, "overall": .58, "independence": .58,
         "blocking": ["EXPERIENTIAL_DEPTH", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .47, False), ("COACHING_EFFECTIVENESS", .68, True),
                            ("INDEPENDENCE_LEVEL", .60, True), ("EMOTIONAL_RESILIENCE", .58, True),
                            ("STRATEGY_INTERNALISATION", .60, True), ("BURNOUT_MANAGEMENT", .44, False)),
         "recommendations": ["Need more experiences (current: 47%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
        {"tick": 1187, "ready": False, "overall": .638, "independence": .63,
         "blocking": ["EXPERIENTIAL_DEPTH", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .52, False), ("COACHING_EFFECTIVENESS", .71, True),
                            ("INDEPENDENCE_LEVEL", .67, True), ("EMOTIONAL_RESILIENCE", .64, True),
                            ("STRATEGY_INTERNALISATION", .66, True), ("BURNOUT_MANAGEMENT", .58, False)),
         "recommendations": ["Need more experiences (current: 52%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
    ],
    "episodes": [
        {"startTick": 1102, "severity": .35, "peakBelow": .34, "recoveredTick": 1187,
         "recoveryMode": "solo"},
        {"startTick": 861, "severity": .22, "peakBelow": .21, "recoveredTick": 934,
         "recoveryMode": "rrt"},
    ],
    "recognitions": [
        {"tick": 1098, "riskAtRecognition": .44, "actedOn": True, "ledTo": "prevented"},
        {"tick": 855, "riskAtRecognition": .38, "actedOn": True, "ledTo": "prevented"},
        {"tick": 640, "riskAtRecognition": .29, "actedOn": False, "ledTo": "ignored"},
    ],
    "events": [
        {"tick": 600, "agentId": AVATAR_ID, "kind": "scene_enter", "severity": "low",
         "text": "Jamie and Focus Aide arrived home for the morning routine."},
        {"tick": 612, "agentId": AVATAR_ID, "kind": "task_start", "severity": "low",
         "text": "Jamie started getting ready for work."},
        {"tick": 640, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "medium",
         "text": "Jamie noticed they were already behind schedule, and carried on anyway."},
        {"tick": 646, "agentId": AVATAR_ID, "kind": "struggle_detected", "severity": "medium",
         "text": "Jamie has been circling the same three things for a few minutes without starting."},
        {"tick": 700, "agentId": AVATAR_ID, "kind": "task_failed", "severity": "medium",
         "text": "The packing attempt ended when Jamie could not find the work bag."},
        {"tick": 855, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "medium",
         "text": "Jamie noticed their energy dropping and said so out loud before it got worse."},
        {"tick": 861, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "Three needs went under the line at once and Jamie stopped."},
        {"tick": 866, "agentId": AIDE_ID, "kind": "aide_intervention", "strategy": "task_chunking",
         "helped": True,
         "text": "Focus Aide broke the packing into three small steps instead of doing it for them."},
        {"tick": 934, "agentId": AVATAR_ID, "kind": "burnout_recovered", "severity": "low",
         "text": "Jamie's energy came back with Focus Aide's help, and the last step got done."},
        {"tick": 940, "agentId": AVATAR_ID, "kind": "strategy_internalised", "severity": "low",
         "text": "Jamie wrote the three steps down for next time."},
        {"tick": 960, "agentId": AVATAR_ID, "kind": "task_start", "severity": "low",
         "text": "Jamie started packing work items."},
        {"tick": 1020, "agentId": AVATAR_ID, "kind": "task_complete", "severity": "low",
         "text": "Jamie finished packing and put the bag by the door."},
        # 1037-1097 is deliberately quiet. The snapshot fixture's newest event before 1098 is 1098,
        # so the final frame's event list matches it exactly; see the note above.
        {"tick": 1098, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "medium",
         "text": "Jamie noticed they were running low before it got bad, and asked for a reset prompt."},
        {"tick": 1102, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "Several needs dropped at once and Jamie's energy fell too far to continue."},
        {"tick": 1103, "agentId": AIDE_ID, "kind": "aide_intervention", "strategy": "reset_prompt",
         "helped": True,
         "text": "Focus Aide suggested a five-minute recovery break rather than taking over the task."},
        {"tick": 1186, "agentId": AVATAR_ID, "kind": "burnout_recovered", "severity": "low",
         "text": "Jamie recovered on their own and picked the routine back up."},
        {"tick": 1187, "agentId": AVATAR_ID, "kind": "task_start", "severity": "low",
         "text": "Jamie started packing work items."},
    ],
}


# ------------------------------------------------------------------------------------ collapse
#
# Three episodes, none resolved. The StayAlert bundle never reaches the "collapsed repeatedly"
# reading, so this one exists to keep that branch reachable and honestly framed as "not ready yet".

COLLAPSE = {
    "step": 20,
    "avatar_path": [
        {"tick": 200, "pos": [2.0, -1.0], "parked": True},
        {"tick": 260, "pos": [3.4, -2.2]},
        {"tick": 320, "pos": [-2.0, -3.0]},
        {"tick": 380, "pos": [0.6, -0.4], "parked": True},
    ],
    "aide_path": [
        {"tick": 200, "pos": [2.9, -0.3], "parked": True},
        {"tick": 260, "pos": [4.3, -1.5]},
        {"tick": 320, "pos": [-1.1, -2.3]},
        {"tick": 380, "pos": [1.5, 0.3], "parked": True},
    ],
    "avatar": [
        {"tick": 200, "state": "resisting", "stateSince": 188, "goal": "Finish the morning routine",
         "task": "Finish the morning routine", "signals": ["task_drift"], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .26, "stressLevel": .66, "confidence": .22, "cognitiveLoad": .80,
                    "independenceScore": .18, "supportNeedLevel": .78},
         "needs": {"quiet": .26, "rest": .22, "social": .38, "stimulation": .48}},
        {"tick": 260, "state": "overwhelmed", "stateSince": 260, "goal": "Finish the morning routine",
         "task": "Finish the morning routine", "signals": ["overload", "task_drift"], "strategies": [],
         "burnout": True,
         "levels": {"attentionEnergy": .08, "stressLevel": .92, "confidence": .12, "cognitiveLoad": .96,
                    "independenceScore": .16, "supportNeedLevel": .88},
         "needs": {"quiet": .10, "rest": .08, "social": .18, "stimulation": .32}},
        {"tick": 320, "state": "overwhelmed", "stateSince": 320, "goal": "Finish the morning routine",
         "task": "Finish the morning routine", "signals": ["overload"], "strategies": [],
         "burnout": True,
         "levels": {"attentionEnergy": .06, "stressLevel": .96, "confidence": .10, "cognitiveLoad": .98,
                    "independenceScore": .14, "supportNeedLevel": .94},
         "needs": {"quiet": .08, "rest": .06, "social": .14, "stimulation": .28}},
        {"tick": 380, "state": "overwhelmed", "stateSince": 380, "goal": "Finish the morning routine",
         "task": "Finish the morning routine", "signals": ["overload"], "strategies": [],
         "burnout": True,
         "levels": {"attentionEnergy": .05, "stressLevel": .98, "confidence": .08, "cognitiveLoad": .99,
                    "independenceScore": .12, "supportNeedLevel": .96},
         "needs": {"quiet": .06, "rest": .04, "social": .12, "stimulation": .24}},
    ],
    "aide": [
        {"tick": 200, "state": "coached", "stateSince": 188, "goal": None,
         "task": "Try to get Jamie started without taking over", "signals": [], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .70, "stressLevel": .38, "confidence": .62, "cognitiveLoad": .40,
                    "independenceScore": .18, "supportNeedLevel": .60},
         "needs": {"quiet": .62, "rest": .58, "social": .60, "stimulation": .58}},
        {"tick": 380, "state": "coached", "stateSince": 262, "goal": None,
         "task": "Call the RRT core for support", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .52, "stressLevel": .58, "confidence": .48, "cognitiveLoad": .62,
                    "independenceScore": .12, "supportNeedLevel": .78},
         "needs": {"quiet": .54, "rest": .50, "social": .58, "stimulation": .54}},
    ],
    "pair": [
        {"tick": 200, "ready": False, "overall": .12, "independence": .18,
         "blocking": ["EXPERIENTIAL_DEPTH", "COACHING_EFFECTIVENESS", "INDEPENDENCE_LEVEL",
                      "EMOTIONAL_RESILIENCE", "STRATEGY_INTERNALISATION", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .08, False), ("COACHING_EFFECTIVENESS", .18, False),
                            ("INDEPENDENCE_LEVEL", .14, False), ("EMOTIONAL_RESILIENCE", .16, False),
                            ("STRATEGY_INTERNALISATION", .06, False), ("BURNOUT_MANAGEMENT", .09, False)),
         "recommendations": ["Need more experiences (current: 8%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
        {"tick": 380, "ready": False, "overall": .17, "independence": .12,
         "blocking": ["EXPERIENTIAL_DEPTH", "COACHING_EFFECTIVENESS", "INDEPENDENCE_LEVEL",
                      "EMOTIONAL_RESILIENCE", "STRATEGY_INTERNALISATION", "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .14, False), ("COACHING_EFFECTIVENESS", .24, False),
                            ("INDEPENDENCE_LEVEL", .12, False), ("EMOTIONAL_RESILIENCE", .18, False),
                            ("STRATEGY_INTERNALISATION", .09, False), ("BURNOUT_MANAGEMENT", .07, False)),
         "recommendations": ["Need more experiences (current: 14%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
    ],
    "episodes": [
        {"startTick": 380, "severity": .41, "peakBelow": .39},
        {"startTick": 320, "severity": .36, "peakBelow": .34},
        {"startTick": 260, "severity": .29, "peakBelow": .27},
    ],
    "recognitions": [
        {"tick": 372, "riskAtRecognition": .62, "actedOn": True, "ledTo": "delayed"},
        {"tick": 312, "riskAtRecognition": .58, "actedOn": False, "ledTo": "ignored"},
        {"tick": 250, "riskAtRecognition": .48, "actedOn": False, "ledTo": "ignored"},
    ],
    "events": [
        {"tick": 200, "agentId": AVATAR_ID, "kind": "scene_enter", "severity": "low",
         "text": "Jamie and Focus Aide arrived home for the morning routine."},
        {"tick": 236, "agentId": AVATAR_ID, "kind": "struggle_detected", "severity": "medium",
         "text": "Jamie has not made progress on the routine for several minutes."},
        {"tick": 250, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "high",
         "text": "Jamie noticed they were not coping, and did not say so."},
        {"tick": 260, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "Several needs dropped at once and Jamie stopped."},
        {"tick": 262, "agentId": AIDE_ID, "kind": "aide_intervention", "strategy": "task_chunking",
         "helped": False,
         "text": "Focus Aide offered a smaller first step; Jamie could not start even that."},
        {"tick": 312, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "high",
         "text": "Jamie noticed the slump had not lifted, and carried on without acting."},
        {"tick": 320, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "Jamie went under again before the first episode had cleared."},
        {"tick": 372, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "high",
         "text": "Jamie noticed the pattern, and asked for the RRT core."},
        {"tick": 380, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "A third collapse, still unresolved."},
    ],
}


# ------------------------------------------------------------------------------------ rescue
#
# One episode, recovered by the Aide's RRT core, and no self-recovery anywhere in the history.
# StayAlert's final frame reads as "self-recovered" because its most recent episode was solo, so
# without this bundle the "needed rescue" reading is unreachable from any fixture.

RESCUE = {
    "step": 16,
    "avatar_path": [
        {"tick": 420, "pos": [3.0, -2.0], "parked": True},
        {"tick": 450, "pos": [1.4, -2.6]},
        {"tick": 470, "pos": [0.2, -1.4]},
        {"tick": 500, "pos": [2.2, -2.2], "parked": True},
    ],
    "aide_path": [
        {"tick": 420, "pos": [3.9, -1.3], "parked": True},
        {"tick": 450, "pos": [2.3, -1.9]},
        {"tick": 470, "pos": [1.1, -0.7]},
        {"tick": 500, "pos": [3.1, -1.5], "parked": True},
    ],
    "avatar": [
        {"tick": 420, "state": "settled", "stateSince": 414, "goal": "Get to the appointment",
         "task": "Get to the appointment", "signals": [], "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .58, "stressLevel": .36, "confidence": .52, "cognitiveLoad": .42,
                    "independenceScore": .34, "supportNeedLevel": .46},
         "needs": {"quiet": .60, "rest": .54, "social": .56, "stimulation": .54}},
        {"tick": 450, "state": "overwhelmed", "stateSince": 450, "goal": "Get to the appointment",
         "task": "Get to the appointment", "signals": ["time_pressure", "overload"], "strategies": [],
         "burnout": True,
         "levels": {"attentionEnergy": .12, "stressLevel": .88, "confidence": .16, "cognitiveLoad": .92,
                    "independenceScore": .36, "supportNeedLevel": .74},
         "needs": {"quiet": .16, "rest": .12, "social": .26, "stimulation": .40}},
        {"tick": 470, "state": "coached", "stateSince": 452, "goal": "Get to the appointment",
         "task": "One step at a time to the appointment", "signals": ["overload"], "strategies": [],
         "burnout": False,
         "levels": {"attentionEnergy": .40, "stressLevel": .58, "confidence": .38, "cognitiveLoad": .70,
                    "independenceScore": .40, "supportNeedLevel": .56},
         "needs": {"quiet": .34, "rest": .28, "social": .42, "stimulation": .46}},
        {"tick": 500, "state": "recovering", "stateSince": 486, "goal": "Get to the appointment",
         "task": "Finish the journey to the appointment", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .50, "stressLevel": .44, "confidence": .48, "cognitiveLoad": .56,
                    "independenceScore": .44, "supportNeedLevel": .48},
         "needs": {"quiet": .46, "rest": .40, "social": .50, "stimulation": .50}},
    ],
    "aide": [
        {"tick": 420, "state": "settled", "stateSince": 414, "goal": None,
         "task": "Keep the morning moving", "signals": [], "strategies": [], "burnout": False,
         "levels": {"attentionEnergy": .86, "stressLevel": .16, "confidence": .82, "cognitiveLoad": .22,
                    "independenceScore": .34, "supportNeedLevel": .36},
         "needs": {"quiet": .72, "rest": .68, "social": .64, "stimulation": .60}},
        {"tick": 500, "state": "coached", "stateSince": 452, "goal": None,
         "task": "Bring Jamie back up, then step back", "signals": [], "strategies": ["task_chunking"],
         "burnout": False,
         "levels": {"attentionEnergy": .80, "stressLevel": .22, "confidence": .78, "cognitiveLoad": .30,
                    "independenceScore": .44, "supportNeedLevel": .48},
         "needs": {"quiet": .70, "rest": .66, "social": .62, "stimulation": .58}},
    ],
    "pair": [
        {"tick": 420, "ready": False, "overall": .36, "independence": .34,
         "blocking": ["EXPERIENTIAL_DEPTH", "COACHING_EFFECTIVENESS", "STRATEGY_INTERNALISATION",
                      "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .24, False), ("COACHING_EFFECTIVENESS", .48, False),
                            ("INDEPENDENCE_LEVEL", .34, True), ("EMOTIONAL_RESILIENCE", .42, True),
                            ("STRATEGY_INTERNALISATION", .21, False), ("BURNOUT_MANAGEMENT", .40, False)),
         "recommendations": ["Need more experiences (current: 24%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
        {"tick": 500, "ready": False, "overall": .45, "independence": .44,
         "blocking": ["EXPERIENTIAL_DEPTH", "COACHING_EFFECTIVENESS", "STRATEGY_INTERNALISATION",
                      "BURNOUT_MANAGEMENT"],
         "dimensions": dims(("EXPERIENTIAL_DEPTH", .30, False), ("COACHING_EFFECTIVENESS", .54, False),
                            ("INDEPENDENCE_LEVEL", .44, True), ("EMOTIONAL_RESILIENCE", .48, True),
                            ("STRATEGY_INTERNALISATION", .27, False), ("BURNOUT_MANAGEMENT", .32, False)),
         "recommendations": ["Need more experiences (current: 30%, target: 60%)",
                             "Reduce burnout risk before fusion"]},
    ],
    "episodes": [
        {"startTick": 450, "severity": .31, "peakBelow": .29, "recoveredTick": 486,
         "recoveryMode": "rrt"},
    ],
    "recognitions": [
        {"tick": 446, "riskAtRecognition": .40, "actedOn": True, "ledTo": "delayed"},
    ],
    "events": [
        {"tick": 420, "agentId": AVATAR_ID, "kind": "scene_enter", "severity": "low",
         "text": "Jamie and Focus Aide set off for the appointment."},
        {"tick": 424, "agentId": AVATAR_ID, "kind": "task_start", "severity": "low",
         "text": "Jamie started getting to the appointment."},
        {"tick": 446, "agentId": AVATAR_ID, "kind": "self_recognition", "severity": "medium",
         "text": "Jamie noticed they were slipping, a little late to act on it."},
        {"tick": 450, "agentId": AVATAR_ID, "kind": "burnout_entered", "severity": "high",
         "text": "Several needs dropped at once and Jamie stopped."},
        {"tick": 452, "agentId": AIDE_ID, "kind": "aide_intervention", "strategy": "task_chunking",
         "helped": True,
         "text": "Focus Aide broke the journey into four small steps rather than driving them there."},
        {"tick": 486, "agentId": AVATAR_ID, "kind": "burnout_recovered", "severity": "low",
         "text": "Jamie's energy came back with the Aide's help and the journey continued."},
        {"tick": 492, "agentId": AVATAR_ID, "kind": "strategy_internalised", "severity": "low",
         "text": "Jamie wrote the four steps down for next time."},
        {"tick": 500, "agentId": AVATAR_ID, "kind": "task_complete", "severity": "low",
         "text": "Jamie reached the appointment."},
    ],
}


# ------------------------------------------------------------------------------------ main


def wrap(name: str, title: str, note: str, frames: list[dict]) -> dict:
    return {
        "schemaVersion": REPLAY_VERSION,
        "name": name,
        "title": title,
        "provenance": {
            "authored": True,
            "authoringTool": "tools/make_replay_fixture.py",
            "generatedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "note": note,
        },
        "frameCount": len(frames),
        "frames": frames,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="verify the committed fixtures match what this tool produces")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stay = build_frames(STAYALERT)
    collapse = build_frames(COLLAPSE)
    rescue = build_frames(RESCUE)

    bundles = {
        OUT_DIR / "stayalert-day.json": wrap(
            "stayalert-day",
            "StayAlert — one working morning, Jamie and Focus Aide",
            "Synthetic fixture authored to exercise the Learning Timeline. Its final frame is "
            "content-equivalent to world-engine-godot/fixtures/state-feed.sample.json, so the two "
            "describe one continuous history. Not simulation output: no policy has run here.",
            stay),
        OUT_DIR / "collapse-only.json": wrap(
            "collapse-only",
            "Repeated collapse — three unresolved burnout episodes",
            "Synthetic fixture. Exists so the 'collapsed repeatedly' reading (RENDERER-PLAN.md D.5) "
            "is reachable; the StayAlert bundle never triggers it.",
            collapse),
        OUT_DIR / "rescue-only.json": wrap(
            "rescue-only",
            "Needed rescue — one episode, recovered by the Aide's RRT core",
            "Synthetic fixture. Makes the 'needed rescue' reading (RENDERER-PLAN.md D.5) reachable: "
            "StayAlert's most recent episode recovers solo, so it never reads as 'needed rescue'.",
            rescue),
    }

    validate_all(bundles)

    failures = 0
    for path, bundle in bundles.items():
        if args.check:
            # The bundle carries a generation timestamp, so a byte comparison always differs. Reuse
            # the committed timestamp for the comparison — otherwise --check can only ever fail, and
            # a check that cannot pass is a check nobody runs. Everything else is still compared.
            if not path.exists():
                print(f"FAIL  {path.name} is missing", file=sys.stderr)
                failures += 1
                continue
            committed = json.loads(path.read_text(encoding="utf-8"))
            bundle["provenance"]["generatedUtc"] = (
                committed.get("provenance", {}).get("generatedUtc")
            )
            text = json.dumps(bundle, indent=2) + "\n"
            if path.read_text(encoding="utf-8") != text:
                print(f"FAIL  {path.name} differs from tools/make_replay_fixture.py output",
                      file=sys.stderr)
                failures += 1
            else:
                print(f"OK    {path.name} up to date ({bundle['frameCount']} frames)")
            continue
        text = json.dumps(bundle, indent=2) + "\n"
        path.write_text(text, encoding="utf-8")
        print(f"wrote {path.relative_to(REPO)} ({bundle['frameCount']} frames, "
              f"{len(text.encode('utf-8')) // 1024} KB)")

    if args.check and failures:
        return 1
    return 0


def validate_all(bundles: dict[Path, dict]) -> None:
    """Run the shipped contract validator over every frame. A fixture that does not validate is a
    false green — the same failure mode the Python validator was written to catch."""
    sys.path.insert(0, str(REPO / "tools"))
    from validate_state_feed import validate  # noqa: PLC0415

    for path, bundle in bundles.items():
        for i, frame in enumerate(bundle["frames"]):
            errs, warns = validate(frame)
            if errs:
                print(f"FAIL  {path.name} frame {i} (tick {frame['tick']}): "
                      + "; ".join(errs[:3]), file=sys.stderr)
                raise SystemExit(1)
            for w in warns:
                print(f"warn  {path.name} frame {i}: {w}", file=sys.stderr)
        print(f"OK    {path.name}: {len(bundle['frames'])} frames validate against "
              f"nlt.state-feed.v1")

    last = bundles[OUT_DIR / "stayalert-day.json"]["frames"][-1]
    compare_to_sample(last, bundles[OUT_DIR / "stayalert-day.json"]["frames"][0]["tick"])


def compare_to_sample(last: dict, origin: int) -> None:
    """The coherence check: the bundle's final frame must describe the same history as the
    snapshot fixture. Divergence between two committed fixtures is a silent lie."""
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    problems = []

    if last["tick"] != sample["tick"]:
        problems.append(f"tick {last['tick']} != sample {sample['tick']}")
    if last["scene"] != sample["scene"]:
        problems.append("scene differs")
    if last["burnoutEpisodes"] != sample["burnoutEpisodes"]:
        problems.append("burnoutEpisodes differ")
    if last["selfRecognitions"] != sample["selfRecognitions"]:
        problems.append("selfRecognitions differ")

    def sig(evs):
        return sorted((e["tick"], e["kind"], e["text"]) for e in evs)

    if sig(last["events"]) != sig(sample["events"]):
        problems.append("event set differs")

    for a, b in zip(last["agents"], sample["agents"]):
        if a["id"] != b["id"]:
            problems.append(f"agent id {a['id']} missing from sample")
            continue
        if a["state"] != b["state"]:
            problems.append(f"{a['id']} state {a['state']} != {b['state']}")
        if a["needs"] != b["needs"]:
            problems.append(f"{a['id']} needs differ: {a['needs']} vs {b['needs']}")

    p, q = last["pairs"][0], sample["pairs"][0]
    if p["dimensions"] != q["dimensions"] or p["overallScore"] != q["overallScore"]:
        problems.append("fusion gate differs")
    if p["recommendations"] != q["recommendations"]:
        problems.append("recommendations differ")

    if problems:
        print("FAIL  stayalert-day final frame is not coherent with state-feed.sample.json:",
              file=sys.stderr)
        for p_ in problems:
            print(f"        {p_}", file=sys.stderr)
        raise SystemExit(1)
    print(f"OK    stayalert-day final frame (tick {last['tick']}) is coherent with "
          f"state-feed.sample.json")


if __name__ == "__main__":
    raise SystemExit(main())