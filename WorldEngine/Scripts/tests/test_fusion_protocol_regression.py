import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fusion_protocol import ProtocolError, ReplayExecutor, compare_replay, state_hash


class FusionProtocolRegressionTests(unittest.TestCase):
    def test_nonfinite_action_value_is_rejected(self):
        executor = ReplayExecutor({"agents": {"a1": {}}})
        with self.assertRaises(ProtocolError) as context:
            executor.execute_action({"type": "move_to", "target_id": "a1", "x": float("nan"), "y": 0})
        self.assertEqual("invalid_action", context.exception.code)

    def test_interaction_requires_target(self):
        executor = ReplayExecutor({"agents": {"a1": {}}})
        with self.assertRaises(ProtocolError) as context:
            executor.execute_action({"type": "interact", "target_id": "a1"})
        self.assertEqual("invalid_action", context.exception.code)

    def test_replay_result_does_not_alias_executor_state(self):
        executor = ReplayExecutor({"tick": 0, "rng_state": 1, "agents": {"a1": {"x": 0}}})
        result = executor.run([[]])
        executor.state["agents"]["a1"]["x"] = 99
        self.assertEqual(0, result.final_state["agents"]["a1"]["x"])

    def test_replay_batch_is_atomic(self):
        executor = ReplayExecutor({"tick": 0, "rng_state": 1, "agents": {"a1": {"x": 0}}})
        with self.assertRaises(ProtocolError):
            executor.step([
                {"type": "move_by", "target_id": "a1", "dx": 1, "dy": 2},
                {"type": "move_to", "target_id": "missing", "x": 0, "y": 0},
            ])
        self.assertEqual(0, executor.state["agents"]["a1"]["x"])
        self.assertEqual(0, executor.tick)
        self.assertEqual([], executor.events)

    def test_compare_requires_complete_expectation(self):
        executor = ReplayExecutor({"agents": {"a1": {}}})
        result = executor.run([[]])
        with self.assertRaises(ProtocolError):
            compare_replay({"intermediate_hashes": result.intermediate_hashes}, result)
        self.assertEqual(state_hash(result.final_state), result.final_hash)


if __name__ == "__main__":
    unittest.main()
