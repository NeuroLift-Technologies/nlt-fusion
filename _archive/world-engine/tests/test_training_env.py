"""Tests for the RL training layer (WorldEnv + cognitive contract port)."""

import sys
import unittest
from pathlib import Path

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORLD_ENGINE_ROOT))

from src.simulation.training.cognitive import (  # noqa: E402
    BURNOUT_FAILURE_THRESHOLD,
    COACHING_STRATEGIES,
    INDEPENDENCE_SUCCESS_THRESHOLD,
    CognitiveState,
)
from src.simulation.training.env import (  # noqa: E402
    OBSERVATION_DIM,
    WorldEnv,
    make_env,
)


class TestCognitivePort(unittest.TestCase):
    def test_reward_matches_ue_formula(self):
        state = CognitiveState(focus=0.5, stress=0.2, burnout=0.1,
                               independence=0.7, success_rate=0.5)
        expected = (1.0 * 0.7 - 1.0 * 0.1 - 0.5 * 0.2
                    + 0.3 * 0.5 + 0.5 * 0.5)
        self.assertAlmostEqual(state.reward(), expected, places=9)

    def test_decay_rates(self):
        state = CognitiveState(focus=0.65, stress=0.15, burnout=0.05,
                               independence=0.20)
        state.decay(0.1)
        self.assertAlmostEqual(state.stress, 0.151, places=6)
        self.assertAlmostEqual(state.burnout, 0.0505, places=6)
        self.assertAlmostEqual(state.focus, 0.648, places=6)
        self.assertAlmostEqual(state.independence, 0.1999, places=6)

    def test_coaching_effects_and_clamp(self):
        state = CognitiveState(stress=0.9, focus=0.05)
        self.assertTrue(state.apply_coaching(6))  # mindful_refocus
        self.assertAlmostEqual(state.stress, 0.7, places=6)
        self.assertAlmostEqual(state.focus, 0.15, places=6)
        state.focus = 0.1
        state.apply_coaching(0)  # pomodoro -0.1 stress, +0.1 focus
        self.assertTrue(0.0 <= state.stress <= 1.0)
        self.assertFalse(state.apply_coaching(99))

    def test_completion_thresholds(self):
        self.assertTrue(CognitiveState(
            independence=INDEPENDENCE_SUCCESS_THRESHOLD).succeeded)
        self.assertTrue(CognitiveState(
            burnout=BURNOUT_FAILURE_THRESHOLD).failed)

    def test_strategy_table_is_complete(self):
        self.assertEqual(len(COACHING_STRATEGIES), 10)


class TestWorldEnv(unittest.TestCase):
    def test_reset_observation_shape_and_bounds(self):
        env = WorldEnv(seed=0)
        obs, info = env.reset()
        self.assertEqual(len(obs), OBSERVATION_DIM)
        self.assertTrue(all(0.0 <= v <= 1.0 for v in obs), obs)
        self.assertEqual(info["scenario_id"], "pers_4")

    def test_step_returns_gymnasium_tuple(self):
        env = WorldEnv(seed=1)
        env.reset()
        result = env.step([0.0, -1.0, 0.0, 0.0])
        self.assertEqual(len(result), 5)
        obs, reward, terminated, truncated, info = result
        self.assertEqual(len(obs), OBSERVATION_DIM)
        self.assertIsInstance(reward, float)
        self.assertIsInstance(terminated, bool)
        self.assertIsInstance(truncated, bool)
        self.assertIn("reason", info)

    def test_move_action_is_submitted_and_moves_agent(self):
        env = WorldEnv(seed=2)
        env.reset()
        start = env.interface.position()
        obs, reward, term, trunc, info = env.step([0.0, -1.0, 0.0, 0.0])
        self.assertTrue(info["acted"])
        for _ in range(3):
            if term or trunc:
                break
            _, _, term, trunc, info = env.step([0.0, -1.0, 0.0, 0.0])
        self.assertNotEqual(env.interface.position(), start)

    def test_determinism_same_seed_same_trajectory(self):
        actions = [_cycle_action(i) for i in range(12)]

        def rollout(seed):
            env = WorldEnv(seed=seed)
            env.reset()
            trace = []
            for action in actions:
                obs, reward, term, trunc, info = env.step(action)
                trace.append((obs, round(reward, 9), info["position"]))
                if term or trunc:
                    break
            return trace

        self.assertEqual(rollout(5), rollout(5))

    def test_aide_coaching_reduces_stress(self):
        env = WorldEnv(seed=3)
        env.reset()
        env.cognitive.stress = 0.5
        env.cognitive.focus = 0.2
        env.step([0.0, 0.0, 0.0, 0.0, 6.0])  # strategy 6: mindful_refocus
        self.assertLess(env.cognitive.stress, 0.5)
        self.assertGreater(env.cognitive.focus, 0.2)

    def test_terminates_on_burnout(self):
        env = WorldEnv(seed=4)
        env.reset()
        env.cognitive.burnout = 0.95
        obs, reward, terminated, truncated, info = env.step([0.0, 0.0, 0.0, 0.0])
        self.assertTrue(terminated)
        self.assertEqual(info["reason"], "burnout")

    def test_terminates_on_independence(self):
        env = WorldEnv(seed=5)
        env.reset()
        env.cognitive.independence = 0.85
        obs, reward, terminated, truncated, info = env.step([0.0, 0.0, 0.0, 0.0])
        self.assertTrue(terminated)
        self.assertEqual(info["reason"], "independence")

    def test_truncates_at_max_steps(self):
        env = WorldEnv(seed=6, max_steps=3)
        env.reset()
        result = None
        for _ in range(3):
            result = env.step([0.0, 0.0, 0.0, 0.0])
        _, _, terminated, truncated, info = result
        self.assertFalse(terminated)
        self.assertTrue(truncated)
        self.assertEqual(info["reason"], "max_steps")

    def test_step_after_done_raises(self):
        env = WorldEnv(seed=7, max_steps=1)
        env.reset()
        env.step([0.0, 0.0, 0.0, 0.0])
        with self.assertRaises(RuntimeError):
            env.step([0.0, 0.0, 0.0, 0.0])

    def test_aide_observation_dim(self):
        env = WorldEnv(seed=8)
        env.reset()
        self.assertEqual(len(env.aide_observation()), 20)

    def test_scenario_assigns_first_objective(self):
        env = WorldEnv(seed=9)
        env.reset()
        objective = env.scenario_system.current_objective("stay_alert")
        self.assertIsNotNone(objective)
        self.assertEqual(objective["prop"], "shower")

    def test_make_env_factory(self):
        thunk = make_env(seed=10)
        env = thunk()
        self.assertIsInstance(env, WorldEnv)
        obs, _ = env.reset()
        self.assertEqual(len(obs), OBSERVATION_DIM)


def _cycle_action(i):
    moves = [(0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0)]
    dx, dy = moves[i % len(moves)]
    interact = float(i % 4)
    return [dx, dy, 0.0, interact]


if __name__ == "__main__":
    unittest.main()
