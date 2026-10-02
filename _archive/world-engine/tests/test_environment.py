"""Tests for the environment engine: grid, systems, agent interface."""

import sys
import unittest
from pathlib import Path

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORLD_ENGINE_ROOT))

from src.simulation.environment.world_engine import WorldEngine, EventType  # noqa: E402
from src.simulation.environment.world_builder import (  # noqa: E402
    build_world, engine_for_spec, DEFAULT_HOME_SPEC, DEFAULT_NEEDS,
)
from src.simulation.environment.agent_interface import AgentInterface  # noqa: E402
from src.simulation.environment.ecs import (  # noqa: E402
    Position, Collider, Interactable, Needs, Descriptor,
)


def make_engine(**config):
    defaults = {"grid_width": 10, "grid_height": 10, "seed": 7}
    defaults.update(config)
    return WorldEngine(defaults)


def place_block(engine, x, y):
    entity = engine.spawn_entity()
    engine.registry.add_component(entity, Position(x, y))
    engine.registry.add_component(entity, Collider())
    engine.grid.invalidate_index()
    return entity


class TestGrid(unittest.TestCase):
    def test_pathfinding_routes_around_collider(self):
        engine = make_engine()
        # Wall across x=5 except a gap at y=9
        for y in range(0, 9):
            place_block(engine, 5, y)
        path = engine.grid.find_path(0, 0, 9, 0)
        self.assertTrue(path)
        self.assertIn((5, 9), path)  # Forced through the gap
        self.assertNotIn((5, 0), path)

    def test_unreachable_goal_returns_empty_path(self):
        engine = make_engine()
        # Box in the goal completely
        for x, y in [(8, 7), (8, 9), (7, 8), (9, 8)]:
            place_block(engine, x, y)
        self.assertEqual(engine.grid.find_path(0, 0, 8, 8), [])

    def test_index_tracks_walkability(self):
        engine = make_engine()
        self.assertTrue(engine.grid.is_walkable(3, 3))
        place_block(engine, 3, 3)
        self.assertFalse(engine.grid.is_walkable(3, 3))


class TestMovement(unittest.TestCase):
    def test_move_intent_completes_at_goal(self):
        engine = make_engine(seconds_per_tick=1.0, tiles_per_second=1.0)
        agent = AgentInterface(engine, "a1", x=0, y=0)
        self.assertTrue(agent.move_to(4, 0))
        for _ in range(10):
            engine.run_simulation_step()
        self.assertEqual(agent.position(), (4, 0))
        self.assertEqual(agent.last_result()["status"], "completed")
        self.assertFalse(agent.is_busy())

    def test_move_to_unreachable_fails(self):
        engine = make_engine()
        for x, y in [(8, 7), (8, 9), (7, 8), (9, 8)]:
            place_block(engine, x, y)
        agent = AgentInterface(engine, "a1", x=0, y=0)
        agent.move_to(8, 8)
        engine.run_simulation_step()
        self.assertEqual(agent.last_result()["status"], "failed")
        self.assertEqual(agent.last_result()["reason"], "no_path")

    def test_move_onto_solid_tile_fails(self):
        # Agents approach objects via adjacent tiles; a solid goal is no_path
        engine = make_engine()
        place_block(engine, 5, 5)
        agent = AgentInterface(engine, "a1", x=0, y=0)
        agent.move_to(5, 5)
        engine.run_simulation_step()
        self.assertEqual(agent.last_result()["status"], "failed")
        self.assertEqual(agent.last_result()["reason"], "no_path")

    def test_move_adjacent_to_skips_unreachable_side(self):
        # The closest adjacent tile (4,5) is walkable but walled into a
        # pocket; the agent must route to a reachable side instead
        engine = make_engine(seconds_per_tick=1.0, tiles_per_second=5.0)
        target = engine.spawn_entity()
        engine.registry.add_component(target, Position(5, 5))
        engine.registry.add_component(target, Collider())
        engine.registry.add_component(target, Interactable(affordances=["use"]))
        for x, y in [(3, 5), (4, 4), (4, 6)]:
            place_block(engine, x, y)
        engine.grid.invalidate_index()
        agent = AgentInterface(engine, "a1", x=0, y=0)
        self.assertTrue(agent.move_adjacent_to(target.entity_id))
        for _ in range(10):
            engine.run_simulation_step()
        self.assertEqual(agent.last_result()["status"], "completed")
        x, y = agent.position()
        self.assertNotEqual((x, y), (4, 5))
        self.assertLessEqual(max(abs(x - 5), abs(y - 5)), 1)

    def test_busy_agent_rejects_second_intent(self):
        engine = make_engine(tiles_per_second=0.1)
        agent = AgentInterface(engine, "a1", x=0, y=0)
        self.assertTrue(agent.move_to(9, 9))
        self.assertFalse(agent.move_to(1, 1))


