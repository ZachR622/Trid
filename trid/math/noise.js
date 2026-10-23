/**
 * Seeded randomness and smooth noise, for procedural shapes and textures.
 * The same seed always gives the same result, on every browser.
 */

/**
 * A seeded random number generator (mulberry32): call the function it
 * returns for the next number in [0, 1). Use it instead of Math.random when
 * the same seed must build the same model again.
 *
 * @example
 * const random = rng(42);
 * const x = random(), y = random(); // the same two numbers every time
 *
 * @param {number} [seed=0] - Any whole number
 * @returns {() => number}
 */
export function rng(seed = 0) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash of lattice coordinates and a seed, in [0, 1). */
function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
/** Wraps lattice coordinate n when the noise repeats every `period` (0: no wrap) */
const wrap = (n, period) => (period > 0 ? ((n % period) + period) % period : n);
/** A usable period: a whole number, or 0 for none */
const periodOf = (p) => (p > 0 ? Math.max(1, Math.round(p)) : 0);

function value2(x, y, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = fade(x - xi), fy = fade(y - yi);
  const x0 = wrap(xi, period), x1 = wrap(xi + 1, period);
  const y0 = wrap(yi, period), y1 = wrap(yi + 1, period);
  return lerp(
    lerp(hash3(x0, y0, 0, seed), hash3(x1, y0, 0, seed), fx),
    lerp(hash3(x0, y1, 0, seed), hash3(x1, y1, 0, seed), fx),
    fy,
  );
}

function value3(x, y, z, seed, period) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const h = (dx, dy, dz) => hash3(wrap(xi + dx, period), wrap(yi + dy, period), wrap(zi + dz, period), seed);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), fx), lerp(h(0, 1, 0), h(1, 1, 0), fx), fy),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), fx), lerp(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

/**
 * Smooth 2D noise (value noise) in [0, 1): random at whole coordinates,
 * blended smoothly in between. Multiply the coordinates to change the size
 * of the blobs.
 *
 * With `period`, the noise repeats every `period` units on both axes, so a
 * texture painted with it tiles with no seam (map the texture's width to
 * `period` units).
 *
 * @param {number} x
 * @param {number} y
 * @param {Object} [opts]
 * @param {number} [opts.seed=0] - Whole number; another seed gives other noise
 * @param {number} [opts.period=0] - Repeat every this many units (a whole number; 0: never)
 * @returns {number}
 */
export function noise2(x, y, { seed = 0, period = 0 } = {}) {
  return value2(x, y, seed, periodOf(period));
}

/**
 * Smooth 3D noise in [0, 1). Sample it at a mesh's vertex positions to
 * displace a sphere with no seam. `period` repeats it on all three axes.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {Object} [opts]
 * @param {number} [opts.seed=0] - Whole number; another seed gives other noise
 * @param {number} [opts.period=0] - Repeat every this many units (a whole number; 0: never)
 * @returns {number}
 */
export function noise3(x, y, z, { seed = 0, period = 0 } = {}) {
  return value3(x, y, z, seed, periodOf(period));
}

/**
 * Fractal 2D noise (fBm): `octaves` layers of noise2, each twice as fine and
 * `gain` times as strong as the one before. Gives natural detail: terrain,
 * clouds, rock, marble. Result in about [0, 1), averaging 0.5.
 *
 * @example
 * // A tiling cloud texture
 * const p = 4; // 4 blobs across
 * for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
 *   const n = fbm2((x / size) * p, (y / size) * p, { period: p });
 *   ctx.fillStyle = `rgb(${n * 255}, ${n * 255}, 255)`;
 *   ctx.fillRect(x, y, 1, 1);
 * }
 *
 * @param {number} x
 * @param {number} y
 * @param {Object} [opts]
 * @param {number} [opts.octaves=5] - Layers of detail
 * @param {number} [opts.gain=0.5] - Strength of each layer compared to the one before
 * @param {number} [opts.seed=0] - Whole number; another seed gives other noise
 * @param {number} [opts.period=0] - Repeat every this many units (a whole number; 0: never)
 * @returns {number}
 */
export function fbm2(x, y, { octaves = 5, gain = 0.5, seed = 0, period = 0 } = {}) {
  const p = periodOf(period);
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * value2(x * freq, y * freq, seed + i * 31, p * freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * Fractal 3D noise (fBm), like `fbm2` in three dimensions. Result in about
 * [0, 1), averaging 0.5.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {Object} [opts]
 * @param {number} [opts.octaves=5] - Layers of detail
 * @param {number} [opts.gain=0.5] - Strength of each layer compared to the one before
 * @param {number} [opts.seed=0] - Whole number; another seed gives other noise
 * @param {number} [opts.period=0] - Repeat every this many units (a whole number; 0: never)
 * @returns {number}
 */
export function fbm3(x, y, z, { octaves = 5, gain = 0.5, seed = 0, period = 0 } = {}) {
  const p = periodOf(period);
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * value3(x * freq, y * freq, z * freq, seed + i * 31, p * freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}
