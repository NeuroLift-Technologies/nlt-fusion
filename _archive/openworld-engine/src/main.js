// Boot: renderer -> world -> atmosphere -> player -> loop.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createHeightField, buildTerrain } from './world/terrain.js';
import { buildWater } from './world/water.js';
import { buildSky } from './world/sky.js';
import { buildClouds } from './world/clouds.js';
import { buildWeather } from './world/weather.js';
import { buildVegetation } from './world/vegetation.js';
import { buildSettlement } from './world/settlement.js';
import { createRenderer, buildComposer, loadEnvironment, applyEnvToScene, preloadPresets, setEnvironmentPreset } from './render/pipeline.js';
import { createPlayer } from './player/controls.js';
import { CharacterManager } from './character/CharacterManager.js';
import { spawnFootDust, updateParticles } from './character/particles.js';

// ── Error display ──────────────────────────────────────────────────────────
const errBox = document.getElementById('err');
/**
 * Display an error message to the user in the error overlay box.
 * @param {string} msg - Error message to display
 * @returns {void}
 */
function showError(msg) {
  errBox.style.display = 'block';
  errBox.textContent   = msg;
}

if (location.protocol === 'file:') {
  showError('Please serve this page over HTTP, not file://.\n\n'
    + 'Quick way:\n'
    + '  python -m http.server 8000\n'
    + 'then open http://127.0.0.1:8000/index.html');
  throw new Error('Open world engine must be served over HTTP, not file://.');
}

window.addEventListener('error', (e) => {
  if (errBox.style.display === 'block' && errBox.textContent.includes('serve this page over HTTP')) return;
  const parts = [
    e.message || '',
    e.filename || '',
    e.lineno != null || e.colno != null ? `line ${e.lineno ?? ''}:${e.colno ?? ''}` : '',
    e.error?.message || '',
    e.error?.stack ? e.error.stack.split('\n').slice(0, 4).join('\n') : '',
  ].filter(Boolean).join('\n');
  showError('Runtime error: ' + (parts || e.type));
  console.error('[openworld] unhandled error', e);
});

/**
 * Weather state machine: manages transitions between clear, overcast, and rain.
 * Controls overcast level, rain intensity, and HDRI environment swaps.
 * @returns {void}
 */
/**
 * Weather state machine: manages transitions between clear, overcast, and rain.
 * Controls overcast level, rain intensity, and HDRI environment swaps.
 * @returns {void}
 */
// ── Weather state machine ──────────────────────────────────────────────────
/**
 * Weather state definitions with overcast, rain, and HUD label.
 * @type {Object.<string, {overcast:number, rain:number, label:string}>}
 */
const WEATHER_STATES = {
  clear:    { overcast: 0.0,  rain: 0.0,  label: '☀ Clear'   },
  overcast: { overcast: 0.85, rain: 0.0,  label: '☁ Overcast' },
  rain:     { overcast: 1.0,  rain: 1.0,  label: '🌧 Rain'    },
};
let weatherState   = 'clear';
let targetOvercast = 0;
let targetRain     = 0;
let smoothOvercast = 0;
let smoothRain     = 0;

// Hoisted so the weather state machine (module scope) can swap IBL presets
// on the live scene without plumbing refs through every call site.
let scene = null;

// Maps each weather state to the HDRI preset that represents its lighting.
// `clear` uses the clear pure-sky HDRI; `overcast` and `rain` share the flat
// overcast HDRI (rain is handled by the rain particle system, not a new sky).
/**
 * Maps each weather state to the HDRI preset that represents its lighting.
 * `clear` uses the clear pure-sky HDRI; `overcast` and `rain` share the flat
 * overcast HDRI (rain is handled by the rain particle system, not a new sky).
 * @type {Object.<string, string>}
 */
const WEATHER_PRESETS = { clear: 'clear', overcast: 'overcast', rain: 'overcast' };

/**
 * Transition the weather to a new state (clear, overcast, rain).
 * Updates internal targets, HUD label/buttons, and swaps the HDRI environment preset.
 * @param {string} state - One of 'clear', 'overcast', 'rain'
 * @returns {void}
 */
function setWeather(state) {
  weatherState   = state;
  const s        = WEATHER_STATES[state];
  targetOvercast = s.overcast;
  targetRain     = s.rain;
  document.getElementById('weather-label').textContent = s.label;

  // Highlight active button
  ['btnWeather', 'btnOvercast', 'btnRain'].forEach((id, i) => {
    document.getElementById(id).classList.toggle(
      'active', ['clear', 'overcast', 'rain'][i] === state);
  });

  // Swap the HDRI environment lighting to match the new weather.
  // setEnvironmentPreset no-ops (keeps current env) if the preset wasn't
  // preloaded, so a failed HDRI download never breaks weather toggling.
  setEnvironmentPreset(scene, CONFIG.envMap, WEATHER_PRESETS[state]);
}

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Compute night factor (0=day, 1=night) from time-of-day using smoothstep.
 * @param {number} h - Time of day in hours (0-24)
 * @returns {number} Night factor 0..1
 */
