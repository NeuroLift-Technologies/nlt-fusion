"""
Tests for the live world server (server.py): protocol, permissions, and
message-flow tests against a manually pumped world (no wall-clock thread,
so tests stay fast and deterministic).
"""

from __future__ import annotations

import asyncio
import json
import threading
import websockets.asyncio.client
import websockets.asyncio.server

from src.simulation.environment.world_builder import (
    build_world, engine_for_spec, DEFAULT_NEEDS, DEFAULT_HOME_SPEC,
)
from src.simulation.environment.ecs import Needs
from src.simulation.environment.snapshot_contract import validate_snapshot_shape
import server as server_module
from server import AvatarSession, LiveWorld, WorldServer
from contextlib import contextmanager


@contextmanager
def raises(exc_type):
    """Minimal pytest.raises-style helper so this file also runs standalone."""
    try:
        yield
    except exc_type:
        pass
    else:
        raise AssertionError(f"{exc_type.__name__} was not raised")


def make_world(seed: int = 0) -> LiveWorld:
    world = LiveWorld.__new__(LiveWorld)
    world.engine = engine_for_spec(DEFAULT_HOME_SPEC, seed=seed,
                                   seconds_per_tick=60.0)
    build_world(world.engine, DEFAULT_HOME_SPEC)
    world.sessions = {}
    world._lock = threading.Lock()
    world._next_spawn = 5
    world._pending_events = []
    world.spawn_count = 0
    world.tick_number = world.engine.tick_count
    return world


def make_session(world: LiveWorld, name: str = "Test") -> AvatarSession:
    return AvatarSession(
        world.engine, name=name, x=5, y=12,
        needs=Needs(levels={"energy": 0.7, "hunger": 0.6, "hygiene": 0.7,
                            "fun": 0.5, "social": 0.5},
                    decay_per_s=DEFAULT_NEEDS))


def tick(world: LiveWorld, n: int = 1) -> None:
    for _ in range(n):
        for session in world.sessions.values():
            if session.utility is not None:
                session.utility.step()
        assert world.engine.run_simulation_step()


class FakeWS:
    """Minimal send-only ws stand-in for handler tests."""

    def __init__(self):
        self.sent = []

    async def send(self, text):
        self.sent.append(json.loads(text))


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def make_server(world=None):
    world = world or make_world()
    return WorldServer(world), world


def last_of(sent, mtype):
    matches = [m for m in sent if m.get("type") == mtype]
    return matches[-1] if matches else None


# ---------------------------------------------------------------- unit


def test_join_registers_contract_profile():
    world = make_world()
    session = make_session(world)
    assert session.contract_id.startswith("avatar-")
    snap = world.snapshot()
    assert session.contract_id in snap["avatars"]
    assert validate_snapshot_shape(snap) == []


def test_join_claims_and_release_returns_to_utility():
    world = make_world()
    session = world.join(name="Casey", avatar_id=None, connection_id="c1")
    assert session.connection_id == "c1"
    assert session.utility is None
    world.leave("c1")
    assert session.utility is not None
    assert session.connection_id is None


def test_claim_conflict_and_unknown_avatar():
    world = make_world()
    world.join(name="A", avatar_id=None, connection_id="c1")
    session = next(iter(world.sessions.values()))
    with raises(PermissionError):
        world.join(name="B", avatar_id=session.contract_id,
                   connection_id="c2")
    with raises(KeyError):
        world.join(name="B", avatar_id="nope", connection_id="c2")


def test_utility_brain_keeps_avatar_alive():
    world = make_world()
    world._spawn_avatar(name="NPC", controlled=False)
    session = next(iter(world.sessions.values()))
    start = world.engine.tick_count
    tick(world, 120)  # two sim hours — the utility brain must keep acting
    assert world.engine.tick_count - start == 120
    assert session.interface.position() != (-1, -1)
    assert (session.interface.check_intent_status() is not None
            or session.interface.last_result() is not None)


# ---------------------------------------------------------------- ws flow


def test_ws_join_perceive_act_flow():
    ws_server, world = make_server()
    conn = server_module.Connection(FakeWS(), conn_id="c1")
    ws_server.connections[conn.id] = conn

    run(ws_server._handle_message(conn, {"type": "join", "name": "Zoe"}))
    welcome = last_of(conn.ws.sent, "welcome")
    assert welcome and welcome["you"]["name"] == "Zoe"
    avatar_id = welcome["avatar_id"]
    assert avatar_id == next(iter(conn.avatar_ids))

    run(ws_server._handle_message(conn, {"type": "perceive"}))
    perception = last_of(conn.ws.sent, "perception")
    assert perception is not None
    assert "needs" in perception and "surroundings" in perception
    fridge = next(s for s in perception["surroundings"]
                  if s.get("name") == "fridge")

    run(ws_server._handle_message(conn, {
        "type": "act", "action": "move_adjacent_to",
        "target": fridge["entity_id"]}))
    assert last_of(conn.ws.sent, "act_result")["submitted"] is True

    tick(world, 30)  # walk there
    run(ws_server._handle_message(conn, {
        "type": "act", "action": "use",
        "target": fridge["entity_id"], "affordance": "eat"}))
    assert last_of(conn.ws.sent, "act_result")["submitted"] is True

    tick(world, 40)  # eating takes 30 sim-minutes
    run(ws_server._handle_message(conn, {"type": "status"}))
    st = last_of(conn.ws.sent, "status")
    assert st["intent"] is None  # finished
    assert st["needs"]["hunger"] > 0.6  # the fridge restored hunger


