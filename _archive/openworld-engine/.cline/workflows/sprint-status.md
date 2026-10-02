---
name: sprint-status
description: Read-only progress report from session state. No code changes.
---

<task_objective>
Report progress, blockers, and next actions from files only.
</task_objective>

<detailed_sequence_of_steps>
1. Read production/session-state/active.md + production/backlog/epics.md.
2. Report: completed stories (with evidence links), in-progress, blocked
   (with owner + needed decision), next 3 actions.
3. Do not modify anything. If state is stale, say so and propose an update.
</detailed_sequence_of_steps>
