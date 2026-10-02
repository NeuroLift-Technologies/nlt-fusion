---
name: ue-render-debugging
description: Diagnose rendering issues using captures and telemetry (Hermes lane).
---

# UE Render Debugging

Hermes evaluates: visual correctness, behavior, scenario outcomes, interactions, and governance behavior.

Use WorldEngine HTTP API for captures:
- GET /api/snapshot - Simulation state
- GET /api/scene - Grid layout
- GET /api/avatar/state - Avatar position

## Python Tools
- capture_viewport_qa.py - Automated viewport capture
- phase6_full_validation.py - Full validation suite
