# World Engine

The Sims-like environment AI agents live in. This repo owns the **environment
only** — world state, space, time, objects, needs, NPCs. Avatar/Aide
intelligence, ADHD trait modeling, and fusion mechanics live in
`neurolift-ai-fusion` and connect through the agent interface.

## Python environment engine (`src/`)

A deterministic ECS simulation: tick loop, seeded RNG, spatial grid with A*
pathfinding, sims-style needs, and movement/interaction systems. AI agents
plug in through `src/simulation/environment/agent_interface.py` — perceive,
submit intents, poll results. Decision logic (rule-based or LLM) stays
outside the tick.

See it run — an agent autonomously living a full day (eat, chat, sleep,
shower, watch TV):

```bash
cd world-engine
python3 demo.py          # a day in the life
python3 -m unittest discover tests   # 24 tests

# Live studio viewer (kernel authoritative — humans watch only):
python3 service/server.py              # SSE + REST on :8765
# then open index.html?live=1 in a static file server
```

`demo.py`'s `UtilityAgent.decide()` is the seam where an LLM controller
replaces the rule-based one without touching the engine.

---

# Frontend Prototype

A standalone React prototype that visualises the Avatar/Aide/Scenario world.
With `?live=1` and the Python service running, the studio is a **read-only
live viewer** fed by `contracts/v1` snapshots over SSE — no local sim tick.
Without the service (`?live=0`), the legacy browser tick loop remains for
offline demos.

The product-facing Claude Design shell lives in [`../studio/`](../studio/) and reuses this prototype's canonical data, simulation hook, and tweaks panel.

The provider-neutral transport and deterministic replay draft lives in [`contracts/v1/`](contracts/v1/).

## Run it

No build step. Any static file server works:

```bash
cd prototypes/world-engine
python3 -m http.server 8765
# then open http://127.0.0.1:8765/
```

The page boots React 18 + Babel from a CDN and loads the `.jsx` files in-browser via `<script type="text/babel">`.

## What's here

| File | Role |
|---|---|
| `index.html` | Entry point, CDN loaders, script order |
| `data.js` | Static data — 19 avatars, paired aides, 11 scenarios, 5 rooms, NPCs, strategies, event vocabulary |
| `app.jsx` | Top-level composition, layout, theme/zoom/pan, tweaks panel mount |
| `sim.jsx` | Life-sim tick loop: objects, walking, interactions, motives, events |
| `data.js` | `OBJECTS` catalog, scenarios linked to `objectId`, single-pair roster mode |
| `world-view.jsx` | Isometric CSS/SVG renderer (32×16 tile diamond, rooms, props, avatars, NPCs) |
| `hud.jsx` | HUD panels — `TopBar`, `AvatarStateCard`, `EventStream`, `AideLog`, `FleetRoster`, `ScenarioControls`, `ProgressPanel` |
| `tweaks-panel.jsx` | Live-tuning shell with the `__activate_edit_mode` host protocol |
| `world.css` | Full styling |
| `_drafts/` | Earlier single-file drafts preserved verbatim: `world-engine.jsx` (full sim+UI in one file), `tweaks-panel.jsx` (top-level dup), `design-canvas.jsx` (Figma-style artboard shell), and the original `scraps/` |

## Roster

19 ADHD-trait avatars. IDs use snake_case matching the Python repo convention (`src/avatars/adhd_traits/`). The first two map directly to existing Python implementations (`stay_alert`, `task_kickstart`); the remaining 17 are design proposals.

Full table in `docs/specs/world-engine-prototype-schema.md#canonical-roster`.

### Roster corrections applied to source

The two zip drafts shipped conflicting rosters. This directory uses the cleaner-named roster with three fixes:

- `transition` → `transition_ease` (consistency with other ids)
- `follow_thru` → `follow_through` (full word)
- `Physical Restless.` → `Physical Restlessness` (no truncation)

The richer schema (blurb, flavor, tag) came from `engine/data.js`. The `_drafts/world-engine.jsx` original is preserved unchanged for reference.

## What's deliberately NOT here

- **No build pipeline.** No package.json, no Vite/Next/Webpack. Adding one is out of scope until the prototype is promoted into `apps/`.
- **No API wiring.** No fetch calls; all state is in-browser. The `mkEvent` payloads and the `AvatarRuntime` shape (in `sim.jsx`) are the eventual API contract — see the open questions in the schema doc.
- **No tests.** This is a design prototype, not production code.
- **No changes to `src/`.** The Python simulation engine is untouched. The two are reconciled later through an explicit transport decision.
