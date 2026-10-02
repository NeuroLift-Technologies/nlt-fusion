"""
Headless simulation runner with pace control and controller stepping.

Wraps WorldEngine.run_simulation_step() for SSE streaming and REST controls.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional, Protocol

from .environment.world_engine import SimulationState, WorldEngine


class Controller(Protocol):
    def step(self) -> None:
        ...


class WorldRunner:
    """Fixed-timestep runner with optional real-time pacing."""

    def __init__(self, engine: WorldEngine,
                 controllers: Optional[List[Controller]] = None,
                 pace: Optional[float] = None):
        self.engine = engine
        self.controllers: List[Controller] = list(controllers or [])
        self.pace = pace if pace is not None else engine.pace
        self.running = engine.current_state == SimulationState.RUNNING
        self._listeners: List[Callable[[Dict[str, Any], List[Dict[str, Any]]], None]] = []

    def on_update(self, listener: Callable[[Dict[str, Any], List[Dict[str, Any]]], None]) -> None:
        self._listeners.append(listener)

    def pause(self) -> None:
        self.running = False
        self.engine.current_state = SimulationState.PAUSED

    def resume(self) -> None:
        self.running = True
        self.engine.current_state = SimulationState.RUNNING

    def toggle(self) -> None:
        if self.running:
            self.pause()
        else:
            self.resume()

    def reset(self) -> None:
        raise NotImplementedError("reset requires a factory — use service bootstrap")

    def step_once(self) -> Dict[str, Any]:
        for controller in self.controllers:
            controller.step()
        self.engine.run_simulation_step()
        events = self.engine.drain_contract_events()
        snapshot = self.engine.get_snapshot()
        for listener in self._listeners:
            listener(snapshot, events)
        return snapshot

    def run_realtime_loop(self, stop_when: Optional[Callable[[], bool]] = None) -> None:
        """Blocking loop for local demos; service uses threaded variant."""
        seconds_per_tick = self.engine.time_per_tick.total_seconds()
        while stop_when is None or not stop_when():
            if self.running:
                started = time.monotonic()
                self.step_once()
                if self.pace > 0:
                    delay = (seconds_per_tick / self.pace) - (time.monotonic() - started)
                    if delay > 0:
                        time.sleep(delay)
            else:
                time.sleep(0.05)

    def status(self) -> Dict[str, Any]:
        snapshot = self.engine.get_snapshot()
        return {
            "running": self.running,
            "pace": self.pace,
            "snapshot": snapshot,
        }
