# World Engine — Design & Implementation Brief

**Status:** Approved direction (Joshua W. Dorsey, Sr.) — 2026-06-22
**For:** Cursor (implementer). Architect/handoff: Claude Code.
**Governed by:** ORG-DEV-OTOI-1.0.3 (the canonical org contract). This PR also syncs this repo's `NLT-DEV-OTOI.md` up to 1.0.2; the rest of nlt-fusion's governance bundle (manifest, validator, SOPs/templates) is still mid-migration from 1.0.0 — see the PR thread. This is a design brief, not a license to skip governance — see §8.

---

## 1. The decision (and why)

> **⚠️ SUPERSEDED — 2026-10-02. Engine decision reversed. Read this before acting on §1.**
>
> The reasoning below was **correct when written** and is no longer the basis for the engine choice. It has been superseded twice: first by **UE 5.8**, and now by **Godot 4.7.2 (C#)** under thread `MIGRATE-001`.
>
> - **What still holds.** The defining constraint is unchanged and remains binding: no human *plays* this world. Humans only *watch*. That constraint applies just as strictly to Godot — see below.
> - **What changed.** The conclusion drawn from it — that a render-and-input game engine is therefore ruled out — no longer follows. The correct statement is narrower: **a game engine may host the physical layer provided the human is a spectator rather than a player.** Agents are the inhabitants and the actors; the engine's player-input affordances simply go unused.
> - **How that is enforced in the Godot port:** the deterministic simulation core is a plain .NET library with **no Godot reference**, so the authoritative tick cannot depend on the renderer. Models drive characters through a semantic-action interface (`IAgentController`), never by writing positions or velocities — the locomotion authority stays in the simulation. The native desktop app is the spectator view. Godot 4 cannot export C# to web, so no browser client is implied.
> - **Also outdated below:** `world-engine/src/` is the Python kernel and now lives under `_archive/`. The `AgentController` and `AgentInterface.perceive() → PerceptionMap` seams cited as reasons to prefer it **did survive into the current design** and are the direct ancestors of `IAgentController` — that reasoning was sound.
>
> Current plan: `world-engine-godot/MIGRATION-PLAN.md`. Approval: `docs/escalations/2026-10-02-godot-migration.md`.

We are building the **actual world simulation engine**, not the tick loop. The defining constraint:

> **No human plays this world. AI agents _live_ in it as the people; humans only _watch_.**

That ruled out a render-and-input game engine (Unity/Godot/Unreal) **at the time**, because those serve a human player we don't have. It calls for a **headless, deterministic, agent-inhabited simulation**. We already had one — the Python ECS kernel at `world-engine/src/`, since archived under `_archive/`.

**Authoritative engine was therefore the Python ECS kernel.** *(Superseded: now UE 5.8 as a frozen oracle, targeting Godot 4.7.2.)* The browser `sim.jsx` `setInterval` loop (the "ticks") was retired _as a simulation_; the studio became a **read-only live viewer** that humans watch.

### Why the Python kernel is the right base (already built, tests pass)
- **Headless + deterministic** — `WorldEngine.run_simulation_step()` runs a fixed `dt` step over insertion-ordered systems; seeded RNG; ~20 unit tests incl. a determinism test. Enables reproducible training + faster-than-real-time runs.
- **Built for AI inhabitants** — the two seams an AI "person" needs already exist: **`AgentController`** (intent/action) and **`AgentInterface.perceive() → PerceptionMap.describe_surroundings()`**, which emits an **LLM-readable** sense feed (name/kind/room/affordances/needs).
- **A real world** — `GridManager` (2D grid, bounds, walkability), **real A\* pathfinding** (`world_map.find_path`) wired into `MovementSystem` with re-path-on-blocked, `NeedsSystem`, `InteractionSystem` (use-intents with occupancy locks + need effects), and an event bus. Default systems register out of the box (`register_default_systems`, default on).

The hard parts exist. This is **promote + wire + stream**, not greenfield.

---

## 2. Settled implementation decisions (historical)

> **Historical Python-kernel guidance:** the decisions and implementation steps in
> §§2–7 describe the archived `_archive/world-engine/` prototype. They are not
> current implementation requirements. Follow the
> [Godot migration plan](../../world-engine-godot/MIGRATION-PLAN.md) referenced by
> the §1 notice. Only the Python sidecar integration requirements in §6 below
> remain current.

| # | Decision | Choice |
|---|---|---|
| 1 | Authoritative runtime | **Python kernel** (`world-engine/src/`, since archived). *SUPERSEDED 2026-10-02 — see §1. Now: Godot 4.7.2 (C#), with the deterministic core as an engine-independent .NET library.* |
| 2 | Transport (kernel → humans) | **SSE** live stream of snapshots+events for watching, **+ a small REST control endpoint** (pause/resume/step/assign-scenario/reset). WebSocket-ready later for networked controllers. |
| 3 | Determinism | **Deterministic kernel + recorded controller decisions.** No unseeded `random` on any Python kernel path — use the seeded rng. Controller (incl. future LLM) actions are logged into the replay stream, not re-derived. |
| 4 | Source of truth | **Python scene JSON is canonical.** `data.js` is demoted to seed/design data; the studio renders from the contract, not its own world. |
| 5 | v1 scope | **Core Loop slice** (see §5). Defer the Fusion Readiness gate and full observer/playback modes to v2. |

---

## 3. Target architecture (historical Python kernel)

Each component **builds on existing code** — file references are the starting point, not a rewrite.

- **World / scene model** — keep `GridManager` (`world_map.py`) + `world_builder.DEFAULT_HOME_SPEC`, but **lift the home spec into a versioned scene JSON** (rooms `origin/size`, props with `affordances`/`use_duration_s`/`need_effects`/`Collider`). Both kernel and studio read the same scene.
- **ECS** — adopt the existing `ecs.py` (`Registry` + `Entity` + `Position/Descriptor/Collider/Interactable/Needs/AgentController`) as canonical. Add a small **`AgentState`** component for renderable affect (focus/stress/cogLoad) so the studio shows inner state.
- **Simulation scheduler (beyond a fixed tick)** — wrap `run_simulation_step()` in a **headless runner** with a fixed-timestep accumulator + a **pace multiplier** (`simulation.pace` already in the snapshot schema) and a **scheduled-event/timer queue** (for scenario stressors firing at sim-times).
- **Navigation** — reuse the existing **A\*** + `MovementSystem` + `AgentInterface.move_adjacent_to`. No new pathfinder.
- **Perception** — reuse `AgentInterface.perceive()/describe_surroundings()` verbatim. This is where AI controllers read the world.
- **Scenario / event system** — **new `ScenarioSystem`** (registered like the other systems) that loads a scenario from the currently-**orphaned `scenarios.py`** (13 ADHD training scenarios) into the world: attach objectives/tasks to entities, route the Avatar, schedule ≥1 stressor, and surface struggle signals as events.
- **State + persistence** — make `get_snapshot()` emit the real **`contracts/v1` `snapshot.schema.json`** shape (`contract_version/snapshot_id/simulation{state,tick,sim_time,seed,pace}/avatars/entities/extensions`) and add a matching **`load_snapshot()`**. Validate against the schema in tests.
- **State contract → studio** — adopt **`contracts/v1`** as the wire format. Refactor `window.useWorldEngine` (`sim.jsx`) so its shape (`avatars/events/interventions/tickCount/simTime/running` + `toggleRun/reset/stepOnce/assignScenario`) is **fed by snapshots+events from the kernel over SSE**, with controls hitting the REST endpoint. The studio becomes a pure projection — no local sim, no `Math.random`.

---

## 4. The "AI lives in it, humans watch it" contract

- **AI inhabitants** act through `AgentController` (submit intent) and sense through `AgentInterface.perceive()`. v1 controllers run **in-process in Python** (a deterministic utility agent is fine; LLM controllers are a later drop-in at the same seam — provider-agnostic per OTOI §4.4).
- **Humans observe** through the studio: the isometric renderer (`world-view.jsx`) + HUD panels (`hud.jsx`) render live from the SSE snapshot/event stream. Human inputs are limited to **observer controls** (pause/step/pace/assign-scenario) — never moving an avatar.

---

## 5. v1 scope — the Core Loop slice (historical acceptance criteria)

Smallest thing that is demonstrably a world, not ticks:

1. **Scene from JSON** — `DEFAULT_HOME_SPEC` lifted to a scene file; solid props carry `Collider` so `is_walkable` blocks them; kernel + studio both load it.
2. **Real navigation in the studio** — the Avatar visibly walks **around walls** and **up to objects** (A* + `move_adjacent_to`), driven by kernel output, not the browser's `Math.sign` stepper.
3. **ECS world rendered from truth** — studio avatars/entities are projections of ECS entities delivered via a `contracts/v1` snapshot (positions, needs, `AgentState`).
4. **One scenario drives behavior** — `ScenarioSystem` loads the **"Morning Routine"** scenario (`scenario_id="pers_4"` in `scenarios.py`) for the StayAlert Avatar: Avatar gets objectives, navigates, needs decay, **≥1 stressor fires on schedule**, struggle signals emit as events, and **one Aide intervention** is logged in the studio's AideLog.
5. **Real snapshot + transport** — `get_snapshot()` emits the `contracts/v1` shape (+ `load_snapshot()`), schema-validated in tests; the headless kernel **streams it over SSE** and accepts observer controls over REST; the studio watches live.

**Out of scope for v1 (→ v2):** Fusion Readiness gate / Advocate fusion (lives in `neurolift-ai-fusion`), full observer playback/scrubbing, networked/remote controllers (WebSocket), the 19-avatar fleet at scale, LLM controllers.

---

## 6. Suggested file layout (historical nlt-fusion/world-engine/)

> The Python kernel, `runner.py`, SSE/REST service, and studio layout below are
> historical. Use the [migration plan](../../world-engine-godot/MIGRATION-PLAN.md)
> for the current .NET core, Godot host, and Python sidecar layout.

- `src/` — the kernel (existing). New: `scene/` (scene JSON + loader), `systems/scenario_system.py`, `runner.py` (headless scheduler), snapshot emit/load on the engine.
- `contracts/v1/` — the snapshot + event schemas (exist as draft; make them the live wire format).
- `service/` (new) — thin SSE+REST host wrapping the runner (stdlib `http.server` is acceptable for v1; no new heavy deps without escalation).
- studio (`sim.jsx`, `world-view.jsx`, `hud.jsx`, `studio/`) — refactor to consume the contract; keep the renderer.
- `data.js` — demoted to seed/design data only.

### Current Python sidecar integration requirements

- The Python sidecar owns HTTP port **8765** and WebSocket port **8766**, proxying
  to the Godot simulation over internal IPC; it does not run the simulation kernel.
- Preserve the existing Fusion route table, protocol envelope, field names, and
  loopback-only enforcement on mutating routes. Follow Phase 3 of the
  [migration plan](../../world-engine-godot/MIGRATION-PLAN.md) for parity requirements
  and explicitly documented divergences.

**Sub-agent fleet (imported in PR #12, `.claude/agents/`):** a broad game-studio agent set is now available. The **generic** roles are usable here — e.g. `systems-designer`, `world-builder`, `ai-programmer`, `tools-programmer`, `ui-programmer`, `ux-designer`, `writer`. *(Superseded 2026-10-02: engine-specific specialists now **do** apply — the physical layer is Godot 4.7.2. The five `godot-*.md` specialists perform a mandatory version check against `docs/engine-reference/godot/VERSION.md`, which was missing until Phase 0 of `MIGRATE-001` and caused all five to fail. Verify that file exists and matches the pinned version before routing engine work to them.)*

---

## 7. Known traps (from the survey — don't trip these)

- `src/core/` is currently **unimportable** (`State` referenced but undefined in `state_machine.py`) and the unused `core/events.py` EventBus — don't wire kernel logic through `src/core`; use the engine's own event bus.
- `scenarios.py` is **orphaned** (zero importers) — wiring it in is the point of `ScenarioSystem`, but verify its dataclass shapes against the ECS as you go.
- `get_snapshot()` keys (`tick/simulation_time/entities`) **structurally differ** from the contract schema — this is real mapping work, not a rename.
- README was **rescoped to environment-only in PR #13 (2026-06-22)** and now correctly states the training-side code (`src/avatars|aides|advocates|fusion`) lives in `neurolift-ai-fusion`; trust it for scope, but still verify module details against the code.
- NPCs are stationary/abstract (`BaseNPC` has no concrete subclass) — if a stressor needs an active NPC, that's net-new.

---

## 8. Governance guardrails (Cursor must follow)

- **PR-only.** Branch off `main`, deliver via PR. Never push to `main`.
- **Commit format:** `[CURSOR] type(scope): description` (types: feat/fix/docs/refactor/chore/test/ci).
- **Session records:** register in `docs/agent-log/registrations/`, write a handoff in `docs/agent-log/handoffs/`, and **add/maintain a `docs/active-threads.md` entry** for this work (don't skip the active-threads update).
- **Escalate to Joshua** for any architecture change beyond this brief, new external integrations/dependencies, persistence/DB choices, or anything touching safety/affect modeling. This is neurodivergent-support modeling: **behavior must never be presented as clinical ground truth.**
- **Determinism:** no unseeded `random` on any Python kernel path — use the seeded rng (it breaks replay otherwise). (The JS studio must also stay a pure projection — no local `Math.random` sim.)
- **Do not edit `.github/workflows/*`** in this environment (the CLI token lacks `workflow` scope; pushes touching CI are rejected). Surface CI needs to Joshua.
- Keep the build **dependency-light** (kernel is stdlib-only today; new runtime deps need approval).

---

## 9. Reference specs (authoritative design)

- `neurolift-ai-fusion/docs/game-engine-vertical-slice.md` — canonical Avatar→Aide→Advocate model + 10-step Core Loop.
- `neurolift-ai-fusion/docs/specs/world-engine-prototype-schema.md` — world/snapshot schema lineage.
- `world-engine/contracts/v1/*.schema.json` — the wire contract to make real.
- This repo's `README.md`, `CLAUDE.md`, `NLT-DEV-OTOI.md`, `AGENTS.md` — governance + vision.

---

*Direction approved by Joshua W. Dorsey, Sr. Architecture by Claude Code (deep-exploration/design/governance role per `senior-dev-hub`). Implementation by Cursor.*
