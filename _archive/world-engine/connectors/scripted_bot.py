"""
Scripted resident — an AI that lives in the world through the Agent API.

Same SimSim-style utility brain as the in-process UtilityAgent, but it
perceives/decides/acts entirely over the WebSocket protocol. Use it to
smoke-test a running server or as a reference implementation for real
LLM-driven agents.

Usage:
    python connectors/scripted_bot.py --name Pip
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.simulation.environment.utility_agent import UtilityAgent  # noqa: E402


class RemoteBrain:
    """
    Reimplementation of UtilityAgent.decide for remote perceptions.

    UtilityAgent.decide is pure (needs + surroundings -> plan), so we
    mirror it here against server payloads instead of engine objects.
    Keeps the brain behavior identical without engine imports at runtime.
    """

    RANKING = ["hunger", "hygiene", "energy", "social", "fun"]
    THRESHOLD = 0.5

    def decide(self, needs: dict, surroundings: list) -> dict | None:
        for need in self.RANKING:
            if needs.get(need, 0.0) >= self.THRESHOLD:
                continue
            target = self._nearest_beneficial(need, surroundings)
            if target is None:
                continue
            affordances = target.get("affordances") or []
            return {"target_id": target["entity_id"],
                    "target_name": target.get("name", "?"),
                    "affordance": affordances[0],
                    "need": need, "phase": "approach"}
        return None

    @staticmethod
    def _nearest_beneficial(need: str, surroundings: list) -> dict | None:
        nearest = None
        for thing in surroundings:
            if not thing.get("affordances") or thing.get("in_use"):
                continue
            effects = thing.get("need_effects") or {}
            if effects.get(need, 0.0) <= 0.0:
                continue
            if nearest is None or thing.get("distance", 1e9) < nearest.get(
                    "distance", 1e9):
                nearest = thing
        return nearest


class Bot:
    """One scripted resident: perceive -> decide -> act, forever."""

    def __init__(self, uri: str, name: str):
        self.uri = uri
        self.name = name
        self.brain = RemoteBrain()
        self.plan: dict | None = None
        self.busy = False
        self.needs: dict = {}
        self.surroundings: list = []

    async def run(self) -> None:
        try:
            import websockets.asyncio.client as ws_client
        except ImportError:
            print("scripted_bot needs the 'websockets' package: "
                  "pip install websockets")
            raise SystemExit(2)
        async with ws_client.connect(self.uri) as ws:
            await ws.recv()  # hello
            await ws.send(json.dumps({"type": "join", "name": self.name}))
            welcome = json.loads(await ws.recv())
            print(f"{self.name} joined as {welcome.get('avatar_id')}")
            await ws.send(json.dumps({"type": "perceive"}))
            async for raw in ws:
                await self._on_message(ws, json.loads(raw))

    async def _on_message(self, ws, msg: dict) -> None:
        mtype = msg.get("type")
        if mtype == "perception":
            self.needs = msg.get("needs", {})
            self.surroundings = msg.get("surroundings", [])
            self.busy = bool(msg.get("intent"))
            await self._decide(ws)
        elif mtype == "act_result":
            self.busy = bool(msg.get("submitted"))
            if not self.busy:
                self.plan = None  # rejected; re-plan on next perception
            await ws.send(json.dumps({"type": "perceive"}))
        elif mtype == "tick":
            # Tick resolved work; refresh senses when idle.
            if not self.busy:
                await ws.send(json.dumps({"type": "perceive"}))

    async def _decide(self, ws) -> None:
        if self.busy:
            # Fresh perception after an approach finished: start using.
            if self.plan and self.plan["phase"] == "approach":
                self.plan["phase"] = "use"
                await ws.send(json.dumps({
                    "type": "act", "action": "use",
                    "target": self.plan["target_id"],
                    "affordance": self.plan["affordance"]}))
                self.busy = True
            return
        if self.plan and self.plan["phase"] == "use":
            self.plan = None  # use finished; pick the next need
        if self.plan is None:
            self.plan = self.brain.decide(self.needs, self.surroundings)
            if self.plan:
                print(f"{self.name}: {self.plan['need']} low -> "
                      f"{self.plan['affordance']} @ {self.plan['target_name']}")
                await ws.send(json.dumps({
                    "type": "act", "action": "move_adjacent_to",
                    "target": self.plan["target_id"]}))
                self.busy = True


def main() -> None:
    parser = argparse.ArgumentParser(description="Scripted world resident")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--name", default="Pip")
    args = parser.parse_args()
    bot = Bot(f"ws://{args.host}:{args.port}/ws", args.name)
    asyncio.run(bot.run())


if __name__ == "__main__":
    main()