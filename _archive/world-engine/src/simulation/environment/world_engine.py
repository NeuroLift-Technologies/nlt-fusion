"""
World Engine

Core simulation engine that manages the virtual world.
Now powered by a hybrid Entity-Component System (ECS) to efficiently
handle thousands of objects, spatial queries, and ticking mechanics.
"""

from enum import Enum
from typing import Dict, List, Any, Optional
import random
import uuid
from datetime import datetime, timedelta

from .ecs import Registry, Entity, Position, Needs, AgentController, Descriptor, AgentState
from .world_map import GridManager
from .snapshot_contract import (
    emit_contract_snapshot, load_contract_snapshot,
    make_contract_event, update_facing_on_move,
)

# Fixed default epoch keeps runs deterministic and replayable by default;
# pass config["start_time"] (datetime or ISO string) to override.
DEFAULT_START_TIME = datetime(2026, 1, 1, 8, 0, 0)


class SimulationState(Enum):
    """Current state of the simulation"""
    INITIALIZING = "initializing"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"


class EventType(Enum):
    """Types of events emitted by the simulation engine"""
    TICK = "tick"
    ENTITY_ADDED = "entity_added"
    ENTITY_REMOVED = "entity_removed"
    ENTITY_MOVED = "entity_moved"
    INTERACTION_STARTED = "interaction_started"
    INTERACTION_COMPLETED = "interaction_completed"


