# Escalation Record — UE 5.8 cannot produce a live golden fixture (SIM-001)

**Date:** 2026-10-02T09:15:00Z
**Agent:** Cline (Cline CLI)
**Session:** `fix/scenario-movement-fragment-view`, `kilo/phase1-nondegeneracy`
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** high

---

### Trigger

Migration plan items **1.5** (commit golden fixtures) and **1.7b** (prove the non-degeneracy assertion) are blocked by a defect that cannot be fixed inside the constraints the plan sets.

Plan §10: *"Do not change any UE simulation behavior after Phase 1.6 — UE is a frozen oracle."* The blocker requires wiring up UE's Mass Entity system, which changes what the oracle **does**, not merely whether it crashes. Unlike the two crash fixes landed alongside this record, there is no defensible reading of this as in-bounds.

This is an architecture/validation decision, not a code change: it determines whether **Tier 2 conformance can be satisfied at all**.

---

### Situation

Working toward Phase 1 golden fixtures for the UE → Godot 4.7.2 migration (`MIGRATE-001`). Three pre-existing defects were found and fixed, each of which had independently prevented any capture from completing:

| Defect | Location | Effect |
|---|---|---|
| Fragment view read before the query binds it | `NLTDemoScenarioProcessors.cpp:247` | Asserted on **every** scenario start; no PIE capture could run |
| `EndCapture` no-ops at the tick cap | `NLTFixtureEmitterSubsystem.cpp:65` | 600 ticks collected in memory, **zero files written** |
| Capture test required a human to press Play | `NLTFixtureCapturePIETests.cpp` | `No PIE world available`; capture only ever run manually |

The first originates from `d590bcb` (2026-09-25, "add StateTree behavior and Fusion protocol reference"). The processor declared `FNLTStateTreeBehaviorFragment` in `ConfigureQueries` but read it in `Execute()` *before* `ForEachEntityChunk` binds views:

```
Assertion failed: View [MassExecutionContext.h:644]
Requested fragment type not bound, type NLTStateTreeBehaviorFragment.
  UNLTScenarioMovementProcessor::Execute() [NLTDemoScenarioProcessors.cpp:247]
```

With all three fixed, the capture now runs end-to-end and writes all six files (600 ticks, ~1 MB of canonical state). **The 1.7 assertion then correctly reports the capture is degenerate:**

```
- **Verdict:** FAIL
- **Ticks captured:** 600
- **Canonical text varies:** no
- **Event stream non-empty:** no (0 tick(s) with events)
- **Agents move:** no
```

Direct inspection confirms 600 tick blocks containing **1 unique** block. The 10 agents exist with valid double-precision positions, but `SimulationTick=0`, `WorldTime=0`, and every position is byte-identical at ticks 0, 300 and 599.

**Root cause:** Mass never ticks. The log is explicit:

```
LogNLTAgentSpawner: Warning: DespawnAllAgents: MassEntity not initialized; clearing 0 entity handles
```

Agents are spawned, but the Mass entity system is not initialized, so no processor runs. This is the pre-existing finding already recorded as **SIM-001** in `docs/active-threads.md` — *"the authoritative clock is disconnected and processors unregistered"* — which the plan defers to Phase 6.6.

### Decision Required

1. **May UE simulation behavior be changed to make Mass tick**, as a recorded, scoped exception to the Phase 1.6 freeze — solely to produce golden fixtures? If yes, what is the acceptable scope?
2. **If the freeze holds, how is the Godot port validated?** Tier 2 cannot be satisfied against a live capture. Should validation fall back to:
   - hand-authored golden vectors (weaker: the port and the vectors could share a mistaken assumption), or
   - UE's existing headless self-test output (`BeginHeadlessSelfTest` / `NLT_HEADLESS_TEST_COMPLETE`), which exercises a different and smaller code path?
3. **Should the plan's §6 risk row be corrected** from a build-availability risk to a simulation-correctness risk?

---

### Options Considered

1. **Scoped, recorded exception to the freeze — fix SIM-001 now**
   - Description: Wire up Mass initialization / clock / processor registration so UE actually steps, capture golden fixtures, then re-freeze.
   - Trade-offs: Unblocks Tier 2 and keeps the migration's stated validation model intact. Requires changing UE simulation behavior, which is precisely what the freeze forbids, and the resulting "oracle" is one whose behavior has just been authored rather than merely observed — weakening its authority as a neutral reference. Also risks the §6 *High* build risk materialising during the work. Phase 6.6 currently owns this work on the Godot side, so it may be double effort.

2. **Hold the freeze; accept that Tier 2 cannot be satisfied** *(agent recommendation)*
   - Description: Land the three crash fixes, which are strictly unblocking and carry no behavioural risk, and proceed with hand-authored or headless-derived golden vectors. Revisit Tier 2 once the Godot core exists and Phase 6.6 fixes SIM-001 there.
   - Trade-offs: Honest about what is actually verified. Cost: the strongest guarantee in the plan is unavailable, so "validated" means something weaker, and decision 7 should be amended to say so. Risk of the two implementations agreeing on a shared wrong assumption.

3. **Defer Phase 1 sign-off entirely**
   - Description: Leave 1.5 and 1.7b open, continue Phase 2 porting, revisit when SIM-001 is addressed.
   - Trade-offs: Preserves the freeze and avoids a rushed UE change. But the plan's own §6 rates fixture capture **time-sensitive**, and the crash fixes already performed are stranded work that cannot be validated without a capture.

---

### Recommendation

Option 2 — hold the freeze, land the crash fixes, and amend decision 7 to state plainly that Tier 2 is unavailable and what replaces it.

The reasoning: the three crash fixes are safe and necessary under any option, because UE cannot run a scenario at all without them. But the Mass wiring is different in kind. It changes what the simulation does, and it would do so in the same commit sequence that then judges the port against the result — which is the specific circularity the freeze exists to prevent. The freeze's purpose is that the oracle is *observed*, not *authored*; making it tick immediately before trusting its output undermines that.

Option 1 remains legitimate if Tier 2 is judged non-negotiable — but it should then be a deliberate, separately-approved act with its own record, not an expedient to unblock a capture.

I also recommend correcting the §6 risk row regardless of which option is chosen: the binding risk is not that UE stops building.

---

### Blockers

- **Plan 1.5** — cannot commit golden fixtures; the only captures producible are degenerate.
- **Plan 1.7b** — cannot be signed off; the assertion runs and correctly reports FAIL, but a failing assertion cannot close the item.
- **Plan 1.6 / Phase 1 sign-off** — remains open; `MIGRATE-001` must not close.
- **Plan 6.4 (Tier 2 gate)** and the retirement of UE — blocked on the validation-model decision.
- **Plan 2.9** (scenario data extraction) and Phase 5 — proceed, but any behaviour-preserving extraction is only as trustworthy as the oracle, which is the thing in question.

---

### Resolution

*(To be filled in after Joshua responds)*

**Date resolved:** [ISO 8601]
**Decision:** [What was decided]
**Decided by:** [Name]
**Actions taken:** [What was done as a result]
