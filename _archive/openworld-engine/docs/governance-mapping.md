# LT OpenWorld Studio governance — what's live vs IDE-only

This repo's governance layer uses Cline's customization system. Some pieces are
live in this terminal session; others require the Cline Desktop IDE to activate.

## Live in this terminal session

These are injected into every prompt (with conditional `paths:` activation for
some) and directly shape behavior here:

- `.cline/rules/01-studio.md` — always-on studio protocol (collaboration,
  file-as-memory, hierarchy, quality gates).
- `.cline/rules/02-threejs.md` — activates when touching `src/**/*.js` or
  `index.html` (Three.js conventions, config-driven, seeded determinism,
  fallback paths, boot error discipline).
- `.cline/rules/03-testing.md` — activates when touching tests or `src/**/*.js`
  (evidence table, test standards).
- `.cline/rules/04-design-docs.md` — activates when touching `design/**`,
  `docs/**`, or `*.md` (GDD structure, incremental writing).
- `AGENTS.md` — cross-tool agent roster + coordination model.
- `docs/`, `design/`, `production/` — real files, readable when explicitly read.

## Requires Cline Desktop IDE (or CLI interactive mode) to activate

These are valid Cline customization files but have no invocation mechanism in
this terminal:

- `.cline/workflows/*.md` — on-demand processes (`/start`, `/dev-story`,
  `/gate-check`, etc.). In the Desktop IDE, typing `/name` expands the workflow
  into the message. Here they serve as structured process documentation.
- `.cline/skills/<skill>/SKILL.md` — on-demand capabilities loaded via
  `use_skill` (IDE-only). Each skill is a directory with `SKILL.md`.
- `.cline/hooks/` — lifecycle hook scripts (e.g. pre-commit checks). Require
  the Cline host to register and execute them.

## How to use the Desktop IDE version

Open this repo in the Cline Desktop IDE. The Rules panel will show the
`.cline/rules/*.md` files (toggleable). The workflows will appear as slash
commands in the TUI/config view. Teammates can be spawned via team tools with
role prompts from `docs/studio-roster.md`.

## Mapping to CCGS

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

Note: we used Cline's actual storage layout (`.cline/rules/`, `.cline/workflows/`,
`.cline/skills/<skill>/SKILL.md`) rather than CCGS's `.claude/` convention,
because Cline reads `.cline/` natively. The CCGS pattern is preserved; the
storage path follows the tool. A `.clinerules/` compatibility mirror was removed
after confirming `.cline/rules/` is the canonical workspace location.