class WorldEngine:
    """
    The main driver for the ECS and spatial grid.
    Advances time, runs systems, and emits global events.
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.simulation_id = str(uuid.uuid4())
        
        # State
        self.current_state = SimulationState.INITIALIZING

        # Time — deterministic by default (see DEFAULT_START_TIME)
        start_time = self.config.get("start_time", DEFAULT_START_TIME)
        if isinstance(start_time, str):
            start_time = datetime.fromisoformat(start_time)
        self.start_time = start_time
        self.simulation_time = start_time
        self.tick_count = 0
        self.time_per_tick = timedelta(seconds=self.config.get("seconds_per_tick", 1.0))

        # Seeded RNG — anything stochastic in the world must draw from this
        self.seed = int(self.config.get("seed", 0))
        self.rng = random.Random(self.seed)
        self.pace = float(self.config.get("pace", 1.0))
        self.scene_id = self.config.get("scene_id", "default_home")

        # Contract stream state
        self.avatar_profiles: Dict[str, Dict[str, Any]] = {}
        self.contract_events: List[Dict[str, Any]] = []
        self.interventions: List[Dict[str, Any]] = []
        self._event_sequence = 0
        self._intervention_sequence = 0
        self._pending_events: List[Dict[str, Any]] = []

        # Architecture
        self.registry = Registry()
        
        # We start with a 100x100 grid by default
        grid_width = self.config.get("grid_width", 100)
        grid_height = self.config.get("grid_height", 100)
        self.grid = GridManager(width=grid_width, height=grid_height, registry=self.registry)
        
        # Event Bus
        self.event_listeners: Dict[EventType, List[Any]] = {e: [] for e in EventType}
        
        self.initialize()
        
    def initialize(self) -> None:
        """Set up initial systems and state."""
        self.current_state = SimulationState.RUNNING

        if self.config.get("register_default_systems", True):
            # Imported here to avoid a circular import at module load
            from .systems import NeedsSystem, MovementSystem, InteractionSystem
            self.registry.register_system(NeedsSystem(self))
            self.registry.register_system(
                MovementSystem(self, tiles_per_second=self.config.get("tiles_per_second", 2.0)))
            self.registry.register_system(InteractionSystem(self))

    def spawn_entity(self) -> Entity:
        """Create and register a new entity."""
        entity = Entity()
        self.registry.add_entity(entity)
        self.grid.invalidate_index()
        self.emit_event(EventType.ENTITY_ADDED, {"entity_id": entity.entity_id})
        return entity

    def remove_entity(self, entity: Entity) -> None:
        """Remove an entity from the world."""
        self.registry.remove_entity(entity)
        self.grid.invalidate_index()
        self.emit_event(EventType.ENTITY_REMOVED, {"entity_id": entity.entity_id})

    def emit_move_event(self, entity: Entity, old_x: int, old_y: int,
                        new_x: int, new_y: int) -> None:
        """Convenience emitter used by MovementSystem."""
        update_facing_on_move(self, entity, old_x, old_y, new_x, new_y)
        self.emit_event(EventType.ENTITY_MOVED, {
            "entity_id": entity.entity_id,
            "from": [old_x, old_y],
            "to": [new_x, new_y],
        })

    def emit_interaction_event(self, started: bool, entity: Entity,
                               target: Entity, affordance: str) -> None:
        """Convenience emitter used by InteractionSystem."""
        event_type = (EventType.INTERACTION_STARTED if started
                      else EventType.INTERACTION_COMPLETED)
        self.emit_event(event_type, {
            "entity_id": entity.entity_id,
            "target_id": target.entity_id,
            "affordance": affordance,
        })

    def register_avatar_profile(self, agent_id: str, entity: Entity, **profile: Any) -> None:
        """Register contract metadata for an agent entity."""
        self.avatar_profiles[agent_id] = {
            "entity_id": entity.entity_id,
            **profile,
        }
        if not self.registry.has_component(entity, AgentState):
            self.registry.add_component(entity, AgentState(
                target_x=profile.get("spawn_x"),
                target_y=profile.get("spawn_y"),
            ))

    def drain_contract_events(self) -> List[Dict[str, Any]]:
        """Return and clear events emitted since the last drain."""
        pending = self._pending_events[:]
        self._pending_events.clear()
        return pending

    def get_snapshot(self) -> Dict[str, Any]:
        """Emit a contracts/v1 snapshot (authoritative wire format)."""
        return emit_contract_snapshot(self)

    def load_snapshot(self, snapshot: Dict[str, Any]) -> None:
        """Restore simulation state from a contracts/v1 snapshot."""
        load_contract_snapshot(self, snapshot)

    def get_legacy_snapshot(self) -> Dict[str, Any]:
        """
        Minimal serializable view of world state — tick, clock, and every
        positioned entity with its descriptor, needs, and current intent.
        Groundwork for the contracts/v1 snapshot format.
        """
        entities = {}
        for entity in self.registry.get_entities_with(Position):
            pos = self.registry.get_component(entity, Position)
            record: Dict[str, Any] = {"position": [pos.x, pos.y]}
            descriptor = self.registry.get_component(entity, Descriptor)
            if descriptor:
                record["name"] = descriptor.name
                record["kind"] = descriptor.kind
            needs = self.registry.get_component(entity, Needs)
            if needs:
                record["needs"] = {k: round(v, 6) for k, v in sorted(needs.levels.items())}
            controller = self.registry.get_component(entity, AgentController)
            if controller and controller.current_intent:
                record["intent_type"] = controller.current_intent.get("type")
            entities[entity.entity_id] = record
        return {
            "tick": self.tick_count,
            "simulation_time": self.simulation_time.isoformat(),
            "entities": entities,
        }

    def run_simulation_step(self) -> bool:
        """
        Run one 'tick' of the simulation.
        Processes all ECS systems, updates time, and fires events.
        """
        if self.current_state != SimulationState.RUNNING:
            return False
            
        try:
            # Time delta for systems is usually seconds
            dt = self.time_per_tick.total_seconds()
            
            # 1. Run ECS Systems
            self.registry.tick(dt)
            
            # 2. Update Time
            self.simulation_time += self.time_per_tick
            self.tick_count += 1
            
            # 3. Emit global tick event
            self.emit_event(EventType.TICK, {
                "tick_count": self.tick_count,
                "simulation_time": self.simulation_time.isoformat()
            })
            tick_event = make_contract_event(
                self,
                "simulation.tick",
                "Simulation advanced one tick.",
                payload={"tick_count": self.tick_count},
            )
            self._pending_events.append(tick_event)
            
            return True
            
        except Exception as e:
            self.current_state = SimulationState.ERROR
            print(f"Simulation tick failed: {e}")
            return False

    def emit_event(self, event_type: EventType, data: Dict[str, Any]) -> None:
        """Simple pub/sub for engine events."""
        listeners = self.event_listeners.get(event_type, [])
        for listener in listeners:
            try:
                # Expecting a callable listener: listener(event_type, data)
                listener(event_type, data)
            except Exception as e:
                print(f"Error in event listener: {e}")

    def subscribe(self, event_type: EventType, listener: Any) -> None:
        """Subscribe to engine events."""
        if event_type in self.event_listeners:
            self.event_listeners[event_type].append(listener)