# Physical-World Agent Loop

**Protocol:** [`nlt.agent-loop.v1`](contracts/agent-loop-v1.md)
**Status:** transport-neutral contract and validation seams implemented; live runtime loop incomplete.

## Purpose

The agent loop connects Fusion's semantic cognition to the physical world without making either
repository authoritative for the other's responsibilities. An agent should be able to perceive
nearby people, objects, and places, choose a semantic action, and observe the physical result.

```text
Godot physical perception
        ↓
Fusion semantic decision
        ↓
Godot intent validation and physical execution
        ↓
Next physical perception
```

## Ownership

| Responsibility | Owner |
| --- | --- |
| Position, velocity, scene, visibility, affordances, occupancy, collision, and physical effects | `nlt-world-engine` |
| Avatar/Aide meaning, goals, needs, coaching, burnout/readiness, and semantic intent | `neurolift-ai-fusion` |
| Intent validation, target and affordance checks, movement, and interaction consequences | `nlt-world-engine` |
| Observer presentation | Displays each owner's supplied data without deriving or overwriting the other's facts |

Fusion sends **intent**, not physical commands. It cannot set coordinates or velocity, teleport an
agent, or directly mutate an object's state. The world engine checks an intent against current world
conditions and owns every resulting physical effect.

## Messages and actions

An engine perception snapshot is scoped to one agent and tick. It carries the agent's physical
state, scene identity, and visible entities with physical affordances. Fusion returns an intent
correlated to that exact `agentId` and `observedTick`.

The v1 semantic verbs are:

| Verb | Target |
| --- | --- |
| `approach` | Required |
| `look_at` | Required |
| `use` | Required |
| `sit` | Required |
| `communicate` | Required |
| `rest` | Optional |
| `wait` | Optional |

For targeted actions, the target must have been in the supplied perception. Visibility at decision
time does not guarantee that it remains reachable or available: the engine must re-check range,
visibility, collision, and affordances when applying the intent. Stale or mismatched intents are
rejected. Rejections include a reason. Acceptance means accepted for execution, not that the desired
physical outcome already occurred; a later perception snapshot is authoritative for the result.

The schema and complete message examples are in
[`contracts/agent-loop-v1.md`](contracts/agent-loop-v1.md) and
[`contracts/agent-loop-v1.schema.json`](contracts/agent-loop-v1.schema.json).

## Boundary from the observer feed

`nlt.agent-loop.v1` is a control boundary. [`nlt.state-feed.v1`](contracts/state-feed-v1.md) remains
a separate observer/presentation projection. In particular, placeholder position and velocity
values in Fusion's existing state-feed serializer must not be treated as live engine state.
Production observer composition must use engine-owned physical fields and Fusion-owned semantic
fields without transferring authority.

## Current implementation

Implemented:

- Versioned perception, intent, and execution-result envelopes, with a JSON Schema that rejects
  undeclared fields such as physical-write commands.
- Strict protocol and correlation/target validation in Godot:
  `world-engine-godot/Agents/AgentLoopProtocol.cs`.
- A transport-neutral Fusion validation seam around an injected semantic decision callback:
  `neurolift-ai-fusion/src/fusion/agent_loop.py`.
- Focused Python and C# contract assertions for serialization, stale or hidden targets,
  unauthorized actions, results, and rejection reasons.

Not implemented yet:

- No live transport has been selected or added. The contract does not assume HTTP, WebSocket,
  file polling, or an in-process call.
- Fusion's seam is not connected to `SessionOrchestrator`.
- Godot's protocol is not connected to `AgentBrain` or `Main`.
- The running Godot scene does not yet execute this protocol through Jolt-backed collision and
  interaction handlers. A validated intent is not proof of physical execution.
- There is no cross-process closed-loop smoke test or production observer-field composition yet.

Therefore this feature currently establishes and tests the **boundary**, not a working live
Fusion-to-Godot runtime integration. Transport, runtime wiring, and physical action execution remain
separate follow-up work.
