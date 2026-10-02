---
paths:
  - "design/**"
  - "docs/**"
  - "*.md"
---

# Design + docs rules (legacy studio layer — superseded by AI-habitat vision)

The design layer (`design/gdd/`, `production/`) is legacy from the original
CCGS-style studio governance. It remains live for reference but new work follows
the AI-habitat vision in `README.md`, `AGENTS.md`, and `CLAUDE.md`.

- Legacy GDD docs live in `design/gdd/` with 8 required sections (for reference only).

- GDD docs live in `design/gdd/`, one mechanic per file, Markdown, with all
  8 required sections: Overview, Player Fantasy, Detailed Rules, Formulas,
  Edge Cases, Dependencies, Tuning Knobs, Acceptance Criteria.
- Balance values link to their formula or rationale. Tuning knobs must map
  1:1 to `src/config.js` entries.
- Architecture decisions: full ADRs in `docs/architecture/ADR-*.md`, linked
  from `docs/technical-preferences.md` decision log.
- Write incrementally: skeleton with all headers first, then one approved
  section at a time; update `production/session-state/active.md` per section.
- Keep paragraphs short, sentences in active voice, no placeholder lorem.
