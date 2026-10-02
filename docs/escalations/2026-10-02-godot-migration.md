# Escalation Record — UE 5.8 → Godot 4.7.2 engine migration

**Date:** 2026-10-02T07:00:00Z
**Agent:** Kilo (Kilo CLI)
**Session:** `fix/hash-v2-double-precision`
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** high

---

### Trigger

OTOI §4.4 — *"No architecture decisions (database, deployment, framework choices) without Joshua's approval."*

Replacing Unreal Engine 5.8 with Godot 4.7.2 as the authoritative simulation engine is a framework change at the root of the repository. It also contradicts the standing core principle recorded in `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `README.md` and `DEPLOYMENT.md`: *"Fusion owns semantic reality; Unreal owns physical reality."* A related contradiction already existed in-repo: `docs/world-engine/DESIGN.md:15` argued explicitly *against* Godot.

---

### Situation

`WorldEngine/` is a UE 5.8 C++ module of 129 files / ~20,700 LOC with 44 public and 8 private module dependencies and 32 plugins enabled. It is the authoritative simulation and the product's training environment (`README.md:9`).

Recon established that the migration is smaller than the LOC suggests in three areas — Mass Entity movement is unused (agents step closed-form toward `TargetPosition`), no `.sttree` assets exist (the live behaviour path is a C++ state machine), and a genuinely portable deterministic core already exists (`FNLTRandomStream`, canonical state text, replay codec, noise/biome library, `contracts/v1` schemas, 256-slot/30-type event bus).

Two subsystems have no Godot equivalent and drove the decisions: RL training (`ULearningAgentsPPOTrainer` over POSIX shared memory, never verified end-to-end — `TRAIN-002` open) and the HTTP/WebSocket control surface (`FHttpServerModule` on port 8765, 7 routes; `IWebSocketNetworkingModule` on 8766). Godot ships no server.

A Godot 4.7.2 C# project already existed at `world-engine-godot/` (~758 LOC, procedural rendering only — no agents, ECS, determinism, protocol, or governance) and was tracked in git.

**No CI safety net exists.** No workflow builds UE, runs UE tests, tests Python, or builds Godot; the single workflow that ever compiled product code (`world-engine-v2-build.yml`) is dead because its path filter points at `world-engine-v2/**`, which moved to `_archive/`. Governance validation is healthy (`validate` green on every PR).

---

### Decision Required

Whether to migrate the authoritative engine from UE 5.8 to Godot, and on what terms.

---

### Options Considered

1. **Staged migration with a validated port** *(selected)*
   - Extract the deterministic core as an engine-agnostic .NET class library with zero Godot dependency, prove it against golden fixtures captured from UE, then build the Godot presentation shell on top and retire UE only after conformance passes.
   - Trade-offs: longer before anything is demoable; UE stays alive as an oracle for longer. Buys a mechanical correctness gate on a rewrite that currently has no tests.

2. **Full cutover**
   - Move `world-engine-godot/` straight to the authoritative path and archive UE sources.
   - Trade-offs: single codebase fastest; but no reference to diff against, no CI gate, and ~20,700 LOC of untested rewrite.

3. **Godot as renderer only**
   - Keep the UE simulation authoritative; replace only render and viewer.
   - Trade-offs: smallest change; sidesteps determinism and RL entirely. Does not deliver the stated migration intent.

---

### Recommendation

Option 1. The decisive factor is that **no automated test protects the behaviour being rewritten**, and UE's own automation coverage (7/7 `NLT.Simulation`, 4/4 `NLT.VisualLOD.Policy`) is the only oracle available. A four-tier gate (core unit tests → golden vectors → protocol conformance → headless run) turns the rewrite from an act of faith into a sequence of checkable steps, and keeps UE authoritative until the evidence exists.

Supporting decisions recorded below.

---

### Resolution

**Date resolved:** 2026-10-02
**Decision:** Approved. Migrate to Godot 4.7.2 under Option 1, with the following settled terms:

| # | Decision |
|---|---|
| 1 | **Staged** — Godot becomes authoritative only after a validated port; UE remains the behavioural oracle until Tier 2 conformance passes |
| 2 | **C# / .NET 8**, continuing `world-engine-godot/`, with the deterministic core as a plain `net8.0` class library and zero Godot references |
| 3 | **RL split** — training-environment surfaces (`Observe`/`Reward`/`IsComplete`/`Reset`) are in scope; the PPO trainer and `RLPolicyController` are deferred to Phase D1 as out-of-process Python |
| 4 | **Python sidecar owns 8765 + 8766**, proxying to Godot over internal IPC, preserving the frozen `nlt.fusion-unreal` 1.0 contract |
| 5 | **Four interior scenarios rebuilt procedurally** as instanced sub-scenes; outdoor world stays procedural |
| 6 | **Governance in-process** via an `asfdk-csharp` .NET reference (retargeted to `net8.0`, PR [#2](https://github.com/NeuroLift-Technologies/asfdk-csharp/pull/2)) |
| 7 | **Four-tier validation** gate |

Additional approval recorded in-session: **character embodiment is in scope** (articulated bodies, walk cycles, name labels) per `README.md:7`.

**Decided by:** Joshua W. Dorsey, Sr. (in session, 2026-10-02)

**Actions taken:**
- Plan authored at `.kilo/plans/1790898229735-ue-to-godot-migration-plan.md`, mirrored at `world-engine-godot/MIGRATION-PLAN.md`
- Thread `MIGRATE-001` registered in `docs/active-threads.md`
- Core-principle amendment raised as a `governance-proposal` issue (see §7 of the plan)
- `docs/world-engine/DESIGN.md:15` and `:84` flagged for reversal — they argue against this migration

---

### Outstanding

- **`asfdk-csharp` API is pre-1.0** (v0.3.0, single merged PR). Pin the commit and keep the seam behind `IGovernanceGate`.
- **`addons/godot_ai/`** is a third-party MCP bridge (MIT) added outside any thread record. OTOI §4.4 external-integration approval is unrecorded; it bootstraps a Python server via `uv`, and its C#/mono compatibility is unverified.
- **Three README claims are unmet and unmet in UE** — agent↔agent interaction, NPCs, realistic graphics. Named as gaps; not in migration scope.
- **`LevelReference` on `UScenarioDataAsset` is dead** — all 13 bindings resolve but nothing reads the field.