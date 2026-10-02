// Deterministic RNG + value noise + fBm. Same seed => same world, always.

/**
 * Mulberry32 PRNG — fast, deterministic 32-bit random number generator.
 * Same seed always produces the same sequence.
 * @param {number} seed - 32-bit unsigned integer seed
 * @returns {function(): number} Generator returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a 2D Perlin-style value noise function.
 * Uses a permutation table seeded by the given value for deterministic output.
 * @param {number} seed - Integer seed for the permutation table
 * @returns {function(number, number): number} Noise function returning values in ~[-1, 1]
 */
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  /**
   * Smoothstep fade function for Perlin noise interpolation.
   * @param {number} t - Input value 0..1
   * @returns {number} Smoothed value 0..1
   */
  const fade = (t) => t * t * (3 - 2 * t);
  /**
   * Compute gradient value for Perlin noise based on hash and position.
   * @param {number} h - Hash value selecting gradient direction
   * @param {number} x - X offset from lattice point
   * @param {number} y - Y offset from lattice point
   * @returns {number} Gradient dot product
   */
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  /**
   * Perlin noise function for 2D coordinates.
   * Uses permutation table and gradient vectors for smooth interpolation.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Noise value in approximately [-1, 1]
   */
  /**
   * Perlin noise function for 2D coordinates.
   * Uses permutation table and gradient vectors for smooth interpolation.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Noise value in approximately [-1, 1]
   */
  return function noise(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[(perm[xi] + yi) & 255], ab = perm[(perm[xi] + yi + 1) & 255];
    const ba = perm[(perm[xi + 1] + yi) & 255], bb = perm[(perm[xi + 1] + yi + 1) & 255];
    const x1 = grad(aa, xf, yf) + (grad(ba, xf - 1, yf) - grad(aa, xf, yf)) * u;
    const x2 = grad(ab, xf, yf - 1) + (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1)) * u;
    return (x1 + (x2 - x1) * v) * 0.7071; // ~[-1,1]
  };
}

/**
 * Create a fractal Brownian motion (fBm) function from a base noise function.
 * Sums multiple octaves of noise at increasing frequency and decreasing amplitude.
 * @param {function(number,number):number} noise - Base 2D noise function
 * @param {number} [octaves=5] - Number of noise layers to sum
 * @param {number} [lacunarity=2.0] - Frequency multiplier per octave
 * @param {number} [gain=0.5] - Amplitude multiplier per octave
 * @returns {function(number,number):number} fBm function returning normalized values
 */
export function makeFbm(noise, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  return function fbm(x, y) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };
}