def test_ws_cannot_act_for_foreign_avatar():
    ws_server, world = make_server()
    c1 = server_module.Connection(FakeWS(), conn_id="c1")
    c2 = server_module.Connection(FakeWS(), conn_id="c2")
    ws_server.connections[c1.id] = c1
    ws_server.connections[c2.id] = c2
    run(ws_server._handle_message(c1, {"type": "join", "name": "One"}))
    aid = last_of(c1.ws.sent, "welcome")["avatar_id"]

    run(ws_server._handle_message(c2, {
        "type": "act", "action": "move_to", "x": 1, "y": 1,
        "avatar_id": aid}))
    assert "do not control" in last_of(c2.ws.sent, "error")["error"]

    # Reading another avatar's status is allowed (spectating)
    run(ws_server._handle_message(c2, {"type": "status", "avatar_id": aid}))
    assert last_of(c2.ws.sent, "status") is not None


def test_ws_observe_sends_valid_snapshot():
    ws_server, world = make_server()
    conn = server_module.Connection(FakeWS(), conn_id="c1")
    ws_server.connections[conn.id] = conn
    run(ws_server._handle_message(conn, {"type": "observe"}))
    snap = last_of(conn.ws.sent, "snapshot")
    assert snap is not None
    assert validate_snapshot_shape(snap) == []
    assert "server" in snap


def test_act_validation_errors():
    ws_server, world = make_server()
    conn = server_module.Connection(FakeWS(), conn_id="c1")
    ws_server.connections[conn.id] = conn
    run(ws_server._handle_message(conn, {"type": "join", "name": "V"}))

    run(ws_server._handle_message(conn, {
        "type": "act", "action": "move_to", "x": "not-an-int", "y": 3}))
    assert "integer" in last_of(conn.ws.sent, "act_result")["reason"]

    run(ws_server._handle_message(conn, {"type": "act", "action": "use",
                                         "target": "x"}))
    assert "target and affordance" in last_of(conn.ws.sent,
                                              "act_result")["reason"]

    run(ws_server._handle_message(conn, {"type": "act", "action": "fly"}))
    assert "unknown action" in last_of(conn.ws.sent, "act_result")["reason"]

    ghost = server_module.Connection(FakeWS(), conn_id="g")
    ws_server.connections[ghost.id] = ghost
    run(ws_server._handle_message(ghost, {"type": "act", "action": "idle"}))
    assert "join first" in last_of(ghost.ws.sent, "error")["error"]


# ---------------------------------------------------------------- live e2e


async def _live_roundtrip(port: int) -> dict:
    """
    Boot the real server (real tick thread + real websockets) and live one
    agent life: connect, join, perceive, walk, eat, watch ticks arrive.
    """
    world = LiveWorld(seed=3, spawn_npcs=1)
    server = WorldServer(world, port=port)
    pump = asyncio.ensure_future(server.broadcast_pump())
    try:
        async with websockets.asyncio.server.serve(
                server.handler, "127.0.0.1", port,
                process_request=server._http_handler):
            world.start()  # real wall-clock tick thread
            uri = f"ws://127.0.0.1:{port}/ws"
            async with websockets.asyncio.client.connect(uri) as ws:
                return await _live_agent_life(ws, avatar_sink={})
    finally:
        pump.cancel()


async def _live_agent_life(ws, avatar_sink: dict) -> dict:
    """One agent life over an open socket: join, perceive, act, watch ticks."""
    hello = json.loads(await ws.recv())
    assert hello["type"] == "hello"

    await ws.send(json.dumps({"type": "join", "name": "River"}))
    welcome = json.loads(await ws.recv())
    assert welcome["type"] == "welcome", welcome
    avatar_id = welcome["avatar_id"]
    avatar_sink.update(welcome)

    await ws.send(json.dumps({"type": "perceive"}))
    perception = None
    for _ in range(10):
        msg = json.loads(await ws.recv())
        if msg["type"] == "perception":
            perception = msg
            break
    assert perception and perception["name"] == "River"
    fridge = next(s for s in perception["surroundings"]
                  if s.get("name") == "fridge")

    await ws.send(json.dumps({
        "type": "act", "action": "move_adjacent_to",
        "target": fridge["entity_id"]}))
    act_result = None
    for _ in range(10):
        msg = json.loads(await ws.recv())
        if msg["type"] == "act_result":
            act_result = msg
            break
    assert act_result and act_result["submitted"], act_result

    # Wait for a few live ticks from the broadcast pump
    ticks = 0
    got_you = False
    for _ in range(40):
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        if msg["type"] == "tick":
            ticks += 1
        elif msg["type"] == "you" and msg["avatar_id"] == avatar_id:
            got_you = True
        if ticks >= 3 and got_you:
            break
    assert ticks >= 3 and got_you

    await ws.send(json.dumps({"type": "status"}))
    for _ in range(20):
        msg = json.loads(await ws.recv())
        if msg["type"] == "status":
            break
    assert msg["type"] == "status"
    assert msg["needs"]
    return {"avatar_id": avatar_id, "ticks": ticks,
            "fridge_seen": True}


def find_free_port() -> int:
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_live_server_end_to_end():
    result = run(_live_roundtrip(find_free_port()))
    assert result["fridge_seen"]


# ---------------------------------------------------------------- standalone


def _main() -> None:
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
            import traceback
            traceback.print_exc()
    print(f"{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    _main()