# ADR-001-threejs-http

**Status:** Accepted

## Context

We need a 3D open-world renderer that is lifelike, procedural, and easy to run
and iterate on in a one-person studio. The target is a browser-based experience
served over HTTP, with no install friction and no build step, so the human can
open the world and play it immediately after a `python -m http.server`.

The question: what rendering stack, and what run model?

## Options considered

### Option A — Three.js via CDN import map, ES modules, no bundler (chosen)
- Pros: zero install, no build step, runs from a static file server, idiomatic
  for a small solo project, fast iteration, the engine already exists this way.
- Cons: depends on the CDN at load time (offline breaks); no compile-time
  checks; bundle size is the full library; no bundler tree-shaking.

### Option B — Vite/Rollup/bundler build step
- Pros: tree-shaking, compile-time checks (if TS), offline dev, control over
  bundle.
- Cons: adds a build tool and config to maintain; slows the "open and play"
  loop; contradicts the no-build-step goal.

### Option C — Babylon.js or a different engine
- Pros: some engines have more built-in world-building tooling.
- Cons: different API, different ecosystem, would mean reimplementing the
  existing procedural world; no clearer benefit for this scope.

## Decision

Use Three.js 0.170 via a CDN import map (`three` + `three/addons/`), ES modules,
no bundler, served from a static file server (`python -m http.server`).

The import map is declared in `index.html`. No other dependencies are allowed
without an ADR.

## Consequences

### Positive
- Lowest-friction run model: have the files, serve, open.
- Fast iteration: change a file, refresh.
- Matches the existing engine implementation; no rework.

### Negative / trade-offs
- The CDN is a runtime dependency for `three` and the addons. Offline or
  CDN-down = no world (expected, surfaced via `#err`).
- No compile-time type checks (plain JS).
- Full library loads; no bundler tree-shaking.

### Constraints introduced
- `file://` is not supported; must serve over HTTP.
- Post-processing addons are optional: if they fail to load, the renderer falls
  back to plain rendering (try/catch in `src/render/pipeline.js`).
- Boot/runtime errors must surface in `#err`; never a silent black screen.
- The `#loading` overlay clears only after the first frame renders.
- No new dependency without an ADR (add a row to
  `docs/technical-preferences.md` decision log).

## Alternatives rejected

- Bundler (Option B): rejected because it adds friction and a build config for a
  solo project where the no-build-step loop matters more than tree-shaking.
- Other engine (Option C): rejected because the world is already built in Three.js
  and there's no clear benefit large enough to justify reimplementing.

## Linked files

- `index.html` (import map, shell, HUD, `#loading`, `#err`)
- `src/main.js` (boot, loop, wiring)
- `src/render/pipeline.js` (renderer + post chain + fallback)
- `src/world/*`, `src/player/*` (engine modules)
- `src/config.js` (tunables)
- `docs/technical-preferences.md` (decision log row)

## Notes

- Date decided: 2026-09-18
- Decided by: technical-director (solo studio)
- Related: ADR-002 (planned — performance/realism budget for "lifelike")
