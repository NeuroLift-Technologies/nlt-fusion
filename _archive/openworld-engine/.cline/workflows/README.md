# LT OpenWorld team workflows (invoke with /name)

Cline expands the workflow file into the message on invoke. Each workflow is
a repeatable multi-step process: gather context -> analyze -> ask -> execute.

## Lifecycle

| Workflow | Purpose | When |
|---|---|---|
| `/start` | Guided onboarding: concept -> GDD skeleton -> epic list | New game / new direction |
| `/design-system` | Draft one GDD mechanic doc section-by-section | Per mechanic |
| `/create-epics` | Turn approved GDD into epics + stories | After GDD gate |
| `/dev-story` | Implement one story with tests + evidence | Per story |
| `/story-done` | Verify evidence, update state, close story | Per story |
| `/gate-check` | Phase-gate review (design/arch/build/QA) | Phase boundaries |
| `/sprint-status` | Read state + report progress/blockers | Anytime |
| `/playtest` | Run scripted playtest, file evidence | Per build |
| `/architecture-decision` | Write an ADR for a technical choice | Per decision |

Rules live in `.cline/rules/` (always-on behavior). Workflows live here
(on-demand processes). Don't duplicate rules inside workflows — reference them.
