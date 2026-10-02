// Weather: rain particle system + overcast mode.
//
// Rain is rendered as a GPU points system using a custom shader.
// Droplets fall from a volume above the camera, wrap around (recycled),
// and streak downward with a length proportional to fall speed.
// An intensity slider fades in/out the effect.
//
// API
//   buildWeather(scene, config) → {
//     update(dt, camera, overcast),
//     setIntensity(0..1),
//     setOvercast(0..1),
//     get intensity, get overcast
//   }
//
import * as THREE from 'three';

// ── Shaders ────────────────────────────────────────────────────────────────

/**
 * GLSL vertex shader for rain droplet streaks.
 * Elongates point sprites vertically based on per-droplet length attribute.
 * @type {string}
 */
const RAIN_VERT = /* glsl */`
  attribute float aLen;      // streak length
  uniform float uSize;       // world-space pixel scale
  uniform float uTime;
  varying float vAlpha;
  varying float vLen;

  void main() {
    vAlpha = 1.0;
    vLen   = aLen;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * (1.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

/**
 * GLSL fragment shader for rain droplet streaks.
 * Stretches point coords into vertical streaks with alpha fade.
 * @type {string}
 */
const RAIN_FRAG = /* glsl */`
  uniform float uIntensity;
  varying float vAlpha;
  varying float vLen;

  void main() {
    // Elongate each point into a vertical streak
    vec2 uv = gl_PointCoord - 0.5;
    // aspect: each point is square, stretch vertically
    float streak = smoothstep(0.5, 0.0, abs(uv.x) * 6.0)
                 * smoothstep(0.5, 0.0, abs(uv.y) - vLen * 0.5 + 0.5);
    if (streak < 0.05) discard;
    float alpha = streak * uIntensity * 0.55;
    gl_FragColor = vec4(0.72, 0.82, 0.92, alpha);
  }
`;

// ── Constants ──────────────────────────────────────────────────────────────
/** @type {number} Maximum simultaneous rain droplets in the pool */
const POOL_SIZE    = 14000;
/** @type {number} Horizontal spawn box half-size around camera (m) */
const SPAWN_RADIUS = 120;
/** @type {number} Spawn height above camera (m) */
const SPAWN_HEIGHT = 55;
/** @type {number} Base fall speed (m/s) */
const FALL_SPEED   = 26;
/** @type {number} Lateral wind drift (m/s) */
const WIND_X       = 1.8;
/** @type {number} Y threshold below camera where droplets recycle (m) */
const RECYCLE_Y    = -8;
/** @type {number} Horizontal spawn box half-size around camera (m) */
const SPAWN_RADIUS = 120;
/** @type {number} How high above camera to spawn (m) */
const SPAWN_HEIGHT = 55;
/** @type {number} Base fall speed (m/s) */
const FALL_SPEED   = 26;
/** @type {number} Slight sideways drift (m/s) */
const WIND_X       = 1.8;
/** @type {number} Recycled when this far below camera (m) */
const RECYCLE_Y    = -8;

// ── Build ──────────────────────────────────────────────────────────────────
/**
 * Build a GPU rain particle system with custom streak shader.
 * Rain droplets fall from a volume above the camera, recycle when out of view,
 * and fade in/out based on intensity. The volume follows the camera.
 * @param {THREE.Scene} scene - The scene to add the rain points to
 * @param {Object} config - Weather configuration
 * @param {number} [config.intensity=0.0] - Initial rain intensity 0..1
 * @returns {{points:THREE.Points, update:function, setIntensity:function, setOvercast:function, intensity:number, overcast:number}} Weather controller
 */
export function buildWeather(scene, config) {
  const intensity = config.intensity ?? 0.0;
  const enabled   = intensity > 0;

  // ── Geometry ─────────────────────────────────────────────────────────────
  const positions = new Float32Array(POOL_SIZE * 3);
  const lengths   = new Float32Array(POOL_SIZE);

  // Randomise initial positions in the spawn volume
  for (let i = 0; i < POOL_SIZE; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * SPAWN_RADIUS * 2;
    positions[i * 3 + 1] = Math.random() * SPAWN_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * SPAWN_RADIUS * 2;
    lengths[i] = 0.28 + Math.random() * 0.32;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLen',     new THREE.BufferAttribute(lengths, 1));

  // ── Material ──────────────────────────────────────────────────────────────
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize:      { value: 220.0 },
      uIntensity: { value: intensity },
      uTime:      { value: 0.0 },
    },
    vertexShader:   RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    fog:            false,
  });

  const points = new THREE.Points(geo, mat);
  points.name          = 'rain';
  points.frustumCulled = false;
  points.visible       = false; // start hidden
  scene.add(points);

  // ── State ──────────────────────────────────────────────────────────────────
  let _intensity = intensity;
  let _overcast  = 0;
  let _elapsed   = 0;
  const _camPos  = new THREE.Vector3();

  /**
   * Set rain intensity (0 = no rain, 1 = heavy). Updates shader uniform and visibility.
   * @param {number} v - Intensity 0..1
   * @returns {void}
   */
  function setIntensity(v) {
    _intensity = THREE.MathUtils.clamp(v, 0, 1);
    mat.uniforms.uIntensity.value = _intensity;
    points.visible = _intensity > 0.01;
  }

  /**
   * Set overcast level (stored for external read; clouds handle visual changes).
   * @param {number} v - Overcast 0..1
   * @returns {void}
   */
  function setOvercast(v) {
    _overcast = THREE.MathUtils.clamp(v, 0, 1);
  }

  /**
   * Call once per frame from the main loop.
   * @param {number} dt          Delta time in seconds
   * @param {THREE.Camera} camera Current camera (rain volume follows it)
   */
  function update(dt, camera) {
    if (_intensity < 0.01) return;

    _elapsed += dt;
    mat.uniforms.uTime.value = _elapsed;

    camera.getWorldPosition(_camPos);

    const pos     = geo.attributes.position.array;
    const fallDt  = FALL_SPEED * dt * (0.8 + _intensity * 0.4);
    const windDt  = WIND_X * dt;

    for (let i = 0; i < POOL_SIZE; i++) {
      const idx = i * 3;
      pos[idx]     += windDt;
      pos[idx + 1] -= fallDt;

      // Recycle droplets that have fallen out of the view volume
      const relX = pos[idx]     - _camPos.x;
      const relY = pos[idx + 1] - _camPos.y;
      const relZ = pos[idx + 2] - _camPos.z;

      if (relY < RECYCLE_Y ||
          Math.abs(relX) > SPAWN_RADIUS ||
          Math.abs(relZ) > SPAWN_RADIUS) {
        pos[idx]     = _camPos.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        pos[idx + 1] = _camPos.y + SPAWN_HEIGHT - Math.random() * 8;
        pos[idx + 2] = _camPos.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
      }
    }

    geo.attributes.position.needsUpdate = true;
  }

  // expose read-only state for main.js
  Object.defineProperties({ setIntensity, setOvercast, update }, {
    intensity: { get: () => _intensity },
    overcast:  { get: () => _overcast },
  });

  return {
    points,
    update,
    setIntensity,
    setOvercast,
    get intensity() { return _intensity; },
    get overcast()  { return _overcast;  },
  };
}
