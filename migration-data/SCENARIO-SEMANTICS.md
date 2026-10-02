# Scenario semantics — what UE actually does with a `UScenarioDataAsset`

**Scope:** how a scenario asset influences simulation behaviour. Companion to
`migration-data/ue-scenarios.v1.json` (plan item 2.9).

**Read this before porting.** Nine of the twelve properties have no C++ reader at
all. Porting them as though they all drive behaviour would invent semantics that do
not exist, and would make the Godot scenarios look scenario-aware when UE's are not.

Every claim below is anchored to a file:line. Verified 2026-10-02 against
`fix/sim-001-mass-ticking`.

---

## 1. Field-by-field: consumed vs decorative

| Field | C++ reader? | Where | Effect |
|---|---|---|---|
| `Aversiveness` | **yes** | `NLTScenarioManagerSubsystem.cpp:32,118,176` | need-growth multiplier + soundscape stress |
| `CognitiveDemand` | **yes** | `NLTScenarioManagerSubsystem.cpp:33,118,176` | need-growth multiplier + soundscape stress |
| `ScenarioId` | **yes** | `NLTScenarioManagerSubsystem.cpp:100` | seeds environment variation |
| `Category` | no | — | not read by simulation code; used only by capture/fixture tooling |
| `DurationMinutes` | no | — | inert |
| `Complexity` | no | — | inert |
| `BaseSuccessRate` | no | — | unread by UE — **but consumed by Fusion's orchestrator** (`RENDERER-PLAN.md` §9), so live across the repo boundary |
| `bRequiresSustainedFocus` | no | — | inert |
| `ContextParams` | no | — | inert — despite carrying per-scenario detail (`email_count`, `word_count`, `anxiety_level`, …) |
| `LevelReference` | no | — | inert in C++; validated only by `Scripts/verify_bindings.py` |
| `DisplayName` | no | — | cosmetic metadata |
| `Description` | no | — | cosmetic metadata |

**3 of 12 properties reach the simulation; 9 have no C++ reader.** Verified by
repo-wide search (`git grep -w`) across `.cpp/.h/.py/.cs`: `DurationMinutes`,
`Complexity`, `BaseSuccessRate`, `bRequiresSustainedFocus`, `ContextParams` and
`LevelReference` appear **only** in `create_scenario_assets.py` / `phase6_*.py` /
`verify_bindings.py` and the class header — never in a `.cpp` that runs the
simulation. That accounts for six. `DisplayName` and `Description` are UI metadata
and `Category` is read only by tooling, which makes the remaining three.

> **Do not "fix" this.** Six UE-unread data fields is a real design gap — the data
> looks scenario-specific but only three values reach UE's simulation — but wiring
> them up would be *new behaviour*. Record it, do not implement it in UE. See §4 for
> why this is now moot: the C# port that was to consume them was withdrawn.

---

## 2. The needs/stressor math (the only behavioural path)

Two fields feed exactly one derived value.

### 2.1 Need-growth multiplier

`NLTScenarioManagerSubsystem.cpp:26-34`:

```cpp
float ScenarioGrowthMultiplier(const UScenarioDataAsset* Scenario)
{
    if (!Scenario) { return 1.0f; }
    return 1.0f + FMath::Clamp(Scenario->Aversiveness, 0.0f, 1.0f) * 0.5f
               + FMath::Clamp(Scenario->CognitiveDemand, 0.0f, 1.0f) * 0.5f;
}
```

Range: **1.0 → 2.0**. Both terms are required; dropping the `CognitiveDemand` term
understates need growth whenever cognitive demand is non-zero.

Applied **once, at spawn**, not per tick:
`StartScenarioWithAsset` → `StartScenarioInternal` → `Spawner->SetNeedGrowthMultiplier(...)`
(`NLTScenarioManagerSubsystem.cpp:73,89`) → written into each agent's
`FNLTScenarioConfigFragment::NeedGrowthMultiplier` (`NLTAgentSpawnerSubsystem.cpp:82`).

The clamp is redundant for current data (all values are already 0–1) but must be
preserved — it is what keeps a future out-of-range asset from breaking the port.

