# Escalation — `recoveryMode` spelling disagreement, and a validator that failed its own fixture

**Raised:** 2026-10-03 · **Agent:** OpenCode · **Thread:** `MIGRATE-001` · **Phase:** A (contract) / D (observer)
**Status:** resolved in code, needs one human decision to close cleanly

---

## What was found

While building the Phase D observer I needed to load the shipped fixture through my own reader, and
found that the committed Python validator does not pass the committed fixture:

```
$ python tools/validate_state_feed.py world-engine-godot/fixtures/state-feed.sample.json
FAIL: world-engine-godot/fixtures/state-feed.sample.json: 1 problem(s)
  - burnoutEpisodes[1].recoveryMode must be solo|rt when recovered
```

The contract (`docs/contracts/state-feed-v1.md` §6) and the fixture both spell the assisted-recovery
mode **`rrt`**. The validator, as committed in `ad06bf8`, accepted only **`rt`**.

The commit message for that change claims *"Verified in both directions: passes the fixture, and
catches all five seeded defects in a mutated copy."* The second half is true — I reproduced all five
— but the first half was not, and the fixture is the one artefact that would have caught it.

## Why it mattered here

D.5 and D.3 require the observer to distinguish *recovered alone* from *needed the RRT core*. That
distinction is the whole point of the panel's tone: a pair that needed rescue is "not ready yet",
not "failed". A renderer that silently coerced an unrecognised mode would invent that distinction.
Failing loudly is correct; being unable to read the shipped fixture is not.

## What I changed

`tools/validate_state_feed.py` now accepts `solo` and `rrt` — the contract's spelling — and emits a
**warning**, not an error, for `rt`, so a producer that picked up the earlier wording is still read
rather than dropped:

```python
err.check(mode in ("solo", "rrt"),
          f"{where}.recoveryMode must be solo|rrt when recovered, got {mode!r}")
if mode == "rt":
    warn.append(f"{where}.recoveryMode is 'rt'; the contract (section 6) and the shipped "
                f"fixture both spell it 'rrt'")
```

The same tolerance is in `Feed/FeedVocabulary.cs` and `Feed/FeedReader.cs` on the renderer side,
with the warning text pointing here.

## The decision that is still Joshua's

Two spellings are now in the wild — `rrt` in the contract and fixture, `rt` in the validator's
original code and possibly in whatever produced it. **Which one Fusion emits is Fusion's call**, and
it is a schema-visible choice:

- If Fusion emits `rrt`: the contract stands, the validator is now right, and nothing else changes.
- If Fusion emits `rt`: the contract and the fixture need a schema-version bump, and the renderer and
  validator follow.

I did not change `docs/contracts/state-feed-v1.md` or the fixture, because the contract is Phase A's
artefact and this is Phase D work. The renderer reads both spellings meanwhile, so neither choice
blocks the observer.

## Also noted, not fixed

`StateFeedLoader.cs` (PR #80) validates recovery modes against its own inline list, which does not
include `rrt`. Loading the shipped fixture through that path may warn or throw. I left the file
alone — it is peer work and out of this phase's scope — but it should be checked when someone next
touches it. See the Phase A follow-up note in `docs/active-threads.md`.