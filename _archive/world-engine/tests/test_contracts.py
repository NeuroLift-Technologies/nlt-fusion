import copy
import hashlib
import json
import re
import unittest
from pathlib import Path


WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_ROOT = WORLD_ENGINE_ROOT / "contracts" / "v1"
EXAMPLE_ROOT = WORLD_ENGINE_ROOT / "contracts" / "examples"
REPLAY_PATH = EXAMPLE_ROOT / "stay-alert-coaching.replay.json"
CONTRACT_VERSION = "nlt.world-engine.v1"


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def canonical_hash(value) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def pointer_parent(document, pointer: str):
    if not pointer.startswith("/"):
        raise ValueError(f"Invalid state-change path: {pointer}")

    tokens = [
        token.replace("~1", "/").replace("~0", "~")
        for token in pointer[1:].split("/")
    ]
    parent = document
    for token in tokens[:-1]:
        parent = parent[token]
    return parent, tokens[-1]


def apply_events(initial_snapshot, events):
    snapshot = copy.deepcopy(initial_snapshot)
    for event in sorted(events, key=lambda item: item["sequence"]):
        for change in event["state_changes"]:
            parent, key = pointer_parent(snapshot, change["path"])
            if change["op"] == "set":
                parent[key] = copy.deepcopy(change["value"])
            elif change["op"] == "increment":
                parent[key] = round(parent[key] + change["value"], 12)
            else:
                raise ValueError(f"Unsupported state-change op: {change['op']}")
    return snapshot


def collect_relative_refs(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "$ref" and not item.startswith(("#", "urn:", "http://", "https://")):
                yield item
            else:
                yield from collect_relative_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from collect_relative_refs(item)


class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.replay = load_json(REPLAY_PATH)

    def test_schema_documents_parse_and_relative_refs_resolve(self):
        schema_paths = sorted(SCHEMA_ROOT.glob("*.schema.json"))
        self.assertEqual(6, len(schema_paths))

        for schema_path in schema_paths:
            schema = load_json(schema_path)
            self.assertEqual(
                "https://json-schema.org/draft/2020-12/schema",
                schema["$schema"],
            )
            self.assertTrue(schema["$id"].startswith("urn:nlt:world-engine:v1:"))
            for ref in collect_relative_refs(schema):
                target = SCHEMA_ROOT / ref.split("#", 1)[0]
                self.assertTrue(target.exists(), f"{schema_path.name}: missing {ref}")

    def test_replay_records_use_v1_and_monotonic_sequences(self):
        replay = self.replay
        self.assertEqual(CONTRACT_VERSION, replay["contract_version"])
        self.assertEqual(replay["seed"], replay["initial_snapshot"]["simulation"]["seed"])

        for collection_name in ("actions", "events", "interventions"):
            records = replay[collection_name]
            sequences = [record["sequence"] for record in records]
            self.assertEqual(sorted(sequences), sequences)
            self.assertEqual(len(sequences), len(set(sequences)))
            for record in records:
                self.assertEqual(CONTRACT_VERSION, record["contract_version"])

        self.assertRegex(replay["expected_final_hash"], re.compile(r"^[a-f0-9]{64}$"))

    def test_replay_reconstructs_expected_final_snapshot(self):
        replay = self.replay
        actual = apply_events(replay["initial_snapshot"], replay["events"])
        self.assertEqual(replay["expected_final_snapshot"], actual)
        self.assertEqual(replay["expected_final_hash"], canonical_hash(actual))

    def test_replay_references_known_avatars_and_normalized_metrics(self):
        replay = self.replay
        known_avatar_ids = set(replay["initial_snapshot"]["avatars"])

        for action in replay["actions"]:
            if action["target_id"] is not None:
                self.assertIn(action["target_id"], known_avatar_ids)
        for event in replay["events"]:
            if event["subject_id"] is not None:
                self.assertIn(event["subject_id"], known_avatar_ids)
        for intervention in replay["interventions"]:
            self.assertIn(intervention["avatar_id"], known_avatar_ids)

        for snapshot_name in ("initial_snapshot", "expected_final_snapshot"):
            for avatar in replay[snapshot_name]["avatars"].values():
                for metric_name, metric_value in avatar["metrics"].items():
                    self.assertGreaterEqual(metric_value, 0, metric_name)
                    self.assertLessEqual(metric_value, 1, metric_name)


if __name__ == "__main__":
    unittest.main()
