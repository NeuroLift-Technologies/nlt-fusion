"""
World Builder

Instantiates a populated world from a declarative spec: rooms, props with
affordances and need effects, and ambient NPCs. This is what turns a
Scenario/world description into an actual environment an agent can live in.

The default spec is a small one-bedroom home, mirroring the browser
prototype's world (`world-engine/data.js`) at a reduced scale.
"""

from typing import Dict, Any, Optional

from .world_engine import WorldEngine
from .ecs import Entity, Position, Collider, Interactable, Descriptor

# Need vocabulary shared by the default world. Decay rates are per simulated
# second, tuned so a need drains over a few simulated hours.
DEFAULT_NEEDS = {
    "energy":  1.0 / (14 * 3600),   # tired after ~14h awake
    "hunger":  1.0 / (5 * 3600),    # hungry every ~5h
    "hygiene": 1.0 / (16 * 3600),
    "fun":     1.0 / (8 * 3600),
    "social":  1.0 / (10 * 3600),
}

# Inline fallback if scene JSON is unavailable (tests, minimal envs).
_FALLBACK_HOME_SPEC: Dict[str, Any] = {
    "grid": {"width": 20, "height": 14},
    "rooms": {
        "bedroom":     {"x": 0,  "y": 0, "w": 8,  "h": 7},
        "bathroom":    {"x": 0,  "y": 7, "w": 8,  "h": 7},
        "kitchen":     {"x": 8,  "y": 0, "w": 6,  "h": 7},
        "living_room": {"x": 8,  "y": 7, "w": 12, "h": 7},
        "office":      {"x": 14, "y": 0, "w": 6,  "h": 7},
    },
    "props": [
        {"name": "bed",      "room": "bedroom",     "x": 2,  "y": 2,
         "affordance": "sleep", "duration_s": 7 * 3600,
         "effects": {"energy": 1.0}},
        {"name": "shower",   "room": "bathroom",    "x": 2,  "y": 10,
         "affordance": "shower", "duration_s": 15 * 60,
         "effects": {"hygiene": 0.9}},
        {"name": "fridge",   "room": "kitchen",     "x": 10, "y": 2,
         "affordance": "eat", "duration_s": 30 * 60,
         "effects": {"hunger": 0.8}},
        {"name": "tv",       "room": "living_room", "x": 11, "y": 10,
         "affordance": "watch", "duration_s": 45 * 60,
         "effects": {"fun": 0.6, "energy": -0.05}},
        {"name": "desk",     "room": "office",      "x": 16, "y": 3,
         "affordance": "work", "duration_s": 60 * 60,
         "effects": {"fun": 0.1, "energy": -0.1}},
        {"name": "bookshelf", "room": "living_room", "x": 17, "y": 9,
         "affordance": "read", "duration_s": 40 * 60,
         "effects": {"fun": 0.4}},
    ],
    "npcs": [
        # v1: NPCs are stationary social props; behavior systems come later
        {"name": "roommate", "room": "living_room", "x": 14, "y": 12,
         "affordance": "chat", "duration_s": 20 * 60,
         "effects": {"social": 0.7, "fun": 0.2}},
    ],
}


def _load_default_home_spec() -> Dict[str, Any]:
    try:
        from ..scene.loader import DEFAULT_SCENE_PATH, load_scene, scene_to_builder_spec
        return scene_to_builder_spec(load_scene(DEFAULT_SCENE_PATH))
    except Exception:
        return _FALLBACK_HOME_SPEC


DEFAULT_HOME_SPEC: Dict[str, Any] = _load_default_home_spec()


def build_world(engine: WorldEngine,
                spec: Optional[Dict[str, Any]] = None) -> Dict[str, Entity]:
    """
    Populate an engine's world from a spec. Returns a name -> Entity map so
    callers (demos, tests, scenario loaders) can reference what was placed.
    """
    spec = spec or DEFAULT_HOME_SPEC
    placed: Dict[str, Entity] = {}

    for group, kind, solid in (("props", "object", True), ("npcs", "npc", True)):
        for item in spec.get(group, []):
            entity = engine.spawn_entity()
            engine.registry.add_component(
                entity, Position(item["x"], item["y"], 0))
            engine.registry.add_component(
                entity, Descriptor(name=item["name"], kind=kind,
                                   room=item.get("room")))
            if solid:
                engine.registry.add_component(entity, Collider())
            engine.registry.add_component(entity, Interactable(
                affordances=[item["affordance"]],
                use_duration_s=item["duration_s"],
                need_effects=item.get("effects", {}),
            ))
            placed[item["name"]] = entity

    engine.grid.invalidate_index()
    return placed


def engine_for_spec(spec: Optional[Dict[str, Any]] = None,
                    **config: Any) -> WorldEngine:
    """Create a WorldEngine sized for a spec's grid, with sensible defaults."""
    spec = spec or DEFAULT_HOME_SPEC
    grid = spec.get("grid", {})
    merged = {
        "grid_width": grid.get("width", 100),
        "grid_height": grid.get("height", 100),
    }
    merged.update(config)
    return WorldEngine(merged)
