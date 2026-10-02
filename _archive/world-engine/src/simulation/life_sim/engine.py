"""
Headless life-sim v1 engine — deterministic tick loop aligned with world-engine/sim.jsx.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .catalog import (
    MOTIVE_DECAY,
    OBJECTS,
    SPAWN_OBJECT_ID,
    LifeScenario,
    SimObject,
    get_object,
    object_for_scenario,
    SCENARIOS,
    SCENARIOS_BY_ID,
)


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


class LCG:
    """Same linear congruential generator as sim.jsx (seed 1337)."""

    def __init__(self, seed: int = 1337) -> None:
        self._state = seed

    def __call__(self) -> float:
        self._state = (self._state * 1664525 + 1013904223) & 0xFFFFFFFF
        return (self._state & 0xFFFFFFF) / 0xFFFFFFF


FLAVOR_BIAS = {
    "attention": {"drift": 0.35, "hyperfocus": 0.15, "stress": 0.20},
}


@dataclass
class SimEvent:
    kind: str
    avatar_id: str
    text: str
    scenario_id: Optional[str] = None
    who: Optional[str] = None
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AvatarState:
    id: str
    name: str
    flavor: str = "attention"
    state: str = "idle"
    emotional: str = "neutral"
    focus: float = 0.7
    cog_load: float = 0.25
    stress: float = 0.2
    burnout: float = 0.05
    independence: float = 0.3
    fusion_ready: float = 0.0
    success_rate: float = 0.5
    energy: float = 0.78
    scenario_id: Optional[str] = None
    pending_scenario_id: Optional[str] = None
    target_object_id: Optional[str] = None
    current_object_id: Optional[str] = None
    elapsed: float = 0.0
    expected: float = 0.0
    room: str = "home"
    px: int = 3
    py: int = 11
    tx: int = 3
    ty: int = 11
    facing: str = "south"
    interventions: int = 0
    successes: int = 0
    failures: int = 0

    def at_tile(self) -> bool:
        return self.px == self.tx and self.py == self.ty


@dataclass
class LifeSimWorld:
    avatars: List[AvatarState] = field(default_factory=list)
    events: List[SimEvent] = field(default_factory=list)


class LifeSimEngine:
    def __init__(self, rng: Optional[LCG] = None) -> None:
        self.rng = rng or LCG()
        self.world = self.make_initial_world()

    def make_initial_world(self) -> LifeSimWorld:
        spawn = get_object(SPAWN_OBJECT_ID) or OBJECTS[0]
        avatar = AvatarState(
            id="stay_alert",
            name="StayAlert",
            room=spawn.room,
            px=spawn.tx,
            py=spawn.ty,
            tx=spawn.tx,
            ty=spawn.ty,
            energy=0.72 + self.rng() * 0.12,
            focus=0.65 + self.rng() * 0.15,
            cog_load=0.20 + self.rng() * 0.10,
            stress=0.15 + self.rng() * 0.10,
        )
        return LifeSimWorld(avatars=[avatar])

    def assign_scenario(self, avatar_id: str, scenario_id: str) -> List[SimEvent]:
        scenario = SCENARIOS_BY_ID.get(scenario_id)
        if not scenario:
            return []
        events: List[SimEvent] = []
        for avatar in self.world.avatars:
            if avatar.id != avatar_id:
                continue
            avatar.scenario_id = None
            avatar.current_object_id = None
            avatar.elapsed = 0.0
            avatar.expected = float(scenario.minutes)
            if self._queue_scenario(avatar, scenario, events):
                break
        self._prepend_events(events)
        return events

    def move_to(self, avatar_id: str, object_id: str) -> List[SimEvent]:
        obj = get_object(object_id)
        if not obj:
            return []
        events: List[SimEvent] = []
        for avatar in self.world.avatars:
            if avatar.id != avatar_id:
                continue
            avatar.pending_scenario_id = None
            avatar.target_object_id = obj.id
            self._path_to_object(avatar, obj)
            events.append(self._mk_event(
                "MOVE_TO_OBJECT", avatar, f"heading to {obj.name}",
                meta={"object_id": obj.id},
            ))
            break
        self._prepend_events(events)
        return events

    def tick(
        self,
        ts: float = 1.0,
        dysfunction_on: bool = True,
        urgency_threshold: float = 0.65,
    ) -> List[SimEvent]:
        new_events: List[SimEvent] = []
        decay = MOTIVE_DECAY

        for avatar in self.world.avatars:
            bias = FLAVOR_BIAS.get(avatar.flavor, FLAVOR_BIAS["attention"])

            if avatar.state == "walking" or avatar.target_object_id:
                self._tick_movement(avatar)
                if avatar.at_tile() and avatar.target_object_id:
                    obj = get_object(avatar.target_object_id)
                    if obj:
                        self._arrive_at_object(avatar, obj, new_events)

            if avatar.scenario_id:
                scenario = SCENARIOS_BY_ID.get(avatar.scenario_id)
                if scenario:
                    self._tick_scenario(
                        avatar, scenario, ts, dysfunction_on,
                        urgency_threshold, bias, new_events,
                    )
            elif not avatar.target_object_id and not avatar.pending_scenario_id:
                avatar.energy = clamp(avatar.energy - decay.energy_per_minute * ts)
                if (
                    avatar.energy < decay.low_energy_threshold
                    and avatar.state == "idle"
                    and self.rng() < 0.08 * ts
                ):
                    new_events.append(self._mk_event(
                        "NEED_LOW", avatar, "energy running low",
                        meta={"motive": "energy", "value": avatar.energy},
                    ))
                if avatar.energy < decay.low_energy_threshold and not avatar.scenario_id:
                    if self.rng() < 0.06 * ts:
                        self._queue_rest(avatar, new_events)
                elif self.rng() < decay.autonomy_pick_rate * ts:
                    scenario = SCENARIOS[int(self.rng() * len(SCENARIOS)) % len(SCENARIOS)]
                    self._queue_scenario(avatar, scenario, new_events)
                if avatar.state != "walking":
                    avatar.state = "idle"

        self._prepend_events(new_events)
        return new_events

    def _path_to_object(self, avatar: AvatarState, obj: SimObject) -> None:
        avatar.room = obj.room
        avatar.tx = obj.tx
        avatar.ty = obj.ty
        avatar.state = "walking"

    def _queue_scenario(
        self, avatar: AvatarState, scenario: LifeScenario, events: List[SimEvent],
    ) -> bool:
        obj = object_for_scenario(scenario)
        if not obj:
            return False
        avatar.pending_scenario_id = scenario.id
        avatar.target_object_id = obj.id
        self._path_to_object(avatar, obj)
        events.append(self._mk_event(
            "MOVE_TO_OBJECT", avatar, f"heading to {obj.name}",
            scenario_id=scenario.id, meta={"object_id": obj.id},
        ))
        return True

    def _queue_rest(self, avatar: AvatarState, events: List[SimEvent]) -> None:
        rest_obj = get_object("home_sofa")
        if not rest_obj:
            for candidate in OBJECTS:
                if candidate.rest_gain > 0:
                    rest_obj = candidate
                    break
        if not rest_obj or avatar.target_object_id == rest_obj.id:
            return
        avatar.pending_scenario_id = None
        avatar.target_object_id = rest_obj.id
        self._path_to_object(avatar, rest_obj)
        events.append(self._mk_event(
            "MOVE_TO_OBJECT", avatar, f"heading to {rest_obj.name} to recover",
            meta={"object_id": rest_obj.id},
        ))

    def _arrive_at_object(
        self, avatar: AvatarState, obj: SimObject, events: List[SimEvent],
    ) -> None:
        if avatar.pending_scenario_id:
            scenario = SCENARIOS_BY_ID.get(avatar.pending_scenario_id)
            if scenario:
                self._begin_scenario_at_object(avatar, obj, scenario, events)
            else:
                avatar.pending_scenario_id = None
                avatar.target_object_id = None
                avatar.state = "idle"
            return
        if obj.rest_gain > 0:
            avatar.current_object_id = obj.id
            avatar.target_object_id = None
            avatar.state = "idle"
            avatar.energy = clamp(avatar.energy + obj.rest_gain)
            events.append(self._mk_event(
                "NEED_RECOVER", avatar, f"rested at {obj.name}",
                meta={"object_id": obj.id},
            ))

    def _begin_scenario_at_object(
        self,
        avatar: AvatarState,
        obj: SimObject,
        scenario: LifeScenario,
        events: List[SimEvent],
    ) -> None:
        avatar.current_object_id = obj.id
        avatar.target_object_id = None
        avatar.pending_scenario_id = None
        avatar.scenario_id = scenario.id
        avatar.expected = float(scenario.minutes)
        avatar.elapsed = 0.0
        avatar.state = "working"
        avatar.room = obj.room
        avatar.px = obj.tx
        avatar.py = obj.ty
        events.append(self._mk_event(
            "INTERACTION_STARTED", avatar,
            f"using {obj.name} — {obj.interaction}",
            scenario_id=scenario.id,
            meta={"object_id": obj.id, "interaction": obj.interaction},
        ))
        events.append(self._mk_event(
            "USE_OBJECT", avatar, f"{obj.interaction} at {obj.name}",
            scenario_id=scenario.id, meta={"object_id": obj.id},
        ))
        events.append(self._mk_event(
            "TASK_START", avatar, f"started {scenario.name}",
            scenario_id=scenario.id, meta={"object_id": obj.id},
        ))

    def _tick_movement(self, avatar: AvatarState) -> bool:
        if avatar.at_tile():
            return False
        dx = (avatar.tx - avatar.px) and (1 if avatar.tx > avatar.px else -1)
        dy = (avatar.ty - avatar.py) and (1 if avatar.ty > avatar.py else -1)
        if self.rng() < 0.58:
            if dx:
                avatar.px += dx
            if avatar.px == avatar.tx and dy:
                avatar.py += dy
        elif dy:
            avatar.py += dy
        elif dx:
            avatar.px += dx
        if dx > 0:
            avatar.facing = "east"
        elif dx < 0:
            avatar.facing = "west"
        elif dy > 0:
            avatar.facing = "south"
        elif dy < 0:
            avatar.facing = "north"
        return True

    def _tick_scenario(
        self,
        avatar: AvatarState,
        scenario: LifeScenario,
        ts: float,
        dysfunction_on: bool,
        threshold: float,
        bias: Dict[str, float],
        events: List[SimEvent],
    ) -> None:
        avatar.elapsed += ts
        load_gain = (scenario.cog * 0.04) * ts
        avatar.cog_load = clamp(avatar.cog_load + load_gain * (1 if dysfunction_on else 0.4))
        if scenario.sustained and dysfunction_on:
            avatar.focus = clamp(avatar.focus - bias["drift"] * 0.02 * ts)
        if scenario.aversive > 0.5 and dysfunction_on:
            avatar.stress = clamp(avatar.stress + bias["stress"] * 0.015 * ts)
        avatar.energy = clamp(avatar.energy - MOTIVE_DECAY.energy_per_minute * ts * 1.15)

        if avatar.elapsed >= avatar.expected:
            success_chance = (
                scenario.base + (avatar.focus - 0.5) * 0.4 - avatar.stress * 0.3
            ) * (1 + avatar.independence * 0.2)
            success = self.rng() < clamp(success_chance, 0.1, 0.95)
            if success:
                avatar.successes += 1
                events.append(self._mk_event("TASK_COMPLETE", avatar, f"{scenario.name} ✓"))
            else:
                avatar.failures += 1
                events.append(self._mk_event("TASK_FAIL", avatar, f"{scenario.name} — incomplete"))
            avatar.scenario_id = None
            avatar.current_object_id = None
            avatar.state = "idle"
            avatar.elapsed = 0.0

    def _mk_event(
        self,
        kind: str,
        avatar: AvatarState,
        text: str,
        scenario_id: Optional[str] = None,
        who: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> SimEvent:
        return SimEvent(
            kind=kind,
            avatar_id=avatar.id,
            text=text,
            scenario_id=scenario_id,
            who=who,
            meta=meta or {},
        )

    def _prepend_events(self, new_events: List[SimEvent]) -> None:
        if new_events:
            self.world.events = list(reversed(new_events)) + self.world.events
            self.world.events = self.world.events[:80]

    def snapshot_avatar(self, avatar_id: str) -> Optional[Dict[str, Any]]:
        for avatar in self.world.avatars:
            if avatar.id != avatar_id:
                continue
            return {
                "id": avatar.id,
                "name": avatar.name,
                "state": avatar.state,
                "energy": avatar.energy,
                "scenario_id": avatar.scenario_id,
                "target_object_id": avatar.target_object_id,
                "position": {
                    "room_id": avatar.room,
                    "x": avatar.px,
                    "y": avatar.py,
                    "target_x": avatar.tx,
                    "target_y": avatar.ty,
                    "facing": avatar.facing,
                },
            }
        return None
