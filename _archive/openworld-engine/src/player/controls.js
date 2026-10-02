// Player: first-person walk (pointer-drag look, WASD, terrain clamp)
// + orbit overview mode. Toggle with 1/2 or HUD buttons.
import * as THREE from 'three';

/**
 * Create a player controller with first-person walk and orbit overview modes.
 * Walk: pointer-drag look, WASD movement, terrain clamp, sprint with Shift.
 * Orbit: auto-rotating camera around a target point, scroll to zoom.
 * @param {THREE.PerspectiveCamera} camera - The camera to control
 * @param {HTMLElement} dom - DOM element for pointer events
 * @param {Object} heightField - Terrain height field sampler
 * @param {function(number,number):number} heightField.sample - Sample terrain height at (x,z)
 * @param {Object} config - Player configuration
 * @param {number} config.walkSpeed - Base movement speed (m/s)
 * @param {number} config.sprintMultiplier - Speed multiplier when sprinting
 * @param {number} config.eyeHeight - Camera height above ground (m)
 * @returns {{state:Object, update:function, setMode:function}} Player controller
 */
export function createPlayer(camera, dom, heightField, config) {
  const state = {
    mode: 'walk', // 'walk' | 'orbit'
    pos: new THREE.Vector3(0, 0, 0),
    yaw: Math.PI * 0.25, pitch: -0.12,
    keys: new Set(),
    orbitTarget: new THREE.Vector3(),
    orbitDist: 90, orbitAngle: 0.6,
  };
  state.pos.set(20, 0, 20);

  let dragging = false, lx = 0, ly = 0;
  dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (state.mode === 'walk') {
      state.yaw -= dx * 0.0032;
      state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0028, -1.2, 1.2);
    } else {
      state.orbitAngle -= dx * 0.005;
      state.orbitDist = THREE.MathUtils.clamp(state.orbitDist + dy * 0.2, 15, 400);
    }
  });
  dom.addEventListener('wheel', (e) => {
    if (state.mode === 'orbit') {
      state.orbitDist = THREE.MathUtils.clamp(state.orbitDist * (1 + Math.sign(e.deltaY) * 0.08), 15, 400);
    }
  }, { passive: true });
  window.addEventListener('keydown', (e) => {
    state.keys.add(e.code);
    if (e.code === 'Digit1') setMode('walk');
    if (e.code === 'Digit2') setMode('orbit');
  });
  window.addEventListener('keyup', (e) => state.keys.delete(e.code));

  /**
   * Get terrain height at world coordinates, clamped to sea level minimum.
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @returns {number} Ground height (never below sea level)
   */
  /**
   * Get terrain height at world coordinates, clamped to sea level minimum.
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @returns {number} Ground height (never below sea level)
   */
  function groundY(x, z) {
    const h = heightField.sample(x, z);
    return Math.max(h, 2.2) ; // seaLevel approx; never sink below water
  }

  /**
   * Switch between 'walk' and 'orbit' modes.
   * @param {string} m - Mode name: 'walk' or 'orbit'
   * @returns {void}
   */
  /**
   * Switch between 'walk' and 'orbit' modes.
   * @param {string} m - Mode name: 'walk' or 'orbit'
   * @returns {void}
   */
  function setMode(m) {
    state.mode = m;
    if (m === 'orbit') {
      state.orbitTarget.copy(state.pos);
    }
    document.getElementById('btnWalk')?.classList.toggle('active', m === 'walk');
    document.getElementById('btnOrbit')?.classList.toggle('active', m === 'orbit');
  }

  const forward = new THREE.Vector3(), right = new THREE.Vector3();
  /**
   * Update player state for one frame: movement, collision, camera transform.
   * @param {number} dt - Time step in seconds
   * @returns {void}
   */
  /**
   * Update player state for one frame: movement, collision, camera transform.
   * @param {number} dt - Time step in seconds
   * @returns {void}
   */
  function update(dt) {
    if (state.mode === 'walk') {
      const sprint = (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight'))
        ? config.sprintMultiplier : 1;
      const speed = config.walkSpeed * sprint;
      forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
      right.set(-forward.z, 0, forward.x);
      const move = new THREE.Vector3();
      if (state.keys.has('KeyW')) move.add(forward);
      if (state.keys.has('KeyS')) move.sub(forward);
      if (state.keys.has('KeyD')) move.add(right);
      if (state.keys.has('KeyA')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        state.pos.add(move);
        const half = 250;
        state.pos.x = THREE.MathUtils.clamp(state.pos.x, -half, half);
        state.pos.z = THREE.MathUtils.clamp(state.pos.z, -half, half);
      }
      if (state.keys.has('KeyR')) state.pos.y += speed * dt;
      else if (state.keys.has('KeyF')) state.pos.y -= speed * dt;
      else state.pos.y = groundY(state.pos.x, state.pos.z) + config.eyeHeight;
      camera.position.copy(state.pos);
      camera.rotation.set(0, 0, 0);
      camera.rotateY(state.yaw);
      camera.rotateX(state.pitch);
    } else {
      state.orbitAngle += dt * 0.03;
      const t = state.orbitTarget;
      camera.position.set(
        t.x + Math.cos(state.orbitAngle) * state.orbitDist,
        t.y + state.orbitDist * 0.55,
        t.z + Math.sin(state.orbitAngle) * state.orbitDist);
      camera.lookAt(t);
    }
  }

  return { state, update, setMode };
}
