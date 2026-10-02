// particles.js — footstep dust and ambient particles
import * as THREE from 'three';

/** @type {number} Maximum number of simultaneous dust particles in the pool */
const MAX_PARTICLES = 200;
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_PARTICLES * 3);
const velocities = new Float32Array(MAX_PARTICLES * 3);
const lifetimes = new Float32Array(MAX_PARTICLES);
const sizes = new Float32Array(MAX_PARTICLES);

particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColor: { value: new THREE.Color(0xc2b280) },
  },
  vertexShader: `
    attribute float size;
    varying float vAlpha;
    void main() {
      vAlpha = size;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.0, d) * vAlpha;
      gl_FragColor = vec4(uColor, a * 0.5);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});

let particleSystem = null;
let particleCount = 0;

/**
 * Get or lazily create the shared particle system in the scene.
 * @param {THREE.Scene} scene - The scene to add the particle system to
 * @returns {THREE.Points} The particle system
 */
function getParticleSystem(scene) {
  if (!particleSystem) {
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);
  }
  return particleSystem;
}

/**
 * Spawn a footstep dust puff at the given world position.
 * Recycles the first dead particle slot in the fixed-size pool.
 * Particles rise, fall under gravity, and fade out over their lifetime.
 * @param {THREE.Scene} scene - The scene to add the particle system to (lazily created)
 * @param {THREE.Vector3} position - World position where the foot strikes ground
 * @returns {void}
 */
export function spawnFootDust(scene, position) {
  const system = getParticleSystem(scene);
  const pos = particleGeometry.attributes.position.array;
  const vel = velocities;
  const life = lifetimes;
  const sz = sizes;

  // Find dead particle slot
  let slot = -1;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (life[i] <= 0) { slot = i; break; }
  }
  if (slot === -1) return; // all particles active

  const i3 = slot * 3;
  pos[i3] = position.x + (Math.random() - 0.5) * 0.3;
  pos[i3 + 1] = 0.05;
  pos[i3 + 2] = position.z + (Math.random() - 0.5) * 0.3;

  vel[i3] = (Math.random() - 0.5) * 0.3;
  vel[i3 + 1] = 0.3 + Math.random() * 0.4;
  vel[i3 + 2] = (Math.random() - 0.5) * 0.3;

  life[slot] = 0.6 + Math.random() * 0.4;
  sz[slot] = 1.0;

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
}

/**
 * Update all active footstep dust particles by one time step.
 * Applies gravity, advances position, fades size by remaining lifetime,
 * and hides dead particles by moving them far below the scene.
 * @param {number} delta - Time step in seconds
 * @returns {void}
 */
export function updateParticles(delta) {
  if (!particleSystem) return;

  const pos = particleGeometry.attributes.position.array;
  const vel = velocities;
  const life = lifetimes;
  const sz = sizes;

  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (life[i] <= 0) continue;

    const i3 = i * 3;
    life[i] -= delta;

    // Physics
    pos[i3] += vel[i3] * delta;
    pos[i3 + 1] += vel[i3 + 1] * delta;
    pos[i3 + 2] += vel[i3 + 2] * delta;
    vel[i3 + 1] -= 1.5 * delta; // gravity

    // Fade out
    sz[i] = Math.max(0, life[i]);

    if (life[i] <= 0) {
      pos[i3 + 1] = -1000; // hide dead particles
    }
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
}

/**
 * Dispose and remove the entire particle system from the scene.
 * Resets the internal state so the next spawnFootDust() recreates it.
 * @returns {void}
 */
export function resetParticles() {
  if (particleSystem) {
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
    particleSystem.parent?.remove(particleSystem);
    particleSystem = null;
  }
}
