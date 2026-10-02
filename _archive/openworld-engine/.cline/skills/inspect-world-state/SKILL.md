---
name: inspect-world-state
description: Summarize current engine + studio state from files before starting work.
---

# Inspect World State

Produce a concise state summary: what the engine has, what the studio has, and
what's open/blocked — so the next task starts from reality, not assumption.

## Steps

1. Read these in order:
   - `README.md` (engine + studio overview)
   - `AGENTS.md` (roster + coordination)
   - `.cline/rules/01-studio.md` (always-on studio protocol)
   - `production/session-state/active.md` (living checkpoint — if it exists)
   - `production/backlog/epics.md` (work to do — if it exists)
   - `design/gdd/` listing (what GDD docs exist — if the dir exists)
   - `docs/active-threads.md` (LIVE threads — if it exists)
   - `src/config.js` (the tunables — to know what's tunable)
2. For the engine, note: Three.js version (from `index.html` import map), which
   world systems exist (`src/world/`), render pipeline (`src/render/`),
   player control (`src/player/`), and any known boot-surface concerns
   (`#err` / `#loading` discipline is in `.cline/rules/02-threejs.md`).
3. For the studio, note: which phase the project is in (design / architecture /
   build / QA) per `active.md` if present, and which stories are open.
4. Produce a short summary with sections:
   - Engine snapshot (version, systems, key tunables relevant to the task)
   - Studio snapshot (phase, open stories, active threads)
   - Suggested next action for the task at hand
5. Do NOT modify files in this skill. Reporting only.

## When to use

Use this skill at the start of any task that touches the engine or studio, so
you don't act on stale assumptions. Especially useful after a context compact
or after picking up the repo fresh.
