"""
Scenario-driven agent controller for the v1 Core Loop slice.

Follows ScenarioSystem objectives using the same AgentInterface seam as
UtilityAgent — deterministic, recorded, and swappable for LLM controllers.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, TYPE_CHECKING

from .agent_interface import AgentInterface

if TYPE_CHECKING:
    from .scenario_system import ScenarioSystem


class ScenarioAgent:
    """Walk the active scenario objective list via AgentInterface intents."""

    def __init__(self, interface: AgentInterface,
                 scenario_system: "ScenarioSystem",
                 placed_names: Dict[str, str]):
        self.interface = interface
        self.scenario_system = scenario_system
        self.placed_names = placed_names  # name -> entity_id
        self.plan: Optional[Dict[str, Any]] = None

    def step(self) -> None:
        if self.interface.is_busy():
            return

        if self.plan and self.plan["phase"] == "approach":
            result = self.interface.last_result()
            if result and result["status"] == "completed":
                self.plan["phase"] = "use"
                self.interface.use(self.plan["target_id"], self.plan["affordance"])
                return
            self.plan = None

        if self.plan and self.plan["phase"] == "use":
            result = self.interface.last_result()
            if result and result["status"] == "completed":
                self.scenario_system.complete_objective(self.interface.agent_id)
            self.plan = None

        if self.plan is None:
            objective = self.scenario_system.current_objective(
                self.interface.agent_id)
            if objective is None:
                return
            target_id = self.placed_names.get(objective["prop"])
            if not target_id:
                return
            self.plan = {
                "target_id": target_id,
                "affordance": objective["affordance"],
                "phase": "approach",
            }
            if not self.interface.move_adjacent_to(target_id):
                self.plan = None
