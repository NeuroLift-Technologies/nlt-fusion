---
name: dev-story
description: Implement one backlog story with tests and evidence.
---

<task_objective>
Implement story <ID> per its acceptance criteria, with required evidence.
</task_objective>

<detailed_sequence_of_steps>
1. Read the story + parent GDD section + relevant rule files. Restate the
   acceptance criteria and required evidence; confirm interpretation.
2. Spawn the owning specialist teammate (see docs/studio-roster.md) for the
   domain: threejs-specialist (world/render), shader-specialist (sky/water/VFX),
   ui-specialist (HUD/menus), level-designer (settlement/placement).
3. Logic/integration stories: write the test first (tests/unit or
   tests/integration), watch it fail, implement, watch it pass.
   Visual/UI stories: implement, screenshot to production/qa/evidence/.
4. Obey the threejs rule: config-driven values, seeded determinism, fallback
   paths for CDN/addon failure, #err + #loading discipline.
5. Report: files changed, test/evidence results, config knobs added. Do NOT
   mark done — that is /story-done with qa-lead verification.
</detailed_sequence_of_steps>
