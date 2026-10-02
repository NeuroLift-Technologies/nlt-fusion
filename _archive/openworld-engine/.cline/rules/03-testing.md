---
paths:
  - "tests/**"
  - "src/**/*.js"
---

# Testing rules (AI-habitat rendering layer)

This layer renders what the Python ECS kernel (`nlt-world-engine`) decides. Tests
cover world generation, rendering pipeline, character systems, and integration
with the kernel's WebSocket/REST bridge.

## Evidence required per story type (BLOCKING unless noted)

| Type | Evidence | Where |
|---|---|---|
| Logic (noise, biomes, placement, state) | Automated test, must pass | `tests/unit/` |
| Integration (multi-system) | Test or documented playtest | `tests/integration/` |
| Visual/feel (lighting, animation, VFX) | Screenshot + lead sign-off | `production/qa/evidence/` (advisory) |
| UI (HUD, menus) | Walkthrough note or interaction test | `production/qa/evidence/` (advisory) |
| Config/balance | Smoke check pass | `production/qa/smoke-<date>.md` (advisory) |

## Test standards

- Node harness: `node --test tests/unit/*_test.js`, no dependencies.
- Naming: files `[system]_[feature]_test.js`, cases `test_[scenario]_[expected]`.
- Deterministic: fixed seeds, no wall-clock assertions.
- Isolated: own setup/teardown, order-independent, no network/file I/O in unit.
- Do NOT automate: shader output appearance, "feel", full sessions (playtest).
- Never disable a failing test to go green — fix the cause.
