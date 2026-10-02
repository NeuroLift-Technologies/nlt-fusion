# NLT World Engine — UE 5.8 Project

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

The Unreal Engine 5.8 project for the NLT simulation runtime. This is the
authoritative physical layer: levels, doors, avatars, the SimBody pawn, and the
local HTTP/MCP control surface that agent runtimes (LLMs, Learning Agents train)
talk to. See the [root README](../README.md) for the full repo architecture;
this file covers day-to-day work inside the UE project.

## Quick Start

Prerequisites: UE 5.8 at `~/Documents/NLT/Engine/`, Linux (Clang 20.1.8).

```bash
cd WorldEngine
make configure          # Generate project files
make WorldEngineEditor  # Build editor
```

Launch the editor (hands-on level editing + MCP server for agent tooling):

```bash
~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor \
  D:\\nlt-repos/nlt-world-engine/WorldEngine/WorldEngine.uproject \
  -MCP -log
```

The `-log` flag writes the output log to `~/Documents/NLT/Engine/Saved/Logs/`
(current session is also mirrored to `/tmp/opencode/unrealeditor.log` when run
through the agent harness).

## Levels & Default Map

Maps live in `Content/Scenarios/Levels/`:

| Map | Notes |
|-----|-------|
| `Workplace_Level` | Main office floor, y=950 door row |
| `Social_Level` | y=950 door row |
| `Academic_Level` | y=950 door row |
| `Personal_Level` | Default map; doors at y=870; contains `Hermes` (SimBodyPawn) |

Default map / editor startup map are `GameDefaultMap` / `EditorStartupMap` in
`Config/DefaultEngine.ini` (currently `Personal_Level`).

## HTTP API (port 8765)

Served by `UNLTWebServerSubsystem` (`NLTWebServerSubsystem.cpp`). All mutation
endpoints are **loopback-only** (`127.0.0.1` / `::1`).

| Method & Path | Purpose |
|---------------|---------|
| `GET /api/snapshot` | Full sim snapshot (avatars, positions, cognitive state) |
| `GET /api/scene` | `nlt.world-engine.v1` grid contract: rooms, cells, spatial layout |
| `GET /api/status` | Sim heartbeat: running state, pace, current snapshot |
| `GET /api/avatar/state` | First/selected avatar position + cognitive metrics |
| `POST /api/control` | `{"action":"pause|resume|step|toggle","pace":N}` |
| `POST /api/avatar/action` | Drive an avatar: `avatar_id`, `move_x/y/z` `[-1,1]`, `interact` `[0-3]` |
| `POST /api/avatar/command` | Natural-language command for an avatar |

`/api/avatar/action` semantics — the vector is a **world-space delta scaled by
100** added to the avatar's current location, then issued as a one-shot
`MoveToLocation` navigation goal (radius 50cm) via its `AAvatarAIController`.
It is not a velocity or per-tick input; a zero vector is a no-op. Movement
requires the pawn to be possessed by a controller and a nav mesh in the level.

## Key C++ Classes

Under `Source/WorldEngine/{Public,Private}`:

| Class | Role |
|-------|------|
| `AAvatarCharacter` | Base avatar pawn (`ACharacter`), speed 300, orient-to-movement, auto-possessed |
| `BP_AvatarCharacter_C` | Blueprint avatar (SimBody skeletal mesh), placed in levels |
| `AAvatarAIController` | Wander/move controller; flags `bLearningAgentsActive`, `bLLMControlActive` gate wander resumption |
| `ASimBodyPawn` | LLM-driven body (`ACharacter` + `BodyMesh` = `SM_SimBody_Base`); `MoveToWorldLocation()` / `StopMoving()` hooks |
| `ANLTDemoGameMode` | Door placement per level (Personal y=870), player controller assignment |
| `ANLTPlayerController` | Player controller |
| `UNLTWebServerSubsystem` | HTTP API on port 8765 |
| `UNLTSimulationSubsystem` | Main tick / mode control (Realtime, Paused, FastForward, SlowMotion) |

Key agents:
- `AvatarCharacter_1` in Personal_Level — the default `BP_AvatarCharacter_C` avatar.
- `Hermes` (`SimBodyPawn_0`) in Personal_Level — `ASimBodyPawn` at `(30,0,0)`,
  reserved for external LLM control.

Plugins in use: Mass Entity, Learning Agents, StateTree, Smart Objects, PCG,
Niagara, ModelContextProtocol, WebSocketNetworking. See the root README for the
full list and the CI/governance layout.

## MCP Server

The project exposes an MCP endpoint on `127.0.0.1:8001` (ModelContextProtocol
plugin). Tools available for agent-driven editing:

- **EditorAppToolset** — `StartPIE`, `StopPIE`, `OpenEditorForAsset`, save/inspect
- **ObjectTools** — `get_class`, `get_properties`, `get_components`, `remove_component`
- **SceneTools** — `add_to_scene_from_class`, `remove_from_scene`, `load_level`,
  `get_current_level`, `edit_level_instance`
- Actor transforms, object detail summaries

There is **no save-level tool** — persist level edits with **Ctrl+S** in the
editor. (`save_actor` only works for external actors and will refuse with
"Save the level instead".)

Level edits to remember are in-memory only until saved; restarting the editor
discards unsaved changes.

## Notes / Gotchas

- LSP/IDE errors on UE headers (e.g. `'CoreMinimal.h' file not found`,
  `Undeclared identifier`) are false positives — the editor build via
  `make WorldEngineEditor` is the source of truth.
- A `UFloatingPawnMovement` component on a non-pawn actor trips a `PawnMovementComponent.cpp:22`
  ensure at level registration. Don't add pawn-only movement components to
  `AActor`-derived statics.
- `LogCrowdFollowing` "Unable to find RecastNavMesh" warnings are benign
  (crowds disabled); individual `MoveToLocation` still needs a nav mesh to reach.
- DefaultEngine.ini `[MLAdapter]` is configured `bIsEnabled=True` with rpc port
  disabled (`NoRPCManager`) to avoid a startup hang when the HTTP server also binds.