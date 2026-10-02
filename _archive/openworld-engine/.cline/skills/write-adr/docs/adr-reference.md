# ADR Reference

Concise reference for writing an ADR in this studio. Full template:
`docs/architecture/template.md`. Model ADR: `docs/architecture/ADR-001-threejs-http.md`.

## ADR skeleton

- **Header**: `ADR-<NNN>-<slug>`, Status: Proposed (Accepted after review).
- **Context**: what prompted the decision, what's at stake (2-5 sentences).
- **Options considered**: 2-4 options, each with trade-offs.
- **Decision**: the chosen option, clearly stated.
- **Consequences**: easier / harder / constrained (including rule or ADR updates
  the decision implies).
- **Alternatives rejected**: brief note on why the others weren't chosen.
- **Linked files**: which files/dirs are affected.

## Process (per `/architecture-decision` workflow)

1. technical-director frames: context, options (2-4 with trade-offs), decision,
   consequences, alternatives rejected.
2. Write the ADR (Status: Accepted, date).
3. Append a row to the decision log in `docs/technical-preferences.md`.
4. If the decision adds an always-on constraint (forbidden pattern, lib approval,
   budget), update the matching `.cline/rules/` file.
5. Update `production/session-state/active.md`.

## Decision log fields

`Number | Topic | Decision | Date | ADR`

Example row: `001 | Three.js over HTTP, no build step | Three.js 0.170 via CDN import map, ES modules, no bundler | 2026-09-16 | ADR-001-threejs-http.md`