function skyNight(h) {
  const dayT = (h - 6) / 12;
  const sunUp = Math.sin(dayT * Math.PI);
  return THREE.MathUtils.smoothstep(-sunUp, -0.08, 0.25);
}
/**
 * Compute sun elevation fraction from time-of-day.
 * @param {number} h - Time of day in hours (0-24)
 * @returns {number} Sun elevation -1..1 (positive = above horizon)
 */
function skySunUp(h) {
  return Math.sin(((h - 6) / 12) * Math.PI);
}
/**
 * Format time-of-day hours as 12-hour clock string (e.g. '2:30 PM').
 * @param {number} h - Time of day in hours (0-24)
 * @returns {string} Formatted time string
 */
function fmtTime(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

// ── Boot ───────────────────────────────────────────────────────────────────
/**
 * Boot the openworld-engine: initialize renderer, load environment IBL,
 * build all world geometry (terrain, water, sky, clouds, vegetation, settlement),
 * create the player controller and characters, wire up HUD controls,
 * and start the main animation loop.
 * @returns {Promise<void>}
 */
async function boot() {
  const container = document.getElementById('app');
  const camera    = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
  scene           = new THREE.Scene();

  const { renderer, composerModules } = await createRenderer(container, CONFIG.quality);
  renderer.toneMappingExposure = CONFIG.sky.exposure;

  await loadEnvironment(renderer, CONFIG.envMap);
  // Eager-load every weather HDRI preset so weather-driven swaps are instant
  // and never trigger a frame hitch / black screen (graceful if a download 404s).
  await preloadPresets(renderer, CONFIG.envMap);

  const composer = buildComposer(renderer, scene, camera, composerModules,
    window.innerWidth, window.innerHeight);

  // ── World geometry ────────────────────────────────────────────────────────
  const W = CONFIG.world;
  const heightField = createHeightField(W);
  buildTerrain(scene, heightField, W, CONFIG.pbr);
  const water = buildWater(scene, {
    size: W.size, seaLevel: W.seaLevel, opacity: CONFIG.water.opacity,
    colorShallow: CONFIG.water.colorShallow, ior: CONFIG.water.ior,
    transmission: CONFIG.water.transmission, seed: W.seed,
  });
  const sky   = buildSky(scene, { shadowMapSize: CONFIG.quality.shadowMapSize });
  const veg   = buildVegetation(scene, heightField, { seed: W.seed }, {
    treeCount:  CONFIG.vegetation.treeCount,
    grassCount: CONFIG.vegetation.grassCount,
    rockCount:  CONFIG.vegetation.rockCount,
    size: W.size, seaLevel: W.seaLevel,
  });
  const camp = buildSettlement(scene, heightField, W);

  // ── Atmosphere: clouds + weather ──────────────────────────────────────────
  const clouds = buildClouds(scene, CONFIG.atmosphere.clouds);
  const weather = buildWeather(scene, { intensity: 0 });

  // ── Characters ─────────────────────────────────────────────────────────────
  const characterManager = new CharacterManager(scene, heightField, CONFIG.characters);

  // Load the shared animated GLB once; residents clone it (independent walk
  // phases). If it fails, addCharacter falls back to procedural bodies.
  try {
    await characterManager.loadSharedModel(CONFIG.characters.model);
  } catch (e) {
    console.warn('[openworld] shared GLB model unavailable — procedural residents will be used:', e?.message || e);
  }

  const campCenter = camp.campCenter;
  characterManager.addCharacter('resident-1', 'Avery', { x: campCenter.x + 5,  z: campCenter.z + 3 });
  characterManager.addCharacter('resident-2', 'Blake', { x: campCenter.x - 4,  z: campCenter.z + 6 });
  characterManager.addCharacter('resident-3', 'Casey', { x: campCenter.x + 2,  z: campCenter.z - 5 });
  characterManager.addCharacter('resident-4', 'Devon', { x: campCenter.x - 8,  z: campCenter.z - 2 });

  // Apply loaded HDR environment map to every PBR material (terrain,
  // vegetation, settlement, characters) so they share consistent IBL.
  applyEnvToScene(scene, CONFIG.envMap);

  const player = createPlayer(camera, renderer.domElement, heightField, CONFIG.player);
  player.state.pos.set(camp.campCenter.x + 14, 0, camp.campCenter.z + 14);
  player.state.orbitTarget.copy(camp.campCenter).add(new THREE.Vector3(0, 4, 0));

  // ── HUD wiring ─────────────────────────────────────────────────────────────
  const fpsEl          = document.getElementById('fps');
  const posEl          = document.getElementById('pos');
  const todEl          = document.getElementById('tod');
  const residentCountEl = document.getElementById('resident-count');
  const slider         = document.getElementById('timeSlider');

  let timeOfDay = parseFloat(slider.value);
  let dayCycle  = false;

  slider.addEventListener('input', () => { timeOfDay = parseFloat(slider.value); });
  document.getElementById('btnWalk').onclick  = () => player.setMode('walk');
  document.getElementById('btnOrbit').onclick = () => player.setMode('orbit');

  const btnDay = document.getElementById('btnDay');
  btnDay.onclick = () => {
    dayCycle = !dayCycle;
    btnDay.classList.toggle('active', dayCycle);
  };

  // Weather buttons
  document.getElementById('btnWeather').onclick  = () => setWeather('clear');
  document.getElementById('btnOvercast').onclick = () => setWeather('overcast');
  document.getElementById('btnRain').onclick     = () => setWeather('rain');
  setWeather('clear'); // init active state

  // HDR env intensity control
  const envSlider = document.getElementById('envIntensitySlider');
  envSlider.addEventListener('input', () => {
    CONFIG.envMap.envMapIntensity = parseFloat(envSlider.value);
    scene.traverse((obj) => {
      const mat = obj.material;
      if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
        mat.envMapIntensity = CONFIG.envMap.envMapIntensity;
        mat.needsUpdate = true;
      }
    });
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer?.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Main loop ──────────────────────────────────────────────────────────────
  const clock   = new THREE.Clock();
  let frames = 0, fpsT = 0;

  /**
 * Main animation loop: updates weather, sky, clouds, rain, world systems,
 * player, characters, and renders the scene. Runs every animation frame.
 * @returns {void}
 */
function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t  = clock.elapsedTime;

    // ── Time of day ──────────────────────────────────────────────────────────
    if (dayCycle) {
      timeOfDay = (timeOfDay + dt * 0.5) % 24; // full day in ~48 s
      slider.value = timeOfDay;
    }

    // ── Smooth weather transitions ───────────────────────────────────────────
    const weatherSpeed = 0.4; // units/second
    smoothOvercast = THREE.MathUtils.lerp(smoothOvercast, targetOvercast, dt * weatherSpeed);
    smoothRain     = THREE.MathUtils.lerp(smoothRain,     targetRain,     dt * weatherSpeed);

    // ── Sky ──────────────────────────────────────────────────────────────────
    sky.applyTimeOfDay(timeOfDay, CONFIG.sky.sunElevationDeg, CONFIG.sky.sunAzimuthDeg, CONFIG.sky);
    sky.setOvercast(smoothOvercast);
    sky.tick(t);

    const nightFactor = skyNight(timeOfDay);
    const sunUp       = skySunUp(timeOfDay);

    // ── Clouds ───────────────────────────────────────────────────────────────
    clouds.update(dt, nightFactor, smoothOvercast, sunUp);

    // ── Rain ─────────────────────────────────────────────────────────────────
    weather.setIntensity(smoothRain);
    weather.update(dt, camera);

    // ── World updates ─────────────────────────────────────────────────────────
    water.update(t);
    veg.update(t);
    camp.update(t, nightFactor);
    player.update(dt);
    characterManager.update(dt);
    updateParticles(dt);

    // Demo: randomly move residents around the camp
    if (Math.random() < 0.008) {
      const chars = ['resident-1', 'resident-2', 'resident-3', 'resident-4'];
      const id    = chars[Math.floor(Math.random() * chars.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist  = 3 + Math.random() * 10;
      characterManager.setCharacterTarget(
        id, campCenter.x + Math.cos(angle) * dist,
            campCenter.z + Math.sin(angle) * dist);
    }

    // Footstep particles
    if (Math.random() < 0.02) {
      const chars = ['resident-1', 'resident-2', 'resident-3', 'resident-4'];
      const id    = chars[Math.floor(Math.random() * chars.length)];
      const char  = characterManager.getCharacter(id);
      if (char && char.moving) spawnFootDust(scene, char.position);
    }

    // ── Render ────────────────────────────────────────────────────────────────
    if (composer) composer.render();
    else renderer.render(scene, camera);

    // ── HUD (update every 0.5 s) ──────────────────────────────────────────────
    frames++; fpsT += dt;
    if (fpsT >= 0.5) {
      fpsEl.textContent          = Math.round(frames / fpsT);
      frames = 0; fpsT = 0;
      posEl.textContent          = `${player.state.pos.x.toFixed(0)}, ${player.state.pos.z.toFixed(0)}`;
      todEl.textContent          = fmtTime(timeOfDay);
      residentCountEl.textContent = characterManager.getCharacterCount();
    }
  }

  document.getElementById('loading').style.display = 'none';
  loop();
}

boot().catch((e) => {
  const reason = e?.message ? e.message : (e?.stack ? e.stack.split('\n')[0] : String(e));
  showError('Boot failed: ' + reason);
  console.error('[openworld] boot failed', e);
});
