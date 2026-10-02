# AGENTS.md — nlt-world-engine

> **Internal use only.** This is the private governance gateway for all coding agents operating within the **NLT World Engine** repository. For public-facing principles, see the public [`NeuroLift-Technologies/.github`](https://github.com/NeuroLift-Technologies/.github) repository.

---

## You Are Here

You are a coding agent operating within the **NLT World Engine** — the UE 5.8 authoritative simulation environment where AI Avatars (with ADHD traits) and AI Aides live, perceive, act, and learn.

**Mandatory reading order:**
1. `NLT-DEV-OTOI.md` — Full org-level coding agent contract (this repo, root level)
2. `CLAUDE.md` — Project-specific context (this repo)
3. `docs/active-threads.md` — Current work state (this repo, if present)
4. `README.md` — Full project documentation
5. `ARCHITECTURE.md` — UE 5.8 architecture and subsystem reference

**Final authority:** Joshua W. Dorsey, Sr. Escalate. Do not guess.

---

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

## Coordination Protocol

### Session Start (Every Session)

```
1. Read NLT-DEV-OTOI.md (this repo)
2. Read CLAUDE.md (this repo)
3. Read docs/active-threads.md (this repo, if present)
4. Read README.md and ARCHITECTURE.md
5. Self-register per OTOI Section 3
6. Confirm task scope before beginning
```

### Commit Format

All agent commits must follow:

```
[AGENT_NAME] type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `ci`

### Escalation Triggers

Escalate to Joshua immediately when:
- Task scope is unclear or conflicts with existing work
- An architectural or deployment decision is required
- A blocker cannot be resolved by the agent
- An ethical concern arises
- LLM provider or external service selection is needed

Use the escalation template: `templates/escalation.md`

---

## Guardrails

These are **non-negotiable**. No exceptions without explicit Joshua approval:

| Guardrail | Details |
|---|---|
| No LLM provider lock-in | Do not hardcode or commit to a specific LLM provider |
| No architecture decisions | Database, deployment, framework choices require human sign-off |
| No production deployments | Human must explicitly approve all production actions |
| No credential storage | Never store secrets, tokens, or credentials in code or VCS |
| No external integrations | Third-party service connections require Joshua's approval |
| No OTOI self-amendment | This governance doc cannot be changed by agents |

---

## Repo File Map

```
nlt-world-engine/
├── README.md                              ← Full project docs (start here)
├── ARCHITECTURE.md                        ← UE 5.8 architecture + subsystems
├── ONBOARDING.md                          ← 3-minute onboarding
├── DEPLOYMENT.md                          ← UE 5.8 build + deployment
├── NLT-DEV-OTOI.md                        ← Canonical org-level agent contract
├── AGENTS.md                              ← This file
├── CLAUDE.md                              ← Claude Code repo instructions
├── links.md                               ← Agent reference links
├── mcp-config.yaml                        ← MCP server configuration
├── file-structure.md                      ← Detailed file tree
├── REVIEW.md                              ← Agent review format
├── pr_body.md                             ← PR body template
├── nltotoi.json                           ← Discovery manifest
│
├── WorldEngine/                           ← UE 5.8 authoritative simulation (C++)
│   ├── Source/WorldEngine/               ← C++ module (16 subsystems)
│   ├── Content/                          ← UE assets (maps, scenarios, materials)
│   ├── Scripts/                          ← Python automation (QA, VFX, scenarios)
│   ├── Config/                           ← DefaultEngine/Game/Input.ini
│   ├── Skills/                           ← Skill definitions
│   └── docs/architecture/                ← Architecture documentation
│
├── world-engine-v2/                       ← Babylon.js web viewer (TypeScript, Vite)
├── world-engine/                          ← Python ECS engine (reference, not authoritative)
├── openworld-engine/                      ← Open-world exploration variant
├── agents/                                ← Agent profiles and configurations
├── SOPs/                                  ← Standard operating procedures
├── templates/                             ← Registration, handoff, escalation templates
├── .nltotoi/                              ← Governance validation namespace
└── .github/workflows/                     ← CI (governance + v2 build)
```

---

## Codebase Overview

This repo has **three runnable components**:

| Component | Location | How to run |
|---|---|---|
| **UE 5.8 authoritative simulation** | `WorldEngine/` | `make WorldEngineEditor` or `make WorldEngineServer` (headless) |
| **Babylon.js web viewer** | `world-engine-v2/` | `cd world-engine-v2 && npm install && npm run dev` |
| **Python ECS engine (reference)** | `world-engine/` | `cd world-engine && python3 demo.py` |

The UE 5.8 simulation is the **driving engine** — all authoritative state lives there. The Babylon.js viewer connects via WebSocket. The Python engine is a reference implementation for data pipeline use.

---

## Multi-Agent Coordination

When multiple agents may be active:

1. **Check active-threads.md first** — do not begin work already in progress
2. **Claim your thread** — update active-threads.md when starting a task
3. **Write handoff records** — never leave a session without a handoff document
4. **Do not overwrite peer work** — if conflict is detected, escalate

---

## Handoff Protocol

Before ending any significant session:

1. Update `docs/active-threads.md` in the working repo
2. Write a handoff record to `docs/agent-log/handoffs/` using `templates/handoff-record.json`
3. Document any open escalations in `docs/escalations/`
4. Summarize decisions made and decisions pending

---

*Internal governance document — NeuroLift Technologies | ORG-DEV-OTOI-1.0.3*
