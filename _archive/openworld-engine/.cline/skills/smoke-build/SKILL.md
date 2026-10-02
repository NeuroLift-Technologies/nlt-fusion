---
name: smoke-build
description: Verify the build still serves and boots after engine or shell changes.
---

# Smoke Build

Run the smoke procedure for this repo: serve it over HTTP and confirm the page
loads past the loading overlay without an #err popup. Report results.

## Steps

1. Serve the repo root over HTTP:
   - `cd "D:\nlt-repos\lt-openworld-engine"`
   - `python -m http.server 8000` (or another free port if 8000 is taken).
   - Internet is required for the three.js CDN in `index.html`.
2. Open `http://127.0.0.1:8000/index.html` in a browser.
3. Observe:
   - Does the `#loading` overlay ("Building open world…") clear after a moment?
   - Is there an `#err` popup at the bottom-right? If so, capture the message.
   - Do the HUD elements populate: fps, position, time (starts at 10:00)?
4. Quick interaction smoke (if browser is available):
   - WASD move a few meters, confirm position updates.
   - Toggle orbit (1/2 or button), confirm camera behavior changes.
   - Drag the time slider, confirm time-of-day updates.
   - Toggle day cycle, confirm time advances.
5. Report:
   - Serve command used, port, URL.
   - Boot result: passed (loading cleared, no #err) or failed (message).
   - Interaction smoke: which steps were attempted and their result.
   - Any console errors if visible.
6. If smoke fails, do NOT silently continue. Capture the #err message and
   console output; that's the starting point for a fix story.

## When to use

This is the procedure skill for "did my change break the build?" It is run after
engine or shell changes. In this terminal, only the serve command is available
directly; browser observation requires a browser. The skill documents the full
procedure so results are comparable across runs.

## Bundled reference

- Shell: `index.html`
- Boot + loop: `src/main.js`
- Render pipeline + fallback: `src/render/pipeline.js`
- Three.js rule (boot error discipline): `.cline/rules/02-threejs.md`
