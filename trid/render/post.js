/**
 * Post effects: shaders run on the whole picture after the scene is drawn
 * (bloom, vignette, color grading, film grain...). Tools draw on top
 * afterwards, so handles and overlays aren't affected.
 *
 *   scene.post = [bloom(), grade({ saturation: 1.2 }), vignette()];
 *
 * They run in the list's order, each on the result of the one before.
 * A post effect is a plain object, like a material effect:
 * - `glsl`: GLSL code defining `vec4 post(vec4 color, Frame f)`, run once
 *   per pixel (WebGL renderer). `color` is the picture at `f.uv`
 * - `passes`: instead of `glsl`, a list of passes run one after the other,
 *   each `{ glsl, scale }` (`scale`: size of that pass's picture, 0.5 = half,
 *   cheaper for blurs). Bloom is made this way
 * - `canvas`: optional `(ctx, frame, uniforms) => void` that changes the 2D
 *   canvas directly. The canvas renderer uses it (WebGL too, for effects
 *   without `glsl` or `passes`). Without it, the canvas renderer skips the effect
 * - `uniforms`: settings used by the code, like `{ uStrength: 0.5 }`. Same
 *   types as material effects; read every frame
 * - `enabled: false` turns the effect off without removing it
 *
 * In GLSL, every pass can call:
 * - `frame(uv)`: the previous pass's picture (the first pass: the picture
 *   this effect starts from)
 * - `source(uv)`: the picture this effect starts from
 * Colors are premultiplied by alpha (the same as plain colors where the
 * picture is opaque, which it is when the scene has an opaque background).
 *
 * With post effects on, the WebGL renderer draws the scene into a texture
 * first. On WebGL 2 it keeps antialiasing (multisampling); on WebGL 1 edges
 * get a little rougher.
 */

import { parseColor } from "./color.js";

/**
 * What a post effect knows about the picture. GLSL fields and the canvas
 * function's `frame` argument have the same names.
 *
 * @typedef {Object} Frame
 * @property {{x:number,y:number}} uv - GLSL only: position in the picture, 0..1 (0, 0 = bottom left)
 * @property {{x:number,y:number}} size - Size of the picture being made, in pixels (GLSL: `vec2`;
 *   canvas: `width` / `height` instead)
 * @property {{x:number,y:number}} texel - GLSL only: one pixel of the input picture, in uv units
 * @property {number} time - Seconds since the renderer started
 * @property {number[]} background - The scene's background color [r, g, b, a]
 */

/** The GLSL declaration of `Frame`, and the `frame` / `source` helpers. */
export const FRAME_GLSL = `
struct Frame {
  vec2 uv;
  vec2 size;
  vec2 texel;
  float time;
  vec4 background;
};
uniform sampler2D uFrame;
uniform sampler2D uSource;
vec4 frame(vec2 uv) { return texture2D(uFrame, uv); }
vec4 source(vec2 uv) { return texture2D(uSource, uv); }
`;

/** A post effect's passes, as `{ glsl, scale }`. Empty when it has no GLSL (canvas only). */
export function postPasses(effect) {
  if (Array.isArray(effect.passes)) return effect.passes.filter((p) => p?.glsl).map((p) => ({ glsl: p.glsl, scale: p.scale > 0 ? p.scale : 1 }));
  return effect.glsl ? [{ glsl: effect.glsl, scale: 1 }] : [];
}

/** The effects of a list that are on. */
export function activePost(list) {
  return Array.isArray(list) ? list.filter((e) => e && e.enabled !== false) : [];
}

/**
 * Runs post effects' `canvas` functions on a scene's 2D canvas.
 * Used by the renderers after drawing.
 *
 * @param {Object} scene
 * @param {Object[]} list - Post effects (the ones off, or without `canvas`, are skipped)
 * @param {number} start - When the renderer started (`performance.now()`), for `time`
 */
export function runCanvasPost(scene, list, start) {
  const effects = activePost(list).filter((e) => typeof e.canvas === "function");
  if (!effects.length) return;
  const { ctx, canvas } = scene;
  const frame = {
    width: canvas.width,
    height: canvas.height,
    time: (performance.now() - start) / 1000,
    canvas,
    rgba: (v) => (typeof v === "string" ? parseColor(ctx, v).map((x, i) => (i < 3 ? x / 255 : x)) : v),
  };
  frame.background = frame.rgba(scene.background ?? "#000000");
  for (const e of effects) {
    ctx.save();
    try {
      e.canvas(ctx, frame, e.uniforms ?? {});
    } finally {
      ctx.restore();
    }
  }
}

// --- Built-in post effects ---

