// Character.js — AI resident: procedurally-built body OR an animated GLB human.
//
// Both paths produce a THREE.Group that walks/idles on the terrain heightfield,
// carries a name label + state ring, and reacts to social proximity. GLB models
// are auto-scaled to `charCfg.height`, given a randomized walk phase so residents
// don't move in lockstep, and fall back to the procedural body if the model or
// its animations are unavailable.
import * as THREE from 'three';


/**
 * Character: AI resident that walks/idles on the terrain heightfield.
 * Can be either an animated GLB human (auto-scaled, independent walk phase)
 * or a procedurally-built fallback body if the model is unavailable.
 * Carries a floating name label and a state ring that reflects social status.
 */
export class Character {
  /**
   * @param {string} id - Unique character identifier
   * @param {string} name - Display name for the floating label
   * @param {{x:number,z:number}} position - Initial world position
   * @param {Object} heightField - Terrain height field sampler
   * @param {function(number,number):number} heightField.sample - Sample height at (x,z)
   * @param {GLTFModel|null} [model=null] - Shared GLB template (if available)
   * @param {Object} [charCfg={}] - Character config from CONFIG.characters (height)
   */
  constructor(id, name, position, heightField, model = null, charCfg = {}) {
    this.id = id;
    this.name = name;
    this.heightField = heightField;
    this.model = model;
    this.charCfg = charCfg;
    this.group = new THREE.Group();
    this.group.name = `character-${id}`;

    // Position state
    this.position = new THREE.Vector3(position.x, 0, position.z);
    this.targetPosition = new THREE.Vector3(position.x, 0, position.z);
    this.position.y = heightField.sample(this.position.x, this.position.z);

    // Movement
    this.speed = 1.8 + Math.random() * 0.8;
    this.rotation = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.moving = false;
    this.walkPhase = Math.random() * Math.PI * 2; // procedural-only walk phase

    // Social state
    this.socialState = 'idle';
    this.socialTarget = null;

    // Visual variety per character (deterministic from id)
    const variant = id.charCodeAt(id.length - 1);
    this.skinTone  = [0xffddbb, 0xe8b88a, 0xc98a5a, 0x8a5a3a, 0x6b4226][variant % 5];
    this.hairColor = [0x2a1f18, 0x4a3520, 0x8b6b4a, 0xd4a44a, 0x1a1a2a][variant % 5];
    this.clothColor = [0x4a90d9, 0xd94a6a, 0x4ad97a, 0xd9b44a, 0x9a4ad9][variant % 5];

    // Body state
    this.ring = null;
    this.labelSprite = null;
    this.instance = null;   // GLTFInstance (animated GLB human)
    this.procedural = false;

    if (this.model && this.model.loaded) {
      this._attachModel();
    } else {
      this._buildProceduralBody();
    }

    // Name label + state ring are shared by both body styles.
    this._addStateRing();
    this._addNameLabel();

    this.group.position.copy(this.position);
  }

  // ── GLB body ─────────────────────────────────────────────────────────────

  /**
   * Attach a GLB model instance to this character.
   * Clones the skeleton, auto-scales to charCfg.height, plants feet at y=0,
   * and enables shadows. Falls back to procedural body on failure.
   * @returns {void}
   */

  /**
   * Attach a GLB model instance to this character.
   * Clones the skeleton, auto-scales to charCfg.height, plants feet at y=0,
   * and enables shadows. Falls back to procedural body on failure.
   * @returns {void}
   */

