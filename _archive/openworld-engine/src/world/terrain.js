// Terrain: heightfield mesh with procedural PBR textures (color, normal,
// roughness baked from the height field at load time — no vertex colors).
import * as THREE from 'three';
import { makeNoise2D, makeFbm, mulberry32 } from './noise.js';
import { createTerrainDetail } from '../materials/pbr.js';

// --- small hash-based value noise for textgeneration ---
/**
 * Hash function for deterministic pseudo-random value at integer lattice point.
 * @param {number} x - Integer X coordinate
 * @param {number} y - Integer Y coordinate
 * @param {number} seed - Seed value
 * @returns {number} Hash value in [0, 1)
 */
function noiseHash(x, y, seed) {
  let h = (seed + x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/**
 * 2D value noise with smoothstep interpolation.
 * @param {number} x - X coordinate (can be fractional)
 * @param {number} y - Y coordinate (can be fractional)
 * @param {number} seed - Seed for the hash function
 * @returns {number} Noise value in [0, 1)
 */
function noise2D(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = noiseHash(xi, yi, seed), b = noiseHash(xi + 1, yi, seed);
  const c = noiseHash(xi, yi + 1, seed), d = noiseHash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/**
 * 2D fractal Brownian motion (multiple octaves of noise).
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} seed - Seed for the base noise
 * @param {number} octaves - Number of noise layers
 * @returns {number} fBm value in [0, 1)
 */
function fbm2D(x, y, seed, octaves) {
  let sum = 0, amp = 1, f = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * f, y * f, seed + i * 137);
    total += amp; amp *= 0.5; f *= 2;
  }
  return sum / total;
}
/**
 * Linearly interpolate between two hex colors.
 * @param {number} a - Start color as 0xRRGGBB
 * @param {number} b - End color as 0xRRGGBB
 * @param {number} t - Interpolation factor 0..1
 * @returns {number} Interpolated color as 0xRRGGBB
 */
function lerpHex(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
/**
 * Wrap an HTML canvas in a tiling CanvasTexture with RepeatWrapping.
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {string} colorSpace - THREE color space constant
 * @returns {THREE.CanvasTexture} Configured tiling texture
 */
function makeTexture(canvas, colorSpace) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = colorSpace;
  return t;
}

/**
 * Create a height field sampler from procedural noise.
 * Returns a sample(x, z) function that returns terrain height at world coords.
 * @param {Object} config - Terrain configuration
 * @param {number} config.seed - World seed for deterministic generation
 * @param {number} config.size - World extent in meters
 * @param {number} config.heightScale - Maximum terrain elevation
 * @returns {{sample: function(number,number):number, number}} Height field with sample method and size
 */
export function createHeightField(config) {
  const noise = makeNoise2D(config.seed);
  const fbm = makeFbm(noise, 5);
  const macro = makeFbm(makeNoise2D(config.seed + 99), 3);
  const size = config.size;

  /**
   * Compute base terrain height with island falloff.
   * Creates a continent in the middle, ocean at the edges.
   * @param {number} nx - Normalized X coordinate (0-1)
   * @param {number} ny - Normalized Y coordinate (0-1)
   * @returns {number} Base height in world units
   */
  function baseHeight(nx, ny) {
    const dx = nx - 0.5, dy = ny - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy) * 2; // 0 center -> ~1 edge
    const continent = 1 - Math.pow(Math.min(1, Math.max(0, dist)), 2.2);
    const hills = fbm(nx * 6, ny * 6) * 0.5 + 0.5;
    const mountains = Math.pow(Math.max(0, macro(nx * 3 + 7, ny * 3 - 3) * 0.5 + 0.5), 2);
    let h = continent * (0.25 + hills * 0.55 + mountains * 0.9) - 0.18;
    return h * config.heightScale;
  }

  /**
   * Sample terrain height at world coordinates.
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @returns {number} Terrain height at the given position
   */
  function sample(x, z) {
    const nx = x / size + 0.5, ny = z / size + 0.5;
    return baseHeight(nx, ny);
  }

  return { sample, size };
}

/**
 * Biome color palette for terrain vertex coloring.
 * Each key maps to a THREE.Color used for that elevation band.
 * @type {Object<string, THREE.Color>}
 */
/**
 * Biome color palette for terrain vertex coloring.
 * Each key maps to a THREE.Color used for that elevation band.
 * @type {Object<string, THREE.Color>}
 */
const BIOME = {
  sand: new THREE.Color(0xc2b280),
  grass: new THREE.Color(0x4d7c3a),
  grassDry: new THREE.Color(0x7d9b4a),
  rock: new THREE.Color(0x6b6f75),
  snow: new THREE.Color(0xe8edf2),
};

/**
 * Build the terrain mesh from a height field and add it to the scene.
 * Generates vertex colors based on biome/elevation and applies procedural PBR detail maps.
 * @param {THREE.Scene} scene - The scene to add the terrain mesh to
 * @param {Object} heightField - Height field sampler from createHeightField()
 * @param {function(number,number):number} heightField.sample - Sample terrain height at (x,z)
 * @param {Object} config - World configuration with size, segments, seaLevel, seed
 * @param {Object} pbr - PBR configuration for detail textures
 * @returns {THREE.Mesh} The created terrain mesh
 */
export function buildTerrain(scene, heightField, config, pbr) {
  const { size, segments, seaLevel } = config;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rand = mulberry32(config.seed + 7);

  const cSand = BIOME.sand, cGrass = BIOME.grass, cDry = BIOME.grassDry;
  const cRock = BIOME.rock, cSnow = BIOME.snow;
  const tmp = new THREE.Color();

  // Second sampler for slope variation so biomes aren't perfectly banded.
  const detail = makeFbm(makeNoise2D(config.seed + 5), 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightField.sample(x, z);
    pos.setY(i, h);

    const n = detail(x * 0.02, z * 0.02) * 0.5 + 0.5;
    if (h < seaLevel + 0.6) tmp.copy(cSand);
    else if (h < seaLevel + 7) tmp.copy(cGrass).lerp(cDry, n * 0.7);
    else if (h < seaLevel + 15) tmp.copy(cRock).lerp(cGrass, (1 - n) * 0.25);
    else tmp.copy(cRock).lerp(cSnow, Math.min(1, (h - seaLevel - 15) / 8));

    const jitter = 0.94 + rand() * 0.12;
    colors[i * 3] = tmp.r * jitter;
    colors[i * 3 + 1] = tmp.g * jitter;
    colors[i * 3 + 2] = tmp.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const detailMaps = createTerrainDetail({
    ...config, ...pbr, tileSize: pbr?.terrainTileSize,
  }, heightField);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
    map: detailMaps.color,
    roughnessMap: detailMaps.roughness,
    normalMap: detailMaps.normal,
    normalScale: new THREE.Vector2(pbr?.terrainNormalScale ?? 1.6, pbr?.terrainNormalScale ?? 1.6),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}
