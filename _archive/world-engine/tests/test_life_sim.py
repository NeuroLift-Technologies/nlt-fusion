import sys
import unittest
from pathlib import Path


WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = WORLD_ENGINE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from simulation.life_sim.catalog import (  # noqa: E402
    OBJECTS_BY_ID,
    SCENARIOS_BY_ID,
    SPAWN_OBJECT_ID,
    get_object,
)
from simulation.life_sim.engine import LCG, LifeSimEngine  # noqa: E402


class LifeSimTests(unittest.TestCase):
    def test_catalog_matches_browser_object_ids(self):
        expected_ids = {
            "office_desk_primary",
            "office_desk_secondary",
            "meeting_table",
            "home_sofa",
            "home_kitchen",
            "phone_booth",
            "lounge_sofa",
        }
        self.assertEqual(expected_ids, set(OBJECTS_BY_ID))

    def test_scenarios_reference_valid_objects(self):
        for scenario in SCENARIOS_BY_ID.values():
            obj = get_object(scenario.object_id)
            self.assertIsNotNone(obj, scenario.id)
            self.assertEqual(scenario.room, obj.room)

    def test_assign_scenario_queues_walk_then_work(self):
        engine = LifeSimEngine(rng=LCG(1337))
        avatar = engine.world.avatars[0]
        spawn = get_object(SPAWN_OBJECT_ID)
        desk = get_object("office_desk_primary")

        events = engine.assign_scenario("stay_alert", "wp_1")
        self.assertTrue(events)
        self.assertEqual("walking", avatar.state)
        self.assertEqual(desk.id, avatar.target_object_id)
        self.assertEqual("wp_1", avatar.pending_scenario_id)
        self.assertIsNone(avatar.scenario_id)

        kinds = [e.kind for e in events]
        self.assertIn("MOVE_TO_OBJECT", kinds)

        steps = 0
        while avatar.state == "walking" and steps < 64:
            engine.tick(ts=1.0, dysfunction_on=False)
            steps += 1

        self.assertTrue(avatar.at_tile())
        self.assertEqual(desk.tx, avatar.px)
        self.assertEqual(desk.ty, avatar.py)
        self.assertEqual("wp_1", avatar.scenario_id)
        self.assertEqual("working", avatar.state)
        self.assertEqual(desk.id, avatar.current_object_id)

        recent_kinds = [e.kind for e in engine.world.events[:6]]
        self.assertIn("INTERACTION_STARTED", recent_kinds)
        self.assertIn("USE_OBJECT", recent_kinds)
        self.assertIn("TASK_START", recent_kinds)

        self.assertNotEqual(spawn.room, desk.room)

    def test_move_to_rest_recovers_energy(self):
        engine = LifeSimEngine(rng=LCG(42))
        avatar = engine.world.avatars[0]
        sofa = get_object("home_sofa")
        avatar.energy = 0.15
        avatar.px = sofa.tx + 4
        avatar.py = sofa.ty
        avatar.tx = avatar.px
        avatar.ty = avatar.py

        engine.move_to("stay_alert", sofa.id)
        self.assertEqual("walking", avatar.state)

        for _ in range(32):
            if avatar.at_tile() and not avatar.target_object_id:
                break
            engine.tick(ts=1.0, dysfunction_on=False)

        self.assertGreater(avatar.energy, 0.15)
        recover = [e for e in engine.world.events if e.kind == "NEED_RECOVER"]
        self.assertTrue(recover)

    def test_scenario_tick_drains_energy(self):
        engine = LifeSimEngine(rng=LCG(99))
        avatar = engine.world.avatars[0]
        engine.assign_scenario("stay_alert", "wp_1")

        while avatar.state == "walking":
            engine.tick(ts=1.0, dysfunction_on=False)

        before = avatar.energy
        engine.tick(ts=5.0, dysfunction_on=True)
        self.assertLess(avatar.energy, before)


if __name__ == "__main__":
    unittest.main()
