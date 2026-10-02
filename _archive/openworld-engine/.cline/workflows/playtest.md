---
name: playtest
description: Scripted playtest of the current build with filed evidence.
---

<task_objective>
Play the build per script, file evidence, return findings as stories.
</task_objective>

<detailed_sequence_of_steps>
1. Read the core GDD loop + latest gate report for focus areas.
2. Script: spawn -> walk to camp (30s) -> toggle orbit -> scrub time of day
   -> day cycle 1 min. Note fps at each step, screenshot each step.
3. File production/qa/playtest-<date>.md: build id, steps, fps table,
   screenshots linked, bugs (severity + repro), feel notes.
4. Bugs become backlog stories (type visual/ui/logic); playtest-analyst
   summarizes fun-blocking vs polish.
</detailed_sequence_of_steps>
