// Procedural PBR texture generation.
// All maps are baked to HTML5 canvas at load time — no external assets, no build step.
// Generates tiling sets of color / normal / roughness (and optional AO) maps so
// surfaces that previously used flat MeshStandardMaterial colors gain real
// micro-detail and respond correctly to the HDR environment map (IBL).
import * as THREE from 'three';
import { makeNoise2D, makeFbm } from '../world/noise.js';

/** @type {THREE.ColorSpace} Linear color space for non-color maps (normal, roughness) */
const LINEAR = THREE.NoColorSpace;
/** @type {THREE.ColorSpace} SRGB color space for color/albedo maps */
const SRGB = THREE.SRGBColorSpace;

/**
 * Create a square HTML canvas for procedural texture generation.
 * @param {number} size - Canvas width and height in pixels
 * @returns {HTMLCanvasElement} Created canvas element
 */
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Wrap a canvas into a tiled CanvasTexture with RepeatWrapping.
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {number} repeat - Tile repeat count in U and V
 * @param {string} [colorSpace=SRGB] - THREE color space constant
 * @param {number} [anisotropy=4] - Anisotropy level for mipmapping
 * @returns {THREE.CanvasTexture} Configured tiling texture
 */
function tex(canvas, repeat, colorSpace = SRGB, anisotropy = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = colorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/**
 * Generate a tangent-space normal map from a scalar height field using central differences.
 * @param {Float32Array} H - Height field array (length w*h)
 * @param {number} w - Image width
 * @param {number} h - Image height
 * @param {number} strength - Slope strength multiplier
 * @returns {ImageData} RGB normal map (tangent space, wrapped)
 */
function normalFromHeight(H, w, h, strength) {
  const img = new ImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xp = (x + 1) % w, xm = (x - 1 + w) % w;
      const yp = (y + 1) % h, ym = (y - 1 + h) % h;
      const hL = H[y * w + xm], hR = H[y * w + xp];
      const hD = H[ym * w + x], hU = H[yp * w + x];
      const gx = (hR - hL) * strength;
      const gz = (hU - hD) * strength;
      const len = Math.sqrt(gx * gx + gz * gz + 1);
      const nx = gx / len, nz = gz / len, ny = 1 / len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  return img;
}

/**
 * Generate a complete tiling PBR texture set (color, roughness, normal, optional AO)
 * from callback functions evaluated per-pixel.
 * @param {Object} opts - Texture set options
 * @param {number} opts.size - Texture resolution
 * @param {number} opts.repeat - Tile repeat count
 * @param {number} opts.seed - Noise seed
 * @param {function} opts.colorFn - (fbm, u, v) => [r, g, b] in 0..255
 * @param {function} opts.roughFn - (fbm, u, v) => roughness 0..1
 * @param {function} [opts.normalFn] - (fbm, u, v) => height for normal map
 * @param {function} [opts.aoFn] - (fbm, u, v) => AO 0..1
 * @param {number} [opts.normalStrength=1] - Normal map slope strength
 * @param {string} [opts.colorSpace=SRGB] - Color space for the color map
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture, ao?:THREE.Texture}} Texture set
 */
function makeSet({
  size, repeat, seed, colorFn, roughFn, normalFn, aoFn, normalStrength = 1, colorSpace = SRGB,
}) {
  const noise = makeNoise2D(seed);
  const fbm = makeFbm(noise, 4);
  const canvasColor = makeCanvas(size), canvasRough = makeCanvas(size);
  const canvasNormal = makeCanvas(size), canvasAO = makeCanvas(size);
  const ci = canvasColor.getContext('2d').createImageData(size, size);
  const ri = canvasRough.getContext('2d').createImageData(size, size);
  const ai = canvasAO.getContext('2d').createImageData(size, size);

  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    H[y * size + x] = normalFn ? normalFn(fbm, x / size, y / size) : 0;
  }

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const i = (y * size + x) * 4;

    const [cr, cg, cb] = colorFn(fbm, u, v);
    ci.data[i] = cr; ci.data[i + 1] = cg; ci.data[i + 2] = cb; ci.data[i + 3] = 255;

    const r = roughFn(fbm, u, v);
    const rv = Math.max(0, Math.min(255, r * 255));
    ri.data[i] = rv; ri.data[i + 1] = rv; ri.data[i + 2] = rv; ri.data[i + 3] = 255;

    if (aoFn) {
      const a = aoFn(fbm, u, v);
      const av = Math.max(0, Math.min(255, a * 255));
      ai.data[i] = av; ai.data[i + 1] = av; ai.data[i + 2] = av; ai.data[i + 3] = 255;
    }
  }

  canvasColor.getContext('2d').putImageData(ci, 0, 0);
  canvasRough.getContext('2d').putImageData(ri, 0, 0);
  canvasNormal.getContext('2d').putImageData(normalFromHeight(H, size, size, normalStrength), 0, 0);
  if (aoFn) canvasAO.getContext('2d').putImageData(ai, 0, 0);

  const out = {
    color: tex(canvasColor, repeat, colorSpace),
    roughness: tex(canvasRough, repeat, LINEAR),
    normal: tex(canvasNormal, repeat, LINEAR),
  };
  if (aoFn) out.ao = tex(canvasAO, repeat, LINEAR);
  return out;
}

