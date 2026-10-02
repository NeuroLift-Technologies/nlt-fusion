// Renderer + post: ACES tone mapping, soft shadows, bloom + vignette.
// Post chain is optional — if addons fail to load we fall back to plain.
// Environment: Poly Haven "Pure Sky" HDRIs (searched polyhaven.com/hdris)
// are used for image-based lighting. Presets are preloaded at boot and swapped
// at runtime (e.g. when the weather changes), with a procedural gradient
// fallback so the scene always has IBL even if a download fails.
import * as THREE from 'three';

/** @type {THREE.Texture|null} Active PMREM environment texture for IBL */
export let envMap = null;
/** @type {Object.<string, {texture:THREE.Texture, url:string|null}>} Cached preset textures */
const presetCache = {};

/**
 * Create a WebGLRenderer with ACES tone mapping and optional post-processing chain.
 * Lazily imports three.js post-processing addons; falls back to plain rendering if unavailable.
 * @param {HTMLElement} container - DOM element to append the canvas to
 * @param {Object} quality - Quality configuration
 * @param {number} quality.pixelRatioMax - Cap for device pixel ratio
 * @param {boolean} quality.antialias - Enable antialiasing
 * @param {boolean} quality.shadows - Enable shadow mapping
 * @returns {Promise<{renderer:THREE.WebGLRenderer, composerModules:Object|null}>} Renderer and post modules
 */
export async function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioMax));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  let composer = null;
  try {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');
    const { ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js');
    return { renderer, composerModules: { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass } };
  } catch (e) {
    console.warn('[openworld] post-processing unavailable, plain rendering', e);
    return { renderer, composerModules: null };
  }
}

// ── Environment (IBL) ──────────────────────────────────────────────────────

/**
 * Process one equirectangular HDR URL into a PMREM texture (used for IBL).
 * Returns null if the download/parse fails.
 */
/**
 * Load and process an HDR environment texture via PMREM.
 * Downloads an equirectangular HDR, processes it through PMREMGenerator for IBL.
 * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
 * @param {string} url - URL of the HDR file
 * @param {Object} cfg - Config with optional pmremBlur setting
 * @returns {Promise<THREE.Texture|null>} PMREM-processed texture, or null on failure
 */
async function loadHDRTexture(renderer, url, cfg) {
  if (!url) return null;
  try {
    const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
    const hdr = await new Promise((resolve, reject) => {
      new RGBELoader().load(url, resolve, undefined, reject);
    });
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const result = pmrem.fromEquirectangular(hdr, cfg?.pmremBlur);
    const tex = result.texture;
    hdr.dispose();
    pmrem.dispose();
    console.log('[openworld] HDR environment loaded:', url);
    return tex;
  } catch (e) {
    console.warn('[openworld] HDR load unavailable:', e?.message || e);
    return null;
  }
}

/**
 * Procedural equirectangular fallback (gradient + soft sun blob).
 * Always builds a fresh PMREMGenerator — reusing one that processed a failed
 * HDR load leaves it in a broken internal state in Three.js 0.170.
 */
/**
 * Build a procedural equirectangular environment map as a fallback.
 * Generates a gradient sky with a soft sun blob, processes through PMREM.
 * Always builds a fresh PMREMGenerator to avoid broken state from failed HDR loads.
 * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
 * @returns {THREE.Texture} PMREM-processed procedural environment texture
 */
function buildProceduralEnv(renderer) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const v = y / canvas.height; // 0 top → 1 bottom
      let col;
      if (v < 0.5) col = { r: 47, g: 108, b: 181 };       // top → sky-blue
      else if (v < 0.62) col = { r: 191, g: 217, b: 232 }; // near horizon
      else col = { r: 16, g: 24, b: 36 };                  // bottom → dark
      const sunX = (x - canvas.width * 0.72) / canvas.width;
      const sunY = (y - canvas.height * 0.58) / canvas.height;
      const sunDist = Math.sqrt(sunX * sunX * 4 + sunY * sunY * 2);
      const sun = Math.exp(-sunDist * 520) * 0.55;
      g.data[i]     = Math.min(255, col.r + sun * 255);
      g.data[i + 1] = Math.min(255, col.g + sun * 255);
      g.data[i + 2] = Math.min(255, col.b + sun * 255);
      g.data[i + 3] = 255;
    }
  }
  ctx.putImageData(g, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const result = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  console.log('[openworld] Procedural environment generated');
  return result.texture;
}

