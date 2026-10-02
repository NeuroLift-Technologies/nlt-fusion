// Vegetation + rocks: instanced meshes (1 draw call per type).
// Trees: trunk + 2 foliage blobs merged into one geometry per instance.
// Grass: crossed quads with wind sway in the vertex shader.
// Rocks: icosahedrons with random squash.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { createWoodSet, createFoliageSet, createRockSet } from '../materials/pbr.js';

/** @type {Object} Shared wood texture set (color, normal, roughness) */
const woodMaps = createWoodSet();
/** @type {Object} Shared foliage texture set (color, normal, roughness) */
const foliageMaps = createFoliageSet();
/** @type {Object} Shared rock texture set (color, normal, roughness) */
const rockMaps = createRockSet();

/**
 * Generate random world positions within a height range for scattering vegetation.
 * Uses rejection sampling to keep points within [minH, maxH] elevation band.
 * @param {function():number} rand - Random number generator returning [0,1)
 * @param {number} count - Desired number of positions
 * @param {number} size - World extent (scatter range is ±size*0.46)
 * @param {Object} heightField - Terrain height sampler
 * @param {function(number,number):number} heightField.sample - Sample height at (x,z)
 * @param {number} seaLevel - Sea level reference (unused but kept for signature)
 * @param {number} minH - Minimum terrain height (exclusive)
 * @param {number} maxH - Maximum terrain height (exclusive)
 * @returns {Array<[number,number,number]>} Array of [x, y, z] positions
 */
function scatterPositions(rand, count, size, heightField, seaLevel, minH, maxH) {
  const out = [];
  let guard = count * 40;
  while (out.length < count && guard-- > 0) {
    const x = (rand() - 0.5) * size * 0.92;
    const z = (rand() - 0.5) * size * 0.92;
    const h = heightField.sample(x, z);
    if (h > minH && h < maxH) out.push([x, h, z]);
  }
  return out;
}

/**
 * Build instanced vegetation (trees, grass, rocks) across the terrain.
 * Trees use merged trunk + foliage geometry. Grass uses crossed quads with
 * wind sway in the vertex shader. Rocks are squashed icosahedrons.
 * Scatter is height-bounded: trees on mid-elevation, grass near water, rocks anywhere.
 * @param {THREE.Scene} scene - The scene to add vegetation to
 * @param {Object} heightField - Terrain height field sampler
 * @param {function(number,number):number} heightField.sample - Sample height at (x,z)
 * @param {Object} config - Vegetation configuration with seed
 * @param {Object} world - World config with scatter counts and bounds
 * @param {number} world.treeCount - Number of tree instances
 * @param {number} world.grassCount - Number of grass instances
 * @param {number} world.rockCount - Number of rock instances
 * @param {number} world.size - World extent for scatter range
 * @param {number} world.seaLevel - Minimum height filter
 * @returns {{group:THREE.Group, update:function}} Vegetation controller
 */
export function buildVegetation(scene, heightField, config, world) {
  /**
   * Initialize vegetation system with seeded random number generator.
   * @param {Object} config - Vegetation configuration with seed
   * @returns {void}
   */
  /**
   * Initialize vegetation system with seeded random number generator.
   * @param {Object} config - Vegetation configuration with seed
   * @returns {void}
   */
  const rand = mulberry32(config.seed + 21);
  const group = new THREE.Group();
  group.name = 'vegetation';

  // --- trees (merged trunk+foliage geometry, instanced) ---
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6);
  trunkGeo.translate(0, 1.3, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0.0,
    map: woodMaps.color, normalMap: woodMaps.normal, roughnessMap: woodMaps.roughness,
    normalScale: new THREE.Vector2(1, 1),
  });
  const folGeo = new THREE.IcosahedronGeometry(1.7, 1);
  folGeo.translate(0, 3.6, 0);
  const folMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0.0, vertexColors: true,
    map: foliageMaps.color, normalMap: foliageMaps.normal, roughnessMap: foliageMaps.roughness,
    normalScale: new THREE.Vector2(1, 1),
  });

  const treeSpots = scatterPositions(rand, world.treeCount, world.size,
    heightField, world.seaLevel, world.seaLevel + 0.8, world.seaLevel + 16);
  const dummy = new THREE.Object3D();
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, treeSpots.length));
  const folMesh = new THREE.InstancedMesh(folGeo, folMat, Math.max(1, treeSpots.length));
  trunkMesh.castShadow = folMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  const tint = new THREE.Color();
  treeSpots.forEach(([x, h, z], i) => {
    const s = 0.7 + rand() * 1.1;
    dummy.position.set(x, h - 0.15, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rand() * Math.PI * 2;
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    folMesh.setMatrixAt(i, dummy.matrix);
    folMesh.setColorAt(i, tint.setHSL(0.29 + rand() * 0.06, 0.42, 0.3 + rand() * 0.12));
  });
  trunkMesh.count = folMesh.count = treeSpots.length;
  group.add(trunkMesh, folMesh);

  // --- grass (instanced crossed quads, wind sway) ---
  const blade = new THREE.PlaneGeometry(0.5, 0.7);
  blade.translate(0, 0.35, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true,
    map: foliageMaps.color, normalMap: foliageMaps.normal, roughnessMap: foliageMaps.roughness,
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    grassMat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float sway = sin(uTime * 2.2 + ip.x * 0.5 + ip.z * 0.7) * 0.08 * position.y;
         transformed.x += sway;
       #endif`
    );
  };
  const grassSpots = scatterPositions(rand, world.grassCount, world.size,
    heightField, world.seaLevel, world.seaLevel + 0.5, world.seaLevel + 9);
  const grass = new THREE.InstancedMesh(blade, grassMat, Math.max(1, grassSpots.length));
  grassSpots.forEach(([x, h, z], i) => {
    dummy.position.set(x, h, z);
    dummy.scale.setScalar(0.7 + rand() * 1.3);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  });
  grass.count = grassSpots.length;
  group.add(grass);

  // --- rocks ---
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0.0, flatShading: true,
    map: rockMaps.color, normalMap: rockMaps.normal, roughnessMap: rockMaps.roughness,
    normalScale: new THREE.Vector2(1.2, 1.2),
  });
  const rockSpots = scatterPositions(rand, world.rockCount, world.size,
    heightField, world.seaLevel - 1, world.seaLevel + 22);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rockSpots.length));
  rocks.castShadow = rocks.receiveShadow = true;
  rockSpots.forEach(([x, h, z], i) => {
    dummy.position.set(x, h - 0.3, z);
    dummy.scale.set(0.4 + rand() * 1.8, 0.3 + rand() * 1.0, 0.4 + rand() * 1.8);
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.count = rockSpots.length;
  group.add(rocks);

  scene.add(group);
  return {
    group,
    /**
     * Update grass wind sway shader time.
     * @param {number} t - Elapsed time in seconds
     * @returns {void}
     */
    update(t) {
      const s = grassMat.userData.shader;
      if (s) s.uniforms.uTime.value = t;
    },
  };
}
