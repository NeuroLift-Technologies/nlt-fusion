# Unreal MCP — WorldEngine Integration Note

**Author:** OpenCode (Graphics/Environment lane)
**Date:** 2026-09-19
**Status:** Integrated (config + docs) — plugin install pending

---

## Purpose

Document how the **Unreal MCP server** connects to the WorldEngine UE 5.8
project for development-plane control (editor automation, asset/environment
work, screenshots, project inspection), and the governance boundaries that
apply.

## Source

- Repo: <https://github.com/ChiR24/Unreal_mcp> (MIT, ChiR24, UE 5.0–5.8)
- Plugin: `McpAutomationBridge` (native C++ MCP transport, included in the repo under `plugins/`)
- NPM (bridge transport, not currently used): `unreal-engine-mcp-server`

## Configuration

### OpenCode (global)

Installed globally in `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "servers": {
      "unreal-mcp": {
        "type": "http",
        "url": "http://127.0.0.1:8001/mcp"
      }
    }
  }
}
```

### Repo (`mcp-config.yaml`)

Added `unreal-mcp` entry pointing at `http://127.0.0.1:8001/mcp` with the
governance note inline.

## Connection status

- `opencode mcp list` → `✓ unreal-mcp  connected`
- The endpoint answers on **8001** and exposes the MCP toolset interface
  (`list_toolsets`, `describe_toolset`, `call_tool`).

## Port notes (important)

| Surface | Upstream default | WorldEngine |
|---|---|---|
| Native MCP transport (`/mcp`) | `3000` | **8001** |
| TypeScript bridge WebSocket | `8091` | — |

8001 is a deliberate override. Any server instance must be configured to
listen on **8001** to match: for the plugin, set the native MCP port via
**Edit → Project Settings → Plugins → MCP Automation Bridge**.

## Exposed interface

Upstream exposes a single `unreal` gateway tool with four operations
(`search`, `describe`, `execute`, `configure`) wrapping 23 canonical tools
(asset management, actor control, editor/PIE, sequencer, Niagara, materials,
audio, console, etc.). Through the OpenCode client the MCP surface is presented
as toolsets.

## Plugin installation (pending — not yet installed in WorldEngine)

The `McpAutomationBridge` plugin is **not** present in `WorldEngine/Plugins/`.
To install:

1. `git clone https://github.com/ChiR24/Unreal_mcp`
2. Copy `plugins/McpAutomationBridge/` into `WorldEngine/Plugins/` (or register
   as an external plugin directory; WorldEngine has a C++ code target, so
   compilation works).
3. In **Project Settings → Plugins → MCP Automation Bridge**:
   - enable **Enable Native MCP**
   - set port to **8001**
   - optionally set **Native MCP Instructions** for project-specific guidance
4. Restart the editor; verify `● MCP :8001` in the status bar and
   `LogMcpNativeTransport` in the output log.

## Authentication

Capability-token auth is **on by default** in the plugin (0.5.30+). Token is
auto-generated at `WorldEngine/Saved/MCP/capability-token` (or set via
`CapabilityToken` in Project Settings). If a client connection starts failing
after install, confirm the token is present and accepted.

## Governance boundary (OTOI §7 / §8)

> **Unreal MCP ≠ governance bypass.**

- The MCP server is a **development-plane interface** — authorized for editor
  control, actors, assets, levels, automation, screenshots, project inspection,
  and testing (within the OpenCode Graphics/Environment lane).
- It does **not** grant simulated AI agents equivalent authority. Runtime agent
  actions must pass through WorldEngine / ASFDK interfaces.
- Developer authority ≠ simulated-agent authority; editor control ≠ runtime
  agent authority.

## Evidence & provenance

Tool-generated evidence from MCP operations (screenshots, asset listings,
inspection output) is `tool_result` provenance — not simulation telemetry.
Keep these distinct per OTOI §14; a build/screenshot success is not behavior
or governance success.