/**
 * Biome color palette shared with terrain.js vertex colors.
 * Each entry maps a biome name to its representative THREE.Color.
 * @type {Object<string, THREE.Color>}
 */
export const BIOME = {
  sand: new THREE.Color(0xc2b280),
  grass: new THREE.Color(0x4d7c3a),
  grassDry: new THREE.Color(0x7d9b4a),
  rock: new THREE.Color(0x6b6f75),
  snow: new THREE.Color(0xe8edf2),
  moss: new THREE.Color(0x3a5a22),
  dirt: new THREE.Color(0x5a4630),
};

/**
 * Generate tiling terrain detail maps (color, roughness, normal) as micro-detail
 * layered on top of vertex-color biome bands. UV space maps to tileSize meters.
 * Roughness is derived from the heightfield so it matches the actual biome/elevation.
 * @param {Object} config - PBR config with size, seed, tileSize, seaLevel
 * @param {Object} heightField - Terrain height sampler for roughness lookup
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled PBR maps
 */
export function createTerrainDetail(config, heightField) {
  const tileSize = config.tileSize ?? 8;
  const repeat = Math.max(1, Math.floor(config.size / tileSize));
  const seed = config.seed;
  const seaLevel = config.seaLevel;

  return makeSet({
    size: 256,
    repeat,
    seed,
    normalStrength: 2.4,
    colorFn: (fbm, u, v) => {
      // micro tint jitter + coarse moisture proxy for moss/dirt variation
      const dryness = 1 - fbm(u * 3, v * 3) * 0.5 - 0.5;
      const jitter = 0.92 + fbm(u * 20, v * 20) * 0.08;
      const t = dryness > 0.55 ? 1 : 1.06; // damp=darker, dry=bright
      const c = jitter * t;
      return [
        Math.min(255, 180 + fbm(u * 30, v * 30) * 50 * c),
        Math.min(255, 150 + fbm(u * 25, v * 28) * 60 * c),
        Math.min(255, 90 + fbm(u * 22, v * 31) * 60 * c),
      ];
    },
    roughFn: (fbm, u, v) => {
      // derive biome from heightfield so roughness matches the land
      const wx = (u - 0.5) * config.size;
      const wz = (v - 0.5) * config.size;
      const h = heightField.sample(wx, wz);
      let base;
      if (h < seaLevel + 1) base = 0.7;        // sand/wet
      else if (h < seaLevel + 8) base = 0.88;  // grass
      else if (h < seaLevel + 16) base = 0.85;  // rocky
      else base = 0.35;                         // snow (hard packed)
      return base + fbm(u * 18, v * 19) * 0.08;
    },
    normalFn: (fbm, u, v) => fbm(u * 12, v * 12),
  });
}

/**
 * Generate a tiling rock/stone PBR texture set (color, roughness, normal).
 * Produces grey-toned stone with subtle FBM variation.
 * @param {Object} [config={}] - Configuration with optional seed
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled rock maps
 */
export function createRockSet(config = {}) {
  return makeSet({
    size: 256,
    repeat: 2,
    seed: config.seed ?? 1,
    normalStrength: 1.8,
    colorFn: (fbm, u, v) => {
      const n = fbm(u * 5, v * 5);
      const g = 110 + n * 40;
      return [g, g, g];
    },
    roughFn: (fbm, u, v) => 0.92 + fbm(u * 6, v * 6) * 0.06,
    normalFn: (fbm, u, v) => fbm(u * 8, v * 8),
  });
}

/**
 * Generate a tiling wood/bark PBR texture set with vertical grain streaks
 * and occasional darker knots.
 * @param {Object} [config={}] - Configuration with optional seed
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled wood maps
 */
export function createWoodSet(config = {}) {
  return makeSet({
    size: 256,
    repeat: 4,
    seed: config.seed ?? 2,
    normalStrength: 1.4,
    colorFn: (fbm, u, v) => {
      // vertical grain streaks
      const grain = 0.5 + 0.5 * Math.sin(v * 30 + fbm(u * 4, v * 2) * 2);
      const r = 72 + grain * 40;
      const g = 40 + grain * 30;
      const b = 16 + grain * 24;
      // darker knots
      const knot = fbm(u * 3, v * 3) > 0.85 ? 0.8 : 1;
      return [r * knot, g * knot, b * knot];
    },
    roughFn: (fbm, u, v) => 0.78 + fbm(u * 6, v * 6) * 0.12,
    normalFn: (fbm, u, v) => {
      const grain = Math.sin(v * 30) * 0.15;
      return grain + fbm(u * 8, v * 7) * 0.3;
    },
  });
}

