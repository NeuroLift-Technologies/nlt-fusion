"""
Live World Server — AI agents connect and live in the Sims-like world.

Exposes the existing deterministic ECS engine (src/simulation/environment)
over WebSocket + REST:

    GET  /api/world          -> full contract-v1 snapshot (spectators)
    GET  /api/status         -> engine status
    POST /api/join           -> join as an avatar (optionally claiming one)
    WS   /ws                 -> agent + spectator protocol (see below)

Agent protocol (JSON messages over one WebSocket):
    -> {"type": "join", "name": "...", "avatar_id": "..."}   # optional avatar_id
    <- {"type": "welcome", "you": {...contract avatar...}}
    -> {"type": "perceive"}                                  # your senses
    <- {"type": "perception", ...}                           # needs + surroundings
    -> {"type": "act", "action": "move_to", "x": 4, "y": 6}
    -> {"type": "act", "action": "move_adjacent_to", "target": "<entity_id>"}
    -> {"type": "act", "action": "use", "target": "<id>", "affordance": "eat"}
    -> {"type": "act", "action": "idle"}
    <- {"type": "act_result", "submitted": true|false, "reason": "..."}
    -> {"type": "status"}                                    # your intent + needs
    <- {"type": "status", ...}
    -> {"type": "observe"}                                   # world snapshot push
    <- {"type": "snapshot", ...}

Every world tick, connected agents receive:
    <- {"type": "tick", "tick": N, "sim_time": "...", "you": {...}, "events": [...]}

Unclaimed avatars are driven by the built-in SimSim-style UtilityAgent,
so the world is always alive. Decisions (LLM or utility) stay OUTSIDE the
deterministic tick, exactly like demo.py.

Standard library only — no new dependencies.

Run:
    cd world-engine
    python server.py                          # port 8765
    python server.py --port 9000 --seed 7     # options
"""

from __future__ import annotations

import argparse
import asyncio
import json
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Set

from src.simulation.environment.world_engine import WorldEngine, EventType
from src.simulation.environment.world_builder import (
    build_world, engine_for_spec, DEFAULT_NEEDS, DEFAULT_HOME_SPEC,
)
from src.simulation.environment.agent_interface import AgentInterface
from src.simulation.environment.ecs import Needs
from src.simulation.environment.utility_agent import UtilityAgent
from src.simulation.environment.snapshot_contract import (
    emit_contract_snapshot, make_contract_event,
)

# ---------------------------------------------------------------- constants

SERVER_VERSION = "nlt.world-server.v1"

# Names for auto-generated avatars
DEFAULT_NAMES = ["Avery", "Blake", "Casey", "Devon", "Ellis", "Frankie",
                 "Gray", "Harper", "Indigo", "Jules"]

# Need decay rates from the default world spec
NEED_DECAY = DEFAULT_NEEDS

# Sim minutes per real-time second (1 real second = 1 sim minute at pace 1.0).
# With seconds_per_tick=60, one tick = one sim minute, and we tick once per
# real second.
SECONDS_PER_TICK = 60.0
TICKS_PER_SECOND = 1.0

MAX_EVENTS_BUFFER = 100

# ---------------------------------------------------------------- helpers


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


class AvatarSession:
    """One avatar in the world, plus the connection controlling it (if any)."""

    def __init__(self, engine: WorldEngine, name: str, x: int, y: int,
                 needs: Optional[Needs] = None,
                 avatar_id: Optional[str] = None):
        self.engine = engine
        agent_id = avatar_id or uuid.uuid4().hex[:12]
        self.interface = AgentInterface(engine, agent_id=agent_id,
                                        x=x, y=y, name=name, needs=needs)
        self.name = name
        self.utility: Optional[UtilityAgent] = None  # set when uncontrolled
        self.connection_id: Optional[str] = None     # controlling WS client
        # Register contract metadata so contract-v1 snapshots include this
        # avatar (otherwise emit_contract_snapshot skips it).
        contract_id = f"avatar-{agent_id[:8]}"
        engine.register_avatar_profile(
            agent_id, self.interface.entity,
            contract_id=contract_id, name=name,
            trait="player-controlled", spawn_x=x, spawn_y=y)
        self.contract_id = contract_id

    # ---- view helpers -------------------------------------------------

    def contract_view(self) -> Dict[str, Any]:
        """This avatar's entry from the latest contract snapshot."""
        snap = emit_contract_snapshot(self.engine)
        view = snap["avatars"].get(self.contract_id, {
            "id": self.contract_id, "name": self.name, "trait": "n/a",
            "state": "unknown", "metrics": {},
        })
        # Contract avatar views carry metrics but not needs; the 3D viewer
        # needs bars to draw, so include the Sims-style needs here.
        view = dict(view)
        view["needs"] = {k: round(_clamp01(v), 4)
                         for k, v in self.interface.needs().items()}
        return view

    def perception(self) -> Dict[str, Any]:
        """What the controlling agent can sense right now."""
        iface = self.interface
        pos = iface.position()
        needs = iface.needs()
        # Vision radius wide enough to see most of the small default home
        perception = iface.perceive(vision_radius=18)
        surroundings = perception.describe_surroundings()
        intent = iface.check_intent_status()
        return {
            "avatar_id": self.contract_id,
            "agent_id": iface.agent_id,
            "name": self.name,
            "position": {"x": pos[0], "y": pos[1]},
            "needs": {k: round(_clamp01(v), 4) for k, v in needs.items()},
            "intent": _clean_intent(intent),
            "surroundings": [
                {k: v for k, v in item.items() if k != "_path"}
                for item in surroundings
                if item["entity_id"] != iface.entity.entity_id
            ],
        }


