/**
 * Effects: small shaders that change how a material looks.
 *
 * A material can have a list of them, applied in order. Each one gets
 * the color so far and the `Surface` being drawn, and returns a new color:
 *
 *   material: { fill: "#8ab4f8", effects: [toon({ steps: 3 }), rim()] }
 *
 * An effect is a plain object:
 * - `glsl`: GLSL code defining `vec4 effect(vec4 color, Surface s)` (WebGL renderer)
 * - `canvas`: optional `(color, s, uniforms) => color` run once per face
 *   by the canvas renderer; colors are [r, g, b, a] from 0 to 1
 * - `uniforms`: optional settings used by the code, like `{ uPower: 2 }`.
 *   Change them at any time; they're read every frame.
 *   Numbers are `float`, [x, y] / [x, y, z] / [x, y, z, w] are `vec2..4`,
 *   CSS color strings are `vec4` colors, `true` / `false` are `float` 1 / 0.
 *
 * The built-in effects below are written exactly that way.
 */

/**
 * What an effect knows about the point being drawn. GLSL fields and
 * the canvas renderer's `s` object have the same names.
 *
 * @typedef {Object} Surface
 * @property {number[]} base - The material's fill color [r, g, b, a], times the texture's color
 * @property {{u,v}} uv - Texture coordinates (0, 0 when the mesh has none)
 * @property {{x,y,z}} normal - Unit normal, in world space, facing the camera's side
 * @property {{x,y,z}} position - World position
 * @property {{x,y,z}} local - Position in the mesh's own space
 * @property {{x,y,z}} view - Unit direction from the point to the camera
 * @property {{x,y,z}} lightDir - Unit direction light comes from
 * @property {number} diffuse - How much the point faces the light (0..1)
 * @property {number} light - Brightness Trid used: ambient + (1 - ambient) × diffuse
 * @property {number} ambient - The scene's ambient level
 * @property {number} depth - Distance to the camera
 * @property {number} time - Seconds since the renderer started
 * @property {number[]} background - The scene's background color [r, g, b, a]
 */

/** The GLSL declaration of `Surface`, shared by every effect. */
export const SURFACE_GLSL = `
struct Surface {
  vec4 base;
  vec2 uv;
  vec3 normal;
  vec3 position;
  vec3 local;
  vec3 view;
  vec3 lightDir;
  float diffuse;
  float light;
  float ambient;
  float depth;
  float time;
  vec4 background;
};
`;

/**
 * Cartoon look: the light comes in a few hard steps instead of a smooth fade.
 *
 * @param {Object} [opts]
 * @param {number} [opts.steps=3] - Number of brightness levels
 */
export function toon({ steps = 3 } = {}) {
  return {
    name: "toon",
    uniforms: { uSteps: steps },
    glsl: `
vec4 effect(vec4 color, Surface s) {
  float level = min(floor(s.diffuse * uSteps), uSteps - 1.0) / max(uSteps - 1.0, 1.0);
  float b = s.ambient + (1.0 - s.ambient) * level;
  return vec4(s.base.rgb * b, color.a);
}`,
    canvas: (color, s, u) => {
      const level = Math.min(Math.floor(s.diffuse * u.uSteps), u.uSteps - 1) / Math.max(u.uSteps - 1, 1);
      const b = s.ambient + (1 - s.ambient) * level;
      return [s.base[0] * b, s.base[1] * b, s.base[2] * b, color[3]];
    },
  };
}

/**
 * A glow along the edges, where the surface turns away from the camera.
 *
 * @param {Object} [opts]
 * @param {string} [opts.color="#ffffff"] - Glow color
 * @param {number} [opts.power=2] - Higher = thinner glow
 * @param {number} [opts.strength=1] - How bright the glow is
 */
export function rim({ color = "#ffffff", power = 2, strength = 1 } = {}) {
  return {
    name: "rim",
    uniforms: { uRimColor: color, uPower: power, uStrength: strength },
    glsl: `
vec4 effect(vec4 color, Surface s) {
  float edge = pow(1.0 - max(0.0, dot(s.normal, s.view)), uPower) * uStrength;
  return vec4(color.rgb + uRimColor.rgb * edge, color.a);
}`,
    canvas: (c, s, u) => {
      const n = s.normal, v = s.view;
      const edge = Math.pow(1 - Math.max(0, n.x * v.x + n.y * v.y + n.z * v.z), u.uPower) * u.uStrength;
      const r = s.rgba(u.uRimColor);
      return [c[0] + r[0] * edge, c[1] + r[1] * edge, c[2] + r[2] * edge, c[3]];
    },
  };
}

/** Ignores the light: the object shows its fill color everywhere, like it glows. */
export function unlit() {
  return {
    name: "unlit",
    uniforms: {},
    glsl: `
vec4 effect(vec4 color, Surface s) {
  return s.base;
}`,
    canvas: (color, s) => s.base.slice(),
  };
}

