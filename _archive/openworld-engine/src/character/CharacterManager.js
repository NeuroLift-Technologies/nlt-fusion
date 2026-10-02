// CharacterManager.js — spawn, update, and manage all AI residents
import * as THREE from 'three';
import { Character } from './Character.js';
import { GLTFModel } from './GLTFModel.js';

/**
 * CharacterManager: spawns, updates, and manages all AI residents.
 * Handles a shared GLB model template (loaded once, cloned per resident),
 * spatial social interactions (proximity detection), and per-frame updates.
 */
export class CharacterManager {
  /**
   * Create a CharacterManager to spawn, update, and manage all AI residents.
   * Handles a shared GLB model template (loaded once, cloned per resident),
   * spatial social interactions (proximity detection), and per-frame updates.
   * @param {THREE.Scene} scene - The scene to add character meshes to
   * @param {Object} heightField - Terrain height field sampler
   * @param {function(number,number):number} heightField.sample - Sample height at (x,z)
   * @param {Object} [characterCfg={}] - Config from CONFIG.characters (model, height)
   */
  constructor(scene, heightField, characterCfg = {}) {
    this.scene = scene;
    this.heightField = heightField;
    this.characters = new Map(); // id -> Character
    this.sharedModel = null; // shared GLB template (loaded once, cloned per resident)
    this.characterCfg = characterCfg; // { model, height } from CONFIG.characters
    this.socialProximityRadius = 3.0; // meters - when characters are this close, they socialize
  }

  /**
   * Load a shared GLB model template from URL and store it for cloning.
   * Falls back gracefully if the model fails to load.
   * @param {string} url - URL of the GLB file
   * @returns {Promise<void>}
   */
  async loadSharedModel(url) {
    if (!url) return;
    const model = new GLTFModel(url);
    await model.load();
    if (model.loaded) {
      this.sharedModel = model;
    }
  }

  /**
   * Create a new character and add it to the scene and internal map.
   * Uses the shared GLB model if available, otherwise builds a procedural body.
   * @param {string} id - Unique character identifier
   * @param {string} name - Display name shown on the floating label
   * @param {{x:number,z:number}} position - Initial world position
   * @returns {Character} The created character instance
   */
  addCharacter(id, name, position) {
    const character = new Character(id, name, position, this.heightField, this.sharedModel, this.characterCfg);
    this.scene.add(character.group);
    this.characters.set(id, character);
    return character;
  }

  /**
   * Remove a character from the scene, dispose its resources, and delete it from the map.
   * @param {string} id - Character identifier to remove
   * @returns {void}
   */
  removeCharacter(id) {
    const character = this.characters.get(id);
    if (character) {
      this.scene.remove(character.group);
      character.dispose();
      this.characters.delete(id);
    }
  }

  /**
   * Set a movement target for a character to walk toward.
   * @param {string} id - Character identifier
   * @param {number} x - Target world X coordinate
   * @param {number} z - Target world Z coordinate
   * @returns {void}
   */
  setCharacterTarget(id, x, z) {
    const character = this.characters.get(id);
    if (character) {
      character.setTarget(x, z);
    }
  }

  /**
   * Set a social interaction target between two characters.
   * Both characters' socialState is set to 'chat' and their socialTarget
   * is set to the other character's position.
   * @param {string} id - Character initiating the interaction
   * @param {string} targetId - Character to interact with
   * @returns {void}
   */
  setSocialTarget(id, targetId) {
    const character = this.characters.get(id);
    const target = this.characters.get(targetId);
    if (character && target && targetId !== id) {
      character.socialState = 'chat';
      character.socialTarget = target.position.clone();
      target.socialState = 'chat';
      target.socialTarget = character.position.clone();
    }
  }

  /**
   * Clear all social interaction targets, resetting every character to idle.
   * @returns {void}
   */
  /**
   * Clear all social interaction targets, resetting every character to idle.
   * @returns {void}
   */
  clearSocialTargets() {
    for (const character of this.characters.values()) {
      character.socialState = 'idle';
      character.socialTarget = null;
    }
  }

  /**
   * Update all characters for one frame.
   * First detects proximity-based social interactions between idle characters,
   * then updates each character's movement and animation.
   * @param {number} delta - Time step in seconds
   * @returns {void}
   */
  update(delta) {
    // Social interaction: detect proximity and trigger behaviors
    const characterIds = Array.from(this.characters.keys());
    for (let i = 0; i < characterIds.length; i++) {
      const id1 = characterIds[i];
      const char1 = this.characters.get(id1);
      if (!char1 || char1.socialState !== 'idle') continue;

      for (let j = i + 1; j < characterIds.length; j++) {
        const id2 = characterIds[j];
        const char2 = this.characters.get(id2);
        if (!char2 || char2.socialState !== 'idle') continue;

        const dist = char1.position.distanceTo(char2.position);
        if (dist < this.socialProximityRadius) {
          // Characters are close enough to socialize
          this.setSocialTarget(id1, id2);
          this.setSocialTarget(id2, id1);
        }
      }
    }

    for (const character of this.characters.values()) {
      character.update(delta);
    }
  }

  /**
   * Look up a character by ID.
   * @param {string} id - Character identifier
   * @returns {Character|undefined} The character, or undefined if not found
   */
  getCharacter(id) {
    return this.characters.get(id);
  }

  /**
   * Get the number of active characters.
   * @returns {number} Count of characters currently managed
   */
  /**
   * Get the number of active characters.
   * @returns {number} Count of characters currently managed
   */
  getCharacterCount() {
    return this.characters.size;
  }

  /**
   * Remove and dispose all characters and clear the managed set.
   * Does NOT dispose the shared model (owned by GLTFModel).
   * @returns {void}
   */
  /**
   * Remove and dispose all characters and clear the managed set.
   * Does NOT dispose the shared model (owned by GLTFModel).
   * @returns {void}
   */
  dispose() {
    for (const [id, character] of this.characters) {
      this.scene.remove(character.group);
      character.dispose();
    }
    this.characters.clear();
  }
}
