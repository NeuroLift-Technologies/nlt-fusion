# StateTree Behavior Layer on Mass Entities

**Date:** 2026-09-25
**Agent:** STATETREE-001
**Status:** In progress (ST-001)
**Related thread:** docs/active-threads.md → ST-001

---

## Objective

Augment the custom Mass `UNLTScenarioDecisionProcessor` +
`UNLTScenarioMovementProcessor` with a deterministic behavior processor and
StateTree task/condition reference definitions. The legacy processors remain
available behind a flag. Native Mass StateTree execution and authored `.sttree`
assets are follow-up work and are not claimed by this document.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  UNLTScenarioNeedsProcessor                                  │
│  (grows needs: Quiet, Rest, Social, Stimulation)           │
│  NOT replaced — stays as the single need-growth source      │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  UNLTStateTreeBehaviorProcessor  ← NEW (primary)            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ State Machine (TickStateTree)                          ││
│  │                                                         ││
│  │  Idle → EvaluateNeeds → SelectTarget → MoveToTarget    ││
│  │              │                        → FallbackWander  ││
│  │              ↓                              ↓         ││
│  │         (pick needs)           (step toward target)     ││
│  │                                                         ││
│  │  Arrived → (hold N ticks) → Idle                        ││
│  │  Override → (external command, no auto-transitions)      ││
│  └─────────────────────────────────────────────────────────┘│
│  Reads: FNLTScenarioNeedsFragment, FNLTScenarioConfigFragment│
│  Writes: FNLTScenarioBehaviorFragment, FNLTAgentLocationFragment│
│           FNLTAgentIntentFragment, FNLTAgentNeedsFragment    │
│           FNLTStateTreeBehaviorFragment (state tracking)     │
│  Uses: UNLTDemoStateTreeBehavior (data asset definition)      │
│  Uses: UNLTSmartObjectWorldSubsystem (FindLocationsByNeed)   │
│  Uses: NLTDSemoScenario::DeterministicHash (seeded RNG)       │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  UNLTScenarioDecisionProcessor  ← LEGACY (gated)            │
│  Early-outs when FNLTStateTreeBehaviorFragment.bEnabled=true│
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  UNLTScenarioMovementProcessor   ← LEGACY (gated)            │
│  Same early-out when StateTree layer is active               │
└──────────────────────────────────────────────────────────────┘
```

### Planned native StateTree path (not implemented in this change)

```
┌─────────────────────────────────────────────────────────────┐
│  UMassStateTreeProcessor                                    │
│  (provided by MassAIBehavior plugin)                          │
│  Reads .sttree asset using UNLTStateTreeSchema               │
│  Tasks: UNLTStateTreeTask_SelectTarget, UNLTStateTreeTask_   │
│          MoveToTarget, UNLTStateTreeTask_SyncBehaviorFragments│
│          UNLTStateTreeTask_MarkArrived                       │
│  Conditions: UNLTStateTreeCondition_NeedAboveThreshold,      │
│              UNLTStateTreeCondition_MovementPhaseIs,         │
│              UNLTStateTreeCondition_NoTarget                 │
│  Same fragment contract → identical behavior                 │
└─────────────────────────────────────────────────────────────┘
```

## Files

### C++ (UE 5.8)

| File | Role |
|------|------|
| `Public/Agents/NLTStateTreeFragments.h` | `ENLTStateTreeBehaviorState` enum + `FNLTStateTreeBehaviorFragment` / `FNLTStateTreeBehaviorConfigFragment` per-entity fragments |
| `Public/Scenarios/Demo/NLTDemoStateTreeBehavior.h` | `UNLTDemoStateTreeBehavior` data asset — C++ state machine definition (no `.sttree` required) |
| `Private/Scenarios/Demo/NLTDemoStateTreeBehavior.cpp` | Default state configs, lookup helpers |
| `Public/Scenarios/Demo/NLTStateTreeBehaviorProcessor.h` | `UNLTStateTreeBehaviorProcessor` — Mass processor |
| `Private/Scenarios/Demo/NLTStateTreeBehaviorProcessor.cpp` | State machine implementation (TickStateTree, SelectTarget, StepMovement, TransitionTo) |
| `Public/Agents/NLTStateTreeTasks.h` | Custom StateTree tasks: `UNLTStateTreeTask_SelectTarget`, `UNLTStateTreeTask_MoveToTarget`, `UNLTStateTreeTask_SyncBehaviorFragments`, `UNLTStateTreeTask_MarkArrived` |
| `Private/Agents/NLTStateTreeTasks.cpp` | Task implementations |
| `Public/Agents/NLTStateTreeConditions.h` | Custom StateTree conditions: `UNLTStateTreeCondition_NeedAboveThreshold`, `UNLTStateTreeCondition_MovementPhaseIs`, `UNLTStateTreeCondition_NoTarget` |
| `Private/Agents/NLTStateTreeConditions.cpp` | Condition implementations |
| `Public/Agents/NLTStateTreeSchema.h` | `UNLTStateTreeSchema` — defines context data bindings for `.sttree` assets |
| `Private/Agents/NLTStateTreeSchema.cpp` | Schema external-data descriptors |
| `Public/Scenarios/Demo/NLTDemoScenarioUtils.h` | Shared utility functions (sort, need ranking, intent mapping, scoring) |
| `Public/World/NLTStateTreeBehaviorTest.h` | Inline C++ test harness (6 tests) |
| `WorldEngine.cpp` | Module startup — includes all StateTree classes |

### Python (reference)

| File | Role |
|------|------|
| `src/statetree/__init__.py` | Enums, constants, `deterministic_hash`, `FRandomStream` |
| `src/statetree/behavior.py` | `StateTreeBehaviorProcessor` — full state machine port |
| `src/statetree/conditions.py` | Condition functions mirroring C++ conditions |
| `src/statetree/tasks.py` | Task functions mirroring C++ tasks |
| `tests/test_statetree_transitions.py` | 12 transition tests |
| `tests/test_statetree_fallback.py` | 9 fallback/determinism tests |

### Modified existing files

| File | Change |
|------|--------|
| `WorldEngine.Build.cs` | Added `"StateTree"` + `"StateTreeModule"` to deps |
| `Private/Agents/NLTAgentSpawnerSubsystem.cpp` | Spawn entities with `FNLTStateTreeBehaviorFragment` + config |
| `Public/Scenarios/Demo/NLTDemoScenarioProcessors.h` | Added deprecation comments on legacy processors |
| `Private/Scenarios/Demo/NLTDemoScenarioProcessors.cpp` | Legacy processors early-out when StateTree layer active; ordering updated |
| `WorldEngine/WorldEngine.cpp` | Includes new module classes in StartupModule |
| `docs/architecture/unreal-simulation-architecture.md` | §9 open item #2 → "In progress" |

## State Machine

```
                    ┌────────────────────────────────┐
                    │         Idle (initial)         │
                    │  - needs below urgency thresh  │
                    │  - idle re-eval interval ticks │
                    └──────────────┬─────────────────┘
                                   │ need ≥ urgency_reeval_threshold
                                   ▼
                    ┌────────────────────────────────┐
                    │      EvaluateNeeds             │
                    │  - PickHighestNeed            │
                    │  - Write to AgentNeeds        │
                    │  - Set DrivenNeed + Intent      │
                    └──────────────┬─────────────────┘
                                   │ (immediate)
                                   ▼
                    ┌────────────────────────────────┐
                    │       SelectTarget             │
                    │  - FindLocationsByNeed        │
                    │  - Sort: score↓ dist↑ name↑   │
                    │  - Pick best OR fallback      │
                    └──────────────┬─────────────────┘
                     candidates?  │
                   ┌─────────────▼──────┐    ┌──────────────────┐
                   │ MoveToTarget       │    │ FallbackWander   │
                   │  - StepMovement    │    │  - Same movement │
                   │  - Check arrival   │    │  - Seeded wander │
                   └─────────┬──────────┘    └────────┬───────────┘
                             │ arr                │ arr
                             ▼                    ▼
                    ┌────────────────────────────────┐
                    │         Arrived                │
                    │  - Hold for N ticks            │
                    │  - bHasTarget = false          │
                    └──────────────┬─────────────────┘
                                   │ hold_ticks elapsed
                                   ▼
                    ┌────────────────────────────────┐
                    │         Idle (loop)            │
                    └────────────────────────────────┘
```

## Deterministic Guarantees

1. **No wall-clock RNG** — all randomness derives from
   `NLTDemoScenario::DeterministicHash(AgentId, SimulationTick)` → `FRandomStream`.
2. **Fixed timestep** — `TickDeltaSeconds = 1/60`, no `DeltaTime` variance.
3. **Candidate sorting** — `(score desc, distance asc, display_name asc)`.
4. **Need ranking** — highest value; ties broken by enum order
   (Quiet < Rest < Social < Stimulation).
5. **State entry** — `StateTicks` and `StateEnterTick` are reset on every
   transition, giving tests a stable clock.

## Testing

- **C++ inline tests** (`NLTStateTreeBehaviorTest.h`): 6 tests covering
  candidate sorting, need ranking, state configs, intent mapping, transitions.
- **Python reference tests**: 21 tests (12 transition + 9 fallback/determinism).
  Run: `cd _archive\world-engine && python -m unittest discover tests ... -v`
- **Cross-language parity**: Both C++ and Python implement the same algorithm
  with identical enum ordering, sort comparator, and fallback formula. The
  Python `FRandomStream` port mirrors UE's LCG. (Full bit-for-bit RNG parity
  requires running the UE engine to verify FName hash equivalence.)
