# State Feed Contract — `nlt.state-feed.v1`

**Status:** draft · **Date:** 2026-10-02 · **Thread:** `MIGRATE-001`
**Direction:** Fusion (Python) → nlt-world-engine (Godot). Read-only to the renderer.
**Cadence:** ~1 Hz, matching the simulation tick. Godot interpolates between ticks.

> **Runtime boundary note (2026-10-07):** This v1 document remains the observer/fixture projection contract; it is not the AI control protocol. The current closed-loop boundary is specified in [`agent-loop-v1.md`](agent-loop-v1.md): the engine owns physical observations and execution, while Fusion owns semantic decisions. Do not use the Fusion serializer's placeholder physical fields as authoritative live-world state.

---

## 1. Why this exists

The world engine is a renderer, not a simulation (`docs/game-engine-vertical-slice.md`: *"the game renderer must not become the source of truth"*). Fusion's Python owns the world, the agents, the policies and the fusion gate. This contract is the **only** thing crossing that boundary.

It follows the vertical slice's own projection rule — `simulation state → renderer projection → observer UI` — so there is **one** state and **two** renderings of it, never two states:

| Projection | Shape | Consumer |
|---|---|---|
| **Scalar** | `levels[]`, `needs[]` as floats | PPO policy, numeric readouts |
| **Structured** | named states, tasks, signals, strategies, events | Observer panels, plain-language explanations |

The structured projection is what makes the metacognitive self-model possible: burnout triggers only when **all** needs are low, so recognising it requires reading the whole field, not one scalar.

---

## 2. Boundary rules

**Must not cross.** Fusion owns semantic reality; the world engine owns physical reality.

- `independenceScore` is **crossing** — Fusion derives it in `readiness_assessor.py` as `independence·0.7 + independent_ratio·0.3`, while UE derived it from needs decay × `ScenarioGrowthMultiplier`. Two incompatible derivations of one gated quantity. **The renderer must not compute it.** The value below is Fusion's, passed for display only.
- `BurnoutRisk` and `FusionReadiness` are likewise Fusion's. UE's `FNLTAgentState` carried all three — that was a boundary violation, now corrected.
- The renderer never writes to this feed. It requests state changes over a separate control surface.

---

## 3. Envelope

```jsonc
{
  "schemaVersion": "nlt.state-feed.v1",
  "tick": 1234,
  "simTimeIso": "2026-10-02T21:30:00Z",
  "scene": { "id": "workplace_1", "kind": "interior" },
  "agents":    [ /* §4 */ ],
  "pairs":     [ /* §5 */ ],
  "burnoutEpisodes":    [ /* §6 */ ],
  "selfRecognitions":   [ /* §7 */ ],
  "events":    [ /* §8 */ ]
}
```

`scene.kind` is `open_world` or `interior`. `scene.id` for `open_world` is always `open_world`; for `interior` it is one of `workplace_1`, `personal_1`, `social_1`, `academic_1`, matching the four interior scenes.

---

## 4. Agent

```jsonc
{
  "id": "avatar_01",
  "name": "Jamie",
  "role": "avatar",              // avatar | aide | advocate
  "scene": "open_world",
  "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
  "velocity": { "x": 0.0, "y": 0.0, "z": 0.0 },
  "appearance": { "body": "avatar_male_01", "walkPhase": 0.0 },

  // scalar projection — 0.0..1.0
  "levels": {
    "attentionEnergy": 0.62,
    "stressLevel":     0.31,
    "confidence":      0.58,
    "cognitiveLoad":   0.44,
    "independenceScore": 0.55,   // Fusion-owned; display only
    "supportNeedLevel":  0.40
  },

  // scalar projection — 1.0 = fully satisfied. Exactly four keys; see 4.3.
  "needs": { "quiet": 0.8, "rest": 0.5, "social": 0.6, "stimulation": 0.4 },

  // structured projection
  "state": "drifting",           // see §4.1
  "stateSince": 1180,            // tick at which `state` was entered
  "currentGoal": "Prepare for work meeting",
  "currentTask": "Find and review meeting notes",
  "struggleSignals": ["task_drift"],
  "learnedStrategies": ["body_doubling", "time_box_25"],

  "burnout": false,
  "supportIndex": 1              // index of this agent's current support interaction, or null
}
```

### 4.1 Named states

The vocabulary is **presentation**, not simulation. It exists so the observer reads a word rather than a number, and it must stay small enough to learn.

| State | Reading |
|---|---|
| `settled` | managing the task |
| `drifting` | disengaging; not progressing |
| `resisting` | aware of the task, not starting it |
| `hyperfocus` | sustained locked attention |
| `overwhelmed` | task demand exceeds capacity |
| `recovering` | working back from burnout or overwhelm |
| `coached` | receiving Aide support |

Colour must never be the only channel (`WorldView.ts` already used a colour-per-intent approach; that mapping needs a non-colour channel too).

### 4.3 Why four needs, and not five or seven

An earlier draft of this contract specified a `privacy` need. That was wrong, and the error is worth recording so it is not reintroduced.

UE declares **seven** values in `ENLTAgentNeed` (`NLTFusionCore.h:55-65`): Quiet, Rest, Social, Stimulation, Food, Movement, Privacy. But `FNLTScenarioNeedsFragment` (`NLTDemoScenarioFragments.h:15-29`) carries state for only **four** — Quiet, Rest, Social, Stimulation. Food, Movement and Privacy are enum-only: declared, never held.

