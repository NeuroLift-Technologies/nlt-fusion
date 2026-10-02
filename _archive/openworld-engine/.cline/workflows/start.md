---
name: start
description: Guided onboarding for a new game direction — concept to GDD skeleton to epics.
---

<task_objective>
Turn a rough game idea into an approved concept, a GDD skeleton, and an epic list.
End with a producer gate verdict: proceed / revise / stop.
</task_objective>

<detailed_sequence_of_steps>
1. **Concept intake**: read `production/session-state/active.md` (if any) and ask:
   fantasy, core loop (30s), setting, platform/input, scope (jam/vertical slice/full).
2. **Options**: use ask_question for each real fork (max 4 options). One question
   per turn. Record decisions in active.md.
3. **Draft GDD skeleton**: create `design/gdd/<slug>-core.md` with the 8 required
   sections as headers + one-line stubs (per design-docs rule). Show the skeleton,
   get approval before filling sections.
4. **Fill sections incrementally**: one section per turn — draft in chat, approve,
   write to file, update active.md. Formulas + tuning knobs must name their
   `src/config.js` counterparts.
5. **Epics**: derive 3-7 epics (`production/backlog/epics.md`), each with stories,
   story type (logic/integration/visual/ui/config), and required evidence.
6. **Gate**: producer verdict — proceed (create stories), revise (list gaps), or
   stop (record why). Write verdict to active.md.
</detailed_sequence_of_steps>
