"""Fusion <-> Unreal v1 protocol and deterministic replay reference.

This module is transport-neutral.  The UE server, Fusion runtime, and replay
runner can all call it; conformance tests use it as the executable contract.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

PROTOCOL = "nlt.fusion-unreal"
PROTOCOL_VERSION = "1.0"
CONTRACT_VERSION = "nlt.world-engine.v1"
ACTION_TYPES = ("move_to", "move_by", "interact", "set_focus", "idle")
ERROR_CODES = {
    "invalid_envelope", "unsupported_version", "unsupported_type",
    "invalid_action", "unknown_target", "invalid_state",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)


def state_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def envelope(message_type: str, payload: dict[str, Any], *, session_id: str,
             agent_id: str | None = None, message_id: str | None = None,
             correlation_id: str | None = None) -> dict[str, Any]:
    return {"protocol": PROTOCOL, "protocol_version": PROTOCOL_VERSION,
            "message_type": message_type, "message_id": message_id or str(uuid.uuid4()),
            "correlation_id": correlation_id, "session_id": session_id,
            "agent_id": agent_id, "payload": payload}


def decode(raw: str | bytes) -> dict[str, Any]:
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ProtocolError("invalid_envelope", "message is not valid UTF-8") from exc
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProtocolError("invalid_envelope", "message is not valid JSON") from exc
    return validate_envelope(value)


def validate_envelope(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ProtocolError("invalid_envelope", "message must be an object")
    required = ("protocol", "protocol_version", "message_type", "message_id", "session_id", "payload")
    missing = [key for key in required if key not in value]
    if missing:
        raise ProtocolError("invalid_envelope", "missing fields: " + ", ".join(missing))
    if value["protocol"] != PROTOCOL:
        raise ProtocolError("invalid_envelope", "unknown protocol")
    if value["protocol_version"] != PROTOCOL_VERSION:
        raise ProtocolError("unsupported_version", f"expected {PROTOCOL_VERSION}")
    if not isinstance(value["message_type"], str) or not value["message_type"]:
        raise ProtocolError("invalid_envelope", "message_type must be a non-empty string")
    if not isinstance(value["payload"], dict):
        raise ProtocolError("invalid_envelope", "payload must be an object")
    if not isinstance(value["message_id"], str) or not value["message_id"]:
        raise ProtocolError("invalid_envelope", "message_id must be a non-empty string")
    if not isinstance(value["session_id"], str) or not value["session_id"]:
        raise ProtocolError("invalid_envelope", "session_id must be a non-empty string")
    if "agent_id" in value and value["agent_id"] is not None and not isinstance(value["agent_id"], str):
        raise ProtocolError("invalid_envelope", "agent_id must be a string or null")
    if "correlation_id" in value and value["correlation_id"] is not None and not isinstance(value["correlation_id"], str):
        raise ProtocolError("invalid_envelope", "correlation_id must be a string or null")
    return value


class ProtocolError(Exception):
    def __init__(self, code: str, message: str):
        if code not in ERROR_CODES:
            raise ValueError(f"unknown protocol error code: {code}")
        super().__init__(message)
        self.code, self.message = code, message


def _finite_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise ProtocolError("invalid_action", f"{field} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ProtocolError("invalid_action", f"{field} must be a finite number") from exc
    if not math.isfinite(number):
        raise ProtocolError("invalid_action", f"{field} must be a finite number")
    return number


def acknowledge(request: dict[str, Any], accepted: bool = True, *, result: dict[str, Any] | None = None, error: ProtocolError | None = None) -> dict[str, Any]:
    validate_envelope(request)
    if error is not None:
        payload = {"status": "rejected", "error": {"code": error.code, "message": error.message}}
    else:
        payload = {"status": "accepted" if accepted else "rejected", "result": result or {}}
        if not accepted:
            payload["error"] = {"code": "invalid_state", "message": "request was not accepted"}
    return envelope("ack", payload, session_id=request["session_id"], agent_id=request.get("agent_id"), correlation_id=request["message_id"])


@dataclass(frozen=True)
class ReplayResult:
    final_state: dict[str, Any]
    final_hash: str
    intermediate_hashes: list[str]
    event_hashes: list[str]
    events: list[dict[str, Any]]


class ReplayExecutor:
    """Strict, deterministic reference executor for the approved action set."""
    def __init__(self, initial_state: dict[str, Any]):
        self.state = copy.deepcopy(initial_state)
        self.tick = int(self.state.get("tick", 0))
        self.rng_state = int(self.state.get("rng_state", 0))
        self.events: list[dict[str, Any]] = []

    def _agent(self, action: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(action, dict):
            raise ProtocolError("invalid_action", "action must be an object")
        agents = self.state.get("agents")
        if not isinstance(agents, dict):
            raise ProtocolError("invalid_state", "agents must be an object")
        target = action.get("target_id")
        if not isinstance(target, str) or not target or target not in agents:
            raise ProtocolError("unknown_target", f"agent does not exist: {target}")
        return agents[target]

    def execute_action(self, action: dict[str, Any]) -> None:
        kind = action.get("type") if isinstance(action, dict) else None
        if kind not in ACTION_TYPES:
            raise ProtocolError("invalid_action", f"unsupported action: {kind}")
        agent = self._agent(action)
        if kind == "move_to":
            if "x" not in action or "y" not in action:
                raise ProtocolError("invalid_action", "move_to requires x and y")
            agent["x"] = _finite_number(action["x"], "x")
            agent["y"] = _finite_number(action["y"], "y")
        elif kind == "move_by":
            if "dx" not in action or "dy" not in action:
                raise ProtocolError("invalid_action", "move_by requires dx and dy")
            agent["x"] = _finite_number(agent.get("x", 0), "x") + _finite_number(action["dx"], "dx")
            agent["y"] = _finite_number(agent.get("y", 0), "y") + _finite_number(action["dy"], "dy")
        elif kind == "interact":
            target = action.get("target")
            if not isinstance(target, str) or not target:
                raise ProtocolError("invalid_action", "interact requires a non-empty target")
            agent.setdefault("interactions", []).append(target)
        elif kind == "set_focus":
            if "value" not in action:
                raise ProtocolError("invalid_action", "set_focus requires value")
            value = _finite_number(action["value"], "value")
            if not 0 <= value <= 1:
                raise ProtocolError("invalid_action", "focus must be in [0,1]")
            agent["focus"] = value
        else:
            agent["moving"] = False
        self.events.append({"tick": self.tick, "agent_id": action.get("target_id"), "type": f"action.{kind}"})

    def step(self, actions: Iterable[dict[str, Any]]) -> None:
        materialized = list(actions)
        snapshot = copy.deepcopy(self.state)
        event_count = len(self.events)
        try:
            for action in materialized:
                self.execute_action(action)
            self.tick += 1
            self.rng_state = (1664525 * self.rng_state + 1013904223) & 0xFFFFFFFF
            self.state["tick"] = self.tick
            self.state["rng_state"] = self.rng_state
        except Exception:
            self.state = snapshot
            del self.events[event_count:]
            raise

    def run(self, ticks: Iterable[Iterable[dict[str, Any]]]) -> ReplayResult:
        hashes = []
        event_hashes = []
        for actions in ticks:
            materialized = list(actions)
            event_start = len(self.events)
            self.step(materialized)
            hashes.append(state_hash(self.state))
            event_hashes.append(state_hash(self.events[event_start:]))
        final_state = copy.deepcopy(self.state)
        return ReplayResult(final_state, state_hash(final_state), hashes, event_hashes, list(self.events))


def compare_replay(expected: dict[str, Any], actual: ReplayResult) -> dict[str, bool]:
    if "intermediate_hashes" not in expected:
        raise ProtocolError("invalid_state", "intermediate_hashes is required")
    if "event_hashes" not in expected:
        raise ProtocolError("invalid_state", "event_hashes is required")
    if "expected_final_state" not in expected or "expected_final_hash" not in expected:
        raise ProtocolError("invalid_state", "expected final state and hash are required")
    return {"intermediate_match": expected["intermediate_hashes"] == actual.intermediate_hashes,
            "event_match": expected["event_hashes"] == actual.event_hashes,
            "final_state_match": expected["expected_final_state"] == actual.final_state,
            "final_hash_match": expected["expected_final_hash"] == actual.final_hash}
