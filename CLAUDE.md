# CLAUDE.md — nlt-world-engine

You are working in the **NLT World Engine** — the authoritative simulation environment where AI Avatars (with ADHD traits) and AI Aides live, perceive, act, and learn.

**The Vision** — NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios. An AI habitat — a virtual world where AI agents live, perceive, act, and learn. The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; the world engine owns physical reality.**
>
> The physical substrate is Godot 4.7.2 (C#). The engine is an implementation detail of the physical layer and may change by Joshua's decision under OTOI §4.4; the boundary between Fusion and the world engine does not.

> **Engine migration in progress (thread `MIGRATE-001`).** The authoritative simulation is moving from UE 5.8 to Godot 4.7.2. UE is a **frozen behavioural oracle** until the port passes conformance; do not change UE simulation behaviour. Read `world-engine-godot/MIGRATION-PLAN.md` before touching anything that spans the two.

**Mandatory reading (in order):**
1. `NLT-DEV-OTOI.md` — Org-level governance contract (this repo, root level)
2. `README.md` — Full project documentation
3. `ARCHITECTURE.md` — UE 5.8 subsystem reference (see migration banner)
4. `docs/active-threads.md` — Current work state (this repo, if present)

**Non-negotiable:** Joshua W. Dorsey, Sr. is final authority on all architectural, deployment, UX, and strategic decisions. Escalate. Do not guess.

**Governed by:** Solidarity Framework | HAIEF | https://elevaitionfoundation.org
**OTOI Version:** ORG-DEV-OTOI-1.0.3
