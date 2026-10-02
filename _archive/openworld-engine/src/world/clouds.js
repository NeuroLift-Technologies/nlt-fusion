// Clouds: a scrolling billboard deck of procedural cloud puffs.
//
// Implementation strategy:
//   - A large flat plane at cloud altitude rendered with a custom shader
//     that uses multiple octaves of FBM noise to produce a soft, fluffy
//     cloud pattern.  The texture scrolls slowly with wind direction.
//   - A second, thinner wisp layer above it adds depth without extra
//     draw calls (second UV set with different scroll speed + rotation).
//   - Density, coverage, and colour are driven by the weather state.
//
// API
//   buildClouds(scene, config) → { update(dt, nightFactor, overcast), setOvercast(v) }
//
import * as THREE from 'three';

// ── Vertex shader ─────────────────────────────────────────────────────────────
/**
 * GLSL vertex shader for cloud plane.
 * Passes UV and radial distance for edge fade.
 * @type {string}
 */
const CLOUD_VERT = /* glsl */`
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vDist = length(worldPos.xz);   // radial distance from centre (for edge fade)
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ── Fragment shader ───────────────────────────────────────────────────────────
// Two-layer FBM clouds with soft alpha.
/**
 * GLSL fragment shader for cloud rendering.
 * Two-layer FBM noise with edge fade, night dimming, and sun-angle warm tint.
 * @type {string}
 */
const CLOUD_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uCoverage;   // 0 = clear sky, 1 = overcast
  uniform float uDensity;    // edge softness tuning
  uniform vec2  uWind;       // slow drift direction
  uniform vec3  uCloudColor; // lit side
  uniform vec3  uShadowColor;// shadowed underside
  uniform float uNight;      // 0=day 1=night (dims clouds)
  uniform float uSunAngle;   // sun elevation fraction 0..1 (for shading)
  varying vec2  vUv;
  varying float vDist;

  // 2-D value noise
  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    return mix(
      mix(hash2(i),               hash2(i + vec2(1,0)), f.x),
      mix(hash2(i + vec2(0,1)),   hash2(i + vec2(1,1)), f.x), f.y);
  }

  // FBM (fractal Brownian motion) — 5 octaves
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * valueNoise(p);
      p  = p * 2.1 + vec2(3.17, 1.83);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Primary cloud layer
    vec2 uv1 = vUv * 3.5 + uWind * uTime * 0.012;
    float n1  = fbm(uv1);

    // Secondary wispy layer (smaller, faster)
    vec2 uv2 = vUv * 6.8 + uWind * uTime * 0.022 + vec2(1.4, -0.8);
    float n2  = fbm(uv2) * 0.45;

    float cloud = clamp((n1 + n2 - (1.0 - uCoverage)) * uDensity, 0.0, 1.0);
    cloud = smoothstep(0.0, 1.0, cloud);

    // Edge fade so the disc doesn't have a sharp cutoff
    float edgeFade = 1.0 - smoothstep(0.3, 0.5, vDist / 900.0);
    cloud *= edgeFade;

    if (cloud < 0.01) discard;

    // Shading: lit top with warm scatter, darker underside
    float shadow = clamp(1.0 - n2 * 0.8, 0.5, 1.0);
    vec3 col = mix(uShadowColor, uCloudColor, shadow);
    col = mix(col, col * 0.18, uNight * 0.9);

    // Sun-angle warm tint at golden hour
    col = mix(col, col * vec3(1.15, 0.95, 0.8), uSunAngle * 0.3);

    gl_FragColor = vec4(col, cloud * 0.88);
  }
`;

/**
 * Build a procedural cloud layer on a large horizontal plane.
 * Uses FBM noise in a custom shader to render scrolling, lit cloud puffs.
 * Cloud appearance adapts to weather (coverage, density, color) and time of day.
 * @param {THREE.Scene} scene - The scene to add the cloud mesh to
 * @param {Object} config - Cloud configuration
 * @param {number} [config.altitude=110] - Height above sea level (m)
 * @param {number} [config.radius=1800] - Plane half-size (m)
 * @param {number} [config.coverage=0.42] - Sky coverage 0..1
 * @param {number} [config.density=2.8] - Edge softness threshold
 * @param {{x:number,y:number}} [config.windDir] - Wind direction vector
 * @param {number} [config.windSpeed=1.0] - Wind speed multiplier
 * @returns {{mesh:THREE.Mesh, update:function, setOvercast:function}} Cloud controller
 */
