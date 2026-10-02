---
name: create-epics
description: Turn approved GDD docs into epics and testable stories.
---

<task_objective>
Write `production/backlog/epics.md`: epics with goal, stories, types, evidence.
</task_objective>

<detailed_sequence_of_steps>
1. Read all approved GDD docs + active.md gate verdicts.
2. Slice into epics (user-visible value each). Per epic: goal, non-goals,
   stories sized ≤1 session.
3. Per story: id (EPIC-00X-S0X), type (logic/integration/visual/ui/config),
   required evidence per testing rule, acceptance criteria copied from GDD.
4. Producer scope-check: cut or defer to fit the milestone; record cuts.
5. Approval: show epic list, get go, write file, update active.md.
</detailed_sequence_of_steps>
