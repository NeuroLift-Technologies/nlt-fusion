---
name: gate-check
description: Phase-gate review at design/architecture/build/QA boundaries.
---

<task_objective>
Render a gate verdict (PASS / CONDITIONAL / FAIL) for the current phase.
</task_objective>

<detailed_sequence_of_steps>
1. Identify the phase from active.md: design (GDD approved?) -> architecture
   (ADRs written?) -> build (stories + evidence?) -> QA (playtest filed?).
2. Spawn technical-director + qa-lead teammates in parallel for independent
   review (shared files listed explicitly; vertical delegation preserved).
3. Collect: gaps (blocking), advisories (non-blocking), risks. Verdict:
   - PASS: all blocking criteria met.
   - CONDITIONAL: ship with named follow-up stories (create them).
   - FAIL: list punchlist, return to phase, re-gate later.
4. Write verdict + punchlist to active.md and production/qa/gate-<date>.md.
</detailed_sequence_of_steps>