def _clean_intent(intent: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Intent view without internal path-cursor fields."""
    if not intent:
        return None
    data = {k: v for k, v in intent.get("data", {}).items()
            if not k.startswith("_")}
    target = intent.get("target_id")
    progress = intent.get("intent_progress")
    return {"type": intent.get("type"),
            "target": target,
            "data": data,
            "progress": round(progress, 4) if isinstance(progress, (int, float)) else None}


class LiveWorld:
    """
    Owns the WorldEngine, a set of avatar sessions, and the real-time tick
    thread. All engine mutation happens on the sim thread; API handlers only
    submit intents (thread-safe by design — AgentInterface intent submission
    is a single dict assignment checked by systems on the next tick).
    """

    def __init__(self, seed: int = 0, spawn_npcs: int = 2):
        self.engine = engine_for_spec(DEFAULT_HOME_SPEC, seed=seed,
                                      seconds_per_tick=SECONDS_PER_TICK)
        build_world(self.engine, DEFAULT_HOME_SPEC)
        self.sessions: Dict[str, AvatarSession] = {}   # contract_id -> session
        self._lock = threading.Lock()
        self._next_spawn = 5
        self._pending_events: List[Dict[str, Any]] = []
        self.spawn_count = 0
        self.tick_number = self.engine.tick_count

        # Ambient NPCs: stationary social props already exist from the spec
        # (roommate). Extra autonomous NPC avatars make the world feel lived-in.
        for i in range(max(0, spawn_npcs)):
            self._spawn_avatar(name=f"NPC {i + 1}", controlled=False)

    # ---- avatar management --------------------------------------------

    def _spawn_avatar(self, name: str, controlled: bool) -> AvatarSession:
        """Create an avatar at a free tile in the living room."""
        session = AvatarSession(
            self.engine, name=name, x=self._next_spawn, y=12,
            needs=Needs(levels={"energy": 0.7, "hunger": 0.6, "hygiene": 0.7,
                                "fun": 0.5, "social": 0.5},
                        decay_per_s=NEED_DECAY),
        )
        self._next_spawn += 2
        self.spawn_count += 1
        self.sessions[session.contract_id] = session
        if not controlled:
            session.utility = UtilityAgent(session.interface)
        return session

    def join(self, name: Optional[str], avatar_id: Optional[str],
             connection_id: str) -> AvatarSession:
        """
        Join as a new avatar, or claim an existing utility-driven one.
        Returns the session now controlled by the caller.
        """
        with self._lock:
            if avatar_id:
                session = self.sessions.get(avatar_id)
                if session is None:
                    raise KeyError(f"no avatar with id {avatar_id!r}")
                if session.connection_id is not None:
                    raise PermissionError(
                        f"avatar {avatar_id!r} is already controlled")
                session.utility = None
                session.connection_id = connection_id
                return session
            name = (name or f"Sim {self.spawn_count + 1}").strip() or "Sim"
            session = self._spawn_avatar(name=name, controlled=False)
            session.utility = None
            session.connection_id = connection_id
            return session

    def leave(self, connection_id: str) -> List[str]:
        """Release any avatars controlled by this connection back to utility AI."""
        released = []
        with self._lock:
            for session in self.sessions.values():
                if session.connection_id == connection_id:
                    session.connection_id = None
                    session.utility = UtilityAgent(session.interface)
                    released.append(session.contract_id)
        return released

    def leave_for_avatar(self, avatar_id: str) -> bool:
        """Release one avatar back to utility AI (used on disconnect)."""
        with self._lock:
            session = self.sessions.get(avatar_id)
            if session is None:
                return False
            session.connection_id = None
            session.utility = UtilityAgent(session.interface)
            return True

    def get_session(self, avatar_id: str) -> Optional[AvatarSession]:
        return self.sessions.get(avatar_id)

    # ---- world views ----------------------------------------------------

    def snapshot(self) -> Dict[str, Any]:
        snap = emit_contract_snapshot(self.engine)
        for session in self.sessions.values():
            if session.contract_id in snap["avatars"]:
                snap["avatars"][session.contract_id]["needs"] = {
                    k: round(_clamp01(v), 4)
                    for k, v in session.interface.needs().items()}
        snap["avatars"] = dict(sorted(snap["avatars"].items()))
        snap["server"] = {"version": SERVER_VERSION,
                          "avatars_controlled": sum(
                              1 for s in self.sessions.values()
                              if s.connection_id),
                          "avatars_total": len(self.sessions)}
        return snap

    def scene(self) -> Dict[str, Any]:
        """Renderer-facing scene description (rooms + props)."""
        try:
            from src.simulation.scene.loader import (
                DEFAULT_SCENE_PATH, load_scene, scene_to_studio_rooms,
            )
            scene = load_scene(DEFAULT_SCENE_PATH)
            return {"rooms": scene_to_studio_rooms(scene),
                    "grid": DEFAULT_HOME_SPEC["grid"]}
        except Exception:
            return {"rooms": [], "grid": DEFAULT_HOME_SPEC["grid"]}

    # ---- tick loop ------------------------------------------------------

    def start(self) -> None:
        self._tick_thread = threading.Thread(target=self._run, daemon=True,
                                             name="world-tick")
        self._tick_thread.start()

    def _run(self) -> None:
        interval = 1.0 / TICKS_PER_SECOND
        while True:
            loop_start = time.monotonic()
            self._tick_once()
            elapsed = time.monotonic() - loop_start
            time.sleep(max(0.0, interval - elapsed))

    def _tick_once(self) -> None:
        engine = self.engine
        with self._lock:
            # 1. Utility brains decide (outside the deterministic tick)
            for session in self.sessions.values():
                if session.utility is not None:
                    session.utility.step()
            # 2. Advance the world one deterministic tick
            if engine.current_state.name == "RUNNING":
                engine.run_simulation_step()
            # 3. Drain events emitted this tick
            drained = list(engine._pending_events)
            engine._pending_events.clear()
        # Prepend anything drained earlier but not yet broadcast, so a
        # concurrent drain_tick_events cannot lose events.
        self._pending_events = self._pending_events + drained
        self.tick_number = engine.tick_count

    def drain_tick_events(self) -> List[Dict[str, Any]]:
        """Events emitted by the most recent tick (sim-thread safe)."""
        events, self._pending_events = self._pending_events, []
        return events


# ---------------------------------------------------------------- network


class Connection:
    """One connected client: agent and/or spectator."""

    def __init__(self, ws: Any, conn_id: str):
        self.ws = ws
        self.id = conn_id
        self.avatar_ids: Set[str] = set()
        self.wants_broadcasts = False


class WorldServer:
    """
    WebSocket + REST facade over LiveWorld.

    REST:
        GET /api/world   -> contract snapshot
        GET /api/scene   -> rooms/props for renderers
        GET /api/status  -> server status

    WebSocket (/ws): protocol documented in the module docstring.
    """

    def __init__(self, world: LiveWorld, host: str = "127.0.0.1",
                 port: int = 8765):
        self.world = world
        self.host = host
        self.port = port
        self.connections: Dict[str, Connection] = {}
        self._outbox: "asyncio.Queue[tuple[Connection, str]]" = asyncio.Queue()

    # ---- HTTP -----------------------------------------------------------

    def _json_response(self, connection: Any, payload: Dict[str, Any]) -> Any:
        from websockets.datastructures import Headers  # local: fast import
        try:
            from websockets.asyncio.server import Response
        except ImportError:  # pragma: no cover
            return (200, [("Content-Type", "application/json"),
                          ("Access-Control-Allow-Origin", "*")],
                    json.dumps(payload).encode())
        return Response(
            status_code=200,
            reason_phrase="OK",
            headers=Headers([
                ("Content-Type", "application/json"),
                ("Access-Control-Allow-Origin", "*"),
            ]),
            body=json.dumps(payload).encode(),
        )

    async def _http_handler(self, connection: Any, request: Any) -> Any:
        path = request.path.split("?", 1)[0]
        if path in ("/api/world", "/api/snapshot"):
            return self._json_response(connection, self.world.snapshot())
        if path == "/api/scene":
            return self._json_response(connection, self.world.scene())
        if path == "/api/status":
            return self._json_response(connection, {
                "status": "ok",
                "version": SERVER_VERSION,
                "tick": self.world.engine.tick_count,
                "sim_time": self.world.engine.simulation_time.isoformat(),
                "connections": len(self.connections),
            })
        if path == "/":
            return self._json_response(connection, {
                "name": "NLT World Engine",
                "version": SERVER_VERSION,
                "endpoints": ["/api/world", "/api/scene", "/api/status", "/ws"],
            })
        return None  # not an HTTP path we handle → websockets serves /ws

    # ---- WebSocket ------------------------------------------------------

    async def handler(self, ws: Any) -> None:
        conn = Connection(ws, conn_id=uuid.uuid4().hex[:12])
        self.connections[conn.id] = conn
        try:
            await ws.send(json.dumps({
                "type": "hello", "server": SERVER_VERSION,
                "tick": self.world.engine.tick_count,
                "protocol": {
                    "join": {"type": "join", "name": "str", "avatar_id": "str?"},
                    "perceive": {"type": "perceive"},
                    "act": {"type": "act",
                            "action": "move_to|move_adjacent_to|use|idle",
                            "x": "int?", "y": "int?", "target": "str?",
                            "affordance": "str?"},
                    "status": {"type": "status"},
                    "observe": {"type": "observe"},
                },
            }))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (TypeError, ValueError):
                    await ws.send(json.dumps({"type": "error",
                                              "error": "invalid json"}))
                    continue
                await self._handle_message(conn, msg)
        except Exception:
            pass
        finally:
            self.connections.pop(conn.id, None)
            for avatar_id in conn.avatar_ids:
                self.world.leave_for_avatar(avatar_id)
            await self._broadcast_event({
                "type": "left", "connection_id": conn.id,
                "avatars": list(conn.avatar_ids),
            })

    async def _handle_message(self, conn: Connection,
                              msg: Dict[str, Any]) -> None:
        mtype = msg.get("type")

        if mtype == "join":
            try:
                session = self.world.join(
                    name=msg.get("name"), avatar_id=msg.get("avatar_id"),
                    connection_id=conn.id)
            except (KeyError, PermissionError) as exc:
                await conn.ws.send(json.dumps({"type": "error",
                                               "error": str(exc)}))
                return
            conn.avatar_ids.add(session.contract_id)
            await conn.ws.send(json.dumps({
                "type": "welcome", "you": session.contract_view(),
                "avatar_id": session.contract_id,
                "tip": "send perceive / act / status / observe",
            }))
            await self._broadcast_event({
                "type": "joined", "avatar": session.contract_view(),
                "connection_id": conn.id,
            })

        elif mtype == "perceive":
            session, error = self._session_for(conn, msg)
            if error:
                await conn.ws.send(json.dumps({"type": "error",
                                               "error": error}))
            elif session:
                await conn.ws.send(json.dumps({
                    "type": "perception", **session.perception()}))

        elif mtype == "act":
            session, error = self._session_for(conn, msg)
            if error:
                await conn.ws.send(json.dumps({"type": "error",
                                               "error": error}))
            elif session:
                await self._handle_act(conn, session, msg)

        elif mtype == "status":
            session, error = self._session_for(conn, msg)
            if error:
                await conn.ws.send(json.dumps({"type": "error",
                                               "error": error}))
            elif session:
                iface = session.interface
                await conn.ws.send(json.dumps({
                    "type": "status",
                    "avatar_id": session.contract_id,
                    "needs": session.perception()["needs"],
                    "intent": _clean_intent(iface.check_intent_status()),
                    "last_result": iface.last_result(),
                    "position": {"x": iface.position()[0],
                                 "y": iface.position()[1]},
                }))

        elif mtype == "observe":
            conn.wants_broadcasts = True
            await conn.ws.send(json.dumps({
                "type": "snapshot", **self.world.snapshot()}))

        elif mtype == "ping":
            await conn.ws.send(json.dumps({"type": "pong"}))

        else:
            await conn.ws.send(json.dumps({
                "type": "error",
                "error": f"unknown message type {mtype!r}"}))

    def _session_for(self, conn: Connection,
                     msg: Dict[str, Any]) -> tuple[Optional[AvatarSession],
                                                   Optional[str]]:
        """
        Find the avatar a message refers to (explicit avatar_id, else the
        joiner's first). Returns (session, error); callers send the error.
        Reading another avatar's status is allowed; acting for one you
        don't control is rejected.
        """
        avatar_id = msg.get("avatar_id")
        if avatar_id:
            session = self.world.get_session(avatar_id)
            if session is None:
                return None, f"no avatar with id {avatar_id!r}"
            if avatar_id in conn.avatar_ids or msg.get("type") == "status":
                return session, None
            return None, f"you do not control avatar {avatar_id!r}"
        for aid in conn.avatar_ids:
            session = self.world.get_session(aid)
            if session:
                return session, None
        return None, "join first: {\"type\": \"join\", \"name\": \"...\"}"

    async def _handle_act(self, conn: Connection, session: AvatarSession,
                          msg: Dict[str, Any]) -> None:
        action = msg.get("action")
        iface = session.interface
        submitted, reason = False, None

        if action == "move_to":
            x, y = msg.get("x"), msg.get("y")
            if not isinstance(x, int) or not isinstance(y, int):
                reason = "move_to needs integer x and y"
            else:
                submitted = iface.move_to(x, y)
                reason = None if submitted else "avatar is busy"
        elif action == "move_adjacent_to":
            submitted = iface.move_adjacent_to(msg.get("target") or "")
            reason = None if submitted else "unknown target or avatar busy"
        elif action == "use":
            target, affordance = msg.get("target"), msg.get("affordance")
            if not target or not affordance:
                reason = "use needs target and affordance"
            else:
                submitted = iface.use(target, affordance)
                reason = None if submitted else "avatar is busy"
        elif action == "idle":
            submitted = True  # no-op; the world just keeps ticking
        else:
            reason = (f"unknown action {action!r}; valid: move_to, "
                      "move_adjacent_to, use, idle")

        await conn.ws.send(json.dumps({
            "type": "act_result", "action": action,
            "submitted": submitted, "reason": reason,
        }))

    # ---- broadcasts -------------------------------------------------------

    async def _broadcast_event(self, payload: Dict[str, Any]) -> None:
        text = json.dumps(payload)
        for conn in list(self.connections.values()):
            try:
                await conn.ws.send(text)
            except Exception:
                pass

    async def broadcast_pump(self) -> None:
        """Push per-tick updates to all connections, once per tick."""
        last_seen_tick = -1
        while True:
            await asyncio.sleep(0.1)
            tick = self.world.engine.tick_count
            if tick == last_seen_tick:
                continue
            last_seen_tick = tick
            events = self.world.drain_tick_events()
            base = json.dumps({
                "type": "tick", "tick": tick,
                "sim_time": self.world.engine.simulation_time.isoformat(),
                "events": events,
            })
            for conn in list(self.connections.values()):
                try:
                    await conn.ws.send(base)
                    for avatar_id in conn.avatar_ids:
                        session = self.world.get_session(avatar_id)
                        if session:
                            await conn.ws.send(json.dumps({
                                "type": "you", "avatar_id": avatar_id,
                                "you": session.contract_view(),
                            }))
                except Exception:
                    pass


# ---------------------------------------------------------------- main


async def amain() -> None:
    parser = argparse.ArgumentParser(description="NLT Live World Server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--npcs", type=int, default=2,
                        help="number of utility-driven NPC avatars")
    args = parser.parse_args()

    world = LiveWorld(seed=args.seed, spawn_npcs=args.npcs)
    world.start()
    server = WorldServer(world, host=args.host, port=args.port)

    async with serve(server.handler, args.host, args.port,
                     process_request=server._http_handler) as ws_server:
        print(f"NLT World Engine live:")
        print(f"  ws   : ws://{args.host}:{args.port}/ws")
        print(f"  REST : http://{args.host}:{args.port}/api/world")
        pump = asyncio.ensure_future(server.broadcast_pump())
        try:
            await pump
        finally:
            pump.cancel()


if __name__ == "__main__":
    from websockets.asyncio.server import serve
    asyncio.run(amain())