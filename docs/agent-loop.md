# Physical-World Agent Loop

**Protocol:** [`nlt.agent-loop.v1`](contracts/agent-loop-v1.md)
**Status:** protocol, engine governance/intent ingress, async loopback HTTP, and an opt-in
single-avatar scene path are implemented. The local-GGUF end-to-end physical run still requires
runtime verification on the test workstation.

## Purpose

The agent loop connects Fusion's semantic cognition to the physical world without making either
repository authoritative for the other's responsibilities. An agent should be able to perceive
nearby people, objects, and places, choose a semantic action, and observe the physical result.

```text
Godot physical perception
        ↓
Fusion semantic decision
        ↓
ASFDK-C# governance gate (engine-side)
        ↓
Godot physical validation and execution
        ↓
Next physical perception
```

## Ownership

| Responsibility | Owner |
| --- | --- |
| Position, velocity, scene, visibility, affordances, occupancy, collision, and physical effects | `nlt-world-engine` |
| Avatar/Aide meaning, goals, needs, coaching, burnout/readiness, and semantic intent | `neurolift-ai-fusion` |
| Cross-cutting interaction governance | `asfdk-csharp`, invoked through an engine-side governance boundary |
| Intent validation, target and affordance checks, movement, and interaction consequences | `nlt-world-engine` |
| Observer presentation | Displays each owner's supplied data without deriving or overwriting the other's facts |

Fusion sends **intent**, not physical commands. It cannot set coordinates or velocity, teleport an
agent, or directly mutate an object's state. The world engine checks an intent against current world
conditions and owns every resulting physical effect.

## ASFDK governance boundary

The runtime uses **ASFDK-C#** as a cross-cutting governance check on the engine's
intent-ingress path: Fusion proposes an intent, the governance boundary evaluates the applicable
interaction policy, and only then does the engine perform its independent physical checks and
execute an allowed intent. ASFDK does not own world state or replace checks for visibility, range,
collision, affordances, or occupancy. This is an in-process engine component, not another network
hop or a Fusion authority.

`AsfdkGovernanceGate` adapts the available ASFDK APIs to `IGovernanceGate`: it sanitizes intent
text, denies Orange-or-higher RRT assessments with interventions, and carries Sleepwalker distress
as a governance note. Intent denials include an explanation. The current gate-unavailable policy is
fail-open with an explicit audit explanation; physical validation still applies. This policy should
be revisited before production use. The async check is performed outside Godot's physics/render
loop.

This governance stage is an implementation boundary, not a new `nlt.agent-loop.v1` wire message.
If it denies an intent, the engine does not apply physical effects and returns an explicit rejection.
The gate is wired into `IntentIngress`. It fails closed if evaluation throws; an explicit
`OpenGovernanceGate` remains available only for test harnesses or a separately approved
unavailable-gate policy.

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
- `AsfdkGovernanceGate` and `IntentIngress`: ASFDK review, contract validation, live target
  re-checks, and engine-owned locomotion dispatch.
- A transport-neutral Fusion validation seam around an injected semantic decision callback:
  `neurolift-ai-fusion/src/fusion/agent_loop.py`.
- Godot's asynchronous `FusionHttpLink` and `AgentLoopDriver`, targeting Fusion's
  `POST /agent-loop/perception` endpoint with a request timeout and one in-flight request per
  avatar.
- Focused Python and C# contract assertions for serialization, stale or hidden targets,
  unauthorized actions, results, and rejection reasons.
- Build and harness verification: `dotnet build world-engine-godot/world-engine-godot.csproj`
  succeeded; `dotnet run --project world-engine-godot/AgentHarness/AgentHarness.csproj` passed
  38/38. A cross-process HTTP smoke test returned a correlated intent and rejected malformed input
  with HTTP 422; the smoke test used Fusion's deterministic fallback, not the local GGUF.

Not implemented yet:

- The loop remains disabled by default. Enable it for a local run with
  `NLT_AGENT_LOOP_ENABLED=1`; this spawns only the dedicated `__local_avatar__`, creates a visible
  `agent_loop_test_target` five metres away, and routes only that avatar through `AgentLoopDriver`.
  Feed avatars remain observer-only for this test.
- Fusion's decision seam is not connected to `SessionOrchestrator`; the local agent-loop endpoint
  uses its own decision source configured through `FUSION_GGUF_MODEL`.
- A full in-scene run through governance, Jolt movement, and subsequent perception has not yet
  been verified after adding the opt-in scene composition. The HTTP smoke test is not that
  end-to-end test.
- The cross-process smoke test is not automated in CI, and production observer-field composition
  remains separate work.

## Local end-to-end test

Start Fusion from the Fusion repository in PowerShell:

```powershell
$env:FUSION_GGUF_MODEL = Join-Path $HOME 'Downloads\Qwen3-0.6B-Q8_0.gguf'
$env:FUSION_AGENT_LOOP_PORT = '8001'
$fusionVenv = '<path to your GGUF-enabled Python virtualenv>'
$fusionPython = Join-Path $fusionVenv 'Scripts\python.exe'
# If your GGUF environment does not already include the API dependencies:
& $fusionPython -m pip install 'fastapi>=0.115.0' 'uvicorn>=0.30.0'
& $fusionPython -m src.fusion.agent_loop_http
```

To use Fusion's deterministic control source instead, leave `FUSION_GGUF_MODEL` unset. Then start
Godot from another PowerShell window with the repository root as the current directory:

```powershell
$env:NLT_AGENT_LOOP_ENABLED = '1'
$env:NLT_AGENT_LOOP_ENDPOINT = 'http://127.0.0.1:8001/agent-loop/perception'
& $env:GDA_GODOT --path .\world-engine-godot
```

The Godot log should report the endpoint and visible test-target id. Fusion's deterministic
fallback approaches the test target; the GGUF may choose `approach` or `wait`. Godot logs whether
each intent was accepted or rejected. For an approach, verify the local avatar moves toward the
marker under Jolt and idles within its one-metre arrival radius. Stop with `Ctrl+C`; unset the
environment variables afterward to restore the default observer-only run. The test target and
single-avatar driver are created only when the opt-in flag is set.
