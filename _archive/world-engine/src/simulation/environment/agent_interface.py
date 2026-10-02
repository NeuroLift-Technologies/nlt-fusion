"""
Agent Interface

The API boundary between the physical WorldEngine (ECS) and a cognitive AI
agent — scripted, utility-based, or LLM-driven. The world does not care what
is making the decisions; anything that can read a perception and submit an
intent can live here.

The contract is deliberately small:

    perceive()  -> what is around me (names, distances, affordances, my needs)
    move_to / move_adjacent_to / use  -> submit an intent
    check_intent_status / last_result -> poll how my intent went

Intents are resolved by the ECS systems inside the engine tick, never
immediately — model calls and decision logic stay outside the deterministic
simulation loop.
"""

from typing import Dict, List, Any, Optional, Tuple
from .world_engine import WorldEngine
from .ecs import (
    Entity, Position, Interactable, AgentController, Needs, Descriptor,
)


class PerceptionMap:
    """A snapshot of what the agent can currently see in the world."""

    def __init__(self, my_pos: Position, visible_entities: List[Entity],
                 engine: WorldEngine):
        self.my_pos = my_pos
        self.entities = visible_entities
        self._engine = engine

    def describe_surroundings(self) -> List[Dict[str, Any]]:
        """
        Returns a simplified list of objects and affordances, sorted by
        distance — designed to be readable by an LLM/cognitive model.
        """
        descriptions = []
        registry = self._engine.registry
        for e in self.entities:
            pos = registry.get_component(e, Position)
            interactable = registry.get_component(e, Interactable)
            descriptor = registry.get_component(e, Descriptor)

            # Positionless entities sort last, not first
            desc: Dict[str, Any] = {
                "entity_id": e.entity_id,
                "distance": (abs(pos.x - self.my_pos.x) + abs(pos.y - self.my_pos.y)
                             if pos else float("inf")),
            }
            if pos:
                desc["position"] = [pos.x, pos.y]
            if descriptor:
                desc["name"] = descriptor.name
                desc["kind"] = descriptor.kind
                if descriptor.room:
                    desc["room"] = descriptor.room
            if interactable:
                desc["affordances"] = interactable.affordances
                desc["in_use"] = interactable.in_use_by is not None
                desc["need_effects"] = interactable.need_effects

            descriptions.append(desc)

        descriptions.sort(key=lambda x: x["distance"])  # type: ignore[arg-type,return-value]
        return descriptions


class AgentInterface:
    """
    Bridge class instantiated by an AI agent. It links the agent to a
    physical Entity in the WorldEngine.
    """

    def __init__(self, engine: WorldEngine, agent_id: str,
                 x: int = 0, y: int = 0, name: Optional[str] = None,
                 needs: Optional[Needs] = None):
        self.engine = engine
        self.agent_id = agent_id

        # Spawn an entity for this agent
        self.entity = self.engine.spawn_entity()

        # Attach required components
        self.controller = AgentController(agent_id=agent_id)
        self.engine.registry.add_component(self.entity, self.controller)
        self.engine.registry.add_component(self.entity, Position(x, y, 0))
        self.engine.registry.add_component(
            self.entity, Descriptor(name=name or agent_id, kind="agent"))
        if needs is not None:
            self.engine.registry.add_component(self.entity, needs)
        self.engine.grid.invalidate_index()

    # --- Perception ---

    def perceive(self, vision_radius: int = 5) -> PerceptionMap:
        """Query the world map for nearby entities."""
        pos = self.engine.registry.get_component(self.entity, Position)
        if not pos:
            return PerceptionMap(Position(), [], self.engine)

        nearby = self.engine.grid.get_entities_in_radius(pos.x, pos.y, vision_radius)
        # Exclude self
        if self.entity in nearby:
            nearby.remove(self.entity)

        return PerceptionMap(pos, nearby, self.engine)

    def position(self) -> Tuple[int, int]:
        pos = self.engine.registry.get_component(self.entity, Position)
        return (pos.x, pos.y) if pos else (-1, -1)

    def needs(self) -> Dict[str, float]:
        """Current need levels (empty dict if the agent has no Needs)."""
        needs = self.engine.registry.get_component(self.entity, Needs)
        return dict(needs.levels) if needs else {}

    # --- Intents ---

    def submit_intent(self, intent_type: str, target_id: Optional[str] = None,
                      data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Submit an action for the ECS engine to process.
        Returns False if the agent is already busy.
        """
        if self.controller.current_intent is not None:
            return False  # Agent is currently executing an action

        self.controller.current_intent = {
            "type": intent_type,
            "target_id": target_id,
            "data": data or {}
        }
        self.controller.intent_progress = 0.0
        return True

    def move_to(self, x: int, y: int) -> bool:
        """Walk to a specific tile."""
        return self.submit_intent("move_to", data={"x": x, "y": y})

    def move_adjacent_to(self, target_id: str) -> bool:
        """
        Walk to a walkable tile next to a target entity (how you approach a
        solid object before using it). Fails if the target has no free side.
        """
        target = self.engine.registry.get_entity(target_id)
        if target is None:
            return False
        target_pos = self.engine.registry.get_component(target, Position)
        if target_pos is None:
            return False

        my_x, my_y = self.position()
        if (my_x, my_y) == (-1, -1):
            return False
        if max(abs(my_x - target_pos.x), abs(my_y - target_pos.y)) <= 1:
            # Deliberately submit a trivial move rather than returning early:
            # controllers wait on a fresh last_result to advance their plan
            return self.submit_intent("move_to", data={"x": my_x, "y": my_y})

        candidates = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = target_pos.x + dx, target_pos.y + dy
                if self.engine.grid.is_walkable(nx, ny):
                    candidates.append((abs(nx - my_x) + abs(ny - my_y), nx, ny))
        candidates.sort()
        # Nearest walkable side first, but only accept one we can actually
        # reach — the closest tile may sit in a walled-off pocket
        for _, x, y in candidates:
            if (x, y) == (my_x, my_y) or self.engine.grid.find_path(my_x, my_y, x, y):
                return self.submit_intent("move_to", data={"x": x, "y": y})
        return False

    def use(self, target_id: str, affordance: str) -> bool:
        """Use an affordance on an adjacent interactable entity."""
        return self.submit_intent("use", target_id=target_id,
                                  data={"affordance": affordance})

    # --- Status ---

    def check_intent_status(self) -> Optional[Dict[str, Any]]:
        """Return the current action the agent is performing."""
        return self.controller.current_intent

    def is_busy(self) -> bool:
        return self.controller.current_intent is not None

    def last_result(self) -> Optional[Dict[str, Any]]:
        """Result of the most recently finished intent."""
        return self.controller.last_result
