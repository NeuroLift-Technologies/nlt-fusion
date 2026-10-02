# LT OpenWorld — technical preferences + decision log

One-page reference for the technical stack and the decisions behind it. New
decisions get an ADR in `docs/architecture/` and a row here.

## Stack

- **Runtime**: browser, ES modules, Three.js 0.170 via CDN import map
  (`https://cdn.jsdelivr.net/npm/three@0.170.0/...`). No bundler.
- **Serve**: Python `http.server` (or any static file server). Never `file://`.
- **Language**: plain JavaScript (no TypeScript, no build step).
- **Post-processing**: ACES tone mapping built into the renderer; bloom +
  vignette via `three/addons/postprocessing`. Optional — falls back to plain
  rendering if the addons fail to load.
- **No other dependencies**. New dependency = ADR first.

## World generation

- Seeded deterministic: same seed => same world, every load. `mulberry32` RNG
  + value noise + fBm in `src/world/noise.js`.
- No `Math.random()` in world building (per-frame variation like wind is fine).
- Config-driven: all tunables in `src/config.js`.

## Performance budgets

- 60fps target.
- Instancing for repeated objects (1 draw call per type: trees, grass, rocks).
- `pixelRatio` capped at 2.
- Shadows: PCFSoft, 2048.
- Keep `src/main.js` wiring-only (~150 lines); logic in modules.

## Boot + error discipline

- `#loading` overlay clears only after the first frame renders.
- `#err` shows boot/runtime errors; never a silent black screen.
- Post-processing and CDN addons must try/catch with a plain-rendering fallback.

## Decision log

| # | Topic | Decision | Date | ADR |
|---|---|---|---|---|
| 001 | Three.js over HTTP, no build step | Three.js 0.170 via CDN import map, ES modules, no bundler. | 2026-09-18 | ADR-001 |