/**
 * Darkens the corners of the picture.
 *
 * @param {Object} [opts]
 * @param {number} [opts.strength=0.5] - How dark the corners get (0..1)
 * @param {number} [opts.radius=0.5] - Where the darkening starts: 0 = center, 1 = corners
 * @param {number} [opts.softness=0.5] - How far it takes to reach `strength`
 * @param {string} [opts.color="#000000"] - Color the corners turn to
 */
export function vignette({ strength = 0.5, radius = 0.5, softness = 0.5, color = "#000000" } = {}) {
  return {
    name: "vignette",
    uniforms: { uStrength: strength, uRadius: radius, uSoftness: softness, uColor: color },
    glsl: `
vec4 post(vec4 color, Frame f) {
  float r = length((f.uv - 0.5) * 2.0) / 1.41421356; // 0 at the center, 1 in the corners
  float v = smoothstep(uRadius, uRadius + max(uSoftness, 1e-3), r) * uStrength;
  return vec4(mix(color.rgb, uColor.rgb * color.a, v), color.a);
}`,
    canvas(ctx, f, u) {
      const [r, g, b] = f.rgba(u.uColor);
      const rgba = (a) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
      ctx.translate(f.width / 2, f.height / 2);
      ctx.scale(f.width / 2, f.height / 2); // the picture is -1..1 both ways: the circle becomes an ellipse
      const r0 = u.uRadius * Math.SQRT2, r1 = (u.uRadius + Math.max(u.uSoftness, 1e-3)) * Math.SQRT2;
      const grad = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) grad.addColorStop(t, rgba(t * t * (3 - 2 * t) * u.uStrength));
      ctx.fillStyle = grad;
      ctx.fillRect(-1, -1, 2, 2);
    },
  };
}

/**
 * Color grading: brightness, contrast, saturation and a tint, in that order
 * (like the CSS filters of the same names).
 *
 * @param {Object} [opts]
 * @param {number} [opts.brightness=1] - Multiplies the colors (1 = unchanged)
 * @param {number} [opts.contrast=1] - Pushes colors away from (> 1) or toward (< 1) middle gray
 * @param {number} [opts.saturation=1] - 0 = gray, 1 = unchanged, > 1 = more vivid
 * @param {string} [opts.tint="#ffffff"] - Multiplies the colors by this one
 */
export function grade({ brightness = 1, contrast = 1, saturation = 1, tint = "#ffffff" } = {}) {
  return {
    name: "grade",
    uniforms: { uBrightness: brightness, uContrast: contrast, uSaturation: saturation, uTint: tint },
    glsl: `
vec4 post(vec4 color, Frame f) {
  if (color.a <= 0.0) return color;
  vec3 c = color.rgb / color.a;
  c = clamp(c * uBrightness, 0.0, 1.0);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturation), 0.0, 1.0) * uTint.rgb;
  return vec4(c * color.a, color.a);
}`,
    canvas(ctx, f, u) {
      if (supportsFilter(ctx) && (u.uBrightness !== 1 || u.uContrast !== 1 || u.uSaturation !== 1)) {
        const copy = scratch(f.width, f.height);
        copy.getContext("2d").drawImage(f.canvas, 0, 0);
        ctx.filter = `brightness(${u.uBrightness}) contrast(${u.uContrast}) saturate(${u.uSaturation})`;
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(copy, 0, 0);
        ctx.filter = "none";
      }
      const t = f.rgba(u.uTint);
      if (t[0] < 1 || t[1] < 1 || t[2] < 1) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = u.uTint;
        ctx.fillRect(0, 0, f.width, f.height);
      }
    },
  };
}

/**
 * Film grain: a little random noise over the picture.
 *
 * @param {Object} [opts]
 * @param {number} [opts.amount=0.08] - How strong the noise is (0..1)
 * @param {number} [opts.size=1] - Size of a grain, in pixels
 * @param {boolean} [opts.animated=true] - New noise every frame (false: the same noise stays)
 */
export function grain({ amount = 0.08, size = 1, animated = true } = {}) {
  return {
    name: "grain",
    uniforms: { uAmount: amount, uGrain: size, uAnimated: animated },
    glsl: `
float grainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec4 post(vec4 color, Frame f) {
  vec2 cell = floor(f.uv * f.size / max(uGrain, 1.0));
  float t = uAnimated > 0.5 ? floor(f.time * 24.0) : 0.0;
  float n = grainHash(cell + vec2(t * 17.0, t * 31.0)) - 0.5;
  return vec4(clamp(color.rgb + n * uAmount * color.a, 0.0, 1.0), color.a);
}`,
    canvas(ctx, f, u) {
      const tile = noiseTile();
      const pattern = ctx.createPattern(tile, "repeat");
      const s = Math.max(1, u.uGrain);
      const frameNo = u.uAnimated ? Math.floor(f.time * 24) : 0;
      // A different spot of the tile each frame
      const ox = (frameNo * 37) % tile.width, oy = (frameNo * 61) % tile.height;
      pattern.setTransform?.(new DOMMatrix([s, 0, 0, s, -ox * s, -oy * s]));
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = Math.min(1, u.uAmount * 4);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, f.width, f.height);
    },
  };
}