### 2.2 Per-tick need growth

`UNLTScenarioNeedsProcessor::Execute` (`NLTDemoScenarioProcessors.cpp:102-121`):

```
ScaledStep = TickDeltaSeconds * NeedGrowthMultiplier      // (1/60) * M
Quiet       = ClampNeed(Quiet       + 0.060 * ScaledStep)
Rest        = ClampNeed(Rest        + 0.030 * ScaledStep)
Social      = ClampNeed(Social      + 0.045 * ScaledStep)
Stimulation = ClampNeed(Stimulation + 0.050 * ScaledStep)
```

Constants (`NLTDemoScenarioFragments.h:101-107`), all `constexpr float`:

| Constant | Value |
|---|---|
| `TickDeltaSeconds` | `1.0f / 60.0f` |
| `QuietGrowthPerSecond` | `0.060f` |
| `RestGrowthPerSecond` | `0.030f` |
| `SocialGrowthPerSecond` | `0.045f` |
| `StimulationGrowthPerSecond` | `0.050f` |

**These are `float`, not `double`.** All four growth constants and the per-tick
arithmetic run in single precision. Port to C# `float` — using `double` changes
results in the low bits and will show up as a state-text mismatch. This is the same
class of issue as plan item 1.9, where a `double` had silently truncated to `float`.

`ClampNeed` (`:110`) clamps to the need range — read it from the header when porting;
it is the only place the 0–1 bound is enforced.

### 2.3 Soundscape stress (audio only — does not reach agents)

At scenario start (`NLTScenarioManagerSubsystem.cpp:118`):

```
InitialStress = Aversiveness * 0.5f + CognitiveDemand * 0.5f    // 0.0 -> 1.0, default 0.3
```

Every manager tick (`NLTScenarioManagerSubsystem.cpp:176-178`):

```
BaseStress  = (Aversiveness + CognitiveDemand) * 0.5f
TimeStress  = Clamp(ScenarioTick / 3600.0f, 0.0f, 0.3f)
SetStressLevel(BaseStress + TimeStress)
```

`TimeStress` ramps 0 → 0.3 over 3600 manager ticks and then clamps. **Audio only** —
this drives `UNLTSoundscapeSubsystem`, not agent state. Do not port it into the
deterministic core; it is not observable in the canonical state text.

### 2.4 Environment variation

`ScenarioId` seeds `UNLTEnvironmentVariationSubsystem::ApplyEnvironmentVariation`
(`NLTScenarioManagerSubsystem.cpp:100-101`) via
`GenerateEnvironmentVariation(ScenarioId, RunSeed)` (`NLTEnvironmentVariation.cpp:115-117`).
Seeded from `(ScenarioId, RunSeed)`, so the same scenario + seed always dresses the
environment identically. Cosmetic dressing only.

---

## 3. Ordering vs processors — what is load-bearing

All three demo processors declare `ExecuteInGroup = TEXT("Tasks")`, so Mass does not
order them by declaration order. The edges are explicit:

| Processor | Declaration | Line |
|---|---|---|
| `UNLTScenarioNeedsProcessor` | `ExecuteInGroup = "Tasks"` (no edges) | `:91` |
| `UNLTScenarioDecisionProcessor` | `ExecuteAfter NLTScenarioNeedsProcessor`, `ExecuteAfter NLTStateTreeBehaviorProcessor` | `:130-134` |
| `UNLTScenarioMovementProcessor` | `ExecuteAfter NLTStateTreeBehaviorProcessor`, `ExecuteAfter NLTScenarioDecisionProcessor` | `:227-229` |

**Needs → Decision → Movement is load-bearing and must be reproduced verbatim** (plan
6.3 already says so). The `ExecuteAfter NLTStateTreeBehaviorProcessor` edges exist so
StateTree-managed entities are not also driven by the legacy path — and with **0
`.sttree` assets** in `Content/`, `NLTStateTreeBehaviorProcessor` currently processes
nothing. Those edges are therefore inert today but must still be expressed in the
port, or the ordering becomes accidentally correct rather than deliberately correct.

**Threading is part of the contract:**

