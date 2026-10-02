"""
Entity Component System (ECS) Foundation

This module defines the core ECS architecture for the simulation engine.
It uses a hybrid approach where the physical environment is managed via
ECS for performance and scalability, while cognitive AI agents can interface
with entities using rich object-oriented logic.
"""

import uuid
from typing import Any, Dict, List, Type, TypeVar, Optional, cast

T = TypeVar('T', bound='Component')

class Component:
    """Base class for all data components attached to entities."""
    pass

class Entity:
    """
    An Entity in the world. Represented primarily by its ID.
    Components are managed by the ECS registry.
    """
    def __init__(self, entity_id: Optional[str] = None):
        self.entity_id = entity_id or str(uuid.uuid4())

    def __hash__(self):
        return hash(self.entity_id)

    def __eq__(self, other):
        if not isinstance(other, Entity):
            return False
        return self.entity_id == other.entity_id

class System:
    """
    Base class for all systems that process logic over entities with
    specific components.
    """
    def __init__(self):
        self.registry: Optional['Registry'] = None

    def set_registry(self, registry: 'Registry') -> None:
        self.registry = registry

    def update(self, delta_time: float) -> None:
        """Process entities. Override this in subclasses."""
        pass

class Registry:
    """
    Central manager for the ECS architecture.
    Stores all entities, their components, and runs registered systems.
    """
    def __init__(self):
        # Insertion-ordered (dict-backed) so iteration — and therefore system
        # processing order, lock acquisition, and tie-breaking — is
        # deterministic across runs. A plain set would iterate in UUID-hash
        # order, which the engine seed does not control.
        self._entities: Dict[Entity, None] = {}
        self._by_id: Dict[str, Entity] = {}
        # Dictionary mapping Component Class -> {Entity ID -> Component Instance}
        self._components: Dict[Type[Component], Dict[str, Component]] = {}
        self._systems: List[System] = []

    def add_entity(self, entity: Entity) -> None:
        """Add an entity to the registry."""
        self._entities[entity] = None
        self._by_id[entity.entity_id] = entity

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Look up an entity by its ID."""
        return self._by_id.get(entity_id)

    def remove_entity(self, entity: Entity) -> None:
        """Remove an entity and all its associated components."""
        if entity in self._entities:
            del self._entities[entity]
            self._by_id.pop(entity.entity_id, None)
            for component_type in self._components:
                if entity.entity_id in self._components[component_type]:
                    del self._components[component_type][entity.entity_id]

    def add_component(self, entity: Entity, component: Component) -> None:
        """Add a component to an entity."""
        comp_type = type(component)
        if comp_type not in self._components:
            self._components[comp_type] = {}
        self._components[comp_type][entity.entity_id] = component

    def get_component(self, entity: Entity, component_type: Type[T]) -> Optional[T]:
        """Get a specific component for an entity, if it exists."""
        if component_type in self._components:
            return cast(Optional[T], self._components[component_type].get(entity.entity_id))
        return None

    def has_component(self, entity: Entity, component_type: Type[Component]) -> bool:
        """Check if an entity has a specific component."""
        if component_type in self._components:
            return entity.entity_id in self._components[component_type]
        return False

    def get_entities_with(self, *component_types: Type[Component]) -> List[Entity]:
        """Get all entities that have ALL the specified components."""
        if not component_types:
            return list(self._entities)
            
        result = []
        for entity in self._entities:
            has_all = all(self.has_component(entity, c_type) for c_type in component_types)
            if has_all:
                result.append(entity)
        return result

    def register_system(self, system: System) -> None:
        """Register a system to be processed during ticks."""
        system.set_registry(self)
        self._systems.append(system)

    def tick(self, delta_time: float) -> None:
        """Run all systems."""
        for system in self._systems:
            system.update(delta_time)

# --- Standard Core Components ---

class Position(Component):
    """Spatial position component for the discrete grid world."""
    def __init__(self, x: int = 0, y: int = 0, z: int = 0):
        self.x = x
        self.y = y
        self.z = z

    def __str__(self):
        return f"Position({self.x}, {self.y}, {self.z})"

class Descriptor(Component):
    """Human/AI-readable identity for an entity (shown in perception)."""
    def __init__(self, name: str, kind: str = "object", room: Optional[str] = None):
        self.name = name
        self.kind = kind  # "object", "npc", "agent"
        self.room = room

class Collider(Component):
    """Marks an entity as solid — it blocks movement through its tile."""
    pass

class Interactable(Component):
    """
    Component that defines what actions an agent can take on this entity.

    `use_duration_s` is simulated seconds a use takes; `need_effects` are the
    deltas applied to the user's Needs when the use completes.
    """
    def __init__(self, affordances: Optional[List[str]] = None,
                 use_duration_s: float = 1.0,
                 need_effects: Optional[Dict[str, float]] = None):
        self.affordances = affordances or []
        self.in_use_by: Optional[str] = None  # Agent ID currently using this
        self.use_duration_s = use_duration_s
        self.need_effects = need_effects or {}

class Needs(Component):
    """
    Sims-style needs, each normalized 0..1 (1 = fully satisfied).
    `decay_per_s` maps a need to how much it drains per simulated second.
    """
    def __init__(self, levels: Optional[Dict[str, float]] = None,
                 decay_per_s: Optional[Dict[str, float]] = None):
        self.levels: Dict[str, float] = dict(levels or {})
        self.decay_per_s: Dict[str, float] = dict(decay_per_s or {})

    def adjust(self, need: str, delta: float) -> None:
        current = self.levels.get(need, 0.0)
        self.levels[need] = max(0.0, min(1.0, current + delta))

class AgentState(Component):
    """Renderable affect + scenario progress for contract snapshots."""

    def __init__(self,
                 state: str = "idle",
                 emotional_state: str = "neutral",
                 focus: float = 0.65,
                 cognitive_load: float = 0.2,
                 stress: float = 0.15,
                 burnout_risk: float = 0.05,
                 independence: float = 0.2,
                 fusion_readiness: float = 0.0,
                 success_rate: float = 0.5,
                 scenario_id: Optional[str] = None,
                 scenario_elapsed: float = 0.0,
                 scenario_expected: float = 60.0,
                 target_x: Optional[int] = None,
                 target_y: Optional[int] = None,
                 facing: str = "south",
                 minutes_focused: float = 0.0,
                 false_starts: int = 0,
                 interventions: int = 0,
                 successes: int = 0,
                 failures: int = 0):
        self.state = state
        self.emotional_state = emotional_state
        self.focus = focus
        self.cognitive_load = cognitive_load
        self.stress = stress
        self.burnout_risk = burnout_risk
        self.independence = independence
        self.fusion_readiness = fusion_readiness
        self.success_rate = success_rate
        self.scenario_id = scenario_id
        self.scenario_elapsed = scenario_elapsed
        self.scenario_expected = scenario_expected
        self.target_x = target_x
        self.target_y = target_y
        self.facing = facing
        self.minutes_focused = minutes_focused
        self.false_starts = false_starts
        self.interventions = interventions
        self.successes = successes
        self.failures = failures

    def clamp_metrics(self) -> None:
        for attr in ("focus", "cognitive_load", "stress", "burnout_risk",
                     "independence", "fusion_readiness", "success_rate"):
            value = getattr(self, attr)
            setattr(self, attr, max(0.0, min(1.0, value)))


class AgentController(Component):
    """
    Bridge component connecting an ECS Entity to an external cognitive AI agent.
    The agent submits 'intents' which the systems process over time.
    """
    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.current_intent: Optional[Dict[str, Any]] = None
        self.intent_progress: float = 0.0
        # Result of the most recently finished intent:
        # {"intent": {...}, "status": "completed"|"failed", "reason": str|None}
        self.last_result: Optional[Dict[str, Any]] = None

    def finish_intent(self, status: str, reason: Optional[str] = None) -> None:
        self.last_result = {
            "intent": self.current_intent,
            "status": status,
            "reason": reason,
        }
        self.current_intent = None
        self.intent_progress = 0.0