export function buildClouds(scene, config) {
  const altitude   = config.altitude   ?? 110;  // metres above sea level
  const radius     = config.radius     ?? 1800;  // plane half-size
  const coverage   = config.coverage   ?? 0.42; // default ~40 % sky covered
  const density    = config.density    ?? 2.8;
  const _wd = config.windDir ?? { x: 1.0, y: 0.4 };
  const windDir   = new THREE.Vector2(_wd.x ?? 1.0, _wd.y ?? 0.4);
  const windSpeed = config.windSpeed ?? 1.0;   // multiplier

  // ── Geometry: large horizontal quad ───────────────────────────────────────
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);

  // ── Material ───────────────────────────────────────────────────────────────
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:        { value: 0 },
      uCoverage:    { value: coverage },
      uDensity:     { value: density },
      uWind:        { value: windDir.clone().normalize().multiplyScalar(windSpeed) },
      uCloudColor:  { value: new THREE.Color(0xf0f4f8) },
      uShadowColor: { value: new THREE.Color(0x9aa8b8) },
      uNight:       { value: 0 },
      uSunAngle:    { value: 1 },
    },
    vertexShader:   CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent:    true,
    depthWrite:     false,
    side:           THREE.FrontSide,
    fog:            false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y    = altitude;
  mesh.frustumCulled = false;
  mesh.renderOrder   = 1;   // render after sky dome
  mesh.name          = 'clouds';
  scene.add(mesh);

  // ── State ──────────────────────────────────────────────────────────────────
  let elapsed = 0;

  /**
   * Update cloud coverage, density, and color to reflect overcast level.
   * Coverage approaches 0.90, density tightens for a grey blanket effect.
   * @param {number} v - Overcast level 0..1
   * @returns {void}
   */
  function setOvercast(v) {
    // overcast: coverage approaches 1, density tightens for a grey blanket
    const c = THREE.MathUtils.clamp(v, 0, 1);
    mat.uniforms.uCoverage.value = THREE.MathUtils.lerp(coverage, 0.90, c);
    mat.uniforms.uDensity.value  = THREE.MathUtils.lerp(density,  4.5,  c);
    const greyAmt = c * 0.65;
    mat.uniforms.uCloudColor.value.setRGB(
      THREE.MathUtils.lerp(0.94, 0.65, greyAmt),
      THREE.MathUtils.lerp(0.96, 0.67, greyAmt),
      THREE.MathUtils.lerp(0.97, 0.69, greyAmt)
    );
    mat.uniforms.uShadowColor.value.setRGB(
      THREE.MathUtils.lerp(0.60, 0.40, greyAmt),
      THREE.MathUtils.lerp(0.66, 0.43, greyAmt),
      THREE.MathUtils.lerp(0.72, 0.46, greyAmt)
    );
  }

  /**
   * Update cloud state for one frame: time, night dimming, sun angle, and overcast.
   * @param {number} dt - Time step in seconds
   * @param {number} [nightFactor=0] - Night dimming factor 0..1
   * @param {number} [overcast=0] - Overcast level 0..1
   * @param {number} [sunUp=1] - Sun elevation fraction
   * @returns {void}
   */
  function update(dt, nightFactor, overcast, sunUp) {
    elapsed += dt;
    mat.uniforms.uTime.value    = elapsed;
    mat.uniforms.uNight.value   = nightFactor ?? 0;
    mat.uniforms.uSunAngle.value = 1.0 - (sunUp ?? 1);  // low sun = 1
    // Transition overcast smoothly each frame if called every tick
    setOvercast(overcast ?? 0);
  }

  return { mesh, update, setOvercast };
}
