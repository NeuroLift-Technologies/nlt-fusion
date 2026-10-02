"""
SimSim-style utility controller for the v1 Core Loop.

Ports the decision loop from SimSim (Charity et al., AAAI AIIDE 2020,
arXiv:2008.11258): rank the needs, act on the first one that drops below
threshold, walk to the nearest object that restores it, use it until it is
satisfied, then move down the ranking.

Lives behind the same AgentInterface seam as ScenarioAgent — decisions stay
outside the deterministic tick, and the controller is swappable for an
LLM-driven one without touching the engine.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .agent_interface import AgentInterface

# Mirrors SimSim's needsRanking ([hunger, hygiene, bladder, energy, social,
# fun]) minus bladder, which the default world does not model.
DEFAULT_NEEDS_RANKING = ["hunger", "hygiene", "energy", "social", "fun"]
DEFAULT_THRESHOLD = 0.5
DEFAULT_VISION_RADIUS = 25


class UtilityAgent:
    """Baseline NPC: satisfy the first ranked need below threshold."""

    def __init__(self, interface: AgentInterface,
                 needs_ranking: Optional[List[str]] = None,
                 threshold: float = DEFAULT_THRESHOLD,
                 vision_radius: int = DEFAULT_VISION_RADIUS):
        self.interface = interface
        self.needs_ranking = list(needs_ranking or DEFAULT_NEEDS_RANKING)
        self.threshold = threshold
        self.vision_radius = vision_radius
        self.plan: Optional[Dict[str, Any]] = None

    def decide(self, needs: Dict[str, float],
               surroundings: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Return a plan for the first ranked need below threshold.

        Unlike a min-need controller, priority order wins: a high-priority
        need at 0.4 beats a low-priority need at 0.1 for attention.
        """
        for need in self.needs_ranking:
            if needs.get(need, 0.0) >= self.threshold:
                continue
            target = self._nearest_beneficial(need, surroundings)
            if target is None:
                continue
            return {
                "target_id": target["entity_id"],
                "target_name": target.get("name", "?"),
                "affordance": target["affordances"][0],
                "need": need,
                "phase": "approach",
            }
        return None

    def _nearest_beneficial(self, need: str,
                            surroundings: List[Dict[str, Any]]
                            ) -> Optional[Dict[str, Any]]:
        """Closest object (SimSim's findNeedObj) that raises `need`.

        Objects already in use are skipped, so multiple NPCs share the world
        without piling onto one fridge.
        """
        nearest: Optional[Dict[str, Any]] = None
        for thing in surroundings:
            if not thing.get("affordances") or thing.get("in_use"):
                continue
            effects = thing.get("need_effects") or {}
            if effects.get(need, 0.0) <= 0.0 or thing["distance"] == float("inf"):
                continue
            if nearest is None or thing["distance"] < nearest["distance"]:
                nearest = thing
        return nearest

    def step(self) -> None:
        """Advance the plan; called once per tick, outside the engine."""
        if self.interface.is_busy():
            return

        if self.plan and self.plan["phase"] == "approach":
            result = self.interface.last_result()
            if result and result["status"] == "completed":
                self.plan["phase"] = "use"
                self.interface.use(self.plan["target_id"], self.plan["affordance"])
                return
            self.plan = None  # Approach failed; re-plan

        if self.plan and self.plan["phase"] == "use":
            self.plan = None  # Use finished (or failed); re-plan next tick

        if self.plan is None:
            perception = self.interface.perceive(vision_radius=self.vision_radius)
            self.plan = self.decide(self.interface.needs(),
                                    perception.describe_surroundings())
            if self.plan and not self.interface.move_adjacent_to(self.plan["target_id"]):
                self.plan = None
