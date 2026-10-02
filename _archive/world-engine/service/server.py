"""Thin SSE + REST host for the headless world engine (stdlib only)."""

from __future__ import annotations

import copy
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

WORLD_ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(WORLD_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORLD_ENGINE_ROOT))

from src.simulation.core_loop import build_core_loop_world
from src.simulation.scene.loader import scene_to_studio_rooms


class SimulationService:
    """Owns the runner and fans out snapshot/event updates to SSE clients."""

    def __init__(self, seed: int = 42, pace: float = 1.0):
        self._lock = threading.Lock()
        self.engine, self.runner, self.scenario_system, self.meta = (
            build_core_loop_world(seed=seed, pace=pace))
        self.subscribers: List["queue.Queue[Dict[str, Any]]"] = []
        self.latest_snapshot = self.engine.get_snapshot()
        self.latest_events: List[Dict[str, Any]] = []
        self.runner.on_update(self._on_update)

    def _on_update(self, snapshot: Dict[str, Any],
                   events: List[Dict[str, Any]]) -> None:
        with self._lock:
            self.latest_snapshot = snapshot
            if events:
                self.latest_events = (events + self.latest_events)[:200]
            for sub in list(self.subscribers):
                try:
                    sub.put_nowait({"snapshot": snapshot, "events": events})
                except Exception:
                    pass

    def subscribe(self):
        import queue
        sub: queue.Queue = queue.Queue(maxsize=64)
        with self._lock:
            self.subscribers.append(sub)
        return sub

    def unsubscribe(self, sub) -> None:
        with self._lock:
            if sub in self.subscribers:
                self.subscribers.remove(sub)

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "running": self.runner.running,
                "pace": self.runner.pace,
                "snapshot": copy.deepcopy(self.latest_snapshot),
            }

    def get_snapshot_copy(self) -> Dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self.latest_snapshot)

    def stream_bundle(self, snapshot: Optional[Dict[str, Any]] = None,
                      events: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        with self._lock:
            return {
                "snapshot": snapshot if snapshot is not None else self.latest_snapshot,
                "events": events if events is not None else self.latest_events[:20],
                "interventions": list(self.engine.interventions),
            }

    def step_if_running(self) -> float:
        with self._lock:
            running = self.runner.running
            pace = self.runner.pace
            tick_seconds = self.engine.time_per_tick.total_seconds()
        if running:
            # step_once triggers _on_update, which acquires _lock — never call
            # it while holding the lock (non-reentrant; deadlocks HTTP step).
            self.runner.step_once()
        return max(0.05, tick_seconds / max(pace, 0.1))

    def control(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = payload or {}
        do_step = False
        with self._lock:
            if action == "pause":
                self.runner.pause()
            elif action == "resume":
                self.runner.resume()
            elif action == "toggle":
                self.runner.toggle()
            elif action == "step":
                do_step = True
            elif action == "pace":
                pace = float(payload.get("pace", self.runner.pace))
                self.runner.pace = max(0.1, pace)
                self.engine.pace = self.runner.pace
            elif action == "assign_scenario":
                agent_id = payload.get("agent_id", "stay_alert")
                scenario_id = payload.get("scenario_id", "pers_4")
                self.scenario_system.assign(agent_id, scenario_id)
            elif action == "reset":
                seed = int(payload.get("seed", self.engine.seed))
                pace = float(payload.get("pace", self.runner.pace))
                self.engine, self.runner, self.scenario_system, self.meta = (
                    build_core_loop_world(seed=seed, pace=pace))
                self.runner.on_update(self._on_update)
                self.latest_events.clear()
                self.latest_snapshot = self.engine.get_snapshot()
            else:
                return {"ok": False, "error": f"unknown action: {action}"}

        if do_step:
            self.runner.step_once()

        return {"ok": True, "status": self.get_status()}

    def scene_payload(self) -> Dict[str, Any]:
        with self._lock:
            scene = self.meta["scene"]
            return {
                "contract_version": scene.get("contract_version", "nlt.world-engine.v1"),
                "scene_id": scene.get("scene_id", "default_home"),
                "grid": scene.get("grid", {}),
                "rooms": scene_to_studio_rooms(scene),
                "raw": scene,
            }


def make_handler(service: SimulationService):
    class Handler(BaseHTTPRequestHandler):
        server_version = "NLTWorldEngine/1.0"

        def log_message(self, format: str, *args: Any) -> None:
            return

        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def _json(self, code: int, payload: Dict[str, Any]) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/scene":
                self._json(200, service.scene_payload())
            elif parsed.path == "/api/status":
                self._json(200, service.get_status())
            elif parsed.path == "/api/snapshot":
                self._json(200, service.get_snapshot_copy())
            elif parsed.path == "/api/stream":
                self._sse()
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != "/api/control":
                self._json(404, {"error": "not found"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self._json(400, {"ok": False, "error": "invalid json"})
                return
            action = payload.get("action")
            if not action:
                self._json(400, {"ok": False, "error": "missing action"})
                return
            result = service.control(action, payload.get("payload", payload))
            self._json(200, result)

        def _sse(self) -> None:
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            sub = service.subscribe()
            try:
                init = service.stream_bundle()
                self.wfile.write(f"event: init\ndata: {json.dumps(init)}\n\n".encode())
                self.wfile.flush()

                while True:
                    try:
                        update = sub.get(timeout=15)
                    except Exception:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                        continue
                    chunk = service.stream_bundle(
                        snapshot=update["snapshot"],
                        events=update["events"],
                    )
                    self.wfile.write(
                        f"event: update\ndata: {json.dumps(chunk)}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                service.unsubscribe(sub)

    return Handler


def run_server(host: str = "127.0.0.1", port: int = 8765,
               seed: int = 42, pace: float = 2.0) -> ThreadingHTTPServer:
    service = SimulationService(seed=seed, pace=pace)
    handler = make_handler(service)
    httpd = ThreadingHTTPServer((host, port), handler)

    def loop() -> None:
        while True:
            sleep_time = service.step_if_running()
            time.sleep(sleep_time)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return httpd


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="NLT World Engine SSE/REST service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--pace", type=float, default=2.0)
    args = parser.parse_args()
    server = run_server(args.host, args.port, seed=args.seed, pace=args.pace)
    print(f"World Engine service listening on http://{args.host}:{args.port}")
    print("  GET  /api/stream   — SSE snapshot/event stream")
    print("  GET  /api/scene    — canonical scene JSON")
    print("  POST /api/control  — pause/resume/step/pace/assign_scenario/reset")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
