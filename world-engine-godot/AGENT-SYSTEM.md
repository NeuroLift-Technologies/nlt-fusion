# Agent System — Usage and Design

> **Scope:** `world-engine-godot/Agents/` — the action seam, the movement authority, and the two
> controllers behind it.
>
> **Status (2026-10-05):** compiles clean; self-test is 12/12. **Not yet wired into the running
> scene.** `Main.cs` still drives residents from the state feed, and no `AgentBrain` is instantiated
> anywhere. See [§8 Known gaps](#8-known-gaps) — read that before planning work on top of this.
>
> **Naming divergence from the plan:** `MIGRATION-PLAN.md` §2.6b/2.6c names these classes
> `DeterministicUtilityController` and `LlmCommandController`. The files on disk are
> `UtilityAgentController` and `LlmAgentController`. The seam and semantics match the plan; only the
> names drifted. Renaming is Joshua's call, not a drive-by.

---

## 1. What this is

Before this directory existed, every resident's position came out of a read-only `StateFeed`
document. A model could emit *"move north"* and there was **nothing to apply it to** — moving the
rendered node directly would have made the model look like it was playing.

These files close that loop. Position is owned by the engine, the model supplies only *intent*, and
the renderer draws the result.

```
   observation  ──▶  IAgentController  ──▶  AgentAction  ──▶  AgentBrain.Validate()
   (what it sees)     (the cognition)        (semantic)         (the seam check)
                                                                        │
                                                          accepted ────┴──── rejected ──▶ Idle
                                                                     │                        │
                                                                     ▼                        ▼
                                                      LocomotionController.Step()   OnActionRejected()
                                                      (the ONLY writer of position)
                                                                     │
                                                                     ▼
                                                        Resident / ResidentLayer  →  screen
```

---

## 2. The files

| File | Type | Responsibility |
|---|---|---|
| `AgentAction.cs` | value types | `AgentAction` (one decision), `AgentObservation` (what a model may see), `AgentInteraction` enum |
| `LocomotionController.cs` | `sealed class` + `interface` | `IAgentController` — **the seam** — and `LocomotionController`, the movement authority |
| `AgentBrain.cs` | `Node3D` | Owns one agent: runs the tick, polls the controller, validates, steps locomotion |
| `DecisionParser.cs` | `static` | Free-form model text → validated `AgentAction`; holds the GBNF `ActionGrammar` |
| `UtilityAgentController.cs` | `sealed class` | Deterministic, model-free control condition |
| `LlmAgentController.cs` | `sealed class` | Out-of-band local-GGUF controller via NobodyWho |
| `ActionAssertions.cs` | `static` | 12 behavioural checks — no engine base class, drivable from any harness |
| `ActionSelfTest.cs` | `SceneTree` | Thin Godot entry point that calls `ActionAssertions.RunAll()` |

> `IAgentController` lives in `LocomotionController.cs` rather than its own file. The plan calls for
> `Agents/IAgentController.cs` (§2.6a); the type is what matters, the filename does not.

---

## 3. How they fit together

**`IAgentController` is the seam.** It is the single substitution point for cognition, and it is
deliberately tiny:

```csharp
void Attach(string agentId);
AgentAction Act(AgentObservation observation);
void OnActionRejected(in AgentObservation observation, in AgentAction action, string reason);
```

Two implementations ship: `UtilityAgentController` (deterministic) and `LlmAgentController`
(local GGUF). A future `RLPolicyController` drops in behind the same three methods — which is the
whole point of the seam existing.

### The per-tick sequence (`AgentBrain._PhysicsProcess`)

1. `_tick++`.
2. Rebuild the observation from **`_locomotion.Position`**, not the last rendered frame. This is what
   makes the loop closed: the agent decides from where it *is*, not where it was drawn.
3. If `DecisionInterval` has elapsed, call `_controller.Act(...)`. Local inference is far slower than
   a tick, so the last good decision is held and re-applied between decisions (motor-latency
   technique — decision at N applied over N..N+k).
4. `Validate(proposed)`. Accepted -> use it. Rejected -> `AgentAction.Idle`, and the reason goes to
   both `OnActionRejected` and the `Rejected` event so it is *reported, not silently dropped*.
5. `_locomotion.Step(action, dt)` — **every tick**, including the ones between decisions.
6. Raise `Acted`.

`AgentBrain` also exposes `Acted` and `Rejected` events for the HUD and the observer, and
`Locomotion` as read-only access to the authoritative state. Nothing else writes position.

### The division of labour

| Concern | Owner |
|---|---|
| *What* to do (heading, effort, interaction) | `IAgentController` |
| *How fast / how smoothly* to do it | `LocomotionController` |
| Whether the decision is well-formed | `AgentBrain.Validate` |
| Whether it is *meaningful* | `LocomotionController` limits (applied regardless) |
| What is drawn | `Resident` / `ResidentLayer` |

---

## 4. The two invariants

**1 — Semantic-only actions.** The model emits a *heading*, never a position, velocity or teleport.
Carried verbatim from `WorldEngine/Source/WorldEngine/Public/Agents/AvatarAIController.h:40-45`:

> *"The model issues high-level semantic commands. Physical locomotion still runs through the
> controller, which remains the movement authority — no raw velocity writes from the model."*

UE enforced this by keeping the movement component authoritative under the AIController. The same
structure is kept here. A model that hallucinates a position has nowhere to put it.

**2 — Locomotion realism lives in `LocomotionController` and nowhere else.** Acceleration and
deceleration caps, turn-rate limits, friction, inertia. A model can ask to go north; it cannot ask to
be 40 m away next tick.

Measured, from the self-test: one tick of *maximum* intent moves **0.0017 m**. Sustained intent
converges to exactly `MaxSpeed` (1.400 m/s) and never exceeds it, even at `effort = 5.0`.

---

## 5. Usage

### 5.1 Build (verified)

```powershell
cd C:\Users\joshd\nlt-repos\nlt-world-engine\world-engine-godot
dotnet build world-engine-godot.csproj
```

Expected: `Build succeeded. 0 Error(s)` with 2 pre-existing `CS8601` warnings in `WorldView.cs`.
Those are unrelated to this directory — do not attribute them to a change here.

### 5.2 Run the self-test (verified)

Two entry points, same 12 assertions.

**Inside Godot** (needs a Godot 4.7.2 .NET build on `PATH`):

```powershell
godot --headless --path . --script res://Agents/ActionSelfTest.cs
```

Exits `0` when all pass, `1` otherwise.

**Out of engine** — the assertions are a plain static class precisely so they *can* run without
launching Godot. The project at **`AgentHarness/`** references the built assembly and drives
`ActionAssertions.RunAll()` from a plain console `Main` (see below).

```powershell
cd C:\Users\joshd\nlt-repos\nlt-world-engine\world-engine-godot
dotnet build world-engine-godot.csproj                 # produces the referenced DLLs
dotnet run --project AgentHarness/AgentHarness.csproj  # exits 0 = 12/12, 1 = failures
```

`AgentHarness/Program.cs` is four lines — call `ActionAssertions.RunAll()`, print `RESULT`, return
`0`/`1` — so it is CI-shaped: any job that can `dotnet build` the Godot project can run the
assertions without a Godot binary on `PATH`.

How the two projects coexist in one folder:

- `world-engine-godot.csproj` carries `<Compile Remove="AgentHarness/**/*.cs" />`, so the harness
  sources (including their `Main`) are **never** compiled into the Godot assembly.
- `AgentHarness.csproj` sets `EnableDefaultCompileItems=false` and includes only `Program.cs`, so
  it never sweeps the engine's sources either.
- The two DLL references use paths relative to `AgentHarness/` and point at
  `.godot/mono/temp/bin/Debug/` — **gitignored**, so a clean clone must build
  `world-engine-godot.csproj` once before `AgentHarness` can resolve them. That ordering is the
  only setup step.

> **`dotnet build` with no arguments fails (MSB1011)** — the folder holds several `.csproj`/`.sln`
> files (including the stray `NLT World Engine (Godot).csproj`/`.sln`). Always name the project:
> `dotnet build world-engine-godot.csproj` or `dotnet run --project AgentHarness/AgentHarness.csproj`.

### 5.3 Wire an agent up

```csharp
var brain = new AgentBrain { Name = "avatar_0", DecisionInterval = 0.5f };
AddChild(brain);                                   // _Ready() creates the LocomotionController

brain.Attach(new UtilityAgentController(WorldConstants.Seed, "avatar_0"));

// Needs + scene are the owner's job. Call this whenever the surrounding state changes,
// otherwise the controller decides from a frozen first frame.
brain.Observe(Vector3.Zero,
              new[] { 0.2f, 0.2f, 0.9f, 0.3f },   // quiet, rest, social, stimulation
              "open_world");

brain.Locomotion.Teleport(spawnPoint);             // scene load — bypasses the accel ramp
```

Ordering rules that matter:

- `Attach` **after** `AddChild` — `_Ready()` is what constructs the locomotion and `Attach`
  dereferences it.
- `Observe` needs all four needs in `FeedVocabulary.Needs` order:
  **`quiet, rest, social, stimulation`** (`Feed/FeedVocabulary.cs:24`). Fewer than four and both
  controllers degrade to `Wander` / `"needs unknown"`.
- `Teleport` is for scene load and replay seek only. Using it to make an agent "move" would defeat
  the entire point of the movement authority.

### 5.4 Render a brain-driven agent

`AgentBrain` does not draw anything. `Resident.Sync` is the render call:

```csharp
resident.Sync(
    world:         brain.Locomotion.Position,
    velocity:      brain.Locomotion.Velocity,
    name:          "avatar_0",
    stateWord:     "settling",                     // PlainLanguage.StateWord(...) if from a feed
    reducedMotion: ReducedMotion);
```

This is the join point between the two systems, and it is **not wired yet** — see §8.

---

## 6. Using the LLM controller

`LlmAgentController` is out-of-band by construction, and that is the whole design. Local inference on
a 0.6B model takes seconds; the sim ticks at 60 Hz. So it never blocks the tick — it *kicks* a
request, and `Act` returns whatever the last completed decision was.

```csharp
var llm = new LlmAgentController();                // res://ml-MODELS/Qwen3-0.6B-Q8_0.gguf
brain.Attach(llm);

// On a timer, NOT per tick:
llm.BeginRequest();
chat.SendAsync(llm.BuildPrompt()).ContinueWith(t => llm.ApplyResponse(t.Result));
```

| Member | Called by | Purpose |
|---|---|---|
| `BuildPrompt()` | owner | Renders the observation in the grammar's vocabulary |
| `BeginRequest()` | owner | Marks work outstanding; `InFlight` reports it |
| `ApplyResponse(raw)` | owner, on completion | Parses, validates, folds into the held decision |
| `OnActionRejected` | `AgentBrain` | Feeds the reason back into the next prompt |
| `LastRawResponse`, `Rejections`, `HasDecision` | HUD | Diagnostics. `Rejections > 0` means the grammar is being bypassed |

Two defences stack against malformed output:

1. **Grammar at the source.** NobodyWho exposes GBNF; `DecisionParser.ActionGrammar` constrains the
   vocabulary so the only reachable outputs are well-formed. Primary defence.
2. **Tolerant parse at the seam.** Whatever still arrives is read leniently, then validated like
   every other decision. Forgiving about *form*, strict about *meaning*: it finds the numbers in
   noisy text but never invents a heading the model did not state. A malformed response becomes
   `Idle` — never a crash into the game loop, and never a snap-to-halt on one bad token.

Grammar and parser are held together deliberately so they cannot drift: whatever `ActionGrammar`
permits, `TryParse` must accept. The parser is intentionally the more permissive of the two.

### No provider lock-in

`LlmAgentController` names no vendor. It is a GGUF file path plus `ApplyResponse(string)`, so the
same controller is driven by NobodyWho, by an OpenAI-compatible endpoint, or by a replayed fixture
with no change here. **Per the AGENTS.md guardrail, do not hardcode or commit to a specific LLM
provider.**

---

## 7. Tuning reference

| Knob | Default | Where | Effect |
|---|---|---|---|
| `DecisionInterval` | `0.5f` | `AgentBrain` `[Export]` | Seconds between decisions. Lower = more reactive, more inference load |
| `MaxSpeed` | `1.4f` | `AgentBrain` / `LocomotionController` | Straight-line top speed, m/s. Matches the walk clip's nominal pace |
| `Acceleration` | `6f` | `LocomotionController` | Makes a direction change ramp instead of snap |
| `Deceleration` | `8f` | `LocomotionController` | Separate from acceleration so stopping settles cleanly |
| `TurnRate` | `6f` | `LocomotionController` | Facing eases toward heading; standing agents hold their heading |
| `StopSpeed` | `0.05f` | `LocomotionController` | Below this the agent counts as still (drives the idle animation) |
| `Thresholds` | `{0.3, 0.3, 0.6, 0.5}` | `UtilityAgentController` | Per-need "is this pressing" bar. Mirrors `TaskAnchor.cs` / RENDERER-PLAN C.3 |

`DecisionInterval` and `MaxSpeed` are `[Export]`, so they are editable in the Godot inspector on any
`AgentBrain` node placed in a scene.

### Validation rules at the seam

`AgentBrain.Validate` is deliberately shallow. Its job is to catch a malformed or out-of-range
decision at the boundary, not to re-litigate the controller's limits — those live in
`LocomotionController` and are applied regardless.

| Check | Rejection reason |
|---|---|
| Direction components finite | `non-finite direction` |
| `\|direction\| <= 1.001` | `direction magnitude N exceeds 1 (effort is 0..1, not a speed)` |
| `\|direction.Y\| <= 0.001` | `direction has a Y component (locomotion is XZ-only)` |

---

## 8. Known gaps

Reported rather than absorbed, per the house convention.

1. **Not wired into the running scene.** No `AgentBrain` is instantiated anywhere. `Main.cs` builds
   `Residents.Sync(doc, ReducedMotion)` from the state feed, and `ResidentLayer` creates one
   `Resident` per agent *in the document*. An `AgentBrain`-driven agent has no path to the screen
   until §5.4 is wired. **This is the single biggest thing to know about this directory.**
2. **No episode reset.** `IAgentController` has no reset hook and `UtilityAgentController` holds its
   decision across re-decide boundaries, so controller state carries between scenarios. This is not
   a bug at this layer, but it blocks deterministic episodes — see `MIGRATION-PLAN.md` §2.6d/2.6e
   (`ResetAgentEpisode`). *Found by this session's own self-test: an assertion that reused one
   controller across two scenarios measured 1.34 m of leftover motion and failed. Fixed in the
   assertion by using a fresh controller; the underlying gap is still open.*
3. **Naming divergence** from `MIGRATION-PLAN.md` §2.6b/2.6c — see the banner at the top.
4. **Plan items unmet.** §2.6 (the 6 UE agent fragments + behaviour state machine), §2.6d
   (`ITrainingEnvironment`), and `RLPolicyController` are not here. Only the seam (2.6a), the
   deterministic controller (2.6b), and an out-of-band LLM controller are.
5. **No world-bounds clamping.** `LocomotionController` will happily walk an agent off the edge of
   the 460 m world. Nothing in this layer knows the world exists.
6. **`AgentBrain` has no collision.** It is a bare `Node3D` with no physics body, so agents pass
   through each other and through geometry. `TerrainBuilderPhysics.cs` is a known empty placeholder.
7. **`AgentAction.TargetId` is always null** from the parser — the grammar emits no such field. It is
   advisory, for labelling only.

---

## 9. Verification

Full `ActionAssertions.RunAll()` output, 2026-10-05:

```
=== NLT action-interface self-test ===

[parse -> authoritative position]
  info  travelled 2.65 m, speed 1.40 m/s
  PASS  a north-facing decision moves the agent north (z decreased)
  PASS  and does not drift sideways

[no teleport from the model]
  info  max-intent single tick moved 0.0017 m
  PASS  one tick of full intent moves < 5 cm (cannot teleport)

[speed cap enforced by the controller]
  info  peak speed 1.400 m/s (cap 1.400)
  PASS  peak speed never exceeds MaxSpeed despite effort=5.0
  PASS  and it does actually reach walking pace

[malformed model output degrades]
  PASS  no input throws out of the parser
  PASS  a fenced JSON block still parses
  PASS  and its action survives

[semantic-only: magnitude clamped, not honoured]
  info  requested 400.0, clamped to 1.000
  PASS  an absurd magnitude is clamped to unit, not honoured
  PASS  60 ticks of it still cannot leave the neighbourhood

[deterministic control condition]
  info  control condition travelled 13.85 m
  PASS  the deterministic controller also produces real movement
  info  pressing 'rest' travelled 0.000 m
  PASS  a pressing 'rest' need holds the agent still

=== 12 passed, 0 failed ===
RESULT: all assertions passed
```

What the control condition is for: without it there is no way to tell *"the LLM is playing"* from
*"the character is drifting on its own"*, because a wander loop looks identical on screen. It is the
same seam, the same locomotion and the same needs, with only the cognition swapped out.

---

## 10. See also

- `MIGRATION-PLAN.md` §2.6a–2.6e — the plan items this implements
- `RENDERER-PLAN.md` B.2 — the articulated-body / walk-cycle requirement these agents feed
- `WorldEngine/Source/WorldEngine/Public/Agents/AvatarAIController.h:40-45` — the UE invariant
- `Feed/FeedVocabulary.cs` — the need and state vocabulary shared with the feed
