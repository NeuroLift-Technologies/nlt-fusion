---
paths:
  - "src/**/*.js"
  - "index.html"
---

# Three.js engine rules (apply when touching rendering / engine code)

- **Stack**: Three.js 0.170 via CDN import map, ES modules, no build step,
  no framework. Must run from `python -m http.server` (never `file://`).
- **Config over magic numbers**: gameplay/world values live in
  `src/config.js`. New tunables go there, never inline.
- **Determinism**: world gen seeded (`src/world/noise.js`). Same seed =
  same world. No `Math.random()` in world building (per-frame variation ok).
- **Performance budgets**: 60fps target, instancing for repeats (1 draw call
  per type), pixelRatio capped at 2, shadows PCFSoft 2048.
- **Public APIs** in `src/world/*`, `src/render/*`, `src/player/*` get
  doc comments. Keep `main.js` wiring-only (~150 lines); logic in modules.
- **Graceful degradation**: post-processing and CDN addons must try/catch
  with plain-rendering fallback. Boot errors surface in `#err`, never a
  silent black screen. The `#loading` overlay clears only after first frame.
- **Allowed libs**: three + three/addons only. New dependency = ADR first.
