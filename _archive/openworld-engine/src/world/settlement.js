// Scatter: a small lakeside camp that proves scale + gives the player
// somewhere to walk to. Procedural huts, campfire + light, crates, dock.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { createWoodSet, createClothSet, createRockSet } from '../materials/pbr.js';

const woodMaps = createWoodSet();
const woodDarkMaps = createWoodSet({ seed: 21 });
const fabricMaps = createClothSet(0xb8472f);
const stoneMaps = createRockSet({ seed: 33 });

/**
 * Build a lakeside camp settlement with procedural huts, campfire, crates, and dock.
 * Scatters buildings near flat land above sea level. The campfire flickers and
 * the fire light brightens at night.
 * @param {THREE.Scene} scene - The scene to add settlement objects to
 * @param {Object} heightField - Terrain height field sampler
 * @param {function(number,number):number} heightField.sample - Sample height at (x,z)
 * @param {Object} world - World configuration
 * @param {number} world.size - World extent in meters
 * @param {number} world.seaLevel - Water plane height
 * @param {number} world.seed - World seed for deterministic placement
 * @returns {{group:THREE.Group, campCenter:THREE.Vector3, update:function}} Settlement controller
 */
export function buildSettlement(scene, heightField, world) {
  const rand = mulberry32(world.seed + 77);
  const group = new THREE.Group();
  group.name = 'settlement';

  /**
   * Find flat-ish land near water for the camp by sampling random positions.
   * Searches for terrain between seaLevel+1 and seaLevel+4 meters.
   * @returns {void}
   */
  /**
   * Find flat-ish land near water for the camp by sampling random positions.
   * Searches for terrain between seaLevel+1 and seaLevel+4 meters.
   * @returns {void}
   */
  // Find flat-ish land near water for the camp.
  let cx = 30, cz = 30, cy = 0;
  for (let i = 0; i < 400; i++) {
    const x = (rand() - 0.5) * world.size * 0.6;
    const z = (rand() - 0.5) * world.size * 0.6;
    const h = heightField.sample(x, z);
    if (h > world.seaLevel + 1 && h < world.seaLevel + 4) { cx = x; cz = z; cy = h; break; }
  }

  /** @type {THREE.MeshStandardMaterial} Shared wood material for huts and crates */
  const wood = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, metalness: 0.0,
    map: woodMaps.color, normalMap: woodMaps.normal, roughnessMap: woodMaps.roughness,
    normalScale: new THREE.Vector2(1, 1),
  });
  /** @type {THREE.MeshStandardMaterial} Darker wood material for roofs and poles */
  const woodDark = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0.0,
    map: woodDarkMaps.color, normalMap: woodDarkMaps.normal, roughnessMap: woodDarkMaps.roughness,
    normalScale: new THREE.Vector2(1, 1),
  });
  /** @type {THREE.MeshStandardMaterial} Fabric material for the tent */
  const cloth = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide,
    map: fabricMaps.color, normalMap: fabricMaps.normal, roughnessMap: fabricMaps.roughness,
    normalScale: new THREE.Vector2(1, 1),
  });

  /**
   * Build a procedural hut with box base, cone roof, and door.
   * @param {number} x - World X position
   * @param {number} z - World Z position
   * @param {number} ry - Rotation around Y axis (radians)
   * @returns {THREE.Group} The hut group
   */
  function hut(x, z, ry) {
    const g = new THREE.Group();
    const y = heightField.sample(x, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3.4), wood);
    base.position.y = 1.2; base.castShadow = base.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 4), woodDark);
    roof.position.y = 3.3; roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x1c1410 }));
    door.position.set(0, 0.9, 1.71);
    g.add(base, roof, door);
    g.position.set(x, y - 0.1, z);
    g.rotation.y = ry;
    return g;
  }
  group.add(hut(cx, cz, 0.4), hut(cx + 7, cz + 3, -0.5), hut(cx - 6, cz + 5, 1.2));

  // Tent
  const tent = new THREE.Group();
  const ty = heightField.sample(cx + 1, cz - 6);
  const canvas = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 6, 1, true), cloth);
  canvas.position.y = 1.3; canvas.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8), woodDark);
  pole.position.y = 1.4;
  tent.add(canvas, pole);
  tent.position.set(cx + 1, ty, cz - 6);
  group.add(tent);

  // Campfire: stones + logs + point light + emissive coals
  const fire = new THREE.Group();
  const fy = heightField.sample(cx - 1, cz - 2);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, flatShading: true, metalness: 0.0,
    map: stoneMaps.color, normalMap: stoneMaps.normal, roughnessMap: stoneMaps.roughness,
    normalScale: new THREE.Vector2(1.3, 1.3),
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), stoneMat);
    st.position.set(Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9);
    st.castShadow = true;
    fire.add(st);
  }
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2), woodDark);
    log.rotation.z = Math.PI / 2; log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.25;
    fire.add(log);
  }
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff4400, emissiveIntensity: 2.4 }));
  coals.position.y = 0.3; coals.scale.y = 0.5;
  fire.add(coals);
  const fireLight = new THREE.PointLight(0xff7733, 30, 25, 1.8);
  fireLight.position.y = 1.4;
  fire.add(fireLight);
  fire.position.set(cx - 1, fy, cz - 2);
  group.add(fire);

  // Crates + barrels
  for (let i = 0; i < 6; i++) {
    const s = 0.5 + rand() * 0.5;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood);
    const x = cx + 3 + rand() * 4, z = cz - 3 + rand() * 3;
    crate.position.set(x, heightField.sample(x, z) + s / 2, z);
    crate.rotation.y = rand() * Math.PI;
    crate.castShadow = crate.receiveShadow = true;
    group.add(crate);
  }

  scene.add(group);
  return {
    group,
    campCenter: new THREE.Vector3(cx, cy, cz),
    /**
     * Update campfire flicker and coal glow, brightening at night.
     * @param {number} t - Elapsed time in seconds
     * @param {number} nightFactor - Night factor 0..1 (brightens fire at night)
     * @returns {void}
     */
    update(t, nightFactor) {
      fireLight.intensity = 30 + Math.sin(t * 9) * 5 + Math.sin(t * 23) * 3;
      fireLight.intensity *= (0.55 + nightFactor * 0.9);
      coals.material.emissiveIntensity = 2 + Math.sin(t * 7) * 0.5;
    },
  };
}
