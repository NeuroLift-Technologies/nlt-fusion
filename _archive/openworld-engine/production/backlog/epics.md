# LT OpenWorld — backlog (epics + stories)

Last updated: 2026-09-18

## How to read this

Each epic has a goal, non-goals, and stories. Each story has:

- `id` — `EPIC-00X-S0X`
- `type` — `logic` | `integration` | `visual` | `ui` | `config`
- `evidence` — required evidence per `.cline/rules/03-testing.md`
- `acceptance criteria` — copied from the GDD section it comes from

Story types and required evidence:

| Type | Evidence | Where |
|---|---|---|
| logic | automated test, must pass | `tests/unit/` |
| integration | test or documented playtest | `tests/integration/` |
| visual/feel | screenshot + lead sign-off | `production/qa/evidence/` (advisory) |
| ui | walkthrough note or interaction test | `production/qa/evidence/` (advisory) |
| config/balance | smoke check pass | `production/qa/smoke-<date>.md` (advisory) |

## Epic 001 — Core world feel (bootstrap)

**Goal:** The player can load the world and feel present in a believable,
  lifelike island environment with a lakeside camp.

**Non-goals:** No quests, no NPC AI, no audio yet.

### Stories

#### EPIC-001-S01 — Procedural island renders with biomes
- type: visual
- evidence: screenshot + lead sign-off (advisory)
- acceptance criteria:
  1. Island loads with sand/grass/rock/snow biomes visible from waterline to summit.
  2. Same seed gives same island on reload (determinism).
  3. No console errors at boot over HTTP.

#### EPIC-001-S02 — Animated water reads as water
- type: visual
- evidence: screenshot + lead sign-off (advisory)
- acceptance criteria:
  1. Water animates with gentle waves.
  2. Shallow/deep color reads as water; transparency believable.
  3. Water plane sits at sea level and surrounds the island.

#### EPIC-001-S03 — Sky dome with day/night cycle
- type: visual
- evidence: screenshot + lead sign-off (advisory)
- acceptance criteria:
  1. Day sky shows a sun disc and believable gradient.
  2. Night sky shows stars when night factor is high.
  3. Time slider and day-cycle toggle work (time updates in HUD).

#### EPIC-001-S04 — Vegetation scatters believably
- type: visual
- evidence: screenshot + lead sign-off (advisory)
- acceptance criteria:
  1. Trees on mid-slopes, grass lower, rocks varied across the island.
  2. Instanced (no per-frame random); seeded deterministic.
  3. Wind sway in grass readable at rest.

#### EPIC-001-S05 — Lakeside camp settlement
- type: visual
- evidence: screenshot + lead sign-off (advisory)
- acceptance criteria:
  1. Camp placed near water on flat-ish ground.
  2. Reads as a small settlement (huts, tent, campfire with light).
  3. Campfire light flickers; night factor affects it.

#### EPIC-001-S06 — Walk + orbit controls
- type: integration
- evidence: documented playtest (advisory)
- acceptance criteria:
  1. WASD moves the player; pointer-drag looks in walk mode.
  2. Orbit mode (1/2 or button) orbits the camp.
  3. Player clamps to world bounds; doesn't sink below water.
  4. No camera fighting between modes.

#### EPIC-001-S07 — HUD and post-processing
- type: ui + visual
- evidence: screenshot + walkthrough note (advisory)
- acceptance criteria:
  1. HUD shows fps, position, time; slider scrubs time; day-cycle toggle works.
  2. ACES + bloom + vignette apply; scene still renders if addons fail.
  3. `#loading` clears after first frame; `#err` shows boot errors, never silent black.

#### EPIC-001-S08 — Smoke test pass
- type: config
- evidence: smoke check pass
- acceptance criteria:
  1. `python -m http.server 8000` serves the repo; page loads over HTTP.
  2. No console errors in a normal run (internet available for CDN).

(More epics added as the GDD grows.)
