# LT OpenWorld — active session state

Last updated: 2026-09-18

## Current phase

design (skeleton)

## Project snapshot

- Engine: Three.js 0.170 procedural island, water, sky, vegetation, camp,
  HUD. Run via `python -m http.server 8000`.
- Studio: `.cline/rules/`, `.cline/workflows/`, `AGENTS.md`, `README.md`,
  `docs/`, `design/gdd/`, `production/` set up. See `README.md` and
  `docs/governance-mapping.md`.

## Last milestone

Studio governance layer bootstrapped: always-on rules (4), workflows (8),
GDD core skeleton, ADR-001, decision log, studio roster, backlog skeleton,
session-state checkpoint. Engine untouched.

## Open stories

None yet. Backlog skeleton exists in `production/backlog/epics.md` (Epic 001,
stories S01-S08). Real stories come from `/create-epics` after the GDD is
filled in via `/start` + `/design-system`.

## Active threads / blockers

- `docs/active-threads.md`: LIVE-001 (run `nlt-world-engine` server tests;
  explore CCGS governance docs to mirror structure here). Status: in progress.
- Engine/서비스 layer integration (nlt-world-engine ↔ world-engine-3d): deferred;
  depends on Adobe account for Mixamo and a Linux box for MetaHuman. Not blocking
  the current bootstrap.

## Next actions

1. `/start` — turn the engine into a real game: concept → GDD skeleton → epics.
2. `/design-system` — fill the core GDD section by section.
3. `/create-epics` — turn the approved GDD into real stories.

## Notes

- `.cline/rules/*.md` are live in this terminal session (injected into every
  prompt, with conditional `paths:` activation). `.cline/workflows/*.md` are
  valid Cline workflow files but have no slash-command invocation in this
  terminal; they serve as structured process documentation here.
- See `docs/governance-mapping.md` for the live-vs-IDE-only breakdown and the
  CCGS mapping.
