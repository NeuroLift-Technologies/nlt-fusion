"""Tests for the SimSim-style UtilityAgent controller."""

import sys
import unittest
from pathlib import Path

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORLD_ENGINE_ROOT))

from src.simulation.environment.world_engine import WorldEngine, EventType  # noqa: E402
from src.simulation.environment.world_builder import (  # noqa: E402
    build_world, engine_for_spec, DEFAULT_NEEDS, DEFAULT_HOME_SPEC,
)
from src.simulation.environment.agent_interface import AgentInterface  # noqa: E402
from src.simulation.environment.utility_agent import UtilityAgent  # noqa: E402
from src.simulation.environment.ecs import (  # noqa: E402
    Needs, Interactable, Position, Collider,
)


def make_engine(**config):
    defaults = {"grid_width": 10, "grid_height": 10, "seed": 7}
    defaults.update(config)
    return WorldEngine(defaults)


def make_agent(**config):
    engine = make_engine(seconds_per_tick=1.0)
    interface = AgentInterface(engine, "a1", x=0, y=0)
    agent = UtilityAgent(interface)
    agent.needs_ranking = config.get("needs_ranking", agent.needs_ranking)
    agent.threshold = config.get("threshold", agent.threshold)
    return engine, interface, agent


def object(entity_id, distance, affordance, need_effects,
           in_use=False, name="?"):
    return {
        "entity_id": entity_id,
        "distance": distance,
        "name": name,
        "affordances": [affordance],
        "in_use": in_use,
        "need_effects": need_effects,
    }


class TestDecide(unittest.TestCase):
    def test_acts_on_first_ranked_need_below_threshold(self):
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.8, "fun": 0.2},
            [object("tv", 3, "watch", {"fun": 0.4}, name="tv")],
        )
        self.assertIsNotNone(plan)
        self.assertEqual(plan["need"], "fun")

    def test_priority_beats_lowest_value(self):
        # hunger (0.4) is above fun (0.1) in value but first in the ranking:
        # SimSim acts on ranking order, not on whichever need is lowest.
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.4, "fun": 0.1},
            [
                object("fridge", 5, "eat", {"hunger": 0.5}, name="fridge"),
                object("tv", 1, "watch", {"fun": 0.4}, name="tv"),
            ],
        )
        self.assertEqual(plan["need"], "hunger")
        self.assertEqual(plan["target_id"], "fridge")

    def test_nearest_beneficial_object_wins(self):
        # SimSim's findNeedObj picks the closest object that raises the need,
        # not the one with the biggest gain.
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.3},
            [
                object("pantry", 1, "eat", {"hunger": 0.1}, name="pantry"),
                object("fridge", 8, "eat", {"hunger": 0.9}, name="fridge"),
            ],
        )
        self.assertEqual(plan["target_id"], "pantry")

    def test_skips_occupied_then_falls_to_next_need(self):
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.3, "fun": 0.2},
            [
                object("fridge", 2, "eat", {"hunger": 0.5}, in_use=True,
                       name="fridge"),
                object("tv", 3, "watch", {"fun": 0.4}, name="tv"),
            ],
        )
        self.assertEqual(plan["need"], "fun")
        self.assertEqual(plan["target_id"], "tv")

    def test_no_target_for_need_falls_to_next(self):
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.3, "fun": 0.2},
            [object("tv", 2, "watch", {"fun": 0.4}, name="tv")],
        )
        self.assertEqual(plan["need"], "fun")

    def test_idle_when_all_needs_above_threshold(self):
        _, _, agent = make_agent()
        plan = agent.decide(
            {"hunger": 0.9, "fun": 0.8},
            [object("fridge", 1, "eat", {"hunger": 0.5}, name="fridge")],
        )
        self.assertIsNone(plan)


class TestLoop(unittest.TestCase):
    def _world_with_fridge(self, effect=0.2):
        engine = make_engine(seconds_per_tick=1.0)
        fridge = engine.spawn_entity()
        engine.registry.add_component(fridge, Position(5, 5))
        engine.registry.add_component(fridge, Collider())
        engine.registry.add_component(fridge, Interactable(
            affordances=["eat"], use_duration_s=1.0,
            need_effects={"hunger": effect}))
        engine.grid.invalidate_index()
        return engine, fridge

    def test_uses_until_satisfied_then_idles(self):
        engine, fridge = self._world_with_fridge(effect=0.2)
        needs = Needs(levels={"hunger": 0.2}, decay_per_s={})
        interface = AgentInterface(engine, "a1", x=4, y=5, needs=needs)
        agent = UtilityAgent(interface)
        eats = []
        engine.subscribe(EventType.INTERACTION_COMPLETED,
                         lambda t, d: eats.append(d["affordance"]))
        for _ in range(20):
            agent.step()
            engine.run_simulation_step()
        self.assertEqual(eats.count("eat"), 2)
        self.assertAlmostEqual(interface.needs()["hunger"], 0.6)
        self.assertIsNone(agent.decide(interface.needs(), []))

    def test_lives_a_day_autonomously(self):
        engine = engine_for_spec(DEFAULT_HOME_SPEC, seed=42,
                                 seconds_per_tick=60.0)
        build_world(engine, DEFAULT_HOME_SPEC)
        needs = Needs(levels={"energy": 0.5, "hunger": 0.35, "hygiene": 0.6,
                              "fun": 0.45, "social": 0.4},
                      decay_per_s=DEFAULT_NEEDS)
        interface = AgentInterface(engine, "demo_agent", x=4, y=12,
                                   name="Avery", needs=needs)
        agent = UtilityAgent(interface)
        actions = []
        engine.subscribe(EventType.INTERACTION_COMPLETED,
                         lambda t, d: actions.append(d["affordance"]))
        for _ in range(1440):
            agent.step()
            engine.run_simulation_step()
        self.assertIn("eat", actions)
        self.assertTrue(actions)


if __name__ == "__main__":
    unittest.main()
