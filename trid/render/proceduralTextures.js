import { fbm2, noise2 } from "../math/noise.js";
import { updateTexture } from "../loaders/texture.js";

/**
 * Procedural textures: patterns painted in code, from a style, two colors
 * and a seed. Every style tiles with no seam (the noise repeats and every
 * count is a whole number), so they wrap around spheres, lathes and
 * repeated textures cleanly. Like a canvas painted once, they're uploaded
 * once.
 *
 *   scene.add({ mesh: makeShape("cube"), material: { texture: makeTexture("wood") } });
 */

/** The built-in styles of `makeTexture`. */
export const TEXTURE_STYLES = ["noise", "marble", "wood", "bricks", "checker", "bark", "spots", "stripes", "solid"];

/** Default colors for each style: [first, second]. */
const DEFAULT_COLORS = {
  noise: ["#3a3f4b", "#c9ced6"],
  marble: ["#e9e6df", "#5d5a55"],
  wood: ["#8a5a33", "#5a3820"],
  bricks: ["#9c4a35", "#cfc8bb"],
  checker: ["#f5f0e6", "#E9806E"],
  bark: ["#4a3426", "#2a1d15"],
  spots: ["#e8c88f", "#5a3d22"],
  stripes: ["#f2efe8", "#4a6fa5"],
  solid: ["#c0c0c0", "#c0c0c0"],
};

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (a, b, t) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const frac = (x) => x - Math.floor(x);

/**
 * For a style, a function of (u, v) in [0, 1) giving `[t, light]`: how much
 * of the second color to use (0..1), and a brightness to multiply by.
 */
function styleFn(style, s, seed) {
  // Noise with `period` p repeats every p units: sampled at u * (a multiple of p), it tiles
  const f = (x, y, octaves, period, k = 0) => fbm2(x, y, { octaves, period, seed: seed + k });
  switch (style) {
    case "solid":
      return () => [0, 1];
    case "noise":
      return (u, v) => [smooth(0.25, 0.75, f(u * s, v * s, 5, s)), 1];
    case "marble":
      return (u, v) => {
        const turb = f(u * s, v * s, 6, s);
        const t = 0.5 + 0.5 * Math.sin(((u + v) * s + turb * 2.5) * Math.PI * 2);
        return [Math.pow(t, 6), 1];
      };
    case "wood":
      return (u, v) => {
        const warp = f(u * s, v * s, 4, s) * 3;
        const ring = frac(u * s * 2 + warp);
        // Fine grain along the boards (64 and 4 are both multiples of the period 4)
        return [smooth(0.55, 0.95, ring), 0.9 + 0.1 * f(u * 64, v * 4, 2, 4, 7)];
      };
    case "bricks": {
      const rows = even(s * 2), cols = s;
      return (u, v) => {
        const row = Math.floor(v * rows);
        const x = u * cols + (row % 2) * 0.5;
        const fx = frac(x), fy = v * rows - row;
        if (Math.min(fx, 1 - fx) < 0.04 || Math.min(fy, 1 - fy) < 0.08) return [1, 1]; // mortar
        // Each brick its own shade (bricks cut by the edge are the same brick on the other side)
        const brick = ((Math.floor(x) % cols) + cols) % cols;
        const tint = 0.85 + 0.3 * noise2(brick, row, { seed });
        return [0.15 * f(u * 32, v * 32, 3, 32), tint];
      };
    }
    case "checker": {
      const c = even(s);
      return (u, v) => [(Math.floor(u * c) + Math.floor(v * c)) % 2, 1];
    }
    case "bark":
      return (u, v) => {
        const ridges = Math.abs(f(u * s * 3, v * s, 5, s) * 2 - 1);
        return [smooth(0.05, 0.4, ridges), 0.8 + 0.4 * ridges];
      };
    case "spots":
      return (u, v) => [smooth(0.55, 0.62, f(u * s, v * s, 4, s)), 1];
    case "stripes":
      return (u, v) => [smooth(0.45, 0.55, 0.5 + 0.5 * Math.sin((v * s + f(u * 4, v * 4, 3, 4) * 0.4) * Math.PI * 2)), 1];
    default:
      throw new Error(`makeTexture: unknown style "${style}" (one of ${TEXTURE_STYLES.join(", ")}, or a function)`);
  }
}

/** [r, g, b, a] (0..255, a 0..1) from "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)" / "rgba(...)" or an array. */
export function colorBytes(color) {
  if (Array.isArray(color)) return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 1];
  const s = String(color).trim();
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.replace(/./g, "$&$&");
    const v = (i) => parseInt(h.slice(i, i + 2), 16);
    return [v(0), v(2), v(4), h.length === 8 ? v(6) / 255 : 1];
  }
  const nums = s.match(/-?[\d.]+%?/g);
  if (/^rgba?\(/i.test(s) && nums && nums.length >= 3) {
    const ch = (x) => (x.endsWith("%") ? (parseFloat(x) * 255) / 100 : +x);
    const a = nums[3] === undefined ? 1 : nums[3].endsWith("%") ? parseFloat(nums[3]) / 100 : +nums[3];
    return [ch(nums[0]), ch(nums[1]), ch(nums[2]), a];
  }
  // Named CSS colors need the browser to read them
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillStyle = s;
      if (ctx.fillStyle !== s) return colorBytes(ctx.fillStyle);
    }
  }
  throw new Error(`Can't read the color "${color}"`);
}

