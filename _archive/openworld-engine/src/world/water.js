// Water: translucent plane with IOR-based transmission, env-map reflections,
// and two animated normal-map layers (one native + one mixed in via compile
// injection) plus vertex displacement for silhouette waves.
// No render targets — pure MeshPhysicalMaterial approach.
import * as THREE from 'three';
import { makeNoise2D, makeFbm } from './noise.js';

/**
 * Build a tileable wave normal map from two-frequency sine waves + FBM noise.
 * @param {number} size - Texture resolution (square)
 * @param {number} seed - Seed for FBM noise
 * @param {number} freq1 - Primary wave frequency
 * @param {number} amp1 - Primary wave amplitude
 * @param {number} freq2 - Secondary wave frequency
 * @param {number} amp2 - Secondary wave amplitude
 * @returns {THREE.CanvasTexture} Tiling normal map texture
 */
function buildWaveNormal(size, seed, freq1, amp1, freq2, amp2) {
  const H = new Float32Array(size * size);
  const n1 = makeFbm(makeNoise2D(seed), 3);
  const n2 = makeFbm(makeNoise2D(seed + 13), 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      H[y * size + x] =
        Math.sin(u * Math.PI * 2 * freq1) * amp1 * 0.5
        + Math.cos(v * Math.PI * 2 * freq1) * amp1 * 0.3
        + n1(u * freq1 * 2.5, v * freq1 * 2.5) * amp1 * 0.4
        + Math.sin(u * Math.PI * 2 * freq2) * amp2 * 0.4
        + n2(u * freq2 * 1.8, v * freq2 * 1.8) * amp2 * 0.6;
    }
  }
  const img = new ImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xp = (x + 1) % size, xm = (x - 1 + size) % size;
      const yp = (y + 1) % size, ym = (y - 1 + size) % size;
      const gx = (H[y * size + xp] - H[y * size + xm]) * 2.2;
      const gz = (H[yp * size + x] - H[ym * size + x]) * 2.2;
      const len = Math.sqrt(gx * gx + gz * gz + 1);
      const i = (y * size + x) * 4;
      d[i] = (gx / len) * 127.5 + 127.5;
      d[i + 1] = (1 / len) * 127.5 + 127.5;
      d[i + 2] = (gz / len) * 127.5 + 127.5;
      d[i + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

/**
 * Build a translucent water plane using MeshPhysicalMaterial.
 * Features dual animated normal-map layers, vertex displacement for waves,
 * IOR-based transmission, and environment-map reflections.
 * No render targets — pure physical material approach.
 * @param {THREE.Scene} scene - The scene to add the water plane to
 * @param {Object} config - Water configuration
 * @param {number} config.size - World size (plane is slightly larger)
 * @param {number} config.seaLevel - Water plane height (Y position)
 * @param {number} [config.opacity=0.82] - Water opacity
 * @param {number} [config.colorShallow] - Shallow water color hex
 * @param {number} [config.ior=1.33] - Index of refraction
 * @param {number} [config.transmission=0.3] - Light transmission
 * @param {number} [config.seed=0] - Seed for wave normal generation
 * @returns {{mesh:THREE.Mesh, update:function}} Water controller
 */
export function buildWater(scene, config) {
  /**
   * Create the water plane geometry (slightly larger than world size).
   * @param {Object} config - Water configuration with size
   * @returns {THREE.PlaneGeometry} The rotated plane geometry
   */
  /**
   * Create the water plane geometry (slightly larger than world size).
   * @param {Object} config - Water configuration with size
   * @returns {THREE.PlaneGeometry} The rotated plane geometry
   */
  const geo = new THREE.PlaneGeometry(config.size * 1.2, config.size * 1.2, 32, 32);
  geo.rotateX(-Math.PI / 2);

  const waveA = buildWaveNormal(256, (config.seed || 0) + 1, 1, 0.6, 4, 0.4);
  const waveB = buildWaveNormal(128, (config.seed || 0) + 101, 2, 0.4, 6, 0.3);

  const waterColor = new THREE.Color(config.colorShallow ?? 0x1a6f8e);
  const mat = new THREE.MeshPhysicalMaterial({
    color: waterColor,
    roughness: 0.04,
    metalness: 0.0,
    transmission: config.transmission ?? 0.6,
    ior: config.ior ?? 1.33,
    thickness: 1.0,
    normalMap: waveA,
    normalScale: new THREE.Vector2(0.9, 0.9),
    transparent: true,
    opacity: config.opacity,
    reflectivity: 1.0,
    side: THREE.FrontSide,
  });

  /**
   * Inject custom uniforms, vertex wave displacement, and an extra scrolling
   * normal layer into the MeshPhysicalMaterial via onBeforeCompile.
   * Declarations go ONLY in the #include <common> replacement to avoid redeclaration.
   * @param {THREE.WebGLProgramParametersWithUniforms} shader - The shader program
   * @returns {void}
   */
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWaveB = { value: waveB };
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader.replace(
      /#include <common>/,
      '#include <common>\nuniform float uTime;\nvarying vec2 vWaveB;'
    );
    shader.vertexShader = shader.vertexShader.replace(
      /#include <begin_vertex>/,
      '#include <begin_vertex>\nvWaveB = uv * 16.0 + vec2(uTime * -0.04, uTime * 0.02);\ntransformed.y += sin(position.x * 0.35 + uTime * 1.4) * 0.05 + cos(position.z * 0.3 + uTime * 1.1) * 0.05;'
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      /#include <common>/,
      '#include <common>\nuniform float uTime;\nuniform sampler2D uWaveB;\nvarying vec2 vWaveB;'
    );
    // Append a second scrolling normal layer after the standard normal mapping.
    shader.fragmentShader = shader.fragmentShader.replace(
      /#include <normal_fragment_maps>/,
      '#include <normal_fragment_maps>\nvec3 nB = texture2D(uWaveB, vWaveB).xyz * 2.0 - 1.0;\nnormal = normalize(normal * 0.6 + nB * 0.4);'
    );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = config.seaLevel;
  mesh.name = 'water';
  scene.add(mesh);

  return {
    mesh,
    /**
     * Update water shader time and scroll normal maps for wave animation.
     * @param {number} t - Elapsed time in seconds
     * @returns {void}
     */
    update(t) {
      const s = mat.userData.shader;
      if (s) s.uniforms.uTime.value = t;
      // scroll the native wave normal
      mat.normalMap.offset.x = (t * 0.03) % 1;
      mat.normalMap.offset.y = (t * 0.015) % 1;
    },
  };
}
