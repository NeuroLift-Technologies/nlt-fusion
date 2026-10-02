"""
Example LLM connector — plug any model into the Agent API.

This is the "plug-in play" seam: implement `decide()` with your model of
choice (OpenAI, Anthropic, local Ollama/vLLM, ...), keep everything else.
The connector handles protocol, perception formatting, and act submission;
you only write cognition.

Implement `decide(perception) -> action dict`, e.g.::

    {"action": "move_to", "x": 4, "y": 6}
    {"action": "move_adjacent_to", "target": "<entity_id>"}
    {"action": "use", "target": "<entity_id>", "affordance": "eat"}
    {"action": "idle"}

Provided: `LLMBot` (protocol loop) + `PromptBuilder` (perception -> prompt).
You provide: `decide()`.

Usage:
    python connectors/llm_connector.py --name Muse --model demo-echo
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE.parent) not in sys.path:
    sys.path.insert(0, str(HERE.parent))


class PromptBuilder:
    """Turn a perception payload into a compact LLM prompt."""

    NEED_LABELS = {
        "energy": "rest", "hunger": "food", "hygiene": "cleanliness",
        "fun": "fun", "social": "company",
    }

    def build(self, perception: dict) -> str:
        needs = perception.get("needs", {})
        lines = [
            f"You are {perception.get('name', 'a Sim')} living in a small "
            "house. Satisfy your needs by walking to objects and using them.",
            "Needs (0=desperate, 1=satisfied):",
        ]
        for need, level in sorted(needs.items()):
            label = self.NEED_LABELS.get(need, need)
            lines.append(f"  - {need} ({label}): {level:.2f}")
        lines.append("Nearby objects (closest first):")
        for item in (perception.get("surroundings") or [])[:12]:
            name = item.get("name", "?")
            dist = item.get("distance", "?")
            affords = ", ".join(item.get("affordances") or [])
            effects = ", ".join(
                f"{k}+{v:.1f}" for k, v in
                (item.get("need_effects") or {}).items())
            busy = " (busy)" if item.get("in_use") else ""
            lines.append(
                f"  - {name} id={item.get('entity_id')} d={dist} "
                f"affords=[{affords}] restores={{{effects}}}{busy}")
        pos = perception.get("position", {})
        lines.append(f"You are at ({pos.get('x')},{pos.get('y')}).")
        intent = perception.get("intent")
        if intent:
            lines.append(f"Currently doing: {intent.get('type')}. "
                         "Reply with idle to keep going.")
        lines.append(
            "Reply with ONE JSON object only: "
            '{"action":"move_to","x":int,"y":int} or '
            '{"action":"move_adjacent_to","target":"id"} or '
            '{"action":"use","target":"id","affordance":"name"} or '
            '{"action":"idle"}.')
        return "\n".join(lines)


def decide_stub(perception: dict, model: str = "demo-echo") -> dict:
    """
    Placeholder cognition: chase the lowest need like the utility brain.

    Replace this function with a real model call. It must return an action
    dict; anything unparseable falls back to {"action": "idle"}.
    """
    _ = model
    needs = perception.get("needs", {}) or {"fun": 0.0}
    worst = min(needs, key=lambda k: needs[k])
    for item in perception.get("surroundings", []):
        effects = item.get("need_effects") or {}
        if (item.get("affordances") and not item.get("in_use")
                and effects.get(worst, 0.0) > 0.0):
            affordance = (item["affordances"] or ["use"])[0]
            pos = item.get("position")
            if pos and item.get("distance", 99) > 1:
                return {"action": "move_adjacent_to",
                        "target": item["entity_id"]}
            return {"action": "use", "target": item["entity_id"],
                    "affordance": affordance}
    return {"action": "idle"}


class LLMBot:
    """Protocol loop: join -> perceive -> decide -> act, on every tick."""

    def __init__(self, uri: str, name: str, model: str = "demo-echo"):
        self.uri = uri
        self.name = name
        self.model = model
        self.prompts = PromptBuilder()

    async def run(self, max_steps: int = 0) -> None:
        try:
            import websockets.asyncio.client as ws_client
        except ImportError:
            print("llm_connector needs the 'websockets' package: "
                  "pip install websockets")
            raise SystemExit(2)
        async with ws_client.connect(self.uri) as ws:
            await ws.recv()  # hello
            await ws.send(json.dumps({"type": "join", "name": self.name}))
            welcome = json.loads(await ws.recv())
            print(f"{self.name} joined as {welcome.get('avatar_id')}")
            await ws.send(json.dumps({"type": "perceive"}))
            steps = 0
            async for raw in ws:
                msg = json.loads(raw)
                done = await self._on_message(ws, msg)
                if done:
                    return
                if msg.get("type") == "act_result":
                    steps += 1
                    if max_steps and steps >= max_steps:
                        print(f"{self.name}: {steps} actions done, leaving")
                        return

    async def _on_message(self, ws, msg: dict) -> bool:
        mtype = msg.get("type")
        if mtype == "perception":
            print("--- prompt sent to model ---")
            print(self.prompts.build(msg))
            action = decide_stub(msg, self.model)
            print(f"--- model ({self.model}) replied: {action}")
            await ws.send(json.dumps({"type": "act", **action}))
        elif mtype == "act_result":
            await ws.send(json.dumps({"type": "perceive"}))
        elif mtype == "tick":
            if not msg.get("events"):
                return False
            await ws.send(json.dumps({"type": "perceive"}))
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Example LLM connector")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--name", default="Nova")
    parser.add_argument("--model", default="demo-echo",
                        help="model id passed to decide(); stub ignores it")
    parser.add_argument("--max-steps", type=int, default=0,
                        help="stop after N actions (0 = run forever)")
    args = parser.parse_args()
    bot = LLMBot(f"ws://{args.host}:{args.port}/ws", args.name, args.model)
    asyncio.run(bot.run(max_steps=args.max_steps))


if __name__ == "__main__":
    main()