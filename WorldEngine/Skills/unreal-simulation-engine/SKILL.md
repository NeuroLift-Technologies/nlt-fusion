---
name: unreal-simulation-engine
description: Route local Unreal Engine 5.8 development workflows for the NLT WorldEngine project following the OTOI governance.
---

# Unreal Simulation Engine

Use this skill to route development work for the NLT WorldEngine UE 5.8 project.

## WorldEngine Development Lanes

Follow the OTOI governance model for WorldEngine development (see WORLD-ENGINE-OTOI.md):

- ue-asset-production - Assets, materials, lighting (OpenCode lane)
- ue-asset-vendoring - Project integration, versioning (Codex + Poolside lane)
- ue-render-debugging - Visual verification, QA (Hermes lane)
- ue-performance-optimization - Performance engineering (Codex + Poolside lane)

## Key Resources

- build-configuration.md - Build commands and module dependencies
- Scripts/ - Python automation scripts
- WORLD-ENGINE-OTOI.md - Governance contract

## Escalation Principle

Escalate to Joshua W. Dorsey, Sr. when:
- Task scope is unclear
- Architectural decisions required
- Governance boundary crossed
