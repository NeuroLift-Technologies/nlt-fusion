"""
Simulation environment - the Sims-like world AI agents live in.

Contains:
- world_engine: tick loop, deterministic clock/RNG, event bus, snapshots
- ecs: Entity-Component-System (Position, Collider, Interactable, Needs, ...)
- world_map: spatial grid index and A* pathfinding
- systems: NeedsSystem, MovementSystem, InteractionSystem
- world_builder: declarative spec -> populated world (default home world)
- agent_interface: the perception/intent boundary AI agents plug into
- utility_agent: SimSim-style needs-ranking controller for autonomous NPCs
- scenarios: scenario library and definitions

See `world-engine/demo.py` for an agent living a full day in this world.
"""
