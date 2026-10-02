"""
contracts/v1 snapshot emission and loading for the world engine.
"""

from __future__ import annotations

import copy
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from .ecs import (
    AgentController, AgentState, Descriptor, Entity, Interactable, Needs, Position,
)

if TYPE_CHECKING:
    from .world_engine import WorldEngine

CONTRACT_VERSION = "nlt.world-engine.v1"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def sim_minutes(engine: "WorldEngine") -> float:
    delta = engine.simulation_time - engine.start_time
    return round(delta.total_seconds() / 60.0, 6)


def _facing_from_movement(old_x: int, old_y: int, new_x: int, new_y: int,
                          current: str = "south") -> str:
    dx, dy = new_x - old_x, new_y - old_y
    if dx > 0:
        return "east"
    if dx < 0:
        return "west"
    if dy > 0:
        return "south"
    if dy < 0:
        return "north"
    return current


def emit_contract_snapshot(engine: "WorldEngine",
                           snapshot_id: Optional[str] = None) -> Dict[str, Any]:
    avatars: Dict[str, Any] = {}
    entities: Dict[str, Any] = {}

    for entity in engine.registry.get_entities_with(Position):
        pos = engine.registry.get_component(entity, Position)
        descriptor = engine.registry.get_component(entity, Descriptor)
        controller = engine.registry.get_component(entity, AgentController)
        profile = engine.avatar_profiles.get(
            controller.agent_id if controller else "", None)

        if profile and controller:
            agent_state = engine.registry.get_component(entity, AgentState)
            if agent_state is None:
                agent_state = AgentState()
                engine.registry.add_component(entity, agent_state)

            tx = agent_state.target_x if agent_state.target_x is not None else pos.x
            ty = agent_state.target_y if agent_state.target_y is not None else pos.y
            room_id = (descriptor.room if descriptor and descriptor.room
                       else profile.get("default_room", "bedroom"))

            scenario = None
            if agent_state.scenario_id:
                scenario = {
                    "id": agent_state.scenario_id,
                    "elapsed": round(agent_state.scenario_elapsed, 6),
                    "expected": agent_state.scenario_expected,
                }

            avatars[profile["contract_id"]] = {
                "id": profile["contract_id"],
                "name": profile["name"],
                "trait": profile["trait"],
                "state": agent_state.state,
                "emotional_state": agent_state.emotional_state,
                "metrics": {
                    "focus": round(_clamp01(agent_state.focus), 6),
                    "cognitive_load": round(_clamp01(agent_state.cognitive_load), 6),
                    "stress": round(_clamp01(agent_state.stress), 6),
                    "burnout_risk": round(_clamp01(agent_state.burnout_risk), 6),
                    "independence": round(_clamp01(agent_state.independence), 6),
                    "fusion_readiness": round(_clamp01(agent_state.fusion_readiness), 6),
                    "success_rate": round(_clamp01(agent_state.success_rate), 6),
                },
                "scenario": scenario,
                "position": {
                    "room_id": room_id,
                    "x": pos.x,
                    "y": pos.y,
                    "target_x": tx,
                    "target_y": ty,
                    "facing": agent_state.facing,
                },
                "counters": {
                    "minutes_focused": round(agent_state.minutes_focused, 6),
                    "false_starts": agent_state.false_starts,
                    "interventions": agent_state.interventions,
                    "successes": agent_state.successes,
                    "failures": agent_state.failures,
                },
                "extensions": {
                    "hue": profile.get("hue", 200),
                    "tag": profile.get("tag", "SA"),
                    "entity_id": entity.entity_id,
                },
            }
            continue

        record: Dict[str, Any] = {
            "position": [pos.x, pos.y],
        }
        if descriptor:
            record["name"] = descriptor.name
            record["kind"] = descriptor.kind
            if descriptor.room:
                record["room"] = descriptor.room
        needs = engine.registry.get_component(entity, Needs)
        if needs:
            record["needs"] = {k: round(v, 6) for k, v in sorted(needs.levels.items())}
        interactable = engine.registry.get_component(entity, Interactable)
        if interactable:
            record["affordances"] = list(interactable.affordances)
            record["in_use"] = interactable.in_use_by is not None
        entities[entity.entity_id] = record

    return {
        "contract_version": CONTRACT_VERSION,
        "snapshot_id": snapshot_id or f"snapshot-{engine.tick_count}",
        "simulation": {
            "simulation_id": engine.simulation_id,
            "state": engine.current_state.value,
            "tick": engine.tick_count,
            "sim_time": sim_minutes(engine),
            "seed": engine.seed,
            "pace": engine.pace,
        },
        "avatars": avatars,
        "entities": entities,
        "extensions": {
            "scene_id": engine.scene_id,
            "simulation_time_iso": engine.simulation_time.isoformat(),
        },
    }


