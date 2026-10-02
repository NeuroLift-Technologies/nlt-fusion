---
name: review-gdd-consistency
description: Check a GDD mechanic doc for consistency with the core GDD and config mappings.
---

# Review GDD Consistency

Review a mechanic doc in `design/gdd/` and report gaps against the core GDD,
the 8-section structure, formula/rationale discipline, and `src/config.js`
mapping.

## Steps

1. Read the target mechanic doc fully.
2. Read `design/gdd/core.md` (the core GDD) if it exists; if not, note that
   core GDD is absent and review against the 8-section standard only.
3. Read `src/config.js` to know the real tunable surface.
4. Check each of these and report as PASS / GAP / N/A:
   - All 8 required sections present: Overview, Player Fantasy, Detailed Rules,
     Formulas, Edge Cases, Dependencies, Tuning Knobs, Acceptance Criteria.
   - Each formula defines every variable; at least 3 edge cases named.
   - Each tuning knob maps 1:1 to a `src/config.js` entry (or notes why it's
     not yet in config).
   - Balance values cite a formula or rationale.
   - Acceptance criteria are testable and numbered.
   - No placeholder lorem; short paragraphs, active voice.
5. If core GDD exists, also check: the mechanic supports the core fantasy and
   pillars; doesn't silently contradict a core-system rule.
6. Output a short review with the checklist above plus a punchlist of gaps.
   Do NOT edit the doc — report only. The author acts on the punchlist.

## When to use

Use this after `/design-system` finishes a doc, or whenever a mechanic doc is
handed off for review. It complements the design-lead role (which owns GDD
integrity) by giving a reusable, repeatable review script.

## Reference

The 8-section standard is defined in `.cline/rules/04-design-docs.md`.
Tuning knobs must map to `src/config.js` per that rule.