class TestInteraction(unittest.TestCase):
    def _world_with_fridge(self):
        engine = make_engine(seconds_per_tick=1.0)
        fridge = engine.spawn_entity()
        engine.registry.add_component(fridge, Position(5, 5))
        engine.registry.add_component(fridge, Collider())
        engine.registry.add_component(fridge, Descriptor("fridge"))
        engine.registry.add_component(fridge, Interactable(
            affordances=["eat"], use_duration_s=3.0,
            need_effects={"hunger": 0.5}))
        engine.grid.invalidate_index()
        return engine, fridge

    def test_use_requires_adjacency(self):
        engine, fridge = self._world_with_fridge()
        agent = AgentInterface(engine, "a1", x=0, y=0)
        agent.use(fridge.entity_id, "eat")
        engine.run_simulation_step()
        self.assertEqual(agent.last_result()["reason"], "not_adjacent")

    def test_use_applies_need_effects_and_releases_lock(self):
        engine, fridge = self._world_with_fridge()
        needs = Needs(levels={"hunger": 0.2}, decay_per_s={})
        agent = AgentInterface(engine, "a1", x=4, y=5, needs=needs)
        events = []
        engine.subscribe(EventType.INTERACTION_COMPLETED,
                         lambda t, d: events.append(d))
        agent.use(fridge.entity_id, "eat")
        for _ in range(4):
            engine.run_simulation_step()
        self.assertEqual(agent.last_result()["status"], "completed")
        self.assertAlmostEqual(agent.needs()["hunger"], 0.7)
        self.assertEqual(len(events), 1)
        interactable = engine.registry.get_component(fridge, Interactable)
        self.assertIsNone(interactable.in_use_by)

    def test_occupied_object_rejects_second_user(self):
        engine, fridge = self._world_with_fridge()
        first = AgentInterface(engine, "a1", x=4, y=5)
        second = AgentInterface(engine, "a2", x=6, y=5)
        first.use(fridge.entity_id, "eat")
        engine.run_simulation_step()
        second.use(fridge.entity_id, "eat")
        engine.run_simulation_step()
        self.assertEqual(second.last_result()["reason"], "occupied")

    def test_positionless_target_is_not_adjacent(self):
        # A target without a Position must not be usable from any distance
        engine = make_engine(seconds_per_tick=1.0)
        ghost = engine.spawn_entity()
        engine.registry.add_component(ghost, Interactable(
            affordances=["eat"], use_duration_s=1.0))
        agent = AgentInterface(engine, "a1", x=0, y=0)
        agent.use(ghost.entity_id, "eat")
        engine.run_simulation_step()
        self.assertEqual(agent.last_result()["status"], "failed")
        self.assertEqual(agent.last_result()["reason"], "not_adjacent")

    def test_unknown_affordance_fails(self):
        engine, fridge = self._world_with_fridge()
        agent = AgentInterface(engine, "a1", x=4, y=5)
        agent.use(fridge.entity_id, "sleep")
        engine.run_simulation_step()
        self.assertEqual(agent.last_result()["reason"], "no_such_affordance")

    def test_contention_winner_is_deterministic(self):
        # Same-tick contention must resolve by spawn order (insertion order),
        # not by set-iteration order, so seeded runs replay identically
        def contend():
            engine, fridge = self._world_with_fridge()
            first = AgentInterface(engine, "first", x=4, y=5)
            second = AgentInterface(engine, "second", x=6, y=5)
            first.use(fridge.entity_id, "eat")
            second.use(fridge.entity_id, "eat")
            engine.run_simulation_step()
            interactable = engine.registry.get_component(fridge, Interactable)
            return interactable.in_use_by

        winners = {contend() for _ in range(5)}
        self.assertEqual(winners, {"first"})


class TestNeeds(unittest.TestCase):
    def test_needs_decay_and_clamp(self):
        engine = make_engine(seconds_per_tick=1.0)
        needs = Needs(levels={"energy": 0.05}, decay_per_s={"energy": 0.02})
        AgentInterface(engine, "a1", x=0, y=0, needs=needs)
        for _ in range(5):
            engine.run_simulation_step()
        self.assertAlmostEqual(needs.levels["energy"], 0.0)


class TestDeterminism(unittest.TestCase):
    def _run_day(self):
        from demo import UtilityAgent
        engine = engine_for_spec(DEFAULT_HOME_SPEC, seed=42,
                                 seconds_per_tick=60.0)
        build_world(engine, DEFAULT_HOME_SPEC)
        agent = UtilityAgent(AgentInterface(
            engine, "demo_agent", x=4, y=12, name="Avery",
            needs=Needs(levels={"energy": 0.5, "hunger": 0.35,
                                "hygiene": 0.6, "fun": 0.45, "social": 0.4},
                        decay_per_s=DEFAULT_NEEDS)))
        events = []
        engine.subscribe(EventType.INTERACTION_COMPLETED,
                         lambda t, d: events.append((engine.tick_count,
                                                     d["affordance"])))
        for _ in range(1440):
            agent.step()
            engine.run_simulation_step()
        snapshot = engine.get_legacy_snapshot()
        # Entity IDs are random UUIDs; compare the ID-independent parts
        records = sorted(
            (r.get("name", ""), tuple(r["position"]),
             tuple(sorted(r.get("needs", {}).items())))
            for r in snapshot["entities"].values())
        return events, records

    def test_same_config_same_day(self):
        first = self._run_day()
        second = self._run_day()
        self.assertEqual(first[0], second[0])
        self.assertEqual(first[1], second[1])
        self.assertTrue(first[0], "expected at least one interaction event")


if __name__ == "__main__":
    unittest.main()
