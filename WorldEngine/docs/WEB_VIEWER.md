# NLT Fusion Web Viewer

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

## Quick Start

### Option 1: Demo Mode (no Unreal needed)
1. Open `Content/Web/index.html` in any browser
2. Click **Demo Mode** — you'll see 20 simulated agents moving around
3. Use WASD or arrow keys to pan, +/- to zoom, R to reset

### Option 2: Connect to Unreal (headless)
1. Run Unreal headless:
   ```bash
   ~/Documents/NLT/Engine/Binaries/Linux/UnrealEditor \
     D:\\nlt-repos/nlt-fusion/WorldEngine/WorldEngine.uproject \
     -nullrhi -benchmark -deterministic -stdout -FullStdOutLogOutput
   ```
2. In Unreal, run console command: `NLT.SocketServer.Start 8765`
3. Open `Content/Web/index.html` in browser
4. Set URL to `ws://localhost:8765`
5. Click **Connect**

### Option 3: Serve via local HTTP
```bash
cd D:\\nlt-repos/nlt-fusion/WorldEngine/Content/Web
python3 -m http.server 8080
# Open http://localhost:8080/index.html
```

## Viewer Controls

| Input | Action |
|-------|--------|
| WASD / Arrows | Pan camera |
| +/- | Zoom in/out |
| R | Reset camera |
| Mouse drag | Pan camera |
| Scroll wheel | Zoom |
| Click agent | Select (future) |

## Agent Colors (by Intent)

| Color | Intent |
|-------|--------|
| 🟢 Green | Idle |
| 🔵 Blue | FindQuietPlace |
| 🟠 Orange | Work |
| 🟣 Magenta | Socialize |
| 🔵 Cyan | Rest |
| 🟡 Yellow | Study |
| 🔴 Red ring | High stress (>0.6) |