def load_contract_snapshot(engine: "WorldEngine", snapshot: Dict[str, Any]) -> None:
    sim = snapshot["simulation"]
    engine.simulation_id = sim["simulation_id"]
    engine.current_state = engine.current_state.__class__(sim["state"])
    engine.tick_count = sim["tick"]
    engine.seed = sim["seed"]
    engine.pace = sim["pace"]
    engine.start_time = engine.config.get("start_time", engine.start_time)
    if isinstance(engine.start_time, str):
        engine.start_time = datetime.fromisoformat(engine.start_time)
    engine.simulation_time = engine.start_time
    from datetime import timedelta
    engine.simulation_time += timedelta(minutes=sim["sim_time"])

    for avatar_id, avatar in snapshot.get("avatars", {}).items():
        profile = engine.avatar_profiles.get(avatar_id)
        if profile is None:
            for agent_id, stored in engine.avatar_profiles.items():
                if stored.get("contract_id") == avatar_id:
                    profile = stored
                    break
        if profile is None:
            continue
        entity = engine.registry.get_entity(profile["entity_id"])
        if entity is None:
            continue

        pos = engine.registry.get_component(entity, Position)
        position = avatar["position"]
        if pos:
            pos.x = int(position["x"])
            pos.y = int(position["y"])

        agent_state = engine.registry.get_component(entity, AgentState)
        if agent_state is None:
            agent_state = AgentState()
            engine.registry.add_component(entity, agent_state)

        agent_state.state = avatar["state"]
        agent_state.emotional_state = avatar["emotional_state"]
        metrics = avatar["metrics"]
        agent_state.focus = metrics["focus"]
        agent_state.cognitive_load = metrics["cognitive_load"]
        agent_state.stress = metrics["stress"]
        agent_state.burnout_risk = metrics["burnout_risk"]
        agent_state.independence = metrics["independence"]
        agent_state.fusion_readiness = metrics["fusion_readiness"]
        agent_state.success_rate = metrics["success_rate"]
        scenario = avatar.get("scenario")
        if scenario:
            agent_state.scenario_id = scenario["id"]
            agent_state.scenario_elapsed = scenario["elapsed"]
            agent_state.scenario_expected = scenario["expected"]
        else:
            agent_state.scenario_id = None
            agent_state.scenario_elapsed = 0.0
        agent_state.target_x = int(position["target_x"])
        agent_state.target_y = int(position["target_y"])
        agent_state.facing = position["facing"]
        counters = avatar["counters"]
        agent_state.minutes_focused = counters["minutes_focused"]
        agent_state.false_starts = counters["false_starts"]
        agent_state.interventions = counters["interventions"]
        agent_state.successes = counters["successes"]
        agent_state.failures = counters["failures"]

    engine.grid.invalidate_index()


def make_contract_event(engine: "WorldEngine",
                        event_type: str,
                        message: str,
                        *,
                        source_type: str = "engine",
                        source_id: str = "world_engine",
                        subject_id: Optional[str] = None,
                        scenario_id: Optional[str] = None,
                        payload: Optional[Dict[str, Any]] = None,
                        state_changes: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    engine._event_sequence += 1
    event = {
        "contract_version": CONTRACT_VERSION,
        "event_id": f"event-{uuid.uuid4().hex[:12]}",
        "sequence": engine._event_sequence,
        "clock": {
            "tick": engine.tick_count,
            "sim_time": sim_minutes(engine),
        },
        "event_type": event_type,
        "source": {"type": source_type, "id": source_id},
        "subject_id": subject_id,
        "scenario_id": scenario_id,
        "message": message,
        "payload": payload or {},
        "state_changes": state_changes or [],
        "extensions": {},
    }
    engine.contract_events.append(event)
    engine._pending_events.append(event)
    return event


def make_intervention(engine: "WorldEngine",
                      avatar_id: str,
                      aide_id: str,
                      strategy: str,
                      reason: str,
                      effectiveness: float,
                      effects: Dict[str, float]) -> Dict[str, Any]:
    engine._intervention_sequence += 1
    intervention = {
        "contract_version": CONTRACT_VERSION,
        "intervention_id": f"intervention-{uuid.uuid4().hex[:12]}",
        "sequence": engine._intervention_sequence,
        "clock": {
            "tick": engine.tick_count,
            "sim_time": sim_minutes(engine),
        },
        "avatar_id": avatar_id,
        "aide_id": aide_id,
        "strategy": strategy,
        "reason": reason,
        "effectiveness": round(_clamp01(effectiveness), 6),
        "effects": effects,
        "extensions": {},
    }
    engine.interventions.append(intervention)
    return intervention


def validate_snapshot_shape(snapshot: Dict[str, Any]) -> List[str]:
    """Lightweight structural validation (stdlib only)."""
    errors: List[str] = []
    required = ("contract_version", "snapshot_id", "simulation",
                "avatars", "entities", "extensions")
    for key in required:
        if key not in snapshot:
            errors.append(f"missing top-level key: {key}")
    if snapshot.get("contract_version") != CONTRACT_VERSION:
        errors.append("contract_version mismatch")
    sim = snapshot.get("simulation", {})
    for key in ("simulation_id", "state", "tick", "sim_time", "seed", "pace"):
        if key not in sim:
            errors.append(f"missing simulation.{key}")
    for avatar_id, avatar in snapshot.get("avatars", {}).items():
        for key in ("id", "name", "trait", "state", "emotional_state",
                    "metrics", "scenario", "position", "counters", "extensions"):
            if key not in avatar:
                errors.append(f"avatar {avatar_id} missing {key}")
    return errors


def update_facing_on_move(engine: "WorldEngine", entity: Entity,
                          old_x: int, old_y: int, new_x: int, new_y: int) -> None:
    agent_state = engine.registry.get_component(entity, AgentState)
    if agent_state is None:
        return
    agent_state.facing = _facing_from_movement(
        old_x, old_y, new_x, new_y, agent_state.facing)
    agent_state.target_x = new_x
    agent_state.target_y = new_y
