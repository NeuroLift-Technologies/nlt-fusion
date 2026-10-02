/**
 * Central configuration object for the openworld-engine.
 * All tunables live here — nothing else hardcodes world constants.
 * @typedef {Object} WorldConfig
 * @property {number} size - World extent in meters (square)
 * @property {number} segments - Terrain mesh resolution
 * @property {number} heightScale - Max terrain elevation
 * @property {number} seaLevel - Water plane height
 * @property {number} seed - Deterministic world seed
 */
/**
 * @typedef {Object} SkyConfig
 * @property {number} sunElevationDeg - Default sun elevation in degrees
 * @property {number} sunAzimuthDeg - Default sun azimuth in degrees
 * @property {number} exposure - Tone mapping exposure
 * @property {Object} fog - Fog density settings
 * @property {number} fog.densityNoon - Exp2 density at noon (~550m visibility)
 * @property {number} fog.densityNight - Denser fog at night
 * @property {number} fog.densityRain - Extra density during rain/overcast
 */
/**
 * @typedef {Object} CloudConfig
 * @property {number} altitude - Metres above sea level
 * @property {number} radius - Cloud plane half-extent (m)
 * @property {number} coverage - 0=clear, 1=100% covered
 * @property {number} density - FBM threshold sharpness
 * @property {{x:number,y:number}} windDir - Horizontal wind direction
 * @property {number} windSpeed - Multiplier for scrolling speed
 */
/**
 * @typedef {Object} RainConfig
 * @property {number} poolSize - Max simultaneous rain droplets
 * @property {number} spawnRadius - Horizontal spawn box half-size around camera
 * @property {number} spawnHeight - How far above camera droplets spawn
 * @property {number} fallSpeed - Base fall speed (m/s)
 * @property {number} windDriftX - Lateral wind drift (m/s)
 */
/**
 * @typedef {Object} AtmosphereConfig
 * @property {CloudConfig} clouds
 * @property {RainConfig} rain
 */
/**
 * @typedef {Object} WaterConfig
 * @property {number} colorShallow - Shallow water color hex
 * @property {number} colorDeep - Deep water color hex
 * @property {number} opacity - Water opacity
 * @property {number} normalScale - Normal map intensity
 * @property {number} ior - Index of refraction
 * @property {number} transmission - Light transmission factor
 */
/**
 * @typedef {Object} VegetationConfig
 * @property {number} treeCount - Number of trees to scatter
 * @property {number} grassCount - Number of grass instances
 * @property {number} rockCount - Number of rocks to scatter
 * @property {number} textureSize - Procedural texture resolution
 */
/**
 * @typedef {Object} PlayerConfig
 * @property {number} walkSpeed - Base movement speed
 * @property {number} sprintMultiplier - Speed multiplier when sprinting
 * @property {number} eyeHeight - Camera height above ground
 */
/**
 * @typedef {Object} QualityConfig
 * @property {number} pixelRatioMax - Max device pixel ratio
 * @property {boolean} shadows - Enable shadow mapping
 * @property {number} shadowMapSize - Shadow map resolution
 * @property {boolean} antialias - Enable MSAA
 */
/**
 * @typedef {Object} PBRConfig
 * @property {number} textureSize - Base texture resolution
 * @property {number} terrainDetailSize - Terrain detail map resolution
 * @property {number} terrainTileSize - Meters per terrain detail tile
 * @property {number} terrainNormalScale - Terrain normal map strength
 */
/**
 * @typedef {Object} EnvMapConfig
 * @property {Object.<string,string>} presets - Named HDR URLs
 * @property {string} default - Default preset name
 * @property {number} envMapIntensity - IBL intensity multiplier
 * @property {number} pmremBlur - PMREM blur radius
 * @property {boolean} procedural - Use procedural fallback if HDR fails
 */
/**
 * @typedef {Object} CharacterConfig
 * @property {string} model - URL to shared GLB model
 * @property {number} height - Target standing height (m)
 */
/**
 * @typedef {Object} CONFIG
 * @property {WorldConfig} world
 * @property {SkyConfig} sky
 * @property {AtmosphereConfig} atmosphere
 * @property {WaterConfig} water
 * @property {VegetationConfig} vegetation
 * @property {PlayerConfig} player
 * @property {QualityConfig} quality
 * @property {PBRConfig} pbr
 * @property {EnvMapConfig} envMap
 * @property {CharacterConfig} characters
 */