/**
 * Load the default environment preset and cache it as the active `envMap`.
 * Resolves the URL from cfg.presets[cfg.default] (falling back to the legacy
 * cfg.url), then applies it to the scene. If loading fails it uses the
 * procedural gradient so IBL is always present.
 */
export async function loadEnvironment(renderer, cfg) {
  const preset = cfg?.default;
  const url = cfg?.presets?.[preset] || cfg?.url;
  let tex = null;
  if (url) tex = await loadHDRTexture(renderer, url, cfg);
  if (!tex && cfg?.procedural) tex = buildProceduralEnv(renderer);
  envMap = tex;
  if (tex) presetCache[preset || 'default'] = { texture: tex, url: url || null };
  return envMap;
}

/**
 * Eagerly load every preset in cfg.presets into the cache so weather-driven
 * swaps at runtime are instant (no per-switch HDRI download). Presets that
 * fail to load are simply omitted from the cache and skipped at swap time.
 */
export async function preloadPresets(renderer, cfg) {
  const presets = cfg?.presets || {};
  await Promise.all(Object.keys(presets).map(async (p) => {
    if (presetCache[p]) return;                       // already loaded (e.g. default)
    const tex = await loadHDRTexture(renderer, presets[p], cfg);
    if (tex) presetCache[p] = { texture: tex, url: presets[p] };
    else console.warn(`[openworld] preset "${p}" unavailable; weather swap will skip it`);
  }));
  return presetCache;
}

/**
 * Swap the active environment map to a preloaded preset and re-apply to the
 * scene. Returns true on success, false if the preset wasn't preloaded (in
 * which case the current env map is kept — graceful degradation).
 */
export function setEnvironmentPreset(scene, cfg, preset) {
  const entry = presetCache[preset];
  if (!entry || !entry.texture) {
    console.warn(`[openworld] preset "${preset}" not loaded; keeping current env map`);
    return false;
  }
  envMap = entry.texture;
  applyEnvToScene(scene, cfg);
  console.log('[openworld] environment preset ->', preset);
  return true;
}

/**
 * Apply the loaded environment map to every PBR material in the scene.
 * Called after loadEnvironment() and after each preset swap.
 */
export function applyEnvToScene(scene, cfg) {
  if (!envMap) return;
  scene.traverse((obj) => {
    const mat = obj.material;
    if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
      mat.envMap = envMap;
      mat.envMapIntensity = mat.envMapIntensity ?? (cfg?.envMapIntensity ?? 1.0);
      mat.needsUpdate = true;
    }
  });
}

/**
 * Vignette post-processing shader — darkens screen edges.
 * Uses a smoothstep falloff from center to create a subtle cinematic effect.
 * @type {{uniforms:Object, vertexShader:string, fragmentShader:string}}
 */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.42 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      c.rgb *= smoothstep(0.95, 0.35, d * (0.6 + uStrength));
      gl_FragColor = c;
    }`,
};

/**
 * Build a post-processing composer chain: RenderPass → UnrealBloom → Vignette → Output.
 * Returns null if post-processing modules are unavailable.
 * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
 * @param {THREE.Scene} scene - The scene to render
 * @param {THREE.Camera} camera - The camera
 * @param {Object|null} modules - Post-processing module imports
 * @param {number} width - Viewport width
 * @param {number} height - Viewport height
 * @returns {EffectComposer|null} The configured composer, or null if modules unavailable
 */
export function buildComposer(renderer, scene, camera, modules, width, height) {
  if (!modules) return null;
  const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass } = modules;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.28, 0.7, 0.85);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VignetteShader));
  composer.addPass(new OutputPass());
  return composer;
}