- Needs: `bRequiresGameThreadExecution = false` (`:92`)
- Decision: `bRequiresGameThreadExecution = true` — "reads world subsystem state" (`:135`)
- Movement: declared at `:227`

So within one tick the sim crosses threads. Any port that assumes a single-threaded
deterministic system list must reproduce the *observable* order, not the threading.

### 3.1 Ordering vs the manager tick — the known nondeterminism

`TickScenarioManager` (`NLTScenarioManagerSubsystem.cpp:155-186`) runs, per call:

1. `Sim->StepTick()` (line 170) — drives the Mass processors
2. `ScenarioTick++`
3. soundscape stress + `TickSoundscape(DeltaTime)`
4. `FixtureEmitter->CaptureTick()` (line 185)

The capture read happens **after** `StepTick` *within the same manager tick*, but
`ANLTDemoGameMode::Tick` is what invokes `TickScenarioManager`, and Mass phases run
from their own tick. That interleave is the documented source of the **tick-59
divergence**. The capture read point was never pinned to a deterministic point in the
Mass pipeline.

Historical note: this mattered under the withdrawn plan, where the committed
fixtures gated Tier 2. Under `RENDERER-PLAN.md` the fixtures are retired, so the
nondeterminism no longer blocks anything — it is recorded here only as a fact about
UE.

---

## 4. What this means now — the port target was withdrawn

**This document was written against a target that no longer exists.**
`world-engine-godot/RENDERER-PLAN.md` §1 withdraws the C# port: *"That scope is
withdrawn."* Godot is a **renderer + spectator**, not a simulation; Fusion's Python
owns the simulation, and determinism/replay/golden fixtures are out of scope.

So there is **no `Scenarios.cs`**, and the earlier porting guidance is void. What
survives is the factual record:

1. **The extracted data is still accurate.** `ue-scenarios.v1.json` describes what
   UE actually holds. It remains useful as scenario *content* if Fusion or the
   renderer needs the 13 scenarios — but the consumer is now Fusion, not a C# port.
2. **The field-consumption analysis is still true and still useful.** It is a fact
   about the UE codebase, independent of who consumes it.
3. **`BaseSuccessRate` is not "inert" in practice.** `RENDERER-PLAN.md` §9 records
   that it *"is consumed by Fusion's orchestrator but has zero C++ readers in UE."*
   The zero-reader finding holds; "inert" was the wrong word, because the field is
   live across the repo boundary. Treat it as **cross-repo live, UE-unread** —
   the same category as the other fields, but with a real consumer.
4. **Do not port anything.** Nothing here is a spec for C# or for Godot. If the
   renderer needs needs-driven targeting, `RENDERER-PLAN.md` C.3 has it — and see
   the caveat below.

### Caveat on `RENDERER-PLAN.md` C.3 — it says five needs; UE has four

C.3's affordance table lists five needs and calls `Privacy` *"distinct from `Rest`
and gates at a stricter threshold."* In UE that is only half true:

- `ENLTAgentNeed` (`NLTFusionCore.h:55-65`) declares `Quiet`, `Rest`, `Social`,
  `Stimulation`, **`Food`**, **`Movement`**, `Privacy` — seven.
- `FNLTScenarioNeedsFragment` (`NLTDemoScenarioFragments.h:15-27`) carries state for
  only **four**: `Quiet`, `Rest`, `Social`, `Stimulation`.
- `UNLTScenarioNeedsProcessor` grows only those four (§2.2 above).
- `NLTSmartObjectWorldSubsystem` still has match/score branches for `Privacy`
  (`:129-130`, `:152-153`) — **unreachable**, because nothing ever sets a `Privacy`
  need value. `Food` and `Movement` are likewise state-less.

So if C.3 ports the UE model as written, the `Privacy` axis can never fire, and
C.4's *"watching an Avatar deliberately walk to the quiet corner"* would only
demonstrate `Quiet`. Whether `Privacy` exists at all now depends on **Fusion's**
schema, not UE's. Worth resolving before C.3 is implemented.

---

## 5. Provenance notes

