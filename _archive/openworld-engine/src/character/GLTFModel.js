// GLTFModel.js — async GLB loader + per-character animation instances.
//
// A GLTFModel is a *template*: load the model once (e.g. the three.js soldier,
// a free animated human with a Mixamo rig). `instantiate()` then clones the
// scene graph (cloning each skeleton so every resident animates independently)
// and creates a fresh AnimationMixer, returning a standalone GLTFInstance.
// This keeps a single network download while giving each resident its own walk
// phase — the previous shared-scene approach only parented the model under the
// last character to attach it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/**
 * GLTFModel: async GLB loader and template for independent character instances.
 * Load once (shared GLB), then instantiate() clones the skeleton per resident
 * so each character animates with its own mixer and walk phase.
 */
export class GLTFModel {
  /**
   * @param {string} url - URL of the GLB file to load as template
   */
  constructor(url) {
    this.url = url;
    this.gltf = null;     // parsed glTF (template; never added directly to the scene)
    this.clips = [];      // shared animation clips
    this.loaded = false;
  }

  /**
   * Load and parse the GLB template from this.url.
   * Populates this.gltf (scene graph) and this.clips (animation tracks).
   * @returns {Promise<GLTFModel|null>} This model on success, null on failure
   */
  /**
   * Load and parse the GLB template from this.url.
   * Populates this.gltf (scene graph) and this.clips (animation tracks).
   * @returns {Promise<GLTFModel|null>} This model on success, null on failure
   */
  async load() {
    try {
      const gltf = await new GLTFLoader().loadAsync(this.url);
      this.gltf = gltf;
      this.clips = gltf.animations || [];
      this.loaded = true;
      console.log(`[GLTFModel] loaded ${this.url} (${this.clips.length} clips)`);
      return this;
    } catch (e) {
      console.warn(`[GLTFModel] failed to load ${this.url}`, e);
      return null;
    }
  }

  /**
   * Build an independent runtime instance: a cloned skeleton (so animation
   * state/mixers don't cross talk between residents) + its own mixer + actions.
   * Shared geometry and materials are reused to keep memory low.
   */
  /**
   * Build an independent runtime instance: a cloned skeleton (so animation
   * state/mixers don't cross talk between residents) + its own mixer + actions.
   * Shared geometry and materials are reused to keep memory low.
   * @returns {GLTFInstance|null} The new instance, or null if not loaded
   */
  instantiate() {
    if (!this.loaded || !this.gltf) return null;
    const scene = clone(this.gltf.scene);
    const mixer = new THREE.AnimationMixer(scene);
    const actions = {};
    for (const clip of this.clips) {
      actions[clip.name] = mixer.clipAction(clip);
    }
    return new GLTFInstance(scene, mixer, actions);
  }

  /**
   * Free GPU resources for the template's meshes, clips, and reset loaded state.
   * Shared geometry/materials are reused by instances; this disposes the originals.
   */
  dispose() {
    this.gltf?.scene?.traverse((c) => {
      if (c.isMesh) { c.geometry?.dispose?.(); c.material?.dispose?.(); }
    });
    this.clips = [];
    this.loaded = false;
  }
}

/**
 * GLTFInstance: an independent runtime clone of a GLTFModel template.
 * Each instance has its own cloned scene graph, AnimationMixer, and actions
 * so multiple characters can animate independently from one shared template.
 */
export class GLTFInstance {
  /**
   * @param {THREE.Object3D} scene - Cloned scene graph from GLTFModel.instantiate()
   * @param {THREE.AnimationMixer} mixer - Per-instance animation mixer
   * @param {Object.<string, THREE.AnimationAction>} actions - Map of clip names to actions
   */
  /**
   * GLTFInstance: an independent runtime clone of a GLTFModel template.
   * Each instance has its own cloned scene graph, AnimationMixer, and actions
   * so multiple characters can animate independently from one shared template.
   * @param {THREE.Object3D} scene - Cloned scene graph from GLTFModel.instantiate()
   * @param {THREE.AnimationMixer} mixer - Per-instance animation mixer
   * @param {Object.<string, THREE.AnimationAction>} actions - Map of clip names to actions
   */
  constructor(scene, mixer, actions) {
    this.scene = scene;
    this.mixer = mixer;
    this.actions = actions;          // { clipName: AnimationAction }
    this.current = null;            // currently fading-in / playing action
  }

  /**
   * Resolve a logical animation name (e.g. 'walk'/'idle') to an action.
   * Tolerates Mixamo-style prefixes like 'Character_Walk'. Falls back to substring match.
   * @param {string} name - Logical animation name to resolve
   * @returns {THREE.AnimationAction|null} The matching action, or null if not found
   */
  _resolve(name) {
    if (this.actions[name]) return this.actions[name];
    const lower = name.toLowerCase();
    const key = Object.keys(this.actions).find(
      (k) => k.toLowerCase() === lower || k.toLowerCase().includes(lower),
    );
    return key ? this.actions[key] : null;
  }

  /**
   * Play an animation clip by logical name, fading from the current clip.
   * Tolerates Mixamo-style prefixes and falls back to substring match.
   * Randomizes start phase so residents don't walk in lockstep.
   * @param {string} name - Logical animation name (e.g. 'walk', 'idle')
   * @param {number} [fadeDuration=0.3] - Crossfade duration in seconds
   */
  /**
   * Play an animation clip by logical name, fading from the current clip.
   * Tolerates Mixamo-style prefixes and falls back to substring match.
   * Randomizes start phase so residents don't walk in lockstep.
   * @param {string} name - Logical animation name (e.g. 'walk', 'idle')
   * @param {number} [fadeDuration=0.3] - Crossfade duration in seconds
   * @returns {void}
   */
  play(name, fadeDuration = 0.3) {
    const next = this._resolve(name);
    if (!next || next === this.current) return;
    if (this.current) this.current.fadeOut(fadeDuration);
    if (!next.isRunning()) {
      // Random start phase so residents don't walk in lockstep.
      const dur = next.clip?.duration || 1;
      next.time = Math.random() * dur;
    }
    next.fadeIn(fadeDuration).play();
    this.current = next;
  }

  /**
   * Advance the animation mixer by delta time.
   * @param {number} delta - Time step in seconds
   */
  /**
   * Advance the animation mixer by delta time.
   * @param {number} delta - Time step in seconds
   * @returns {void}
   */
  update(delta) {
    this.mixer?.update(delta);
  }

  /**
   * Stop all animations, uncache the mixer's root, and release references.
   */
  dispose() {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.scene);
    this.mixer = null;
  }
}

/**
 * CharacterManifest — optional per-character GLB URL override map.
 * Empty by default: all residents share CONFIG.characters.model.
 * To give a resident its own model, add: '<character-id>': '<cdn glb url>'
 * @type {Object.<string, string>}
 */
export const CHARACTER_MANIFEST = {
  // 'resident-1': 'https://cdn.example.com/avatar-1.glb',
};

/**
 * Look up a per-character GLB URL override from the manifest.
 * @param {string} characterId - The character ID to look up
 * @returns {string|null} The override URL, or null if character uses the shared model
 */
export function getCharacterModelUrl(characterId) {
  return CHARACTER_MANIFEST[characterId] || null;
}
