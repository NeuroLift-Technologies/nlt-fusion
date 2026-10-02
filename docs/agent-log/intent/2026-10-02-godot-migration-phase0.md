# Intent Log — UE 5.8 → Godot 4.7.2 migration, Phase 0

**Date:** 2026-10-02T07:50:00Z
**Agent:** Kilo (Kilo CLI)
**Session:** `fix/hash-v2-double-precision`
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Working repo:** NeuroLift-Technologies/nlt-world-engine

---

### Action

Execute **Phase 0** (governance and repo hygiene) plus one correctness fix that Phase 1 depends on.

1. Fix the `double`→`float` narrowing of agent position in `BuildCanonicalStateTextV2` (`NLTSimulationStateHash.cpp`), swapping `AppendFloatHex` → `AppendDoubleHex` for `Agent.Position.X/Y/Z`.
2. Restore trailing newlines on `NLTSimulationStateHash.cpp` / `.h` and document the v2 encoding contract in the header.
3. Untrack `world-engine-godot/.godot/` (119 files committed before the ignore rule existed) and extend `.gitignore` with scoped `bin`/`obj` entries for the Godot .NET project.
4. Move the four level FBX exports from `WorldEngine/fbx/` to `world-engine-godot/assets/levels/`.
5. Write the Phase 0 governance artifacts: escalation record, intent log, agent registration, `MIGRATE-001` thread entry, `docs/engine-reference/godot/VERSION.md`, and delete the dead `world-engine-v2-build.yml` workflow.
6. Carry both plan copies forward with the applied state.

---

### Rationale

Item 1 is time-critical and cheap **only right now**. `FVector` is `FVector3d` under UE5 large-world coordinates, so `AppendFloatHex` truncated a 53-bit mantissa to 24 bits inside the encoding whose entire purpose is bit-exactness. Critically, **no fixtures have been committed yet** — everything captured so far is local and gitignored under `Saved/Fixtures/`. Changing the encoding now costs nothing; after the first fixture commit every captured vector needs recapturing. Item 1 was also invisible to automated review, since CodeRabbit's 13 fixes addressed style and NaN canonicalisation but not the UE5 `FVector` width.

Item 3 is not cosmetic: `.gitignore` already listed `.godot/`, but gitignore does not apply retroactively to tracked files, so opening the editor produced spurious diffs in `editor_layout.cfg` and `global_script_class_cache.cfg` on every session.

Item 4 places assets inside the project that consumes them. Godot does not look in `WorldEngine/`, and UE's asset scanner can see it.

Items 5–6 satisfy OTOI §4.1 session-start and §6 session-end obligations for a framework change approved under §4.4, and record ownership boundaries where Phase 1 straddles agent and human capability.

---

### Risks

- **Encoding change invalidates prior captures.** Any fixture already generated with the 8-hex position encoding is now non-comparable and must be recaptured. Mitigated by the fact that none are committed.
- **`LevelReference` remains dead** and is not fixed here — the migration must decide whether it becomes the scenario→sub-scene binding or is deleted. Recorded in the plan, not silently carried.
- **Deleting `world-engine-v2-build.yml` removes the only workflow that compiled product code.** It can no longer fire (its path filter points at `world-engine-v2/**`, which moved to `_archive/`), so the loss is theoretical — but the repo will have no product-code CI until Phase 7.2. Recorded as a risk.
- **Moving the FBX files changes their import context.** Godot will generate `.import/` metadata for them on first editor open. If a fixture were ever captured from these levels, the geometry must not be rescaled on import or the canonical state text shifts.
- **Two plan copies will drift.** Mitigated by keeping `.kilo/plans/` canonical and cross-referencing from the Godot copy; the drift risk is real and accepted for now.

---

### Alternatives Considered

1. **Defer the narrowing fix to a follow-up PR** — rejected. Every fixture captured before that lands is invalidated, and the fix is three lines. The whole Tier 2 gate depends on it.
2. **File the narrowing as a review comment on PR #61** — no longer possible; #61 was merged to `main` at `f0bb432`.
3. **Commit the FBX files under `assets/levels/fbx/`** — the natural result of moving the directory; flattened instead so `assets/levels/` holds the four files directly.
4. **Add Git LFS rules for `*.fbx` and `*.glb`** — considered, not taken. The four exports total ~1.5 MB and the existing LFS rule covers only one large `.uasset`; adding a tracking rule mid-stream risks re-writing already-committed blobs for no current benefit. Revisit when Phase 4 imports the Fab Modern City GLBs.

---

### Escalation Needed

**yes** — and already resolved. The framework change required OTOI §4.4 approval. Joshua approved in session on 2026-10-02 with seven settled terms; the approval is recorded at `docs/escalations/2026-10-02-godot-migration.md`. Proceeding under that record.

---

### Outcome

*(To be filled in after the action is taken)*

**Date completed:** 2026-10-02
**Result:** See PR description.
**Deviations from plan:** None at time of writing.