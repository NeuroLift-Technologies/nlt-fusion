"""
Load versioned scene JSON — canonical world description shared by the
Python kernel and the read-only studio viewer.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SCENE_PATH = WORLD_ENGINE_ROOT / "data" / "scenes" / "default_home.v1.json"

_PROP_KINDS = {
    "bed": "bed",
    "shower": "shower",
    "fridge": "fridge",
    "tv": "tv",
    "desk": "desk",
    "bookshelf": "bookshelf",
}


def load_scene(path: Optional[Path] = None) -> Dict[str, Any]:
    scene_path = path or DEFAULT_SCENE_PATH
    with scene_path.open(encoding="utf-8") as handle:
        return json.load(handle)


def scene_to_builder_spec(scene: Dict[str, Any]) -> Dict[str, Any]:
    """Convert scene JSON into the dict shape expected by world_builder."""
    rooms = {}
    for room_id, room in scene.get("rooms", {}).items():
        origin = room.get("origin", {})
        size = room.get("size", {})
        rooms[room_id] = {
            "x": origin.get("x", 0),
            "y": origin.get("y", 0),
            "w": size.get("w", 1),
            "h": size.get("h", 1),
        }

    def _items(group: str) -> List[Dict[str, Any]]:
        mapped = []
        for item in scene.get(group, []):
            mapped.append({
                "name": item["name"],
                "room": item["room"],
                "x": item["x"],
                "y": item["y"],
                "affordance": item["affordance"],
                "duration_s": item.get("use_duration_s", item.get("duration_s", 60)),
                "effects": item.get("need_effects", item.get("effects", {})),
            })
        return mapped

    return {
        "grid": scene.get("grid", {"width": 20, "height": 14}),
        "rooms": rooms,
        "props": _items("props"),
        "npcs": _items("npcs"),
    }


def scene_to_studio_rooms(scene: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Map scene JSON into the WE_DATA.ROOMS array shape for the studio."""
    room_origins: Dict[str, Dict[str, int]] = {}
    for room_id, room in scene.get("rooms", {}).items():
        origin = room.get("origin", {})
        room_origins[room_id] = {
            "x": origin.get("x", 0),
            "y": origin.get("y", 0),
        }

    rooms = []
    props_by_room: Dict[str, List[Dict[str, Any]]] = {}
    for prop in scene.get("props", []):
        origin = room_origins.get(prop["room"], {"x": 0, "y": 0})
        props_by_room.setdefault(prop["room"], []).append({
            "kind": prop.get("kind", _PROP_KINDS.get(prop["name"], "table")),
            "x": prop["x"] - origin["x"],
            "y": prop["y"] - origin["y"],
            "w": prop.get("w", 1),
            "h": prop.get("h", 1),
        })

    for npc in scene.get("npcs", []):
        origin = room_origins.get(npc["room"], {"x": 0, "y": 0})
        props_by_room.setdefault(npc["room"], []).append({
            "kind": "npc",
            "x": npc["x"] - origin["x"],
            "y": npc["y"] - origin["y"],
            "w": 1,
            "h": 1,
        })

    for room_id, room in scene.get("rooms", {}).items():
        origin = room.get("origin", {})
        size = room.get("size", {})
        rooms.append({
            "id": room_id,
            "name": room.get("name", room_id.replace("_", " ").title()),
            "x": origin.get("x", 0),
            "y": origin.get("y", 0),
            "w": size.get("w", 1),
            "h": size.get("h", 1),
            "color": room.get("color", "#1f6fb2"),
            "floor": room.get("floor", "#173855"),
            "props": props_by_room.get(room_id, []),
        })
    return rooms
