"""
Core ECS Systems

The systems that make the world run each tick:

- NeedsSystem        — sims-style need decay over time
- MovementSystem     — executes "move_to" intents via A* pathfinding
- InteractionSystem  — executes "use" intents against Interactable objects

Agents (human, scripted, or LLM-driven) never mutate world state directly;
they submit intents through `AgentInterface` and these systems resolve them
deterministically inside the tick.
"""

from typing import TYPE_CHECKING

from .ecs import (
    System, Entity, Position, AgentController, Interactable, Needs,
)

if TYPE_CHECKING:
    from .world_engine import WorldEngine


class EngineSystem(System):
    """Base for systems that need access to the engine (events, grid, time)."""

    def __init__(self, engine: "WorldEngine"):
        super().__init__()
        self.engine = engine


class NeedsSystem(EngineSystem):
    """Drains every entity's needs by their decay rates each tick."""

    def update(self, delta_time: float) -> None:
        if not self.registry:
            return
        for entity in self.registry.get_entities_with(Needs):
            needs = self.registry.get_component(entity, Needs)
            if not needs:
                continue
            for need, rate in needs.decay_per_s.items():
                needs.adjust(need, -rate * delta_time)


class MovementSystem(EngineSystem):
    """
    Processes "move_to" intents: computes a path once, then walks the agent
    one tile per `tiles_per_second * delta_time` along it.

    Intent shape: {"type": "move_to", "data": {"x": int, "y": int}}
    """

    def __init__(self, engine: "WorldEngine", tiles_per_second: float = 2.0):
        super().__init__(engine)
        self.tiles_per_second = tiles_per_second

    def update(self, delta_time: float) -> None:
        if not self.registry:
            return
        for entity in self.registry.get_entities_with(AgentController, Position):
            controller = self.registry.get_component(entity, AgentController)
            if not controller or not controller.current_intent:
                continue
            if controller.current_intent.get("type") != "move_to":
                continue
            self._advance(entity, controller, delta_time)

    def _advance(self, entity: Entity, controller: AgentController,
                 delta_time: float) -> None:
        pos = self.registry.get_component(entity, Position)
        data = controller.current_intent["data"]
        goal = (data["x"], data["y"])

        if (pos.x, pos.y) == goal:
            controller.finish_intent("completed")
            return

        path = data.get("_path")
        if path is None:
            path = self.engine.grid.find_path(pos.x, pos.y, goal[0], goal[1])
            if not path:
                controller.finish_intent("failed", reason="no_path")
                return
            data["_path"] = path
            data["_path_i"] = 0  # Cursor instead of pop(0): O(1) per step

        # Accumulate fractional movement so slow speeds still progress
        data["_movement_budget"] = data.get("_movement_budget", 0.0) \
            + self.tiles_per_second * delta_time

        while data["_movement_budget"] >= 1.0 and data["_path_i"] < len(path):
            data["_movement_budget"] -= 1.0
            next_x, next_y = path[data["_path_i"]]
            # Re-check walkability in case the world changed since pathing —
            # the goal included: agents never step onto solid tiles
            if not self.engine.grid.is_walkable(next_x, next_y):
                data["_path"] = None
                return  # Re-path next tick
            data["_path_i"] += 1
            old_x, old_y = pos.x, pos.y
            pos.x, pos.y = next_x, next_y
            self.engine.grid.update_entity_position(entity, old_x, old_y, next_x, next_y)
            self.engine.emit_move_event(entity, old_x, old_y, next_x, next_y)

        if (pos.x, pos.y) == goal:
            controller.finish_intent("completed")


class InteractionSystem(EngineSystem):
    """
    Processes "use" intents: the agent must be adjacent to the target,
    the target must be free, and the use takes `use_duration_s` of sim
    time. Need effects apply when the use completes.

    Intent shape: {"type": "use", "target_id": str, "data": {"affordance": str}}
    """

    def update(self, delta_time: float) -> None:
        if not self.registry:
            return
        for entity in self.registry.get_entities_with(AgentController, Position):
            controller = self.registry.get_component(entity, AgentController)
            if not controller or not controller.current_intent:
                continue
            if controller.current_intent.get("type") != "use":
                continue
            self._advance(entity, controller, delta_time)

    def _advance(self, entity: Entity, controller: AgentController,
                 delta_time: float) -> None:
        intent = controller.current_intent
        target = self.registry.get_entity(intent.get("target_id") or "")
        if target is None:
            controller.finish_intent("failed", reason="no_such_target")
            return

        interactable = self.registry.get_component(target, Interactable)
        if interactable is None:
            controller.finish_intent("failed", reason="not_interactable")
            return

        affordance = intent["data"].get("affordance")
        if affordance not in interactable.affordances:
            controller.finish_intent("failed", reason="no_such_affordance")
            return

        my_pos = self.registry.get_component(entity, Position)
        target_pos = self.registry.get_component(target, Position)
        if target_pos is None or max(abs(my_pos.x - target_pos.x),
                                     abs(my_pos.y - target_pos.y)) > 1:
            controller.finish_intent("failed", reason="not_adjacent")
            return

        if interactable.in_use_by not in (None, controller.agent_id):
            controller.finish_intent("failed", reason="occupied")
            return

        if interactable.in_use_by is None:
            interactable.in_use_by = controller.agent_id
            self.engine.emit_interaction_event(
                started=True, entity=entity, target=target, affordance=affordance)

        duration = max(interactable.use_duration_s, 1e-6)
        controller.intent_progress += delta_time / duration

        if controller.intent_progress >= 1.0:
            needs = self.registry.get_component(entity, Needs)
            if needs:
                for need, delta in interactable.need_effects.items():
                    needs.adjust(need, delta)
            interactable.in_use_by = None
            self.engine.emit_interaction_event(
                started=False, entity=entity, target=target, affordance=affordance)
            controller.finish_intent("completed")