/** @type {CONFIG} */
export const CONFIG = {
  world: {
    size: 512,            // world extent in meters (square)
    segments: 256,        // terrain mesh resolution
    heightScale: 26,      // max terrain elevation
    seaLevel: 2.2,        // water plane height
    seed: 1337,
  },

  sky: {
    sunElevationDeg: 42,
    sunAzimuthDeg: 135,
    exposure: 0.6,
    // FogExp2 density by time-of-day / weather state.
    // Larger value = shorter view distance (denser fog).
    fog: {
      densityNoon:  0.0016,  // exp2 density (~550 m visibility)
      densityNight: 0.0048,  // denser at night — terrain melts to darkness
      densityRain:  0.0035,  // extra density during rain / overcast
    },
  },

  // ── Atmosphere ──────────────────────────────────────────────────────────
  atmosphere: {
    clouds: {
      altitude:   110,           // metres above sea level
      radius:     1800,          // cloud plane half-extent (m); should exceed draw distance
      coverage:   0.42,          // 0 = clear sky, 1 = 100% covered (overcast overrides)
      density:    2.8,           // FBM threshold sharpness (higher = harder cloud edges)
      windDir:    { x: 1.0, y: 0.4 }, // horizontal wind direction (will be normalised)
      windSpeed:  1.0,           // multiplier applied to scrolling speed
    },
    rain: {
      poolSize:    14000,        // max simultaneous rain droplets
      spawnRadius: 120,          // horizontal spawn box half-size around camera (m)
      spawnHeight: 55,           // how far above camera droplets spawn (m)
      fallSpeed:   26,           // base fall speed (m/s)
      windDriftX:  1.8,          // lateral wind drift on rain (m/s)
    },
  },

  water: {
    colorShallow: 0x2e8b9a,
    colorDeep:    0x0b3d5c,
    opacity:      0.82,
    normalScale:  0.6,
    ior:          1.33,
    transmission: 0.3,
  },

  vegetation: {
    treeCount:   700,
    grassCount:  9000,
    rockCount:   220,
    textureSize: 256,
  },

  player: {
    walkSpeed:        14,
    sprintMultiplier: 2.4,
    eyeHeight:        2.4,
  },

  quality: {
    pixelRatioMax: 2,
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
  },
  pbr: {
    textureSize: 512,
    terrainDetailSize: 512, // resolution of procedural terrain detail maps
    terrainTileSize: 8,     // meters per terrain detail tile (tiling repeat)
    terrainNormalScale: 1.6, // strength of terrain normal-map perturbation
  },
  // ── HDR environment lighting (Image-Based Lighting) ─────────────────────
  // HDRIs were sourced by searching https://polyhaven.com/hdris. All CC0;
  // "Pure Sky" equirectangular HDRIs so sky reflections stay clean and don't
  // clash with the engine's own terrain/water. Two presets drive the IBL:
  //   * clear    — midday, clear, high-contrast sky (default daytime lighting)
  //   * overcast — flat overcast sky (used for overcast + rain weather states)
  // `loadEnvironment` (render/pipeline.js) loads the `default` preset at boot,
  // `preloadPresets` eager-loads the rest, and `setEnvironmentPreset` swaps
  // at runtime when the weather changes. If a download fails the procedural
  // gradient fallback keeps the world lit (no black screen).
  envMap: {
    presets: {
      clear:    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_43d_clear_puresky_2k.hdr',
      overcast: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_overcast_puresky_2k.hdr',
    },
    default: 'clear',
    envMapIntensity: 1.0,
    pmremBlur:  0.4,
    procedural: true,            // fallback if a preset HDR fails to load
  },

  // ── GLB character models ────────────────────────────────────────────────
  // Animated humans replacing the procedural resident bodies. `model` is a
  // shared GLB loaded once and cloned per resident; `height` is the target
  // standing height (m) the GLB is auto-scaled to. The soldier from the three.js
  // examples is free + no-account (Mixamo rig: TPose/Idle/Walk/Run). Swap for a
  // civilian GLB (e.g. Xbot.glb) to change the look — see CHARACTER_MANIFEST.
  characters: {
    model:  'https://threejs.org/examples/models/gltf/Soldier.glb',
    height: 1.8,
  },
};
