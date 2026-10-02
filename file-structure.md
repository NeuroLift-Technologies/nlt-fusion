# nlt-world-engine — File Structure

## The Vision

**NLT World Engine is an embodied multi-agent simulation where machine learning models inhabit a persistent world, control their characters, interact with environments and other agents, and transition between meaningful life scenarios.**

**An AI habitat — a virtual world where AI agents live, perceive, act, and learn.** The world is rendered with realistic graphics: procedural terrain, water, sky, vegetation, and settlement. AI residents walk through this world with articulated bodies, animated walk cycles, and name labels. Humans watch through a spectator viewer.

---

## Root-Level Map

```
nlt-world-engine/
├── README.md                              ← Full project docs (start here)
├── ARCHITECTURE.md                        ← UE 5.8 architecture + subsystems
├── ONBOARDING.md                          ← 3-minute onboarding
├── DEPLOYMENT.md                          ← UE 5.8 build + deployment
├── NLT-DEV-OTOI.md                        ← Canonical org-level agent contract
├── AGENTS.md                              ← Internal coordination gateway
├── CLAUDE.md                              ← Claude Code repo instructions
├── links.md                               ← Agent reference links
├── mcp-config.yaml                        ← MCP server configuration
├── file-structure.md                      ← This file
├── REVIEW.md                              ← Agent review format
├── pr_body.md                             ← PR body template
├── nltotoi.json                           ← Discovery manifest
│
├── WorldEngine/                           ← UE 5.8 authoritative simulation (C++)
│   ├── WorldEngine.uproject               ← UE project file
│   ├── Source/WorldEngine/               ← C++ module (16 subsystems)
│   │   ├── Public/                       ← Headers
│   │   │   ├── Agents/                   ← Fragments, spawner, AI controller
│   │   │   ├── Core/                     ← EventBus, FusionCore, SimulationState
│   │   │   ├── Simulation/               ← Clock, seed, room state, atmosphere
│   │   │   ├── Scenarios/                ← Data assets, scenario manager
│   │   │   ├── Audio/                    ← Soundscape subsystem
│   │   │   ├── Persistence/              ← Save/load snapshots
│   │   │   ├── World/                    ← World generator, smart objects
│   │   │   ├── Roles/                    ← Fusion role manager
│   │   │   ├── Scaling/                  ← Population LOD scaler
│   │   │   └── Web/                      ← WebSocket control server
│   │   └── Private/                      ← Implementation
│   ├── Content/                          ← UE assets
│   │   ├── Scenarios/                    ← 4 level maps + 16 scenario DataAssets
│   │   ├── Environment/Materials/        ← 12 shared materials
│   │   ├── Audio/Soundscape/             ← 4 ambient WAV beds
│   │   ├── Kits/SimBody/                 ← SimBody skeletal mesh
│   │   ├── Kits/Workplace/               ← Blender-exported desk kits (3 states)
│   │   ├── PCG/                          ← Environment scatter
│   │   └── Web/                          ← 2D canvas viewer (index.html)
│   ├── Scripts/                          ← Python automation (QA, VFX, scenarios)
│   ├── Skills/                           ← Skill definitions
│   ├── Config/                           ← DefaultEngine/Game/Input.ini
│   ├── Makefile                          ← Build targets (Windows + Linux)
│   └── docs/architecture/                ← Architecture documentation
│       ├── unreal-architecture-assessment.md
│       ├── unreal-simulation-architecture.md
│       ├── fusion-unreal-domain-mapping.md
│       ├── build-documentation.md
│       └── TECHNICAL_DIAGRAM.md
│
├── _archive/                              ← Prototype directories (reference only, not part of build)
│   ├── world-engine/                     ← Original Python ECS engine + React prototype
│   ├── world-engine-v2/                  ← Babylon.js viewer (superseded)
│   ├── world-engine-3d/                  ← Early Three.js experiment
│   ├── openworld-engine/                 ← Open-world exploration variant
│   └── studio/                           ← Claude Design shell (superseded)
│
├── agents/                                ← Agent profiles and configurations
├── SOPs/                                  ← Standard operating procedures
├── templates/                             ← Registration, handoff, escalation templates
├── docs/                                  ← Project documentation
│   ├── training/                         ← Training guides
│   ├── agent-log/                        ← Agent handoffs and logs
│   ├── onboarding-checklist.md
│   ├── WEB_VIEWER.md
│   └── DEMO_SETUP.md
├── .nltotoi/                              ← Governance validation namespace
├── .hermes.md                             ← Hermes agent configuration
├── .github/workflows/                     ← CI (governance + v2 build)
├── .github/ISSUE_TEMPLATE/               ← Issue templates
└── .github/PULL_REQUEST_TEMPLATE/        ← PR templates
```

---

## Build Outputs (gitignored)

```
WorldEngine/
├── Intermediate/                         ← UE build intermediates
├── Saved/                                ← UE saves, logs, screenshots
└── Binaries/                             ← Compiled executables

world-engine-v2/
├── dist/                                 ← Vite build output
└── node_modules/

world-engine/
├── __pycache__/
└── *.pyc
```
