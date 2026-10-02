/**
 * Asset manifest — which GLB models dress the Sims-like world.
 *
 * Drop-in upgrade path (no code changes): put rigged humanoid .glb files
 * under assets/characters/ and point entries here. Until then every entry
 * uses "procedural" and the viewer builds articulated low-poly humans
 * (iso-world.js createCharacter) that read as people, not capsules.
 *
 * Later sources (all compatible with this manifest):
 *   - CC0 now:      Quaternius Ultimate Animated Character Pack
 *   - Mixamo (free, Adobe account): X Bot / Y Bot (+ walk/sit/idle clips)
 *   - MetaHuman (Unreal export -> glb via metahuman-to-glb pipeline)
 *
 * Each character entry:
 *   { model: "procedural" | "assets/characters/<file>.glb",
 *     animations: { idle, walk, sit, work } (glb clip names),
 *     tint: hex, skin: hex, name: label }
 *
 * NOTE: iso-world.js createCharacter() reads tint/skin via characterFor(),
 * so new names automatically get a stable outfit color.
 */
window.WE_ASSETS = (function () {
  'use strict';

  const CHARACTERS = [
    { name: 'Avery',  model: 'procedural', tint: 0x4a90d9, skin: 0xffddbb },
    { name: 'Blake',  model: 'procedural', tint: 0xd94a6a, skin: 0xe8b88a },
    { name: 'Casey',  model: 'procedural', tint: 0x4ad97a, skin: 0xc98a5a },
    { name: 'Devon',  model: 'procedural', tint: 0xd9b44a, skin: 0x8a5a3a },
    { name: 'Ellis',  model: 'procedural', tint: 0x9a4ad9, skin: 0xffccaa },
    { name: 'NPC',    model: 'procedural', tint: 0x888899, skin: 0xe8b88a },
  ];

  function characterFor(name) {
    return CHARACTERS.find(c => c.name === name)
        || CHARACTERS[Math.abs(hash(name)) % CHARACTERS.length];
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  return { CHARACTERS, characterFor };
})();
