"""Tests for contracts/v1 snapshot emission and the v1 Core Loop slice."""

import sys
import unittest
from pathlib import Path

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORLD_ENGINE_ROOT))

from src.simulation.core_loop import build_core_loop_world  # noqa: E402
from src.simulation.environment.snapshot_contract import (  # noqa: E402
    validate_snapshot_shape, load_contract_snapshot,
)
from src.simulation.scene.loader import load_scene, scene_to_builder_spec, scene_to_studio_rooms, DEFAULT_SCENE_PATH  # noqa: E402
from src.simulation.runner import WorldRunner  # noqa: E402


class TestSceneLoader(unittest.TestCase):
    def test_default_scene_loads_and_maps_to_builder_spec(self):
        scene = load_scene(DEFAULT_SCENE_PATH)
        self.assertEqual(scene["scene_id"], "default_home")
        spec = scene_to_builder_spec(scene)
        self.assertEqual(spec["grid"]["width"], 20)
        self.assertTrue(any(p["name"] == "shower" for p in spec["props"]))

    def test_studio_rooms_use_room_relative_prop_coords(self):
        scene = load_scene(DEFAULT_SCENE_PATH)
        rooms = scene_to_studio_rooms(scene)
        kitchen = next(r for r in rooms if r["id"] == "kitchen")
        fridge = next(p for p in kitchen["props"] if p["kind"] == "fridge")
        self.assertEqual(fridge["x"], 2)
        self.assertEqual(fridge["y"], 2)


class TestContractSnapshot(unittest.TestCase):
    def test_core_loop_snapshot_matches_schema_shape(self):
        engine, runner, _, _ = build_core_loop_world(seed=7, seconds_per_tick=60.0)
        runner.step_once()
        snapshot = engine.get_snapshot()
        errors = validate_snapshot_shape(snapshot)
        self.assertEqual(errors, [], errors)
        self.assertIn("stay_alert", snapshot["avatars"])
        avatar = snapshot["avatars"]["stay_alert"]
        self.assertEqual(avatar["scenario"]["id"], "pers_4")
        self.assertIn("shower", [p["name"] for p in
                                 snapshot["entities"].values()
                                 if p.get("name")])

    def test_load_snapshot_round_trip(self):
        engine, runner, _, _ = build_core_loop_world(seed=3)
        for _ in range(5):
            runner.step_once()
        original = engine.get_snapshot()
        load_contract_snapshot(engine, original)
        restored = engine.get_snapshot()
        self.assertEqual(original["simulation"]["tick"], restored["simulation"]["tick"])
        self.assertEqual(
            original["avatars"]["stay_alert"]["position"],
            restored["avatars"]["stay_alert"]["position"],
        )


class TestMorningRoutineScenario(unittest.TestCase):
    def test_stressor_and_intervention_fire(self):
        engine, runner, scenario_system, _ = build_core_loop_world(
            seed=11, seconds_per_tick=60.0, pace=1.0)
        captured: list = []
        runner.on_update(lambda _snap, events: captured.extend(events))
        for _ in range(20):
            runner.step_once()
        types = {evt["event_type"] for evt in captured}
        self.assertIn("struggle.focus_drift", types)
        self.assertIn("aide.coaching_delivered", types)
        self.assertTrue(engine.interventions)


if __name__ == "__main__":
    unittest.main()
