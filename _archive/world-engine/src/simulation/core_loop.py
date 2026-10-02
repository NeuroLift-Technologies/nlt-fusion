"""
Bootstrap the v1 Core Loop world: scene JSON, StayAlert avatar, ScenarioSystem.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from .environment.agent_interface import AgentInterface
from .environment.ecs import AgentState, Needs
from .environment.scenario_agent import ScenarioAgent
from .environment.scenario_system import ScenarioSystem
from .environment.world_builder import DEFAULT_NEEDS, build_world, engine_for_spec
from .environment.world_engine import WorldEngine
from .runner import WorldRunner
from .scene.loader import DEFAULT_SCENE_PATH, load_scene, scene_to_builder_spec


def build_core_loop_world(seed: int = 42,
                          seconds_per_tick: float = 60.0,
                          pace: float = 1.0) -> Tuple[WorldEngine, WorldRunner,
                                                      ScenarioSystem, Dict[str, Any]]:
    scene = load_scene(DEFAULT_SCENE_PATH)
    spec = scene_to_builder_spec(scene)
    engine = engine_for_spec(
        spec,
        seed=seed,
        seconds_per_tick=seconds_per_tick,
        pace=pace,
        scene_id=scene.get("scene_id", "default_home"),
    )
    placed = build_world(engine, spec)
    placed_ids = {name: entity.entity_id for name, entity in placed.items()}

    avatar_contract_ids = {"stay_alert": "stay_alert"}
    aide_ids = {"stay_alert": "dr_vance"}
    scenario_system = ScenarioSystem(
        engine, placed, avatar_contract_ids, aide_ids)
    engine.registry.register_system(scenario_system)

    needs = Needs(
        levels={"energy": 0.55, "hunger": 0.4, "hygiene": 0.35,
                "fun": 0.5, "social": 0.45},
        decay_per_s=DEFAULT_NEEDS,
    )
    interface = AgentInterface(
        engine, agent_id="stay_alert", x=4, y=12,
        name="StayAlert", needs=needs)
    engine.registry.add_component(interface.entity, AgentState(
        focus=0.52, cognitive_load=0.22, stress=0.18,
        target_x=4, target_y=12, facing="south",
    ))
    engine.register_avatar_profile(
        "stay_alert",
        interface.entity,
        contract_id="stay_alert",
        name="StayAlert",
        trait="Sustained Attention",
        default_room="bedroom",
        hue=200,
        tag="SA",
        spawn_x=4,
        spawn_y=12,
    )

    agent = ScenarioAgent(interface, scenario_system, placed_ids)
    runner = WorldRunner(engine, controllers=[agent], pace=pace)
    scenario_system.assign("stay_alert", "pers_4")

    meta = {
        "scene": scene,
        "spec": spec,
        "placed": placed_ids,
    }
    return engine, runner, scenario_system, meta
