# NLT Fusion Studio

Product-facing Claude Design prototype for the NLT Fusion World Engine.

The Studio adds three views over the existing browser simulation:

- **Live Sim** - one Avatar/Aide pair, scenario controls, telemetry, and inner monologue
- **Fleet** - active avatar roster (default: single StayAlert pair), state signals, interventions, and fusion readiness
- **Fusion** - the Avatar + Aide to Advocate progression ceremony

## Run

From the repository root:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/studio/`.

## Runtime Boundary

`studio/index.html` deliberately reuses the canonical browser prototype:

- `../world-engine/data.js`
- `../world-engine/sim.jsx`
- `../world-engine/tweaks-panel.jsx`

The Studio is not wired to the Python simulation engine yet. It remains a no-build React/Babel prototype while the state, event, action, and transport contracts are defined.

## Provenance

Adopted from the supplied `nlt-fusion.zip` Claude Design export on 2026-06-04. Duplicate engine files and the stale alternate HTML/CSS entrypoint from the export were not copied into the repository.
