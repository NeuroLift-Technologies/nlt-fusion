# Escalation Record

**Date:** 2026-10-01T18:00:00Z
**Agent:** Kilo (stealth/space-bunny-alpha)
**Session:** `kilo/modular-fern-k54`
**OTOI Version:** ORG-DEV-OTOI-1.0.3
**Escalation Target:** Joshua W. Dorsey, Sr.
**Priority:** high

---

### Trigger

Direct request: *"change the UE worldengine to a single page HTML."* AGENTS.md guardrail **"No architecture
decisions — database, deployment, framework choices require human sign-off"** was triggered. Swapping the
UE 5.8 authoritative runtime for a single-page web runtime is a framework-level change to the simulation
layer, and the repo already carries a conflicting accepted decision (`docs/adr-live-world.md` ADR-001,
which makes the headless Python ECS — not UE — the authoritative kernel).

---

### Situation

This repo currently has three runnable components, and two of them are authoritative candidates:

| Component | Location | Status per governance |
|---|---|---|
| UE 5.8 simulation (C++) | `WorldEngine/` | Per AGENTS.md/README: *the driving engine*, all authoritative state lives here |
| Babylon.js web viewer | `world-engine-v2/` (submodule, absent in this checkout) | Spectator only |
| Python ECS | `world-engine/` (submodule, absent in this checkout) | ADR-001: authoritative kernel, headless + deterministic |

There is already a stub spectator page at `WorldEngine/Content/Web/index.html` (flat 2D canvas, WebSocket
demo mode, capsule "agents").

To make the vision concrete and reviewable, I built **`WorldEngine/Content/Web/habitat.html`**: one
self-contained file, no build step, no CDN, no new dependency. It contains the full habitat — procedural
terrain with baked paths, a lake with animated specular water, a time-of-day sky and sun model, broadleaf
and conifer vegetation, a settlement (bungalow row, studio block, café, park shelter, plaza markers), and
13 AI residents (5 Avatars, 3 Aides, 1 RRT Advocate, 4 villagers) walking articulated bodies with animated
walk cycles, role rings, focus arcs, stress pulses and name labels. The spectator HUD offers observer-only
controls (pause / step / pace 0.5–12× / scenario assignment from the 13-scenario ADHD catalog / reseed),
a clickable resident card showing needs (energy, hunger, social, focus) and affect (stress, cognitive load),
an Aide-intervention log with real coaching lines, and RRT Advocate escalation tiers GREEN → AMBER → RED →
BLACK.

Behaviour is emergent from the simulation, not scripted theatre: needs decay, stressors fire on a schedule
weighted by the active scenario's aversiveness, Aides path to any Avatar above 0.5 stress and log their
intervention, and the Advocate escalates off the population stress peak. The whole thing is deterministic
from one seed — there is no `Math.random` anywhere on the simulation path, per DESIGN.md §8.

Verification performed: inline JS passes `node --check`; a headless harness drove 900+ frames of the real
render loop and the real `stepSim` (0 runtime errors, ~1,970 draw items/frame); a second harness
re-implemented canvas rasterisation and confirmed the frames visually across day/dusk/night; a determinism
test confirmed identical seed + identical step ⇒ identical positions and needs.

---

### Decision Required

1. **Is the single-page habitat the new authoritative simulation layer, replacing UE 5.8?**
2. **If yes, what happens to `WorldEngine/`** — deleted, archived, or kept for content/asset reuse only?
3. **Does `contracts/v1` still bind?** The page currently owns its own world model. Should it consume a
   `contracts/v1` snapshot feed from a headless kernel instead (ADR-001 shape), or remain self-contained?
4. **Does `docs/adr-live-world.md` ADR-001 stand** (headless Python ECS as kernel), or is it superseded now
   that a single page can be the kernel?

---

### Options Considered

1. **Full retirement of UE in favour of the page**
   - Description: `habitat.html` becomes the authoritative simulation and viewer; `WorldEngine/` is archived.
   - Trade-offs: One language, one file, zero build/toolchain, instantly reviewable anywhere; loses the UE
     content library (PCG, sky, VFX, Mass/LOD system, automation tests) and the Win64 ASFDK build work on
     DET-001; a canvas painter's-algorithm renderer will not hold UE-scale frame rates or 19-avatar-scale
     scenes without a real 3D backend (WebGL) later.

2. **Keep UE authoritative; the page becomes the spectator viewer** (closest to today's governance)
   - Description: `habitat.html` renders the `contracts/v1` snapshot stream instead of simulating locally;
     `WorldEngine/` keeps producing authoritative state.
   - Trade-offs: Preserves DET-001 and all UE assets and the determinism work; keeps the heavyweight
     Win64/ASFDK toolchain; the page cannot be opened standalone as a demo without a running engine.

3. **Both, page-first for iteration**
   - Description: page self-simulates for fast iteration and demo; a snapshot adapter swaps in UE/kernel
     state when available. `WorldEngine/` untouched for now.
   - Trade-offs: Two world models to keep in sync (contract drift risk); defers the decision.

---

### Recommendation

**Option 2**, with the page adopted immediately as the reviewable artifact. The page already demonstrates
everything the vision calls for, but "replace the engine" and "choose a framework" are decisions reserved
to Joshua, and option 2 gets the vision in front of stakeholders today without spending the UE work
(DET-001, LOD-001, the Win64 ASFDK build) that several in-flight threads assume.

---

### Blockers

- Nothing blocked on the page itself; it is complete and verified.
- Blocked pending decision: any *deletion or deprecation* of `WorldEngine/`, and any change to the ADR set.

---

### Resolution

*(To be filled in after Joshua responds)*

**Date resolved:**
**Decision:**
**Decided by:**
**Actions taken:**