  /**
   * Attach a GLB model instance to this character.
   * Clones the skeleton, auto-scales to charCfg.height, plants feet at y=0,
   * and enables shadows. Falls back to procedural body on failure.
   * @returns {void}
   */
  _attachModel() {
    // instantiate() clones the skeleton so each resident animates independently.
    this.instance = this.model.instantiate();
    if (!this.instance) {
      this._buildProceduralBody(); // model unavailable — fall back to procedural
      return;
    }
    const scene = this.instance.scene;

    // Auto-scale the GLB to the configured standing height and plant its base
    // on the terrain (lowest point at y = 0 in the group).
    //
    // Skinned meshes on a detached scene return near-zero bounding boxes even
    // after updateWorldMatrix — the skeleton pose isn't applied until the mesh
    // is rendered. Instead we measure geometry bounds directly (position
    // attribute of every mesh in the hierarchy), which gives us the rest-pose
    // extents that are baked into the GLB file. This is reliable, fast, and
    // works on any GLB regardless of whether it's in the scene graph.
    const targetH = this.charCfg?.height || 1.8;

    let minY = Infinity, maxY = -Infinity;
    scene.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const pos = obj.geometry.attributes.position;
      if (!pos) return;
      // Apply the object's local matrix chain up to (but not including) the
      // scene root, so we measure in scene-local space.
      obj.updateWorldMatrix(true, false);
      // scene.matrixWorld is identity (detached), so obj.matrixWorld is the
      // accumulated local chain from scene root → this mesh.
      const e = obj.matrixWorld.elements; // column-major
      for (let i = 0; i < pos.count; i++) {
        // World Y = e[1]*lx + e[5]*ly + e[9]*lz + e[13]  (row 1 of 4×4)
        const wy = e[1] * pos.getX(i) + e[5] * pos.getY(i) + e[9] * pos.getZ(i) + e[13];
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }
    });

    const measuredH = (minY === Infinity) ? 0 : (maxY - minY);
    const scale = measuredH > 0 ? targetH / measuredH : 1;
    scene.scale.multiplyScalar(scale);

    // Plant feet: minY (in scene-local space) scaled to world space should be 0.
    scene.position.y = -minY * scale;

    // Honour environment lighting + cast/receive shadows.
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.group.add(scene);
    this.procedural = false;
  }

  // ── Procedural body ──────────────────────────────────────────────────────

  /**
   * Build a procedural humanoid body from primitives (no GLB model).
   * Creates legs, arms, torso, head, hair, eyes, mouth with basic materials.
   * Limb pivot groups are stored for walk/idle animation.
   * @returns {void}
   */

  /**
   * Build a procedural humanoid body from primitives (no GLB model).
   * Creates legs, arms, torso, head, hair, eyes, mouth with basic materials.
   * Limb pivot groups are stored for walk/idle animation.
   * @returns {void}
   */

  /**
   * Build a procedural humanoid body from primitives (no GLB model).
   * Creates legs, arms, torso, head, hair, eyes, mouth with basic materials.
   * Limb pivot groups are stored for walk/idle animation.
   * @returns {void}
   */
  _buildProceduralBody() {
    const skinMat = new THREE.MeshBasicMaterial({ color: this.skinTone });
    const hairMat = new THREE.MeshBasicMaterial({ color: this.hairColor });
    const clothMat = new THREE.MeshBasicMaterial({ color: this.clothColor });
    const pantsMat = new THREE.MeshBasicMaterial({ color: 0x2a2a3a });
    const shoeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x2a1f18 });

    // Legs (animated via pivot groups)
    const legGeo = new THREE.CapsuleGeometry(0.06, 0.34, 4, 8);
    this.legL = new THREE.Group();
    this.legL.position.set(-0.09, 0.42, 0);
    const legMeshL = new THREE.Mesh(legGeo, pantsMat);
    legMeshL.position.y = -0.2;
    legMeshL.castShadow = true;
    this.legL.add(legMeshL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.09, 0.42, 0);
    const legMeshR = new THREE.Mesh(legGeo.clone(), pantsMat);
    legMeshR.position.y = -0.2;
    legMeshR.castShadow = true;
    this.legR.add(legMeshR);

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.1, 0.05, 0.15);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(0, -0.42, 0.02);
    this.legL.add(shoeL);
    const shoeR = new THREE.Mesh(shoeGeo.clone(), shoeMat);
    shoeR.position.set(0, -0.42, 0.02);
    this.legR.add(shoeR);

    // Torso (shirt)
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.38, 6, 12), clothMat);
    this.torso.position.y = 0.62;
    this.torso.castShadow = true;

    // Hips
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.12, 6, 12), pantsMat);
    hips.position.y = 0.42;
    hips.castShadow = true;

    // Arms (animated via pivot groups)
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.28, 4, 8);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.24, 0.82, 0);
    const armMeshL = new THREE.Mesh(armGeo, clothMat);
    armMeshL.position.y = -0.16;
    armMeshL.castShadow = true;
    this.armL.add(armMeshL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.24, 0.82, 0);
    const armMeshR = new THREE.Mesh(armGeo.clone(), clothMat);
    armMeshR.position.y = -0.16;
    armMeshR.castShadow = true;
    this.armR.add(armMeshR);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const handL = new THREE.Mesh(handGeo, skinMat);
    handL.position.y = -0.32;
    this.armL.add(handL);
    const handR = new THREE.Mesh(handGeo.clone(), skinMat);
    handR.position.y = -0.32;
    this.armR.add(handR);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skinMat);
    this.head.position.y = 1.08;
    this.head.castShadow = true;

    // Hair (back half of sphere)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat,
    );
    hair.position.y = 1.12;

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const pupilGeo = new THREE.SphereGeometry(0.009, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    eyeL.position.set(-0.04, 1.1, 0.11);
    const eyeR = new THREE.Mesh(eyeGeo.clone(), eyeWhiteMat);
    eyeR.position.set(0.04, 1.1, 0.11);
    const pupilL = new THREE.Mesh(pupilGeo, eyePupilMat);
    pupilL.position.set(-0.04, 1.1, 0.125);
    const pupilR = new THREE.Mesh(pupilGeo.clone(), eyePupilMat);
    pupilR.position.set(0.04, 1.1, 0.125);

    // Mouth
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.025, 0.008, 4, 12, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x8a4a3a }),
    );
    mouth.position.set(0, 1.02, 0.12);
    mouth.rotation.x = Math.PI;

    // Assemble (ring + label are added by the constructor helpers)
    this.group.add(
      this.legL, this.legR, this.armL, this.armR,
      this.torso, hips, this.head, hair,
      eyeL, eyeR, pupilL, pupilR, mouth,
    );

    this.procedural = true;
  }

  // ── Shared visuals (built by both body styles) ───────────────────────────

  /**
   * Add a colored ring under the character that reflects social state.
   * Green=idle, cyan=walk, purple=chat, etc. Updated each frame.
   * @returns {void}
   */

  /**
   * Add a colored ring under the character that reflects social state.
   * Green=idle, cyan=walk, purple=chat, etc. Updated each frame.
   * @returns {void}
   */

  /**
   * Add a colored ring under the character that reflects social state.
   * Green=idle, cyan=walk, purple=chat, etc. Updated each frame.
   * @returns {void}
   */
  _addStateRing() {
    const ringGeo = new THREE.RingGeometry(0.22, 0.32, 20);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.group.add(this.ring);
  }

  /**
   * Add a floating name label sprite above the character.
   * Renders the character name on a rounded-rectangle canvas texture.
   * @returns {void}
   */
  _addNameLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath(); ctx.roundRect(0, 0, 256, 64, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.name, 128, 42);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true }),
    );
    sprite.position.y = this._labelHeight();
    sprite.scale.set(1.2, 0.3, 1);
    this.labelSprite = sprite;
    this.group.add(sprite);
  }

  /**
   * Compute the height above feet for the name-label sprite.
   * GLB models: charCfg.height + small offset. Procedural: fixed ~1.45m.
   * @returns {number} Y position in group-local space
   */
  _labelHeight() {
    if (this.instance) {
      // _attachModel plants the GLB's feet at group-origin (y=0) and scales the
      // total standing height to charCfg.height, so the model top sits exactly
      // at that height in group-local space. Float the label just above it.
      return (this.charCfg?.height || 1.8) + 0.25;
    }
    // Procedural: head ~1.08 + radius (0.13) = ~1.21, label floats above
    return 1.45;
  }

  /**
   * Set a movement target for the character to walk toward.
   * @param {number} x - Target world X coordinate
   * @param {number} z - Target world Z coordinate
   * @returns {void}
   */
  setTarget(x, z) {
    this.targetPosition.set(x, 0, z);
  }

  /**
   * Update character state for one frame: movement, terrain following, animation.
   * Walks toward targetPosition, clamps to terrain height, updates procedural
   * limb animation or GLB animation, and refreshes social state + ring color.
   * @param {number} delta - Time step in seconds
   * @returns {void}
   */
  update(delta) {
    const dx = this.targetPosition.x - this.position.x;
    const dz = this.targetPosition.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    this.moving = dist > 0.15;

    if (this.moving) {
      const step = Math.min(dist, this.speed * delta);
      const t = step / dist;
      this.position.x += dx * t;
      this.position.z += dz * t;
      this.rotation = Math.atan2(dx, dz);
      this.state = 'walk';
    } else {
      this.state = 'idle';
    }

    // Follow terrain
    this.position.y = this.heightField.sample(this.position.x, this.position.z);

    // Apply transform
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;

    // Animation
    if (this.procedural) {
      if (this.moving) {
        this.walkPhase += delta * 8;
        const swing = Math.sin(this.walkPhase) * 0.55;
        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;
        this.armL.rotation.x = -swing * 0.7;
        this.armR.rotation.x = swing * 0.7;
      } else {
        // Idle: relax limbs gently
        this.walkPhase += delta * 1.5;
        const breathe = Math.sin(this.walkPhase) * 0.03;
        this.legL.rotation.x *= 0.9;
        this.legR.rotation.x *= 0.9;
        this.armL.rotation.x = breathe;
        this.armR.rotation.x = -breathe;
        if (this.head) this.head.position.y = 1.08 + breathe * 0.5; // head bob
      }
    } else if (this.instance) {
      this.instance.play(this.state === 'walk' ? 'walk' : 'idle');
      this.instance.update(delta);
    }

    // Social state update
    this.updateSocial(delta);

    // State ring color
    if (this.ring) {
      const colors = { idle: 0x00ff88, walk: 0x00ffaa, sit: 0xffaa00, use: 0xff00ff, chat: 0xaa00ff };
      this.ring.material.color.setHex(colors[this.socialState] || 0x00ff88);
      this.ring.material.opacity = this.socialState === 'idle' ? 0.25 : 0.6;
    }
  }

  /**
   * Set the torso color (procedural body only).
   * @param {number} color - Hex color value (e.g. 0xff0000)
   * @returns {void}
   */
  setColor(color) {
    if (this.procedural && this.torso) {
      this.torso.material.color.setHex(color);
    }
  }

  /**
   * Update social state: if the character has a social target and reaches it,
   * clear the target and return to idle. Called internally by update().
   * @param {number} delta - Time step in seconds (unused but kept for signature)
   * @returns {void}
   */
  updateSocial(delta) {
    // Check proximity to other characters for social interaction
    // This is called per-character; the manager will pass neighbor info
    if (this.socialTarget) {
      const distToTarget = this.position.distanceTo(this.socialTarget);
      if (distToTarget < 1.0) {
        // Reached social target - resume idle
        this.socialState = 'idle';
        this.socialTarget = null;
      }
    }
  }

  /**
   * Dispose per-character resources: GLTF instance mixer, state ring, name label.
   * For procedural bodies, also disposes all child geometries and materials.
   * Shared GLB geometry/materials are owned by GLTFModel and not disposed here.
   * @returns {void}
   */
  dispose() {
    // GLB clones share geometry/materials with the template;
    // per-character mixer and free the per-character ring/label here. The shared
    // geometry/materials are owned by GLTFModel and disposed once at shutdown.
    if (this.instance) {
      this.instance.dispose();
      if (this.instance.scene.parent) this.instance.scene.parent.remove(this.instance.scene);
      this.instance = null;
    }
    if (this.ring) {
      this.ring.geometry.dispose();
      this.ring.material.dispose();
      this.ring = null;
    }
    if (this.labelSprite) {
      const t = this.labelSprite.material.map;
      this.labelSprite.material.dispose();
      if (t) t.dispose();
      this.labelSprite = null;
    }
    if (this.procedural) {
      this.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }
  }
}