/**
 * The pixels of a procedural texture, without a canvas (for workers, or to
 * process them further). Same options as `makeTexture`.
 *
 * @param {string|((u:number, v:number) => number)} style - A style name, or `(u, v) => t`
 * @param {Object} [opts] - See `makeTexture`
 * @returns {{ width:number, height:number, data:Uint8ClampedArray }} RGBA rows, top row first
 */
export function texturePixels(style = "noise", opts = {}) {
  const {
    size = 256,
    colors = typeof style === "string" ? DEFAULT_COLORS[style] ?? DEFAULT_COLORS.noise : ["#000000", "#ffffff"],
    scale = 4,
    seed = 0,
    grain = 0,
  } = opts;
  const width = Math.max(1, Math.floor(size)), height = width;
  const s = Math.max(1, Math.round(scale));
  const a = colorBytes(colors[0]), b = colorBytes(colors[1] ?? colors[0]);
  const fn = typeof style === "function" ? (u, v) => [clamp01(style(u, v)), 1] : styleFn(style, s, seed);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    // Image rows go down, texture v goes up
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const [t, light] = fn(u, v);
      const g = grain > 0 ? 1 + (fbm2(u * 128, v * 128, { octaves: 2, period: 128, seed: seed + 99 }) - 0.5) * grain : 1;
      const k = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[k + c] = (a[c] + (b[c] - a[c]) * t) * light * g;
      data[k + 3] = (a[3] + (b[3] - a[3]) * t) * 255;
    }
  }
  return { width, height, data };
}

/**
 * Paints a procedural texture on a canvas: wood, marble, bricks... Every
 * style tiles with no seam. Pass the result as a material's `texture`.
 *
 * | Style | Looks like | `scale` is |
 * | --- | --- | --- |
 * | `"noise"` | Soft clouds | Blobs across |
 * | `"marble"` | Veined stone | Veins across |
 * | `"wood"` | Boards with rings and grain (rings run along v) | Rings across, ×2 |
 * | `"bricks"` | A brick wall, each brick its own shade | Bricks across (rows: 2× as many) |
 * | `"checker"` | A checkerboard | Squares across (made even) |
 * | `"bark"` | Rough ridges running along v | Ridges across, ×3 |
 * | `"spots"` | Blotches, like a giraffe | Spots across |
 * | `"stripes"` | Wavy stripes across v | Stripes |
 * | `"solid"` | Just the first color (with `grain`: a rough surface) | — |
 *
 * `style` can also be your own function `(u, v) => t`: 0 gives the first
 * color, 1 the second. It should repeat for u and v in [0, 1) to tile.
 *
 * Repainting into the same canvas (`opts.canvas`) calls `updateTexture` for you.
 *
 * @example
 * const floor = makeTexture("wood", { colors: ["#a87447", "#6b4426"], scale: 3, grain: 0.15 });
 * scene.add({ mesh: makeShape("plane"), material: { texture: floor, textureRepeat: 4 } });
 *
 * @param {string|((u:number, v:number) => number)} [style="noise"] - One of `TEXTURE_STYLES`, or a function
 * @param {Object} [opts]
 * @param {number} [opts.size=256] - Width and height in pixels (a power of two is best for WebGL 1)
 * @param {(string|number[])[]} [opts.colors] - [first, second]: hex, rgb() / rgba(), CSS names or [r, g, b, a?]
 *   (default: a pair that suits the style)
 * @param {number} [opts.scale=4] - How many times the pattern repeats across (a whole number)
 * @param {number} [opts.seed=0] - Another whole number gives another texture of the same style
 * @param {number} [opts.grain=0] - Fine speckles on top, 0 to 1
 * @param {HTMLCanvasElement|OffscreenCanvas} [opts.canvas] - Paint into this canvas instead of a new one
 * @returns {HTMLCanvasElement|OffscreenCanvas} The canvas
 */
export function makeTexture(style = "noise", opts = {}) {
  const { width, height, data } = texturePixels(style, opts);
  let canvas = opts.canvas;
  if (!canvas) {
    if (typeof document !== "undefined") canvas = document.createElement("canvas");
    else if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(width, height);
    else throw new Error("makeTexture needs a browser (or a worker with OffscreenCanvas); use texturePixels instead");
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(width, height);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  if (opts.canvas) updateTexture(canvas);
  return canvas;
}
