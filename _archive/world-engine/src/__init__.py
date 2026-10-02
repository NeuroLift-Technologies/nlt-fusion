"""
World Engine - NLT Fusion Environment

A Sims-like simulated world that AI agents can live in. This repo owns the
environment only: world state, space, time, objects, needs, and NPCs.
Avatar/Aide intelligence, ADHD trait modeling, and fusion mechanics live in
the sibling repo (neurolift-ai-fusion) and connect through
`simulation.environment.agent_interface.AgentInterface`.

Package structure:
- core/: Event system, state machine, foundational components
- simulation/environment/: World engine, ECS, world map, systems, scenarios
- simulation/npcs/: NPC base classes
"""

__version__ = "0.2.0-alpha"
