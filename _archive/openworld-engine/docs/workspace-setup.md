# LT OpenWorld Studio — how this repo maps to Cline

Purpose: this doc explains how the studio governance layer is implemented using
Cline's customization system, and what's live in this terminal vs what needs the
Cline Desktop IDE. It's the orientation doc for anyone (including future you)
picking up the repo.

## What Cline reads from this repo

Cline's customization system reads markdown-based instruction files from a few
canonical locations. In this repo those are:

| Location | What's here | How Cline uses it |
|---|---|---|
| `.cline/rules/*.md` | Always-on rules with optional `paths:` activation | Merged into system prompt; `paths:` rules activate when context matches |
| `.cline/workflows/*.md` | On-demand workflows with YAML `name`/`description` frontmatter | Expanded into the message when invoked as `/name` (Desktop IDE / CLI interactive) |
| `.cline/skills/<skill>/SKILL.md` | On-demand skills (each is a directory with `SKILL.md` + optional `docs/`, `scripts/`) | Loaded via `use_skill` when the request matches the skill description; also invocable as `/<name>` |
| `.cline/hooks/` | Lifecycle hook scripts | Executed by the Cline host at lifecycle events (not run by this terminal) |
| `AGENTS.md` | Cross-tool agent roster + coordination model | Read as a rule-like file by Cline and other agents tooling |

Cline also reads global rules/skills/workflows from the user's documents folder
(`~/Documents/Cline/...` on Windows), and cross-tool AGENTS instructions from
`~/.agents/AGENTS.md`. This repo only contributes workspace-level files.

## How skills are structured here

Each skill is a directory named `<skill>/` containing a `SKILL.md` whose
`name` frontmatter matches the directory name. That matches Cline's documented
skill structure exactly:

```
.cline/skills/
  inspect-world-state/
    SKILL.md
  generate-terrain-variant/
    SKILL.md
    docs/
      world-gen-reference.md     # how config knobs map to world gen
  review-gdd-consistency/
    SKILL.md
  write-adr/
    SKILL.md
    docs/
      adr-reference.md           # concise ADR writing reference
  smoke-build/
    SKILL.md
  run-test-harness/
    SKILL.md
```

The Cline docs show skills can also bundle `docs/`, `templates/`, and `scripts/`
inside each skill directory. We've used that pattern for two skills so far —
`generate-terrain-variant/docs/world-gen-reference.md` (World-Gen Reference) and
`write-adr/docs/adr-reference.md` (ADR Reference) — so those skills can reference
their own self-contained reference notes without relying on top-level repo docs.
The remaining skills currently reference repo files directly; add bundled `docs/`
when a skill's instructions grow enough to justify it.

## How workflows are structured here

Each workflow is a markdown file in `.cline/workflows/` with YAML frontmatter:

```
---
name: dev-story
description: Implement one backlog story with tests and evidence.
---

<task_objective>
...
</task_objective>

<detailed_sequence_of_steps>
...
</detailed_sequence_of_steps>
```

In the Cline Desktop IDE / CLI interactive mode, typing `/dev-story` expands
that body into the message. In this terminal there is no slash-command
invocation, so these files serve as structured process documentation and are
followed manually as guidance.

## How rules are structured here

Rules are markdown files in `.cline/rules/`. A file with YAML frontmatter
(`paths:`) is conditionally activated when the current context matches. A file
without frontmatter is always active. This repo's rules:

- `01-studio.md` — always-on studio protocol (no frontmatter).
- `02-threejs.md` — activates when touching `src/**/*.js` or `index.html`.
- `03-testing.md` — activates when touching `tests/**` or `src/**/*.js`.
- `04-design-docs.md` — activates when touching `design/**`, `docs/**`, or
  `*.md`.

## What's live in this terminal session

These are injected into the current session's prompts and directly shape
behavior here:

- `.cline/rules/01-studio.md` — always-on studio protocol.
- `.cline/rules/02-threejs.md` — conditional Three.js rule.
- `.cline/rules/03-testing.md` — conditional testing rule.
- `.cline/rules/04-design-docs.md` — conditional design/docs rule.
- `AGENTS.md` — agent roster + coordination model.
- `design/gdd/`, `production/`, `docs/` — real files, readable when explicitly
  read with read_files.

## What needs the Cline Desktop IDE (or CLI interactive mode)

These are valid Cline customization files but have no invocation mechanism in
this terminal:

- `.cline/workflows/*.md` — slash-command workflows (`/start`, `/dev-story`,
  `/gate-check`, etc.) require the IDE or CLI interactive TUI to expand.
- `.cline/skills/<skill>/SKILL.md` — loaded via the `use_skill` tool, which
  requires the Cline host. Also invokable as `/<name>` in the IDE.
- `.cline/hooks/` — lifecycle hooks require the Cline host to register and run
  them.

## Relationship to CCGS

CCGS is a process/governance framework, not a game engine. We adopted its
*process patterns*, not its code:

| CCGS concept | This repo |
|---|---|
| AGENTS.md (agent roster + coordination) | `AGENTS.md` + `docs/studio-roster.md` |
| CLAUDE.md (entry point) | `CLAUDE.md` (and `AGENTS.md`) |
| .claude/docs/ (coding-standards, context-management, coordination-rules, directory-structure, technical-preferences) | `.cline/rules/*.md` + `docs/technical-preferences.md` + `docs/workspace-setup.md` |
| GDD with epics/stories | `design/gdd/` + `production/backlog/epics.md` |
| Sprint planning | `production/session-state/active.md` + backlog |
| ADRs | `docs/architecture/ADR-*.md` |
| Review gates | `/gate-check` workflow + `qa-lead` |
| Hooks | `.cline/hooks/` (IDE-only) |
| Skills | `.cline/skills/<skill>/SKILL.md` (IDE-only) |

Note: we used Cline's actual storage layout rather than CCGS's `.claude/`
convention, because Cline reads `.cline/` (and `.clinerules/`) natively. The
CCGS pattern is preserved; the storage path follows the tool. We initially
created a `.clinerules/` compatibility mirror, but after confirming Cline's docs
we removed it — `.cline/rules/` is the canonical workspace location and
`.clinerules/` is still supported but legacy.

## Companion docs

- `docs/studio-roster.md` — teammate role prompts.
- `docs/technical-preferences.md` — stack + decision log.
- `docs/architecture/template.md` — ADR template.
- `docs/governance-mapping.md` — this doc's parent summary (live vs IDE-only).
- [x] This file is coherent + accurate + explains the lay of the land .... 
  done — rewritten with CCGS mapping, live-vs-IDE breakdown, skill dir structure,
  .clinerules mirror removal noted
- [x] Skills are real Cline skills (dirs + YAML frontmatter + docs/ where useful) 
  .... done — 6 skills, each `<name>/SKILL.md`, name==dir, 2 skills have bundled docs/
- [ ] For future sessions: study skills for what's worth automating this way .... 
  not yet
  Candidates: a "review PR-style change" skill (gather changed files, check against
  rules, produce a review note), a "balance tuning" skill (read config + relevant
  GDD knob rows, propose a change with rationale), a "gate-check reporter" skill
  (read active.md + backlog + evidence, produce the gate report).
