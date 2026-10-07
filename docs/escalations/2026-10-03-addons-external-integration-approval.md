# Escalation — Third-party addons in `world-engine-godot/addons/` with no OTOI §4.4 approval recorded

**Raised:** 2026-10-03 · **Agent:** Kilo · **Thread:** none claimed (MIGRATE-001-adjacent) · **Status:** resolved by Joshua in-session, 2026-10-03

---

## Trigger

`docs/active-threads.md:66` already records that `addons/godot_ai/` landed *"outside any thread: OTOI
§4.4 external-integration approval unrecorded"*. While triaging addon load failures in
`world-engine-godot` I found that gap had since been joined by four more third-party integrations,
and that one of them was mis-installed **twice** and failing to load.

## What was found

### NobodyWho was installed twice

`.godot/extension_list.cfg` registered two copies of the same GDExtension:

```
res://addons/nobodywho/nobodywho.gdextension    ← loads
res://bin/addons/nobodywho/nobodywho.gdextension ← duplicate, panics
```

The second load of the same native library aborted inside the godot-rust FFI:

```
panic godot-ffi-0.4.5/src/binding/multi_threaded.rs:41] initialize must only be called at startup or after deinitialize
ERROR: GDExtension initialization function 'gdext_rust_init' returned an error.
ERROR: Error loading extension: 'res://bin/addons/nobodywho/nobodywho.gdextension'.
```

