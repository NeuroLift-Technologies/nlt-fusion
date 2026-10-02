# Golden Fixtures — UE 5.8 → Godot 4.7.2 (plan item 1.5)

Reference vectors captured from the UE 5.8 oracle, to be reproduced by
`NltWorldEngine.Core` under the Tier 2 conformance gate.

> ## ⚠️ NOT YET TRUSTWORTHY AS GOLDEN VECTORS
>
> **The UE oracle is not deterministic run-to-run.** Re-running the identical
> command (same seed, same commit, same switches) produces different bytes:
>
> ```
> first differing tick: 59
> ticks 0–58:  identical
> ticks differing: 1941 of 2000
> ```
>
> Divergence begins immediately before `DecisionIntervalTicks = 60`, i.e. the
> first decision, and never re-converges. `DecideTarget`'s wander fallback is
> itself deterministic — it seeds on `(AgentId, SimulationTick)` — so the
> nondeterminism is not the RNG. The likely cause is an ordering race: Mass
> processors tick separately from `ANLTDemoGameMode::Tick`, which drives both
> `Sim->StepTick()` and `CaptureTick()`, so whether the capture reads an agent's
> position *after* the movement processor stepped it is not pinned.
>
> **Consequence:** these vectors must not be wired into Tier 2 yet. Measuring a
> Godot divergence against a nondeterministic baseline is meaningless, and a real
> divergence in the port would be indistinguishable from one in the oracle.
>
> Committed because the provenance chain, the scenario selection and the
> non-degeneracy evidence are all real work worth preserving, and because this
> finding should be visible in the tree rather than in a chat log. The
> determinism gate itself is the missing piece — see the plan's item 1.7b.

## What is here

Four scenario captures, **one per scenario category**, all at seed **42**, 2,000 ticks each.

| Directory | Category | Scenario asset | Unique tick blocks |
|---|---|---|---|
| `seed42_wp_1/` | Workplace | `Wor_wp_1` | 2000 / 2000 |
| `seed42_pers_1/` | Personal | `Per_pers_1` | 2000 / 2000 |
| `seed42_soc_1/` | Social | `Soc_soc_1` | 2000 / 2000 |
| `seed42_acad_1/` | Academic | `Aca_acad_1` | 2000 / 2000 |

Each directory contains `PROVENANCE.md` (build, commit, seed, tick count,
capture context and verbatim command line — all machine-generated at capture
time) plus the per-tick series:

| File | Contents |
|---|---|
| `canonical_state_v2.txt` | Per-tick canonical state, v2 bit-exact IEEE-754 hex |
| `rng_state.txt` | Per-tick RNG state (`initialSeed;seed;calls`) |
| `event_stream.txt` | Per-tick ordered event stream — **currently empty, see below** |
| `state_hash.txt` | Per-tick BLAKE3 digest of the canonical state |
| `final_state.txt` | Final state summary |

Total ≈ 13.8 MB, all four together.

## Provenance

All four were captured from a single build:

- **UE** 5.8.3, changelist 58210709, WindowsEditor, Development
- **Source commit** `a0f3c3ac150bd33da5e798876b7cdced218f6974`
- **Context** Play-In-Editor, headless + unattended, world `OpenWorld_Level`

Reproduce with (per scenario, substituting the name):

```
UnrealEditor-Cmd.exe <repo>/WorldEngine/WorldEngine.uproject \
  -ExecCmds="Automation RunTests NLT.FixtureCapture.PIE" \
  -NltFixtureTicks=2000 -NltFixtureSeed=42 -NltFixtureAgents=10 \
  -NltFixtureScenario=Wor_wp_1 \
  -NltFixtureCommit=<sha> \
  -testexit="Automation Test Queue Empty" \
  -unattended -nullrhi -nopause -nosplash -stdout -FullStdOutLogOutput
```

The test starts its own PIE session, so no manual Play step is needed.

## ⚠️ Read this before treating these as trusted

Every capture currently reports **`Verdict: FAIL`**, on exactly one of the four
item 1.7 signals:

```
- Canonical text varies: yes
- Agents move:            yes
- Event stream non-empty: no  (0 ticks with events)
```

The captures are **live** — the simulation ran, the clock advanced, and agents
moved and re-decided — and the position trace confirms it. But the event stream
is empty because **the producer chain is never driven.**

`UNLTEventBus` does have writers: `UNLTWorkplaceEnvironmentSubsystem` raises
`EnvLightingChanged`, `EnvRoomStateChanged` (`RefreshRooms`) and
`EnvTimeOfDayChanged`, `EnvLightingChanged` (`PublishTimeOfDay`). None of it
runs. The chain is:

- `UNLTSimulationClockSubsystem::AdvanceTick()` is the only broadcaster of
  `OnAuthoritativeTick`.
- Its **only** caller is `UNLTWorkplaceEnvironmentSubsystem::StepEnvironmentSimulation`.
- `StepEnvironmentSimulation` has **zero** call sites. Its own header documents
  *"Each frame while running, call `StepEnvironmentSimulation(1)`"* — no game
  mode does.

So the workplace subsystem never ticks, and the stream stays empty. This is the
**same defect class as SIM-001** — documented behaviour that is not wired up —
so it belongs inside the 1.6 carve-out rather than being scoped as new
behaviour. Corrected 2026-10-02; this file previously claimed the ring buffer
had "zero writers", which was wrong and came from a grep that missed
`RaiseEnvironmentEvent`.

Two consequences:

1. **These vectors are usable for Tier 2 state comparison but not yet for event
   comparison**, and they do not exercise the coverage criteria in plan item 1.3
   — stressor fired, needs saturation, Aide intervention, completion transition —
   because those are exactly the things that would flow through the event bus.
2. Per plan item 1.7b, treat any fixture as untrusted until the event signal is
   green or that gate is deliberately amended.

`Verdict: FAIL` here is the assertion working, not a broken capture. The
non-degeneracy check is what makes this legible instead of a silent bad vector.