`NLTSmartObjectWorldSubsystem` keeps match and score branches for `Privacy` (`:129-130`, `:152-153`) that **can never fire**, because an agent's need is never `Privacy`. Reading those branches and inferring a five-need model is the trap.

Two different things were being conflated:

| | Fields | Owner |
|---|---|---|
| **Agent needs** — what the agent is short of | quiet, rest, social, stimulation | Fusion, delivered in this feed |
| **Location affordance axes** — what a place offers | noiseLevel, socialDensity, privacy | **The renderer.** Godot owns the locations, so their axes are renderer-side and are *not* in this feed |

So `privacy` is a real location axis with no live agent need driving it. That is a genuine gap in UE's model, not a missing feed field, and it is not this contract's job to close. If Fusion's schema defines a privacy need, adding it here is a schema-version bump.

### 4.4 Walk animation

**`velocity` is required, not optional.** `appearance.walkPhase` may be supplied by Fusion; if omitted the renderer derives phase from its own integration of velocity. Speed below a threshold is idle — do not animate a standing agent.

---

## 5. Pair and fusion

A pure projection of Fusion's `FusionReadiness.to_dict()`. The renderer computes nothing here.

```jsonc
{
  "avatarId": "avatar_01",
  "aideId": "aide_01",
  "ready": false,
  "overallScore": 0.61,
  "blockingDimensions": ["BURNOUT_MANAGEMENT"],
  "dimensions": {
    "EXPERIENTIAL_DEPTH":       { "score": 0.72, "passes": true },
    "COACHING_EFFECTIVENESS":   { "score": 0.68, "passes": true },
    "INDEPENDENCE_LEVEL":       { "score": 0.64, "passes": true },
    "EMOTIONAL_RESILIENCE":     { "score": 0.59, "passes": false },
    "STRATEGY_INTERNALISATION": { "score": 0.55, "passes": false },
    "BURNOUT_MANAGEMENT":       { "score": 0.41, "passes": false }
  },
  "recommendations": ["Reduce burnout risk before fusion"]
}
```

> **Presenter obligation.** `BURNOUT_MANAGEMENT` carries a permanent penalty for every Aide crisis intervention and never decays, so a pair with a hard life is structurally disadvantaged. The Fusion Gate panel must explain a blocked pair as *"not ready yet"* and never as *failed* — the observer audience will recognise themselves in the struggling Avatar.

---

## 6. Burnout episodes

Burnout is a threshold predicate, not an accumulator: it holds when **all** needs are below their floor. This record exists because the fusion gate scores resilience *post hoc* from history, while a spectator needs the *current* picture and its trend.

`nlt.state-feed.v1` does not define numeric floors for the four needs. Until Fusion defines and
records the authoritative per-need floor transitions, producers must not derive episode history
from the aggregate burnout-risk score.

```jsonc
{
  "startTick": 1102,
  "severity": 0.35,              // 0..1, how far below the floor the lowest need reached
  "peakBelow": 0.34,
  "recoveredTick": 1187,
  "recoveryMode": "solo"         // solo | rrt
}
```

An open episode omits `recoveredTick` and `recoveryMode`. This is the Learning Timeline's primary data — fifty attempts are not comprehensible in real time.

---

## 7. Self-recognition

Metacognition is one of the 19 canonical executive-function tracks and **is not measured by the fusion gate**. Without this record the behaviour is trained but ungraded and unobservable.

```jsonc
{ "tick": 1098, "riskAtRecognition": 0.44, "actedOn": true, "ledTo": "prevented" }
```

`ledTo` is `prevented` | `delayed` | `ignored`. **`actedOn: false` is the failure signal** — it distinguishes self-awareness from self-report.

---

## 8. Events

Plain-language by requirement: the audience must understand the simulation without parsing a dashboard.

```jsonc
{
  "eventId": "b9a72e65-6c74-4b96-b7a1-c14ef4c0a11d",
  "occurredAt": "2026-10-02T21:29:03Z",
  "tick": 1183,
  "agentId": "avatar_01",
  "kind": "aide_intervention",
  "text": "Jamie noticed they were slipping and asked for help. The Aide suggested time-boxing to 25 minutes.",
  "strategy": "time_box_25",
  "helped": true
}
```

`eventId` and `occurredAt` are stable across feed snapshots when available; consumers should use
`eventId` to deduplicate and `occurredAt` for event chronology. `tick` remains the feed tick at
which the event is projected, not a substitute for the original event timestamp. Pending Aide
interventions must not be reported as helped or emitted as completed events until an outcome is
recorded.

`kind` values: `scene_enter`, `scene_exit`, `task_start`, `task_complete`, `task_failed`, `struggle_detected`, `aide_intervention`, `strategy_internalised`, `self_recognition`, `burnout_entered`, `burnout_recovered`, `fusion_ready`.

`text` is required. A feed that emits only `kind` has failed this contract.

---

## 9. Validation

- `nlt.state-feed.v1` is forward-compatible: unknown keys are **ignored**, while missing required keys **fail loudly** — a silently-defaulted `needs` map would make burnout undetectable.
- `needs` must carry the four keys `quiet`, `rest`, `social`, `stimulation`, each `0.0..1.0`. A **non-agent-need key raises a warning, not a failure** — Fusion may legitimately add needs later, but `privacy` is a location affordance axis rather than an agent need (§4.3), and silently accepting it is the exact mistake that draft made.
- `agents` may be empty only during a scene transition.

## 10. Open

- Transport is undecided. Options are a file polled each tick, a local socket, or HTTP. The schema is transport-agnostic by design.
- `nlt-adhd` may need a read-only projection of this feed for end users; defer until that need is concrete.