Cause: the v11.0.0 release zip has **`bin/` as its only top-level directory**
(`bin/addons/nobodywho/…`). Extracting it into `res://` by hand therefore produces
`res://bin/addons/nobodywho/`. Upstream's README avoids this by importing through AssetLib with
*"Ignore asset root"* ticked, which strips that layer. `.gitignore:102`
(`world-engine-godot/**/bin/`, a C# build-output rule) then hid the stray copy from git entirely.
959 MB duplicated. Removed.

The surviving `res://addons/nobodywho/` was verified as authentic v11.0.0: the zip's SHA256 matches
the published release digest `567e6da8…d7243`, and the installed DLL is byte-identical to the one
inside that zip (`6cf7e02a…7f4587`).

### Register of third-party integrations

| Addon | Kind | Ships native binaries | In git | Role here |
|---|---|---|---|---|
| `godot_ai` | GDScript editor plugin (v4.3.0) | no (bootstraps Python via `uv`) | tracked, 313 files, **26 modified** | Godot↔MCP bridge; autoload `_mcp_game_helper` |
| `sky_3d` | GDScript editor plugin (v2.1) | no (textures only) | tracked, 43 files | day/night sky; **enabled** in `project.godot` |
| `fennara` | Rust GDExtension | **yes** — per-platform editor DLLs + bundled `rg` + CEF bridge | **untracked** | MCP bridge; autoload `_fennara_game_capture`; mandated by `world-engine-godot/AGENTS.md` |
| `godotopenxrvendors` | C++ GDExtension | **yes** — per-platform vendor libs | **untracked** | OpenXR vendor runtime |
| `beehave` | GDScript editor plugin (v2.9.3) | no | **untracked** | behaviour trees; **not enabled** |
| `nobodywho` | Rust GDExtension | **yes** — ~959 MB, per-platform | **untracked** | local LLM inference (llama.cpp + ONNX Runtime) |

Also present: `world-engine-godot/Starter-Kit-City-Builder-main/` — a standalone demo project
(it has its own `project.godot`, no `plugin.cfg`), not an addon. Two copies existed; the one under
`addons/` was byte-identical to the root copy across all 110 files (SHA256) and was removed. It was
never a plugin, which is why it never appeared in *Project Settings → Plugins*.

## Decision

Joshua W. Dorsey, Sr. — final authority under OTOI §4.4 — ruled in-session on 2026-10-03:

1. **NobodyWho is removed from the world-engine project.** Local inference, if adopted, runs as an
   out-of-process `nobodywho-server` exposing an OpenAI-compatible endpoint on `127.0.0.1:8888`,
   consumed by Fusion — not as a library inside the sim.
2. **All five addons get a recorded §4.4 approval entry** (below).

### Rationale for the NobodyWho ruling

- **Core boundary.** `ARCHITECTURE.md:15-17` — *"Fusion owns semantic reality; the world engine owns
  physical reality"* — and the boundary explicitly does not move when the engine changes. An in-process
  inference engine puts semantic reasoning inside the physical layer.
- **Provider neutrality.** OTOI §4.4 bars LLM provider lock-in without Joshua's approval;
  `MIGRATION-PLAN.md:312` (item 9.2) and `:437` both require preserving it. Committing the
  authoritative sim to one inference runtime and GGUF model format is the lock-in §4.4 guards.
- **Wrong direction of integration, and no seam yet.** `MIGRATION-PLAN.md:311` makes the engine an
  HTTP **client** via `LlmCommandController`, out-of-band, applied at tick boundaries.
  `:219` (item 2.6c) says *declare* that controller but **do not implement** it — it is Phase 9.
  `docs/active-threads.md:76` puts the migration at Phase 2.
- **Determinism.** In-process inference is non-reproducible by construction, which is the property the
  Tier-2 replay gate (`MIGRATION-PLAN.md:278`) exists to establish, and the gate that retires UE.

Running the same engine out-of-process behind an OpenAI-compatible endpoint keeps every one of these
intact, and matches the sanctioned pattern at `docs/active-threads.md:266` — *"against local or hosted
OpenAI-compatible endpoint"*. Neither Fusion nor the engine learns that llama.cpp is underneath.

## Evaluation register (OTOI §4.4, approved 2026-10-03 by Joshua W. Dorsey, Sr.)

**"Approved" here means cleared under §4.4 — not adopted.** Joshua confirmed these addons were
downloaded to *evaluate whether each suits the project*. Only `godot_ai` and `sky_3d` are actually
wired into the project today; the rest are candidates, and the verdicts below are recommendations,
not decisions.

| Addon | Approval | Conditions |
|---|---|---|
| `godot_ai` | **Approved** | **Editor-inspection path verified working on the C#/mono project, 2026-10-03** — see verification below. Remaining caveat is the updater, not compatibility: 26 **tracked** files modified mid-flight, review before committing. |
| `sky_3d` | **Approved** | Tracked and enabled. No binaries. |
| `fennara` | **Approved** | Mandated by `world-engine-godot/AGENTS.md`. See blocking item below. |
| `godotopenxrvendors` | **Approved** | Ships binaries. Emits `Property not found: 'xr/openxr/extensions/hand_tracking'` — engine/vendor skew (`compatibility_minimum = 4.6` vs 4.7.2 runtime). Benign, not project config. No editor-tagged libs, so Godot falls back to `template_debug`. |
| `beehave` | **Approved, not enabled** | Enable from *Project Settings → Plugins* when wanted. |
| `nobodywho` | **Approved for Fusion-side use only** | Must not be installed in `world-engine-godot`. Any future use is via `nobodywho-server` on an OpenAI-compatible endpoint, owned by Fusion. |

## Fit assessment against the current plan (2026-10-03, agent recommendation)

Assessed against `MIGRATION-PLAN.md` at Phase 2 and `RENDERER-PLAN.md` / `GRAPH-001`. Not decisions.

| Addon / asset | Verdict | Evidence |
|---|---|---|
| `sky_3d` | **Keep — already adopted** | Tracked, enabled, and loaded by `WorldView.cs`. `GRAPH-001` owns realistic graphics; sky is squarely inside that thread's scope. |
| `godot_ai` | **Keep — verified working** | See verification section below. Pure GDScript + `uvx`; no native binaries. |
| `godotopenxrvendors` | **Remove for now — right instinct, wrong instrument** | **Corrected 2026-10-03 after Joshua's framing.** The download was not speculation: he downloaded it because he *"keeps on saying think of this project as VR for AI."* That framing is already the project's canonical vision, verbatim in `README.md:9`, `ARCHITECTURE.md:13`, `AGENTS.md:28`, `CLAUDE.md:5`, `DEPLOYMENT.md:11`, `ONBOARDING.md:13` and `file-structure.md:7` — *"An AI habitat — a virtual world where AI agents live, perceive, act, and learn… Humans watch through a spectator viewer."* So the instinct is sound and load-bearing.<br><br>But OpenXR is the wrong instrument for it. OpenXR provides XR **presentation and input for a human wearing a headset**. The agents are not XR clients: they are embodied characters driven through `IAgentController` via a deliberately narrow, deterministic `AgentObservation`, and giving them headset-style perception would collide with the determinism and Tier-2 conformance design. The human side is a *spectator viewer*, and `MIGRATION-PLAN.md:459` records that it **does not exist yet** (*"humans watch through a spectator viewer — no viewer"*). OpenXR would only matter if that viewer became a headset application, which is downstream of the viewer existing at all.<br><br>**So: keep the idea, leave the addon out.** If XR is ever adopted it is a **viewer-side** concern, not a world-engine-sim concern — which keeps it on the correct side of the physical/semantic boundary rather than against it. |
| `beehave` | **Conditional yes — for NPCs only, not agents** | **Corrected 2026-10-03 after Joshua's challenge.** The original "remove" verdict over-applied an *agent*-side constraint to a population that does not exist. `MIGRATION-PLAN.md:461` records NPCs as `✗ gap — no NPC system` ("residents" are `AAvatarCharacter`, not NPCs), and `:468` lists NPC population among claims unmet **and unmet in UE**. There is therefore **no UE oracle and no fixture encoding NPC behaviour** — so the constraints that disqualify beehave for *agents* do not transfer. Those agent-side constraints stand: `:216` ports the behaviour state machine as plain C# inside `DeterministicUtilityController`, `:215` keeps the core engine-free so Tier-1 xUnit runs without Godot, `:274` wants execution order as an explicit deterministic system list.<br><br>**The binding condition is that NPCs stay outside the conformance surface** — canonical state text v2, RNG state, and the ordered event stream — until an NPC thread exists with its own determinism story. Fixtures encode per-tick canonical state (`:213`); `:276` requires every controller action recorded into the replay stream; Workplace environment events already carry a seeded random walk that `:215` calls "a genuine Tier 2-core conformance signal". If NPCs consume RNG or raise events into those streams, the golden vectors diverge and Tier 2, the gate that retires UE, fails. Beehave's GDScript also cannot be unit-tested by Tier-1 xUnit — acceptable only because NPCs are outside that gate.<br><br>**Rides on an NPC thread existing first:** `RENDERER-PLAN.md` §0.3, `MIGRATION-PLAN.md:468` and `ART-PIPELINE.md:136,144` all record that NPC population has **no owner and no thread**. |
| `fennara` | **Keep — but it is not actually reachable, which is the real finding** | **Corrected twice on 2026-10-03.** First wrongly called a duplicate of `godot_ai`; Joshua clarified fennara is an **in-editor coding-agent interface**, and `ai/index.md` confirms a distinct product: a routing index over agent-facing knowledge (`visual-observation.md` for framing 2D/3D evidence, comparing states and inspecting animation; `runtime-observation.md` for observing/controlling a running game; `operations.md` for recovering timed-out calls and working at scale; `clients/cursor.md` for naming inside Cursor). `godot_ai` exposes a raw editor tool surface; fennara is a curated agent experience with an evidence/observation workflow. **Complementary, not duplicate.**<br><br>**The actual defect:** fennara is installed, loads (its log shows `Plugin started, Godot 4.7.2-stable` and a local bridge daemon), and is mandated by `world-engine-godot/AGENTS.md` — but it is **not registered as an MCP server in the client config**. `C:\Users\joshd\.config\kilo\kilo.jsonc` registers `"godot-ai"` and nothing else, which is why this session exposes zero fennara tools. So `AGENTS.md` mandates an interface **no agent session can reach**, while the interface that *is* connected is undocumented there. **Root cause, established 2026-10-03 — it is not "setup was never run":** setup *was* run. `%LOCALAPPDATA%\Fennara\current.json` reports version 0.4.3, stable track, addon at `versions/0.4.3/addon/addons/fennara`, with daemon and MCP runtimes present; `operations/` holds a logged `install-…json` and `update-…json`; `versions/` holds both 0.4.1 and 0.4.3. The addon's own `release.json` matches at 0.4.3.

The real cause is that **fennara is not registered in any agent client, and `fennara mcp-setup` cannot target Kilo.** The CLI's supported targets are `--claude`, `--claude-code`, `--claude-desktop`, `--gemini`, `--antigravity`, `--cline`, `--cursor`, `--vscode`, `--opencode`, `--windsurf`, `--kiro`, `--codex` — twelve clients, **Kilo absent**. Checked and all negative: `.claude.json`, `.claude/settings.json`, `.codex/config.toml`, `.cursor/mcp.json`, VS Code `mcp.json`. The only registered MCP server anywhere is `"godot-ai"` in `C:\Users\joshd\.config\kilo\kilo.jsonc`.

This also explains how fennara has been used against this project so far: `%LOCALAPPDATA%\Fennara\tool_logs\C__Users_joshd_nlt-repos_nlt-world-engine_world-engine-godot_#13660\` exists, but the **built-in chat dock needs no client registration** — so dock usage works while external agents stay unwired. The addon also ships `fennara.exe` (3.9 MB) which is **not on `PATH`**; it lives at `%LOCALAPPDATA%\Fennara\bin\`.

**Joshua declined the manual MCP entry, 2026-10-03.** Instead he directed that the mandate be removed from `world-engine-godot/AGENTS.md`, which is done — the file's entire contents were the fennara block (`# Fennara MCP Guidelines`, wrapped in `<!-- fennara-agents-start -->` / `<!-- fennara-agents-end -->` sentinels) and it is now 0 bytes.

Two facts about that file worth recording:

- **It was never tracked in git** (`?? world-engine-godot/AGENTS.md`). The fennara mandate existed only in this working copy, never in the repository for any other machine or clone — so "every agent following that file literally" was a local effect, not a repo-wide one.
- **The block is machine-injected, and the sentinel markers are the giveaway.** `fennara install` / *Set Up Fennara* writes it into `AGENTS.md` between `fennara-agents-start` and `fennara-agents-end`. Editing it out by hand is therefore **not durable** — a future fennara setup, update, or `versions\` sync will re-inject the block. If it reappears, either re-remove it or use fennara's own removal path. This is a side effect of keeping fennara installed for its chat dock.

The root `AGENTS.md` was checked and needs no change: it contains no fennara reference. Note it is drifting in two ways that `MIGRATION-PLAN.md:324` (item 10.3) already schedules for Phase 10 — its repo file map predates the new addons, and line 118 still annotates `addons/godot_ai/` as *"(external, unapproved)"*, which this record supersedes. Requirements for fennara were otherwise satisfied: Godot 4.5+ (project is 4.7.2) and Windows x86_64.

**Credential hygiene — verified clean.** `auth.json` and `chat.sqlite` (1.9 MB of chat history) live under `%LOCALAPPDATA%\Fennara\`, **outside the repository**. The addon's committed tree carries no key material (`ai/`, `bin/`, `dist/`, `runtime/`, `release.json`, `VERSION`, `LICENSE.md`). Worth preserving: fennara's BYO-key providers should keep keys in that local store and out of git, per the OTOI §4.4 bar on credentials in version control. |
| `Starter-Kit-City-Builder-main` | **Do not adopt the demo; maybe harvest the 15 GLBs** | 15 `.glb` models (buildings, roads, pavement, grass, trees, fountain, lightposts), 0.01–0.07 MB each — small, **stylised low-poly**, not "realistic". Two conflicts: `MIGRATION-PLAN.md:92` keeps the outdoor shell procedural precisely to *"avoid an asset-re-import workstream"*, and `:397` puts asset re-import **explicitly out of scope** as *"a later mechanical pass, not a blocker."* Also a standalone demo project with its own `project.godot`, which is why it never registered as a plugin. If GRAPH-001 wants reference art, copy the GLBs to a neutral `_assets/` folder and leave the demo outside the project. |
| **Cogito** (Codeberg `Phazorknight/Cogito`, player controller) | **Evaluated — not adopted; viewer-side candidate only** | External reference, not an installed addon. First-person **human** player controller: walk/run/sprint, stairs, ladders, crouch, ledge climbing, swimming, statechart-based `CogitoPlayerAdvanced`, save slots, HUD + pause-menu dependencies, `godot-statecharts` dependency. Conflicts with agent design: `:273` (6.2) requires agents move *"in straight lines closed-form"* and forbids a navmesh dependency, `:147`/`:149` keep the controller the movement authority with **no raw velocity writes from the model**, and `:130` drives agents through `IAgentController.Observe/Act`, not input devices. A `move_and_slide`-driven FPS controller would *replace* the movement authority the plan requires to stay closed-form. Only legitimate use is a first-person **spectator viewer**, which does not exist (`:459`). |
| **Physics Arsenal** (RockChuckDev, v0.1.2-alpha) | **Evaluated — not adopted; viewer-side candidate only** | External reference, not an installed addon. Physics-based object grabbing (independent left/right hand), grabbable-behaviour customisation, and a first-person character controller. Built for Godot .NET 4.7, so it is *surface*-compatible with this project's 4.7 + C# — but that is compatibility, not suitability. Same conflict as Cogito for agent locomotion, and worse on two counts: physics-solver behaviour is not bit-reproducible per tick, which is what the Tier-2 gate (`:278`) and canonical-state comparison (`:213`) depend on; and it is self-described **alpha**, "developed for my own game." Grab/carry affordances would be a viewer-side nicety, never sim state. |

Net: two keepers already in use (`sky_3d`, `godot_ai`); `godotopenxrvendors` has no requirement behind
it; `beehave` is a conditional yes scoped to NPCs and gated on an NPC thread; `fennara` is a resolved
duplicate to remove, with a wrong instruction file to correct; the Starter-Kit demo should stay out
even if its GLBs are worth keeping.

## Blocking item found while writing this record

**Committed `project.godot` does not match the working tree, and the working tree depends on an
untracked addon.**

- `HEAD:world-engine-godot/project.godot` contains only the `_mcp_game_helper` autoload (→ `godot_ai`,
  which *is* tracked).
- The **modified, uncommitted** `project.godot` adds `_fennara_game_capture` →
  `res://addons/fennara/runtime/game_capture_helper.gd`.
- `fennara` is **untracked**.

Committing `project.godot` without also committing `addons/fennara/` leaves every fresh clone with an
autoload pointing at a missing script. These must land in the same commit, or fennara's autoload line
must be dropped from `project.godot`.

## Actions taken

- Deleted `res://bin/` — the mis-extracted NobodyWho duplicate (959 MB).
- Deleted the duplicate `addons/Starter-Kit-City-Builder-main/` (110 files, verified identical).
- Removed the stale `res://bin/…` entry from `.godot/extension_list.cfg`.
- **NobodyWho removed from `addons/` per the ruling below.** All 15 files deleted (959 MB),
  including `nobodywho.gdextension`, and its entry dropped from `.godot/extension_list.cfg`
  (now 2 entries: `fennara`, `godotopenxrvendors`).
  - *Order matters if this is repeated:* removing the `.gdextension` / registry entry **first** is
    what frees the library. While the path is still registered, a running editor re-copies the DLL
    on every filesystem scan as a `~`-prefixed temp (`~libnobodywho-…dll`) and holds it open, so
    the delete appears to fail and then reappears.
  - The last remaining `~libnobodywho-…dll` temp and the now-empty `addons/nobodywho/` directory
    shell clear when the editor process exits. They are Godot's own load artifacts, not repo content.
- Verified: headless run of the project loads with **zero errors**; the `gdext_rust_init` panic and
  both `Error loading extension` lines are gone.

## Verification performed on `godot_ai` (2026-10-03)

`active-threads.md:66` had carried *"C#/mono compatibility unverified"* against this addon since it
was first flagged. That gap is now **closed by direct test**, not by assumption:

```
session_id       world-engine-godot@408911c87536be49
plugin / server  4.3.0 / 4.3.0        protocol_version  2
godot_version    4.7.2-stable (official)
project_path     .../world-engine-godot
editor_pid       21060                server_launch_mode  uvx
readiness        ready                is_active          true
```

Exercised against the running editor on the mono/C# project:

- `session_manage(list)` — session discovered and connected.
- `editor_state` — `readiness: ready`, `current_scene: res://Main.tscn`, not playing.
- `scene_get_hierarchy(depth 2)` — returned exactly one node, `/Main` (`Node3D`), `total_count: 1`.
  Cross-checked against `Main.tscn`, which likewise declares a single `[node name="Main" type="Node3D"]`.
  The tool's report is faithful; the rest of the world (observer HUD, sky, terrain) is constructed at
  runtime from C# rather than authored in the scene.

**What this does and does not establish.** It establishes that the addon loads, connects, and serves
correct editor state on a C#/mono project — the specific claim that was unverified. It does **not**
exercise `dotnet build`, the .NET assembly path, or any C# script execution, and it says nothing about
gameplay (`game_capture_ready: false`, `helper_live: false` while stopped). The `uv` bootstrap remains
a real external dependency at launch.

**Note for whoever wires tooling next:** `world-engine-godot/AGENTS.md` mandates **Fennara** MCP for
Godot-aware inspection, but the MCP server actually connected in this session was `godot_ai`. Both are
approved above; they are not interchangeable, and check which one a session has before following the
AGENTS.md instruction literally. The blocker is concrete and documented in the fennara row: fennara
0.4.3 is installed and set up, but registered in **no** agent client, and `fennara mcp-setup` has no
`--kilo` target among its twelve supported clients — so Kilo needs a hand-written MCP entry.

Net: `sky_3d` and `godot_ai` in use; `godotopenxrvendors` encodes a correct instinct ("VR for AI") in the
wrong instrument and should stay out until a spectator viewer exists; `beehave` is a conditional yes
scoped to NPCs and gated on an NPC thread; `fennara` is a genuinely distinct interface that is
installed, mandated, and **not registered with any agent client**; the Starter-Kit demo should stay
out even if its GLBs are worth keeping.

### Proposal: adopt a third-party character controller for the ML-model-driven avatars

Joshua's framing (2026-10-03): use Cogito / Physics Arsenal as the **body** with the ML model as the **brain**. **The pattern is correct and already in the design** — and this corrects an earlier over-broad reading. `MIGRATION-PLAN.md:273` distinguishes two populations: UE's *Mass* agents moved in straight lines closed-form (no navmesh), but *"Only `AvatarAIController` used `UNavigationSystemV1` — port that path separately or omit."* So the avatar the model drives already had a navigation-aware controller, and `:149` confirms the controller stays the movement authority with no raw velocity writes from the model. There is a real controller slot.

**Correction 2026-10-03 — the determinism blocker was overstated.** An earlier version of this entry
claimed third-party or realistic locomotion would break Tier 2. That is wrong, and the distinction
matters because it is the whole answer to "how do we get realistic feel for RL training".

Tier 2 compares fixtures captured with the **scripted** `DeterministicUtilityController` (`:141`, `:277`)
— not with a learned policy. Separately, `:276` (6.3b) requires every controller action to be recorded
into the replay stream, and `:278` (6.4a) proves an ML-controlled run replays identically **from those
recorded actions** — using an `LlmCommandController` stub or a fixture action stream as the
non-deterministic source. So reproducibility for ML runs is bought at the **action-replay layer, not
the physics layer**. Bit-exact physics is only required on the *conformance* path.

Combined with `:275` (6.3a) — the loop is controller-agnostic and *"must not know which controller is
mounted"* — the architecture already permits **two locomotion implementations behind one interface**:

| Path | Locomotion | Reproducibility bar |
|---|---|---|
| Conformance (Tier 2, UE retirement) | UE-faithful port of `AvatarAIController` | bit-exact canonical state / RNG / event stream vs captured fixtures |
| RL training (Phase D1) | realistic actuation dynamics | seed-reproducible per `(seed, tick)` (`:221` 2.6e) + action replay (`:276`, `:278`) |

Therefore realistic locomotion **does not jeopardise UE retirement**, provided the conformance path
keeps the faithful port. Third-party code still cannot live in the engine-free core (`:215`), so it
remains a *reference* for realistic actuation numbers rather than something to vendor.

**What realism actually has to mean here — RL policies observe vectors, not pixels.** `:151` fixes
the schemas: Avatar obs `{Position, Velocity(3), Cognitive(7)}`, act `{MoveDirection(3), Interaction(4
exclusive discrete)}`; Aide obs `{AvatarState(13), AideState(7)}`, act 10-way discrete. There is **no
camera in the observation**. Consequences:

- **Rendered realism does nothing for training.** Photorealism under `GRAPH-001`, `sky_3d`, and the
  Starter-Kit GLBs are spectator-facing only. If RL value is expected from them, that expectation
  needs revisiting.
- **All locomotion realism lives in the controller that consumes `MoveDirection`,** because `:147`/`:149`
  forbid raw velocity writes from the model. `AgentAction` is semantic only. That controller *is* the
  realism surface for RL — it is where acceleration/deceleration caps, turn-rate limits, slope cost,
  friction and inertia belong.
- **The high-value techniques** are actuation limits (so a direction change cannot teleport an agent),
  seeded observation noise and partial observability, motor latency (decision at tick N applied at
  N+k, already contemplated for the out-of-band LLM controller at `:143`), and **domain randomization**
  across friction/mass/latency per episode. `:221` 2.6e's `(seed, tick)` reproducibility is exactly what
  makes domain randomization reproducible, which is what stops policies overfitting to one physics.
- **Vision-based RL would change all of this.** If policies were ever to observe camera images, GRAPH-001
  would move from spectator polish onto the training critical path, and rendering throughput plus
  determinism would become RL infrastructure. `:151` currently specifies vector observations, so that is
  not the current design — but it is the decision that most changes the graphics strategy, and it is
  Joshua's call.

- **Before Tier 2 passes / UE retirement (Phase 10):** nothing third-party may touch the conformance surface. The avatar controller must be *our* deterministic port of `AvatarAIController`, preserving UE invariants.
- **Also disqualifying now:** third-party controllers cannot live in the engine-free `NltWorldEngine.Core`, because `:215` requires that core stay engine-free so Tier-1 xUnit runs without launching Godot. Neither Cogito (GDScript) nor Physics Arsenal (Godot-node C#) qualifies.
- **After Phase 10:** with fixtures retired, third-party controllers become a legitimate option for avatars, NPCs and the viewer.

**Legitimate ways to use them today:**

1. **Extract the technique, not the code.** The valuable part of both is locomotion *craft* — slope limits, stair stepping, ground snapping, crouch-posture transitions, and hooks for procedurally driven animation. Those can be reimplemented as a deterministic kinematic controller in the engine-free core, which is exactly what `:266` (5c.2) already commits to for walk cycles (procedural pose from velocity, no authored animation assets). Borrowing the approach is compatible; vendoring the node scripts is not.
2. **NPCs** — no UE oracle, so no conformance constraint, subject to the NPC-thread and RNG/event-stream conditions recorded for `beehave` above.
3. **Spectator viewer** — no oracle; `:459` records it does not exist yet. If a human should be able to walk the habitat in first person, Cogito saves substantial work and Physics Arsenal's grab/carry affordances are a plus. This is the human side of "VR for AI".

## Still open

- Close the Godot editor once to clear the last `~libnobodywho-…dll` temp and the empty
  `addons/nobodywho/` directory shell. Nothing of the addon remains in git terms.
- `project.godot` / `addons/fennara` must be committed together — see blocking item.
- `godot_ai`'s 26 modified files: the updater writes to tracked files; `.godot_ai_update/` holds
  backups for 3.2.1 and 4.2.3. Confirm that diff is intended before committing.
- NobodyWho v11.0.0 is built against the **Godot 4.5 API** (`compatibility_minimum = 4.5`,
  `godot-ffi-0.4.5`) while this project runs 4.7.2. Not a stale install — it is what upstream ships.
  There is no newer Godot-targeted build. Relevant only if the Fusion-side server path is adopted.