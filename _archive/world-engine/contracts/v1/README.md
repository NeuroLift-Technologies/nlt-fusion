# World Engine Contract v1 Draft

This directory defines a provider-neutral transport and replay contract for the
NLT Fusion World Engine.

**Status:** Draft. It does not select a database, network transport, game engine,
LLM provider, or learned world model.

## Files

- `common.schema.json` - shared identifiers, clocks, metrics, positions, and sources
- `snapshot.schema.json` - complete saveable simulation state
- `action.schema.json` - intent submitted by a human, agent, aide, or engine
- `event.schema.json` - ordered fact emitted by the simulation
- `intervention.schema.json` - structured Aide coaching record
- `replay.schema.json` - initial state, ordered records, and expected final state
- `../examples/stay-alert-coaching.replay.json` - deterministic reference replay

## Design Rules

1. The deterministic simulation owns truth. Renderers and model adapters consume
   snapshots and events.
2. Snapshot collections are keyed by stable IDs. Browser arrays can be converted
   with `Object.fromEntries(items.map(item => [item.id, item]))`.
3. Normalized metrics use the inclusive `0..1` range.
4. Unknown implementation-specific data belongs under `extensions`.
5. Replays use ordered events with explicit `state_changes`. These are audit and
   verification records, not a recommendation that the production engine must use
   JSON-pointer mutation internally.
6. A replay hash is SHA-256 over the canonical expected final snapshot:
   sorted object keys, no insignificant whitespace, and UTF-8 encoding.

## Life sim v1 (2026-06)

- **Objects:** Interactive lot objects (`move_to`, `use_object`) map to `world-engine/data.js` `OBJECTS`.
- **Avatar state:** `walking` is used while pathing to a target object before `working`.
- **Energy motive:** Runtime energy is `0..1` in the browser and headless engine (`world-engine/src/simulation/life_sim/`). Replays may store it under `avatars.<id>.extensions.energy` until metrics schema gains a first-class field.
- **Actions:** `move_to`, `use_object`, and `rest` complement `assign_scenario` for object-first flows.

## Compatibility Targets

- Browser prototype: `world-engine/data.js` and `world-engine/sim.jsx`
- Product shell: `studio/`
- Python headless life sim: `world-engine/src/simulation/life_sim/`
- Python event bus and session concepts: `world-engine/src/`

The contract intentionally captures their shared surface while leaving richer ECS,
controller, and model-specific state in `extensions`.

## Human-Centered Constraint

The schemas describe simulation records, not clinical truth. Behavior, coaching
effectiveness, and fusion readiness must remain reviewable, evidence-linked, and
clearly labeled as simulated or inferred.
