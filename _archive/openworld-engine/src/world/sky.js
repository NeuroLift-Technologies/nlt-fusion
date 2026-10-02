// Sky: physically-inspired sky dome with Rayleigh-style scattering, golden-hour
// gradient, Mie-ish sun glow, moon disc + glow, star field with twinkle, and
// height-based horizon haze.  Driven by time-of-day via applyTimeOfDay().
import * as THREE from 'three';

/**
 * Build a physically-inspired sky dome with Rayleigh-style scattering,
 * golden-hour gradients, Mie sun glow, moon disc + glow, and twinkling stars.
 * Includes directional sun light, hemisphere/ambient lights, and exponential fog.
 * Driven by time-of-day via applyTimeOfDay().
 * @param {THREE.Scene} scene - The scene to add sky and lights to
 * @param {Object} config - Sky configuration
 * @param {number} config.shadowMapSize - Shadow map resolution for the sun
 * @returns {{applyTimeOfDay:function, setOvercast:function, tick:function, sun:THREE.DirectionalLight}} Sky controller
 */
export function buildSky(scene, config) {
  /**
   * Build the sky dome geometry and shader material.
   * Uses a large sphere with BackSide rendering and custom scattering shader.
   * @returns {THREE.Mesh} The sky dome mesh
   */
  /**
   * Build the sky dome geometry and shader material.
   * Uses a large sphere with BackSide rendering and custom scattering shader.
   * @returns {THREE.Mesh} The sky dome mesh
   */
  // ── Dome ────────────────────────────────────────────────────────────────────
  const skyGeo = new THREE.SphereGeometry(1200, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTopColor:     { value: new THREE.Color(0x1a4a8a) },
      uMidColor:     { value: new THREE.Color(0x5d9ed4) },
      uHorizonColor: { value: new THREE.Color(0xbfd9e8) },
      uGroundColor:  { value: new THREE.Color(0x080b12) },
      uSunDir:       { value: new THREE.Vector3(0, 1, 0) },
      uSunColor:     { value: new THREE.Color(0xfff2dd) },
      uMoonDir:      { value: new THREE.Vector3(-1, 0.3, 0) },
      uNightFactor:  { value: 0.0 },
      uDuskFactor:   { value: 0.0 },
      uOvercast:     { value: 0.0 },   // 0 = clear, 1 = heavy overcast
      uTime:         { value: 0.0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uTopColor, uMidColor, uHorizonColor, uGroundColor;
      uniform vec3  uSunDir,   uSunColor;
      uniform vec3  uMoonDir;
      uniform float uNightFactor, uDuskFactor, uOvercast, uTime;
      varying vec3  vDir;

      // Pseudo-random helpers
      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float hash2(float n) { return fract(sin(n) * 43758.5453); }

      /**
       * Rayleigh-style scattering: bluer near zenith, hazier/warmer at horizon.
       * Computes sky color based on view direction, sun direction, and time factors.
       */
      vec3 rayleigh(vec3 dir, vec3 sunDir, float nightF, float duskF) {
        float h       = clamp(dir.y, 0.0, 1.0);
        float sunDot  = max(dot(dir, sunDir), 0.0);

        // Base sky gradient: horizon → mid → top
        vec3 sky = mix(uHorizonColor, uMidColor,  smoothstep(0.0, 0.18, h));
        sky       = mix(sky,          uTopColor,  smoothstep(0.12, 0.8,  h));

        // Rayleigh scattering: more blue near zenith, haze near horizon
        float rayleighAmt = 1.0 - h;
        vec3  rayleighCol = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.9, 0.7), duskF);
        sky = mix(sky, sky * rayleighCol, rayleighAmt * 0.45);

        // Horizon haze ring
        float hazeRing = exp(-abs(h) * 8.5) * (1.0 - nightF * 0.6);
        sky += uHorizonColor * hazeRing * 0.35;

        // Dusk / dawn warm band near sun on horizon
        float sunHorizonAmt = pow(max(dot(normalize(vec3(dir.x, 0.0, dir.z)),
                                        normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0), 3.0)
                              * (1.0 - smoothstep(0.0, 0.25, abs(dir.y)));
        sky += vec3(1.0, 0.45, 0.1) * sunHorizonAmt * duskF * 0.7;

        // Mie-ish sun halo
        float mie  = pow(sunDot, 8.0)   * 0.55;
        float disc = pow(sunDot, 900.0) * 2.5;
        sky += uSunColor * (mie + disc) * (1.0 - nightF * 0.9);

        // Night: darken everything
        sky = mix(sky, sky * 0.012, nightF);
        return sky;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h  = clamp(dir.y, -1.0, 1.0);

        vec3 sky;
        if (h >= 0.0) {
          sky = rayleigh(dir, normalize(uSunDir), uNightFactor, uDuskFactor);
        } else {
          // Below horizon: blend horizon into ground
          float t = pow(clamp(-h * 2.0, 0.0, 1.0), 0.6);
          sky = mix(uHorizonColor * 0.6, uGroundColor, t);
          sky = mix(sky, sky * 0.01, uNightFactor);
        }

        // ── Overcast layer: wash out colour, add grey ────────────────────────
        if (uOvercast > 0.0) {
          float occlude = uOvercast * smoothstep(0.0, 0.35, h);
          vec3 overcastCol = mix(vec3(0.72, 0.75, 0.78), vec3(0.35, 0.37, 0.4),
                                 uNightFactor);
          sky = mix(sky, overcastCol, occlude * 0.88);
        }

        // ── Moon disc + glow ─────────────────────────────────────────────────
        if (uNightFactor > 0.02 && h > 0.0) {
          vec3 mDir = normalize(uMoonDir);
          float mDot   = dot(dir, mDir);
          float mDisc  = pow(max(mDot, 0.0), 4000.0) * uNightFactor;
          float mGlow  = pow(max(mDot, 0.0), 18.0)   * uNightFactor * 0.12;
          sky += vec3(0.92, 0.95, 1.0) * (mDisc * 2.0 + mGlow);
        }

        // ── Stars ────────────────────────────────────────────────────────────
        if (uNightFactor > 0.02 && h > 0.0) {
          // Three layers of stars at different scales for depth
          float overcastMask = 1.0 - uOvercast * 0.95;
          float starMask = uNightFactor * smoothstep(0.0, 0.18, h) * overcastMask;

          // Layer 1: fine stars
          vec3 g1 = floor(dir * 240.0);
          float s1 = fract(sin(dot(g1, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float twinkle1 = 0.8 + 0.2 * sin(uTime * 2.3 + s1 * 50.0);
          float star1 = step(0.9986, s1) * starMask * twinkle1;

          // Layer 2: medium stars (fewer, brighter)
          vec3 g2 = floor(dir * 110.0);
          float s2 = fract(sin(dot(g2, vec3(91.123, 43.567, 19.321))) * 12345.6789);
          float twinkle2 = 0.7 + 0.3 * sin(uTime * 1.7 + s2 * 30.0);
          float star2 = step(0.994, s2) * starMask * 1.4 * twinkle2;

          // Layer 3: rare bright stars
          vec3 g3 = floor(dir * 55.0);
          float s3 = fract(sin(dot(g3, vec3(33.7, 127.1, 61.3))) * 8765.4321);
          float twinkle3 = 0.6 + 0.4 * sin(uTime * 1.1 + s3 * 20.0);
          float star3 = step(0.987, s3) * starMask * 2.2 * twinkle3;

          // Slight colour tint per star
          vec3 starTint1 = vec3(0.85 + s1 * 0.15, 0.9 + s1 * 0.1, 1.0);
          vec3 starTint2 = mix(vec3(1.0, 0.9, 0.7), vec3(0.7, 0.85, 1.0), s2);
          sky += starTint1 * star1 + starTint2 * star2 + vec3(1.0) * star3;
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const dome = new THREE.Mesh(skyGeo, skyMat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  scene.add(dome);

  // ── Lights ─────────────────────────────────────────────────────────────────
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
  /** @type {number} Half-size of the shadow camera frustum (m) */
  const R = 260;
  sun.shadow.camera.left   = -R;  sun.shadow.camera.right = R;
  sun.shadow.camera.top    =  R;  sun.shadow.camera.bottom = -R;
  sun.shadow.camera.near   = 1;   sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x3a4a3a, 0.55);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.08);
  scene.add(amb);

  // ── Exponential fog (replaces linear Fog) ──────────────────────────────────
  // density is tuned per-time by applyTimeOfDay
  const fog = new THREE.FogExp2(0xbfd9e8, 0.0016);
  scene.fog = fog;

  /**
   * Precomputed colors for different times of day.
   * Used for smooth interpolation between sky states.
   * @type {Object.<string, THREE.Color>}
   */
  const C = {
    noonTop:    new THREE.Color(0x1a4a8a),
    noonMid:    new THREE.Color(0x5d9ed4),
    noonHor:    new THREE.Color(0xbfd9e8),
    duskTop:    new THREE.Color(0x1a2456),
    duskMid:    new THREE.Color(0xff6633),
    duskHor:    new THREE.Color(0xff9a5c),
    dawnHor:    new THREE.Color(0xffbb88),
    nightTop:   new THREE.Color(0x020308),
    nightMid:   new THREE.Color(0x060b18),
    nightHor:   new THREE.Color(0x0a1420),
    sunNoon:    new THREE.Color(0xfff2dd),
    sunDusk:    new THREE.Color(0xff8833),
    moonColor:  new THREE.Color(0x8fb4ff),
  };

  // ── State ──────────────────────────────────────────────────────────────────
  let _overcast = 0;

  /**
   * Set the overcast level for the sky dome shader.
   * @param {number} v - Overcast level 0..1
   * @returns {void}
   */
  function setOvercast(v) {
    _overcast = THREE.MathUtils.clamp(v, 0, 1);
    skyMat.uniforms.uOvercast.value = _overcast;
  }

  /**
   * Apply time-of-day to the sky dome, lights, and fog.
   * Computes sun/moon direction, night/dusk factors, sky colors,
   * light intensities, and fog density based on the hour.
   * @param {number} hours - Time of day in hours (0-24)
   * @param {number} elevationDeg - Sun elevation in degrees
   * @param {number} azimuthDeg - Sun azimuth in degrees
   * @param {Object} cfg - Sky config with fog density settings
   * @returns {void}
   */
  function applyTimeOfDay(hours, elevationDeg, azimuthDeg, cfg) {
    const densityNoon  = cfg?.fog?.densityNoon  ?? 0.0016;
    const densityNight = cfg?.fog?.densityNight ?? 0.0048;
    const densityRain  = cfg?.fog?.densityRain  ?? 0.0035;

    // ── Sun position ──────────────────────────────────────────────────────
    const dayT  = (hours - 6) / 12;          // 0 at 6h, 1 at 18h
    const sunUp = Math.sin(dayT * Math.PI);  // +1 at noon, ≤0 at night

    const el  = THREE.MathUtils.degToRad(elevationDeg) * Math.max(0, sunUp);
    const az  = THREE.MathUtils.degToRad(azimuthDeg + (hours - 12) * 15);
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    skyMat.uniforms.uSunDir.value.copy(dir);

    // Moon is opposite the sun on the celestial sphere (offset a bit)
    const moonEl  = THREE.MathUtils.degToRad(30);
    const moonAz  = az + Math.PI + 0.4;
    const moonDir = new THREE.Vector3(
      Math.cos(moonEl) * Math.cos(moonAz),
      Math.sin(moonEl),
      Math.cos(moonEl) * Math.sin(moonAz));
    skyMat.uniforms.uMoonDir.value.copy(moonDir);

    // ── Factors ───────────────────────────────────────────────────────────
    // night: smoothly fades in as sun dips below horizon
    const night = THREE.MathUtils.smoothstep(-sunUp, -0.08, 0.25);
    // dusk/dawn: peaks at sun ≈ 0 elevation
    const dusk  = Math.max(0, 1 - Math.abs(sunUp) * 2.4) * (sunUp > -0.2 ? 1 : 0);
    // dawn vs dusk distinction (sunUp rising = dawn, falling = dusk)
    const isDawn = hours < 12 ? 1 : 0;

    skyMat.uniforms.uNightFactor.value = night;
    skyMat.uniforms.uDuskFactor.value  = dusk;

    // ── Sky colours ───────────────────────────────────────────────────────
    // Top
    const topCol = C.noonTop.clone().lerp(C.duskTop, dusk * 0.7).lerp(C.nightTop, night);
    // Mid
    const midCol = C.noonMid.clone().lerp(C.duskMid, dusk * 0.85).lerp(C.nightMid, night);
    // Horizon: dawn slightly pinker, dusk more orange
    const duskHorCol  = isDawn ? C.dawnHor : C.duskHor;
    const horCol = C.noonHor.clone().lerp(duskHorCol, dusk).lerp(C.nightHor, night);

    skyMat.uniforms.uTopColor.value.copy(topCol);
    skyMat.uniforms.uMidColor.value.copy(midCol);
    skyMat.uniforms.uHorizonColor.value.copy(horCol);

    // ── Sun colour / intensity ────────────────────────────────────────────
    const sunCol = C.sunNoon.clone().lerp(C.sunDusk, dusk * 0.9);
    skyMat.uniforms.uSunColor.value.copy(sunCol);

    const sunI = THREE.MathUtils.clamp(sunUp, 0, 1);
    sun.intensity = 0.02 + sunI * 2.6;
    sun.color.copy(sunCol).lerp(C.moonColor, night * 0.9);
    sun.position.copy(dir).multiplyScalar(400);

    hemi.intensity = 0.06 + sunI * 0.5 * (1 - _overcast * 0.4);
    hemi.groundColor.setHex(_overcast > 0.5 ? 0x4a4e52 : 0x3a4a3a);

    // ── Exponential fog ───────────────────────────────────────────────────
    // density increases at night and in rain; overcast adds a little haze
    const baseDensity = THREE.MathUtils.lerp(densityNoon, densityNight, night)
                      + _overcast * densityRain * 0.5;
    fog.density = baseDensity;
    fog.color.copy(horCol);
  }

  /**
   * Update the sky shader time uniform (for star twinkle animation).
   * @param {number} t - Elapsed time in seconds
   * @returns {void}
   */
  function tick(t) {
    skyMat.uniforms.uTime.value = t;
  }

  return { applyTimeOfDay, setOvercast, tick, sun };
}