- **Lineage: these scenarios are ports from `neurolift-ai-fusion`.** Fusion is the
  original source. `WorldEngine/docs/SCENARIO_PLAN.md:5` states the task verbatim:
  *"Port the 13 scenarios from `neurolift-ai-fusion-org` to UE 5.8 scenario levels."*
  `UScenarioDataAsset.h:29` names the origin
  (`neurolift-ai-fusion-org/src/simulation/environment/scenarios.py`), and
  `create_scenario_assets.py:1` says it *"mirrors scenarios.py"*.

  ```
  Fusion scenarios.py          <- AUTHORITATIVE (per RENDERER-PLAN.md section 2)
        |  create_scenario_assets.py  (manual transcription, see below)
        v
  UE .uasset x 13
        |  extract_scenario_data.py  (this work)
        v
  migration-data/ue-scenarios.v1.json   <- THIRD-generation copy
  ```

  So `ue-scenarios.v1.json` is **not authoritative**. It records what UE holds, and
  UE is now historical reference. It is useful for reconciling against Fusion, not
  as a definition of anything.

- **The transcription is manual, so drift is unguarded.** `create_scenario_assets.py`
  hardcodes 13 literal rows rather than importing them from Fusion. Nothing syncs the
  two sides, and now that UE is historical nothing ever will. If Fusion's
  `scenarios.py` has changed since the port, the UE copies are silently stale.

- **The lineage is already broken: two writers, and the committed one did not produce
  what is on disk.** Every asset reads `"Auto-generated scenario: <DisplayName>"`, but
  `create_scenario_assets.py` supplies specific text (e.g.
  `"Study for exam (2 hours focused study)"`). All 13 differ, while every other field
  matches the committed generator exactly. A second, later writer produced the current
  assets. **Which of the two was faithful to Fusion cannot be determined from this
  repo** — `neurolift-ai-fusion` is not available locally.
  `tools/verify_scenario_extraction.py` asserts the numeric agreement and reports the
  description divergence; it cannot resolve which writer is correct.

- **Cross-repo naming, and a known gap.** `verify_bindings.py:155` maps UE's
  camelCase `baseSuccessRate` onto Fusion's snake_case `base_success_rate`.
  `RENDERER-PLAN.md` section 9 adds that `base_success_rate` *"is consumed by Fusion's
  orchestrator but has zero C++ readers in UE, and `task_type` exists in neither
  schema."*

- **`ScenarioId` values are short codes** (`wp_1`, `pers_1`, ...), **not** the
  `"workplace_deadline"` / `"social_networking"` examples in the class doc comment
  (`UScenarioDataAsset.h:38`). The comment is wrong; do not derive the schema from it.
  These short codes are UE-local identifiers and are unlikely to match Fusion's own
  scenario ids, so do not treat `scenarioId` as a cross-repo join key without
  confirming it.

- **`verify_bindings.py` is stale** — it hardcodes `Wor_EmailProcessing`-style names,
  but the assets are `Wor_wp_1` ... `Wor_wp_5`. The extractor discovers assets by
  walking `/Game/Scenarios` specifically to avoid inheriting that.

---

## 6. Reproducing the extraction

```
UnrealEditor-Cmd.exe <abs path>\WorldEngine\WorldEngine.uproject ^
  -nullrhi -unattended -nosplash -run=PythonScriptCommandlet ^
  -Script=<abs path>\WorldEngine\Scripts\extract_scenario_data.py

python tools\verify_scenario_extraction.py
```

Both paths must be **absolute** — `UnrealEditor-Cmd` rejects a relative `.uproject`
("Could not find a valid project file"), and `unreal.Paths.project_dir()` returns a
*relative* path, so the extractor calls `convert_relative_path_to_full` before joining.

The extractor fails loudly rather than silently if `UScenarioDataAsset.h` gains a
`UPROPERTY` that `PROPERTY_NAMES` does not cover, and refuses to publish the
versioned JSON when asset discovery is incomplete. That guard exists because UE 5.8's
Python `Class` exposes **no** property enumeration (`get_properties()` does not exist;
`getattr(cls, "ScenarioId")` returns `None`), so the header is the only reachable
source of truth for the field list.