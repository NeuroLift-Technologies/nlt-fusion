import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fusion_protocol import ProtocolError, ReplayExecutor, acknowledge, decode, envelope, state_hash, compare_replay


class ProtocolTests(unittest.TestCase):
    def test_correlated_ack_and_error(self):
        request = envelope("action", {"type": "idle", "target_id": "a1"}, session_id="s1", agent_id="a1")
        ack = acknowledge(request, result={"tick": 4})
        self.assertEqual(request["message_id"], ack["correlation_id"])
        self.assertEqual("accepted", ack["payload"]["status"])
        error = acknowledge(request, False, error=ProtocolError("unknown_target", "missing avatar"))
        self.assertEqual("rejected", error["payload"]["status"])
        self.assertEqual("unknown_target", error["payload"]["error"]["code"])

    def test_invalid_envelope_is_rejected(self):
        with self.assertRaises(ProtocolError) as context:
            decode('{"protocol":"nlt.fusion-unreal"}')
        self.assertEqual("invalid_envelope", context.exception.code)


class ReplayTests(unittest.TestCase):
    def test_multi_tick_action_execution_and_hashes(self):
        state = {"tick": 0, "rng_state": 7, "agents": {"a1": {"x": 0.0, "y": 0.0, "focus": 0.5}}}
        executor = ReplayExecutor(state)
        result = executor.run([
            [{"type": "move_by", "target_id": "a1", "dx": 1, "dy": 2}],
            [{"type": "interact", "target_id": "a1", "target": "door"}, {"type": "set_focus", "target_id": "a1", "value": 0.9}],
        ])
        self.assertEqual(2, result.final_state["tick"])
        self.assertEqual(1.0, result.final_state["agents"]["a1"]["x"])
        self.assertEqual(0.9, result.final_state["agents"]["a1"]["focus"])
        self.assertEqual(2, len(result.intermediate_hashes))
        self.assertEqual(state_hash(result.final_state), result.final_hash)
        expected = {"intermediate_hashes": result.intermediate_hashes,
                    "event_hashes": result.event_hashes,
                    "expected_final_state": result.final_state,
                    "expected_final_hash": result.final_hash}
        self.assertTrue(all(compare_replay(expected, result).values()))

    def test_unapproved_action_cannot_be_executed(self):
        executor = ReplayExecutor({"agents": {"a1": {}}})
        with self.assertRaises(ProtocolError):
            executor.execute_action({"type": "teleport", "target_id": "a1"})


if __name__ == "__main__":
    unittest.main()
