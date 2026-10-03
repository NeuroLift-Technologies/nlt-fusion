# State-feed fixtures

Static JSON standing in for Fusion's Python, so the whole renderer chain works before the bridge
exists (RENDERER-PLAN.md A.5). Nothing here is simulation output: no policy has produced these
documents. Every frame is a complete, individually valid `nlt.state-feed.v1` document, authored to
exercise a specific part of the observer.

| File | What it is | Reaches which D.5 reading |
|---|---|---|
| `state-feed.sample.json` | One snapshot, tick 1187. The Phase A contract's reference document. | — |
| `replay/stayalert-day.json` | 60 frames, ticks 600–1187. A working morning: drifting → a burnout the Aide rescues → a second burnout the Avatar handles alone. | **Self-recovered** ("the goal") |
| `replay/collapse-only.json` | 10 frames, ticks 200–380. Three unresolved episodes, no fusion. | **Collapsed repeatedly** |
| `replay/rescue-only.json` | 6 frames, ticks 420–500. One episode, recovered by the RRT core. | **Needed rescue** |

The two remaining readings — **never approached burnout** and **approached, self-recovered** — are
reached by any early frame of `stayalert-day.json` (before tick 861 there are no episodes at all) and
by its final frame respectively. Scrubbing the timeline is how you see that.

## The two fixtures describe one history

`stayalert-day.json`'s **final frame is content-equivalent to `state-feed.sample.json`**: same tick,
same scene, same two burnout episodes, same three self-recognitions, same five events, same gate
scores. `tools/make_replay_fixture.py` asserts this on every run and fails if they drift, because two
committed fixtures quietly disagreeing is a lie nobody would notice.

## Regenerating

```
python3 tools/make_replay_fixture.py           # rewrite all three bundles
python3 tools/make_replay_fixture.py --check   # fail if the committed files are stale
```

The tool expands an authored storyboard — keyframed states plus an event list — into full frames. It
is authoring-time only; the renderer never derives anything, it reads documents that already exist.
Every emitted frame is validated against the contract before it is written, so a fixture cannot
quietly become invalid.

`--check` reuses the committed generation timestamp before comparing, because the bundles carry one
and a byte-for-byte comparison would otherwise always differ — a check that cannot pass is a check
nobody runs.

## How the renderer reads them

`Feed/FixtureFeedSource.cs` accepts either shape: a single document, or a `nlt.state-feed.replay.v1`
bundle whose `frames[]` are complete documents of their own. A frame that fails the contract is
**rejected and reported** in the observer's Diagnostics panel, never rendered. Warnings are shown and
the document is kept.

At ~1 Hz the bundle replays in about a minute, which is why Phase D also ships pause, step, replay
and adjustable speed: fifty repetitions are not comprehensible in real time, and that is the whole
reason the Learning Timeline exists (D.2).