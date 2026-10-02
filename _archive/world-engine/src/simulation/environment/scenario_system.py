"""
ScenarioSystem — wires orphaned scenarios.py into the live ECS world.

v1: Morning Routine (pers_4) for StayAlert with scheduled stressors and
a single Aide intervention surfaced to the studio AideLog.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from .ecs import AgentController, AgentState, Entity, System
from .scenarios import Scenario, ScenarioLibrary
from .snapshot_contract import make_contract_event, make_intervention

if TYPE_CHECKING:
    from .world_engine import WorldEngine

MORNING_ROUTINE_OBJECTIVES = [
    {"id": "shower", "prop": "shower", "affordance": "shower"},
    {"id": "breakfast", "prop": "fridge", "affordance": "eat"},
    {"id": "getting_ready", "prop": "desk", "affordance": "work"},
]


@dataclass
class ActiveScenario:
    scenario: Scenario
    objectives: List[Dict[str, str]]
    objective_index: int = 0
    stressors_fired: List[str] = field(default_factory=list)
    intervention_logged: bool = False
    elapsed_minutes: float = 0.0


class ScenarioSystem(System):
    """Loads scenarios, schedules stressors, and emits struggle/intervention events."""

    def __init__(self, engine: "WorldEngine",
                 placed: Dict[str, Entity],
                 avatar_contract_ids: Dict[str, str],
                 aide_ids: Dict[str, str]):
        super().__init__()
        self.engine = engine
        self.placed = placed
        self.avatar_contract_ids = avatar_contract_ids
        self.aide_ids = aide_ids
        self.active: Dict[str, ActiveScenario] = {}

    def assign(self, agent_id: str, scenario_id: str) -> None:
        scenario = ScenarioLibrary.get_scenario_by_id(scenario_id)
        objectives = (MORNING_ROUTINE_OBJECTIVES
                      if scenario_id == "pers_4" else [])
        self.active[agent_id] = ActiveScenario(
            scenario=scenario,
            objectives=objectives,
            objective_index=0,
        )

        contract_id = self.avatar_contract_ids.get(agent_id, agent_id)
        entity = self._entity_for_agent(agent_id)
        if entity:
            agent_state = self.engine.registry.get_component(entity, AgentState)
            if agent_state:
                agent_state.scenario_id = scenario_id
                agent_state.scenario_elapsed = 0.0
                agent_state.scenario_expected = (
                    scenario.expected_duration.total_seconds() / 60.0)
                agent_state.state = "working"

        make_contract_event(
            self.engine,
            "scenario.assigned",
            f"Assigned {scenario.name} to {contract_id}.",
            source_type="human",
            source_id="operator",
            subject_id=contract_id,
            scenario_id=scenario_id,
            state_changes=[
                {"op": "set", "path": f"/avatars/{contract_id}/state", "value": "working"},
                {"op": "set", "path": f"/avatars/{contract_id}/scenario",
                 "value": {
                     "id": scenario_id,
                     "elapsed": 0,
                     "expected": scenario.expected_duration.total_seconds() / 60.0,
                 }},
            ],
        )

    def current_objective(self, agent_id: str) -> Optional[Dict[str, str]]:
        active = self.active.get(agent_id)
        if not active or active.objective_index >= len(active.objectives):
            return None
        return active.objectives[active.objective_index]

    def complete_objective(self, agent_id: str) -> None:
        active = self.active.get(agent_id)
        if not active:
            return
        active.objective_index += 1
        if active.objective_index >= len(active.objectives):
            contract_id = self.avatar_contract_ids.get(agent_id, agent_id)
            entity = self._entity_for_agent(agent_id)
            if entity:
                agent_state = self.engine.registry.get_component(entity, AgentState)
                if agent_state:
                    agent_state.state = "idle"
                    agent_state.scenario_id = None
                    agent_state.successes += 1
            make_contract_event(
                self.engine,
                "scenario.completed",
                f"Completed {active.scenario.name}.",
                subject_id=contract_id,
                scenario_id=active.scenario.scenario_id,
            )
            del self.active[agent_id]

    def update(self, delta_time: float) -> None:
        minutes = delta_time / 60.0
        for agent_id, active in list(self.active.items()):
            active.elapsed_minutes += minutes
            entity = self._entity_for_agent(agent_id)
            if entity is None:
                continue
            agent_state = self.engine.registry.get_component(entity, AgentState)
            if agent_state is None:
                continue

            agent_state.scenario_elapsed = active.elapsed_minutes
            agent_state.cognitive_load = min(
                1.0, agent_state.cognitive_load + 0.01 * minutes)

            if (active.scenario.scenario_id == "pers_4"
                    and "distraction" not in active.stressors_fired
                    and active.elapsed_minutes >= 12.0):
                self._fire_stressor(agent_id, active, agent_state, "distraction")

            if (not active.intervention_logged
                    and agent_state.focus < 0.45
                    and active.stressors_fired):
                self._log_aide_intervention(agent_id, active, agent_state)

            agent_state.clamp_metrics()

    def _entity_for_agent(self, agent_id: str) -> Optional[Entity]:
        profile = self.engine.avatar_profiles.get(agent_id)
        if profile is None:
            return None
        return self.engine.registry.get_entity(profile["entity_id"])

    def _fire_stressor(self, agent_id: str, active: ActiveScenario,
                       agent_state: AgentState, stressor_id: str) -> None:
        active.stressors_fired.append(stressor_id)
        contract_id = self.avatar_contract_ids.get(agent_id, agent_id)
        agent_state.state = "drifting"
        agent_state.focus = max(0.0, agent_state.focus - 0.12)
        agent_state.stress = min(1.0, agent_state.stress + 0.15)
        agent_state.false_starts += 1
        make_contract_event(
            self.engine,
            "struggle.focus_drift",
            "Lost focus during morning routine — notification distraction.",
            source_type="scenario",
            source_id=active.scenario.scenario_id,
            subject_id=contract_id,
            scenario_id=active.scenario.scenario_id,
            payload={"stressor_id": stressor_id},
            state_changes=[
                {"op": "set", "path": f"/avatars/{contract_id}/state", "value": "drifting"},
                {"op": "increment", "path": f"/avatars/{contract_id}/metrics/focus", "value": -0.12},
                {"op": "increment", "path": f"/avatars/{contract_id}/metrics/stress", "value": 0.15},
            ],
        )

    def _log_aide_intervention(self, agent_id: str, active: ActiveScenario,
                               agent_state: AgentState) -> None:
        active.intervention_logged = True
        contract_id = self.avatar_contract_ids.get(agent_id, agent_id)
        aide_id = self.aide_ids.get(agent_id, "dr_vance")
        strategy = "Attention anchor"
        effectiveness = 0.6
        effects = {"focus": 0.08, "cognitive_load": -0.1, "stress": -0.12}

        agent_state.state = "coached"
        agent_state.focus = min(1.0, agent_state.focus + effects["focus"])
        agent_state.cognitive_load = max(
            0.0, agent_state.cognitive_load + effects["cognitive_load"])
        agent_state.stress = max(0.0, agent_state.stress + effects["stress"])
        agent_state.interventions += 1

        intervention = make_intervention(
            self.engine,
            avatar_id=contract_id,
            aide_id=aide_id,
            strategy=strategy,
            reason="Focus drifted during the morning routine sequence.",
            effectiveness=effectiveness,
            effects=effects,
        )
        make_contract_event(
            self.engine,
            "aide.coaching_delivered",
            f"{aide_id} delivered {strategy}.",
            source_type="aide",
            source_id=aide_id,
            subject_id=contract_id,
            scenario_id=active.scenario.scenario_id,
            payload={"intervention_id": intervention["intervention_id"]},
            state_changes=[
                {"op": "set", "path": f"/avatars/{contract_id}/state", "value": "coached"},
                {"op": "increment", "path": f"/avatars/{contract_id}/counters/interventions", "value": 1},
            ],
        )