/**
 * Generate a tiling foliage/leaf PBR texture set with green tones and
 * lighter sunlit patches on leaf edges.
 * @param {Object} [config={}] - Configuration with optional seed
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled foliage maps
 */
export function createFoliageSet(config = {}) {
  return makeSet({
    size: 256,
    repeat: 2,
    seed: config.seed ?? 3,
    normalStrength: 1.2,
    colorFn: (fbm, u, v) => {
      const n = fbm(u * 7, v * 7);
      const r = 58 + n * 50;
      const g = 115 + n * 60;
      const b = 50 + n * 50;
      // lighter patches (sunlit leaf edges)
      const lit = fbm(u * 14, v * 14) > 0.7 ? 1.2 : 1;
      return [r * lit, g * lit, b * lit];
    },
    roughFn: (fbm, u, v) => 0.82 + fbm(u * 6, v * 7) * 0.12,
    normalFn: (fbm, u, v) => fbm(u * 10, v * 10) * 0.5,
  });
}

/**
 * Generate a tiling fabric/cloth PBR texture set with subtle weave variation
 * tinted by the given base color.
 * @param {number} [color=0xb8472f] - Base cloth color hex
 * @param {Object} [config={}] - Configuration with optional seed
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled cloth maps
 */
export function createClothSet(color = 0xb8472f, config = {}) {
  const base = new THREE.Color(color);
  return makeSet({
    size: 256,
    repeat: 6,
    seed: config.seed ?? 4,
    normalStrength: 1.0,
    colorFn: (fbm, u, v) => {
      const n = fbm(u * 9, v * 9) * 0.12 + fbm(u * 20, v * 20) * 0.06;
      return [(base.r * (1 + n)) * 255, (base.g * (1 + n)) * 255, (base.b * (1 + n)) * 255];
    },
    roughFn: (fbm, u, v) => 0.85 + fbm(u * 6, v * 6) * 0.1,
    normalFn: (fbm, u, v) => fbm(u * 11, v * 11) * 0.4,
  });
}

/**
 * Generate a tiling skin PBR texture set with warm tone and fine pore detail.
 * @param {Object} [config={}] - Configuration with optional seed
 * @returns {{color:THREE.Texture, roughness:THREE.Texture, normal:THREE.Texture}} Tiled skin maps
 */
export function createSkinSet(config = {}) {
  return makeSet({
    size: 256,
    repeat: 3,
    seed: config.seed ?? 5,
    normalStrength: 0.8,
    colorFn: (fbm, u, v) => {
      const n = fbm(u * 8, v * 8) * 0.08 + fbm(u * 18, v * 18) * 0.04;
      // base skin tone (warm)
      return [218 * (1 + n), 165 * (1 + n), 115 * (1 + n)];
    },
    roughFn: (fbm, u, v) => 0.55 + fbm(u * 6, v * 6) * 0.15,
    normalFn: (fbm, u, v) => fbm(u * 9, v * 9) * 0.3,
  });
}

/**
 * Generic PBR material factory.
 * Creates a MeshStandardMaterial and attaches optional texture maps.
 * When a color map is provided, the base color is reset to white so the texture drives it.
 * @param {Object} [opts={}] - Material options
 * @param {number} [opts.color] - Base color hex (overridden to white if maps.color is set)
 * @param {number} [opts.roughness=0.8] - Surface roughness 0..1
 * @param {number} [opts.metalness=0] - Surface metalness 0..1
 * @param {Object} [opts.maps] - Texture maps: color, roughness, normal, ao, metalness
 * @param {number} [opts.side=THREE.FrontSide] - Material side
 * @param {boolean} [opts.flatShading=false] - Enable flat shading
 * @returns {THREE.MeshStandardMaterial} Configured PBR material
 */
export function makePBRMaterial(opts = {}) {
  const { color, roughness = 0.8, metalness = 0, side, maps = {}, flatShading = false, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color ?? 0x888888),
    roughness, metalness,
    side: side ?? THREE.FrontSide,
    flatShading: !!flatShading,
    ...rest,
  });
  if (maps.color) { m.map = maps.color; m.color.set(0xffffff); }
  if (maps.roughness) m.roughnessMap = maps.roughness;
  if (maps.normal) { m.normalMap = maps.normal; m.normalScale = new THREE.Vector2(1, 1); }
  if (maps.ao) m.aoMap = maps.ao;
  if (maps.metalness) m.metalnessMap = maps.metalness;
  return m;
}
