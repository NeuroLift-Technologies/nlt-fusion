# Agent Loop Contract — `nlt.agent-loop.v1`

**Status:** transport-neutral draft · **Thread:** `AGENT-LOOP-001`
**Direction:** physical perception: world engine → Fusion; semantic intent: Fusion → world engine.

## 1. Purpose and authority

This is the runtime control boundary between `nlt-world-engine` and `neurolift-ai-fusion`.
It is deliberately separate from [`state-feed-v1.md`](state-feed-v1.md), which remains the
read-only observer/fixture projection.

```text
Godot physical tick
  └─ perception snapshot ──▶ Fusion semantic decision
                                └─ intent ──▶ engine-side ASFDK governance check
                                                 └─ Godot physical validation and execution
                                                       └─ next snapshot ──▶ Fusion
```

| Data | Authority |
|---|---|
| Position, velocity, scene, visible entities, object affordances/occupancy, collision and physical effects | `nlt-world-engine` |
| Avatar/Aide meaning, goals, needs, named cognitive state, coaching, burnout/readiness, action intent | `neurolift-ai-fusion` |
| Intent validation, target/affordance checks, pathing, locomotion, interaction effects | `nlt-world-engine` |
| Observer presentation | Godot renders the owners' supplied fields; it derives neither physical facts nor Fusion assessments |

Fusion must not send coordinates, velocity, teleport requests, or object-state writes. An intent is
a request, not authority: the engine may reject it based on current physical state and reports the
reason rather than silently dropping it.

The runtime places an in-process ASFDK-C# governance boundary at intent ingress, before physical
execution. `AsfdkGovernanceGate` is implemented and wired into `IntentIngress`; its current policy
mapping applies prompt defense, RRT crisis assessment, and Sleepwalker distress assessment.
Intent-specific TOI policy mapping remains pending, and assessments must not be treated as TOI
authorization. This is an implementation-level check, not a message or authority transfer in this
protocol. ASFDK governance does not replace the engine's physical validation. The current
gate-unavailable fallback is fail-open with an audit explanation and must be reviewed before
production use.

## 2. Perception snapshot

The engine sends one snapshot per agent decision opportunity. Coordinates are metres in the Godot
world coordinate frame; `velocity` is descriptive and cannot be written back through an intent.
`visibleEntities` contains only entities visible to that agent, not a world-global listing.

```json
{
  "protocolVersion": "nlt.agent-loop.v1",
  "messageType": "perception",
  "messageId": "obs-42-avatar-1",
  "agentId": "avatar_1",
  "tick": 42,
  "scene": { "id": "workplace_1", "kind": "interior" },
  "self": {
    "position": { "x": 1.0, "y": 0.0, "z": 2.0 },
    "velocity": { "x": 0.0, "y": 0.0, "z": 0.0 }
  },
  "visibleEntities": [
    {
      "id": "desk_1",
      "kind": "object",
      "position": { "x": 2.0, "y": 0.0, "z": 2.0 },
      "affordances": ["use", "sit"],
      "occupied": false
    }
  ]
}
```

The engine owns visibility filtering and physical affordance facts. Semantic needs and coaching
history are not copied into this message as engine facts; Fusion already owns those values.

## 3. Semantic intent

Fusion responds with one action intent correlated to the agent and exact observed tick:

```json
{
  "protocolVersion": "nlt.agent-loop.v1",
  "messageType": "intent",
  "messageId": "intent-42-avatar-1",
  "agentId": "avatar_1",
  "observedTick": 42,
  "verb": "approach",
  "targetId": "desk_1"
}
```

Allowed verbs are `approach`, `look_at`, `use`, `sit`, `rest`, `communicate`, and `wait`.
`approach`, `look_at`, `use`, `sit`, and `communicate` require a `targetId`. The target must be
present in the corresponding observation. `rest` and `wait` may omit it. The JSON schema is
[`agent-loop-v1.schema.json`](agent-loop-v1.schema.json).

An intent contains no destination coordinate, speed, velocity, teleport, or object-state field.
The engine resolves a target to movement/pathing and validates the requested affordance at execution
time; a target's prior visibility does not guarantee that it is still available.

## 4. Correlation, rejection, and results

- `agentId` and `observedTick` bind an intent to the snapshot that informed it. Reject an intent
  for a different agent or an expired tick; do not apply it to a later world state.
- `messageId` is unique per message. The receiver should detect duplicate delivery before applying
  an intent twice.
- The engine reports accepted/rejected outcome with the intent/message id, current tick, and an
  explicit reason on rejection. The result envelope is:

  ```json
  {
    "protocolVersion": "nlt.agent-loop.v1",
    "messageType": "result",
    "messageId": "result-42-avatar-1",
    "intentMessageId": "intent-42-avatar-1",
    "agentId": "avatar_1",
    "tick": 42,
    "status": "rejected",
    "reason": "target is occupied"
  }
  ```

  `status` is `accepted` or `rejected`; `reason` is required for a rejection. Acceptance means the
  engine accepted the request for execution, not that the intended outcome has already happened.
- The next perception snapshot is the physical source of truth for whether movement or interaction
  actually occurred. Fusion must not infer physical success from issuing an intent.
- Validation and execution are separate: validate schema/correlation/target, then re-check current
  engine-side range, visibility, collision, and affordance state at execution.
- The ASFDK-C# governance check is separate from physical validation. A governance denial must
  prevent execution and be reported as a rejection; this contract does not define the internal
  ASFDK policy or adapter API.

## 5. Transport and observer

The DTOs and schema are transport-agnostic and do not require file polling, HTTP, WebSocket,
in-process calls, or a particular port. The current Godot integration uses asynchronous loopback
HTTP to Fusion's `/agent-loop/perception` endpoint; this is an implementation choice, not a
transport requirement imposed on other compliant peers.

`nlt.state-feed.v1` is not a substitute for this loop. Before production observer integration, its
physical fields must be populated from engine-owned state and Fusion fields from Fusion-owned state;
the projection must not turn either repository into authority for the other's data.
