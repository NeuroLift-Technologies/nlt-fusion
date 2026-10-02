---
name: architecture-decision
description: Write an ADR for a technical choice and log it.
---

<task_objective>
Decide <TOPIC>, write docs/architecture/ADR-<NNN>-<slug>.md, log it.
</task_objective>

<detailed_sequence_of_steps>
1. technical-director framing: context, options (2-4 with trade-offs via
   ask_question), decision, consequences (good + bad), alternatives rejected.
2. Write the ADR (Status: Accepted, date). Append a row to the decision log
   in docs/technical-preferences.md.
3. If the decision adds a constraint (forbidden pattern, lib approval,
   budget), also update the matching .cline/rules file.
4. Update active.md.
</detailed_sequence_of_steps>