/**
 * Glow around bright parts: what's brighter than `threshold` is blurred
 * and added back on top.
 *
 * On the canvas renderer it's an approximation (CSS filters can't cut at a
 * brightness exactly), and it needs a browser with canvas `filter` support.
 *
 * @param {Object} [opts]
 * @param {number} [opts.threshold=0.7] - Brightness (0..1) where the glow starts
 * @param {number} [opts.strength=0.8] - How bright the glow is
 * @param {number} [opts.radius=1] - How far it spreads (1 = about 25 pixels)
 */
export function bloom({ threshold = 0.7, strength = 0.8, radius = 1 } = {}) {
  // 9-tap Gaussian blur, along one direction
  const blur = (dir) => `
vec4 post(vec4 color, Frame f) {
  vec2 step = ${dir} * f.texel * uRadius * 1.5;
  vec3 c = frame(f.uv).rgb * 0.227027;
  c += (frame(f.uv + step).rgb + frame(f.uv - step).rgb) * 0.1945946;
  c += (frame(f.uv + step * 2.0).rgb + frame(f.uv - step * 2.0).rgb) * 0.1216216;
  c += (frame(f.uv + step * 3.0).rgb + frame(f.uv - step * 3.0).rgb) * 0.054054;
  c += (frame(f.uv + step * 4.0).rgb + frame(f.uv - step * 4.0).rgb) * 0.016216;
  return vec4(c, 1.0);
}`;
  return {
    name: "bloom",
    uniforms: { uThreshold: threshold, uStrength: strength, uRadius: radius },
    passes: [
      {
        // The bright parts only, at half size (four pixels averaged into one)
        scale: 0.5,
        glsl: `
vec4 post(vec4 color, Frame f) {
  vec2 o = f.texel * 0.5;
  vec3 c = (frame(f.uv - o).rgb + frame(f.uv + o).rgb
    + frame(f.uv + vec2(o.x, -o.y)).rgb + frame(f.uv + vec2(-o.x, o.y)).rgb) * 0.25;
  float b = max(c.r, max(c.g, c.b));
  return vec4(c * smoothstep(uThreshold - 0.1, uThreshold + 0.1, b), 1.0);
}`,
      },
      { scale: 0.25, glsl: blur("vec2(1.0, 0.0)") },
      { scale: 0.25, glsl: blur("vec2(0.0, 1.0)") },
      {
        // Added on top of the picture
        scale: 1,
        glsl: `
vec4 post(vec4 color, Frame f) {
  vec4 s = source(f.uv);
  vec3 g = frame(f.uv).rgb * uStrength;
  return vec4(min(s.rgb + g, 1.0), min(1.0, max(s.a, max(g.r, max(g.g, g.b)))));
}`,
      },
    ],
    canvas(ctx, f, u) {
      if (!supportsFilter(ctx)) return;
      const copy = scratch(f.width, f.height);
      const c = copy.getContext("2d");
      c.clearRect(0, 0, f.width, f.height);
      // brightness, then strong contrast: what's darker than about `threshold` goes black
      const t = Math.min(0.99, Math.max(0.05, u.uThreshold));
      c.filter = `brightness(${0.375 / t}) contrast(4) blur(${Math.max(1, 10 * u.uRadius)}px)`;
      c.drawImage(f.canvas, 0, 0);
      c.filter = "none";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, u.uStrength);
      ctx.drawImage(copy, 0, 0);
    },
  };
}

// --- Helpers for the canvas versions ---

function supportsFilter(ctx) {
  return typeof ctx.filter === "string";
}

let scratchCanvas = null;
/** A spare canvas of a size (one, reused). */
function scratch(w, h) {
  scratchCanvas ??= document.createElement("canvas");
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = w;
    scratchCanvas.height = h;
  }
  return scratchCanvas;
}

let tile = null;
/** 128 × 128 gray noise, made once. */
function noiseTile() {
  if (tile) return tile;
  tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const c = tile.getContext("2d");
  const img = c.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 256);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return tile;
}
