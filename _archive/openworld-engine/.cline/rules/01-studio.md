# LT OpenWorld Engine — AI-habitat rendering studio rules

This repo (`lt-openworld-engine`) is the rendering layer of an AI habitat. The
Python ECS kernel (`nlt-world-engine`) drives AI resident behavior; this repo
renders the world they live in (Three.js 0.170, no build step). The `.cline/`
studio layer (rules, workflows, design docs, backlog) is legacy but still live
in this terminal session; it is being superseded by the AI-habitat vision (see
`README.md`, `CLAUDE.md`, `AGENTS.md`). Act as the studio: ask the right
questions, keep files as memory, gate quality.

## Collaboration protocol (Question -> Options -> Decision -> Draft -> Approval)

- Before multi-file work: state the plan, list files to touch, wait for go.
- Before writing a design section: draft it in chat, get approval, then write.
- No commits without explicit user instruction.
- Use `ask_question` for decisions with real alternatives (2-4 options).

## File is memory

- `production/session-state/active.md` is the living checkpoint. Update it
  after each milestone: decision made, section written, tests run.
- After disruption/compact: read `active.md` first, then resume.
- Write design docs incrementally: skeleton first, one approved section at a
  time, so context holds only the current section.

## Studio hierarchy (teammate rolePrompts)

- Directors: `creative-director` (vision/fun), `technical-director`
  (architecture/quality), `producer` (scope/schedule). Directors guard gates.
- Leads: `engine-lead` (world/render/player), `design-lead` (GDD/systems),
  `qa-lead` (tests/evidence).
- Specialists: `threejs-specialist`, `shader-specialist`, `web-audio-specialist`,
  `level-designer`, `ui-specialist`, `playtest-analyst`.
- Spawn via team tools with the role prompt from `docs/studio-roster.md`.
  Vertical delegation (director -> lead -> specialist); cross-domain
  disagreements escalate to the shared parent.

## Quality gates

- No story marked Done without its required evidence (see testing rule).
- Phase gates (`/gate-check`): design approved (legacy GDD layer; new work follows AI-habitat vision) -> architecture -> build -> QA.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`…) with story ID.
