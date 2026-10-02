---
name: story-done
description: Verify a story's evidence and close it out.
---

<task_objective>
Verify story <ID> is truly done: evidence present, criteria met, state updated.
</task_objective>

<detailed_sequence_of_steps>
1. qa-lead check: re-run the automated test OR open the evidence artifact.
   - Missing/blocking evidence -> story stays open with a punchlist. Never
     waive blocking evidence.
2. Confirm every acceptance criterion maps to evidence (numbered 1:1).
3. Update production/backlog/epics.md (check the story), active.md
   (milestone entry), and CHANGELOG.md (Conventional Commit line + story ID).
4. Report done + residual risks (follow-ups become new stories, never silent).
</detailed_sequence_of_steps>
