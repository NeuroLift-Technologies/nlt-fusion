---
name: write-adr
description: Scaffold an ADR from a technical decision for review and sign-off.
---

# Write ADR

Given a decision topic, decision, and rationale, produce a complete ADR skeleton
in `docs/architecture/ADR-<NNN>-<slug>.md` ready for review.

## Steps

1. Determine the next ADR number: read `docs/architecture/` listing and
   `docs/technical-preferences.md` decision log, pick the next NNN.
2. Slug the topic from its name (lowercase, hyphenated, no spaces).
3. Produce the ADR with these sections:
   - Header: `ADR-<NNN>-<slug>`, Status: Proposed (not Accepted until reviewed).
   - Context: what prompted the decision, what's at stake.
   - Options considered: 2-4 options, each with trade-offs. If the decision
     involved `ask_question`, summarize the options that were on the table.
   - Decision: the chosen option, clearly stated.
   - Consequences: what becomes easier, what becomes harder, what's now
     constrained (including any rule/ADR updates the decision implies).
   - Alternatives rejected: brief note on why the others weren't chosen.
   - Linked files: which files/dirs are affected.
4. Append a row to the decision log table in `docs/technical-preferences.md`
   (Number, Topic, Decision, Date, ADR path). Use today's date.
5. If the decision adds a constraint that should be enforced always-on
   (forbidden pattern, lib approval, performance budget change), note in the
   ADR that `.cline/rules/` may need an update — don't edit the rule file in
   this skill unless instructed.
6. Present the ADR content for review. Do NOT write it to disk unless
   explicitly instructed. (Writing is the `/architecture-decision` workflow's
   job; this skill scaffolds the content.)

## When to use

Use this whenever a substantive technical choice is being made: new dependency,
new rendering approach, new world-gen approach, new performance budget.
ADR-001 (`docs/architecture/ADR-001-threejs-http.md`) is the model to follow.

## Bundled reference

- ADR template: `docs/architecture/template.md`
- ADR-001: `docs/architecture/ADR-001-threejs-http.md`
- Decision log: `docs/technical-preferences.md`

For a concise in-skill reference, see `docs/adr-reference.md` (this skill's
bundled reference).

