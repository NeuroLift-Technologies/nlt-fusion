# Build Documentation

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

> **Core principle: Fusion owns semantic reality; Unreal owns physical reality.**

---

**Date:** 2026-09-05  
**Agent:** Hermes  
**Handoff source:** GPT-5.6 Luna Technical Handoff (2026-09-01)  
**Status:** Partially filled — verify platform-specific details before relying on unmarked items

---

## 1. Unreal Version

- **UE 5.8** (`EngineAssociation: "5.8"` in `.uproject`)
- Engine install: `~/Documents/NLT/Engine/`
- Clang 20.1.8, ISPC 1.24.0

## 2. Required Toolchain

| Component | Version | Notes |
|-----------|---------|-------|
| Unreal Engine | 5.8 | Custom install at `~/Documents/NLT/Engine/` |
| Clang | 20.1.8 | Default compiler on this Linux host |
| ISPC | 1.24.0 | Shader compiler |
| Linux SDK | UE 5.8 Linux target | Pre-installed with UE |

## 3. Linux Build Setup

### 3.1 Prerequisites

- Ubuntu/Debian-based Linux (tested on this host)
- UE 5.8 installed at `~/Documents/NLT/Engine/`
- Clang 20.1.8 + ISPC 1.24.0
- Git
- Python 3 (for `make` wrapper scripts)

### 3.2 Project Setup

```bash
# Clone
cd D:\\nlt-repos
git clone https://github.com/NeuroLift-Technologies/nlt-world-engine.git
cd nlt-world-engine

# Generate project files
make configure

# Or manually:
cd WorldEngine && ~/Documents/NLT/Engine/Engine/Build/BatchFiles/RunGeneratedProjectFiles.sh
```

### 3.3 Build Commands

```bash
# Full editor build
make WorldEngineEditor

# Headless server (no editor)
make WorldEngineServer

# Configure only (generates .sln/.csproj)
make configure

# Clean
make clean
```

The `make` wrapper is a project-provided script — do not call UBT directly.

## 4. Project Structure

```
nlt-world-engine/
├── WorldEngine/
│   ├── WorldEngine.uproject     # Main project file
│   ├── Source/WorldEngine/      # C++ module
│   │   ├── WorldEngine.Build.cs # Module dependencies
│   │   ├── WorldEngine.h/.cpp   # Module entry point
│   │   ├── Public/              # Headers (subsystem/fragment definitions)
│   │   └── Private/             # Implementation
│   ├── Content/                 # UE assets
│   ├── Plugins/                 # (empty — custom code in main module)
│   └── docs/architecture/       # Architecture docs
├── .github/                     # CI, governance
└── Makefile                     # Project build wrapper
```

## 5. Plugin Setup

| Plugin | Status | Notes |
|--------|--------|-------|
| ModelingToolsEditorMode | Enabled | Editor mode |
| ModelContextProtocol | Enabled | MCP server |
| AllToolsets | Enabled | Full toolset access |
| MassAI | Required | Mass + AI integration |
| LearningAgents | Required | RL training |
| MassCrowd | Required | Crowd simulation |
| MetaHuman | Optional | LOD 0 characters |

Plugins are enabled in `WorldEngine.uproject` — verify the JSON before building.

## 6. Project Generation

```bash
# Regenerate project files after adding modules or plugins
cd nlt-world-engine
make configure

# Or use UE's generator directly
~/Documents/NLT/Engine/Engine/Build/BatchFiles/GenerateProjectFiles.sh -project=WorldEngine/WorldEngine.uproject -game -engine
```

## 7. Packaging

```bash
# Package for Linux (headless server)
make package Linux Server

# Package for Linux (editor preview)
make package Linux Editor
```

**Note:** Packaging details (output directory, configuration flags, chunk settings) — verify with UE 5.8 documentation before relying.

## 8. Test Execution

**No tests exist yet.** The project has no test directory, no pytest configuration, and no CI test step. The CI workflow (`.github/workflows/validate-governance.yml`) runs only the governance validation script.

To add tests:
1. Create `Tests/` directory in the project
2. Add test module to `WorldEngine.Build.cs` with `PrivateDependencyModuleNames.Add("AutomationDriver")`
3. Implement automation tests using UE's `FAutomationTestBase`

## 9. Known Build Notes

| Issue | Workaround |
|-------|------------|
| Linux UE docs are sparse | Check Epic's UE 5.8 release notes for platform-specific changes |
| LearningAgents plugin | Verify compatibility with UE 5.8 — some ML plugins target specific UE versions |
| MetaHuman on Linux | Limited support — use primitive shapes for LOD 0 dev |
| Mass Entity at scale | Profile before scaling beyond 1k entities |

## 10. CI/CD

The repo has one CI workflow:

```yaml
# .github/workflows/validate-governance.yml
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate governance
        run: bash .nltotoi/scripts/validate-governance.sh
```

No build validation in CI — `make WorldEngineEditor` is not currently gated on PRs.

## 11. TBD Items

- [ ] Verify packaging configuration flags for UE 5.8 Linux
- [ ] Add test suite (Automation framework)
- [ ] Add build validation to CI
- [ ] Document headless server deployment procedure
- [ ] Document Windows build toolchain (if needed)
- [ ] Document replication build settings (if multiplayer)