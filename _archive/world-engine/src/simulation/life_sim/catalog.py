"""
Life-sim v1 catalog — mirrors world-engine/data.js (OBJECTS, SCENARIOS, motives).

Single source for headless Python ticks and contract vocabulary alignment.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


GENRE = "life_sim"
ROSTER_MODE = "single"
SINGLE_PAIR_ID = "stay_alert"
SPAWN_OBJECT_ID = "home_sofa"


@dataclass(frozen=True)
class SimObject:
    id: str
    name: str
    room: str
    tx: int
    ty: int
    affordances: Tuple[str, ...]
    interaction: str
    rest_gain: float
    scenario_ids: Tuple[str, ...] = ()


@dataclass(frozen=True)
class LifeScenario:
    id: str
    name: str
    category: str
    room: str
    object_id: str
    minutes: int
    complexity: str
    aversive: float
    cog: float
    base: float
    sustained: bool


@dataclass(frozen=True)
class MotiveDecay:
    energy_per_minute: float = 0.006
    energy_rest_per_minute: float = 0.14
    low_energy_threshold: float = 0.28
    autonomy_pick_rate: float = 0.12


OBJECTS: List[SimObject] = [
    SimObject(
        "office_desk_primary", "Work Desk", "office", 4, 5,
        ("work", "sit"), "work", 0.0,
        ("wp_1", "wp_2", "wp_4", "wp_5", "acad_1"),
    ),
    SimObject(
        "office_desk_secondary", "Second Desk", "office", 8, 5,
        ("work",), "work", 0.0, ("wp_4",),
    ),
    SimObject(
        "meeting_table", "Meeting Table", "meeting", 16, 3,
        ("meet", "sit"), "meet", 0.0, ("wp_3",),
    ),
    SimObject(
        "home_sofa", "Sofa", "home", 3, 11,
        ("rest", "sit"), "rest", 0.12, (),
    ),
    SimObject(
        "home_kitchen", "Kitchen Counter", "home", 8, 11,
        ("cook", "work"), "cook", 0.0, ("pers_1", "pers_2", "pers_3"),
    ),
    SimObject(
        "phone_booth", "Phone Booth", "phone", 12, 8,
        ("call",), "call", 0.0, ("soc_1",),
    ),
    SimObject(
        "lounge_sofa", "Lounge Sofa", "lounge", 17, 11,
        ("social", "rest"), "social", 0.08, ("soc_2",),
    ),
]

OBJECTS_BY_ID: Dict[str, SimObject] = {o.id: o for o in OBJECTS}

SCENARIOS: List[LifeScenario] = [
    LifeScenario("wp_1", "Email Processing", "workplace", "office", "office_desk_primary",
                 30, "medium", 0.4, 0.5, 0.7, True),
    LifeScenario("wp_2", "Report Writing", "workplace", "office", "office_desk_primary",
                 90, "high", 0.6, 0.8, 0.5, True),
    LifeScenario("wp_3", "Meeting Participation", "workplace", "meeting", "meeting_table",
                 60, "medium", 0.3, 0.6, 0.6, True),
    LifeScenario("wp_4", "Code Review", "workplace", "office", "office_desk_secondary",
                 45, "high", 0.4, 0.85, 0.6, True),
    LifeScenario("wp_5", "Deadline Crunch", "workplace", "office", "office_desk_primary",
                 120, "high", 0.8, 0.9, 0.4, True),
    LifeScenario("pers_1", "Household Cleaning", "personal", "home", "home_kitchen",
                 120, "medium", 0.7, 0.3, 0.5, False),
    LifeScenario("pers_2", "Grocery & Cooking", "personal", "home", "home_kitchen",
                 90, "medium", 0.5, 0.6, 0.6, False),
    LifeScenario("pers_3", "Bill Paying", "personal", "home", "home_kitchen",
                 45, "low", 0.8, 0.7, 0.5, True),
    LifeScenario("soc_1", "Phone Conversation", "social", "phone", "phone_booth",
                 15, "medium", 0.6, 0.5, 0.6, True),
    LifeScenario("soc_2", "Social Event", "social", "lounge", "lounge_sofa",
                 120, "high", 0.7, 0.8, 0.5, False),
    LifeScenario("acad_1", "Study Session", "academic", "office", "office_desk_primary",
                 120, "high", 0.5, 0.8, 0.5, True),
]

SCENARIOS_BY_ID: Dict[str, LifeScenario] = {s.id: s for s in SCENARIOS}

MOTIVE_DECAY = MotiveDecay()

LIFE_SIM_EVENT_KINDS = (
    "MOVE_TO_OBJECT",
    "INTERACTION_STARTED",
    "USE_OBJECT",
    "NEED_LOW",
    "NEED_RECOVER",
    "TASK_START",
)

ACTION_TYPES = (
    "assign_scenario",
    "move_to",
    "use_object",
    "rest",
    "advance_tick",
)


def get_object(object_id: Optional[str]) -> Optional[SimObject]:
    if not object_id:
        return None
    return OBJECTS_BY_ID.get(object_id)


def object_for_scenario(scenario: LifeScenario) -> Optional[SimObject]:
    obj = get_object(scenario.object_id)
    if obj:
        return obj
    for candidate in OBJECTS:
        if candidate.room == scenario.room:
            return candidate
    return None