/**
 * Color that changes along an axis, like a sky or terrain by height.
 *
 * @param {Object} [opts]
 * @param {string} [opts.from="#E9806E"] - Color at `min`
 * @param {string} [opts.to="#8ab4f8"] - Color at `max`
 * @param {"x"|"y"|"z"} [opts.axis="y"] - Direction of the change
 * @param {number} [opts.min=-0.5] - Where `from` is fully reached
 * @param {number} [opts.max=0.5] - Where `to` is fully reached
 * @param {"local"|"world"} [opts.space="local"] - Measure in the mesh's own space (moves with it) or in the world
 * @param {boolean} [opts.lit=true] - Keep the shading from the light
 */
export function gradient({
  from = "#E9806E", to = "#8ab4f8", axis = "y", min = -0.5, max = 0.5, space = "local", lit = true,
} = {}) {
  const k = { x: 0, y: 1, z: 2 }[axis] ?? 1;
  const p = space === "world" ? "position" : "local";
  return {
    name: "gradient",
    uniforms: { uFrom: from, uTo: to, uMin: min, uMax: max, uLit: lit },
    glsl: `
vec4 effect(vec4 color, Surface s) {
  float t = clamp((s.${p}[${k}] - uMin) / (uMax - uMin), 0.0, 1.0);
  vec3 c = mix(uFrom.rgb, uTo.rgb, t);
  return vec4(c * mix(1.0, s.light, uLit), color.a);
}`,
    canvas: (color, s, u) => {
      const v = s[p][axis] ?? s[p].y;
      const t = Math.min(1, Math.max(0, (v - u.uMin) / (u.uMax - u.uMin)));
      const a = s.rgba(u.uFrom), b = s.rgba(u.uTo);
      const l = u.uLit ? s.light : 1;
      return [0, 1, 2].map((i) => (a[i] + (b[i] - a[i]) * t) * l).concat(color[3]);
    },
  };
}

/**
 * Fades objects into a color with distance.
 *
 * @param {Object} [opts]
 * @param {number} [opts.near=1] - Distance where the fog starts
 * @param {number} [opts.far=5] - Distance where it's fully fog
 * @param {string} [opts.color] - Fog color (default: the scene's background)
 */
export function fog({ near = 1, far = 5, color } = {}) {
  return {
    name: "fog",
    uniforms: { uNearFog: near, uFarFog: far, uFogColor: color ?? "#000000", uOwnColor: color != null },
    glsl: `
vec4 effect(vec4 color, Surface s) {
  float t = smoothstep(uNearFog, uFarFog, s.depth);
  vec3 c = mix(s.background.rgb, uFogColor.rgb, uOwnColor);
  return vec4(mix(color.rgb, c, t), color.a);
}`,
    canvas: (color, s, u) => {
      let t = Math.min(1, Math.max(0, (s.depth - u.uNearFog) / (u.uFarFog - u.uNearFog)));
      t = t * t * (3 - 2 * t);
      const c = u.uOwnColor ? s.rgba(u.uFogColor) : s.background;
      return [0, 1, 2].map((i) => color[i] + (c[i] - color[i]) * t).concat(color[3]);
    },
  };
}

// --- Used by the renderers ---

/** GLSL type of a uniform value, or null if it can't be one. */
export function uniformType(value) {
  if (typeof value === "number" || typeof value === "boolean") return "float";
  if (typeof value === "string") return "vec4";
  if (Array.isArray(value) && value.length >= 2 && value.length <= 4) return "vec" + value.length;
  if (value && typeof value === "object" && "x" in value) return "vec3";
  return null;
}

/**
 * Joins a material's effects into GLSL. Each effect's `effect` function,
 * helper functions and uniforms get a numbered suffix, so the same effect
 * can be used twice and two effects can use the same names.
 *
 * @param {Object[]} effects
 * @returns {{ code:string, calls:string, uniforms:{ effect:number, name:string, glslName:string, type:string }[] }}
 */
export function buildEffects(effects) {
  let code = "";
  let calls = "";
  const uniforms = [];

  effects.forEach((e, i) => {
    let src = e.glsl ?? "vec4 effect(vec4 color, Surface s) { return color; }";
    const rename = new Map();

    for (const [name, value] of Object.entries(e.uniforms ?? {})) {
      const type = uniformType(value);
      if (!type) continue;
      rename.set(name, `${name}_${i}`);
      uniforms.push({ effect: i, name, glslName: `${name}_${i}`, type });
    }
    // Every function the effect defines, including `effect` itself
    const fn = /(?:^|[\s;}])(?:void|float|int|bool|vec[234]|mat[234]|Surface)\s+([A-Za-z_]\w*)\s*\(/g;
    for (const m of src.matchAll(fn)) rename.set(m[1], `${m[1]}_${i}`);

    for (const [from, to] of rename) src = src.replace(new RegExp(`\\b${from}\\b`, "g"), to);

    const decls = uniforms.filter((u) => u.effect === i).map((u) => `uniform ${u.type} ${u.glslName};`).join("\n");
    code += `\n// Effect ${i}${e.name ? ": " + e.name : ""}\n${decls}\n${src}\n`;
    calls += `  color = effect_${i}(color, s);\n`;
  });

  return { code, calls, uniforms };
}

/** A key that's the same for effect lists that compile to the same shader. */
export function effectsKey(effects) {
  return effects
    .map((e) => (e.glsl ?? "") + "|" + Object.entries(e.uniforms ?? {}).map(([k, v]) => k + ":" + uniformType(v)).join(","))
    .join("\n");
}
