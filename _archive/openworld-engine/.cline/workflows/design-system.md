---
name: design-system
description: Draft one GDD mechanic document section-by-section with approval gates.
---

<task_objective>
Produce `design/gdd/<mechanic>.md` with all 8 required sections approved.
</task_objective>

<detailed_sequence_of_steps>
1. Read the core GDD + `docs/technical-preferences.md` + related systems.
2. Create/refresh the file skeleton (all 8 headers, empty bodies).
3. For each section: draft in chat -> ask approval -> write -> update active.md.
   - Formulas: every variable defined; edge cases: min 3; tuning knobs: map to
     `src/config.js`; acceptance criteria: testable, numbered.
4. End with a design-lead self-review: consistency with core GDD, MDA fit
   (mechanics/dynamics/aesthetics in one line each), open questions or none.
</detailed_sequence_of_steps>
