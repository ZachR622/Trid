/**
 * Lights: what makes faces bright or dark.
 *
 * A scene has a list of lights, `scene.lights`. Each one is a plain object:
 *
 *   { type: "ambient", color: "#ffffff", intensity: 0.25 }                  // everywhere, from every side
 *   { type: "directional", direction: { x: -0.5, y: 1, z: -0.8 }, intensity: 0.75 } // like the sun
 *   { type: "point", position: { x: 0, y: 1, z: 0 }, color: "#ffb070", intensity: 1, range: 3 } // like a bulb
 *
 * - `direction` is where the light comes **from** (it doesn't need to be unit length)
 * - `color` is any CSS color (default white), `intensity` multiplies it (default 1)
 * - `range`: a point light fades out smoothly and reaches nothing past it
 *   (default: no fading)
 * - `enabled: false` turns a light off without removing it
 * - `shadows: true` (directional lights): it casts shadows, see trid/render/shadows.js
 *
 * Lights add up: a face gets the ambient lights, plus each other light
 * times how much the face turns toward it. Both renderers use at most
 * `MAX_LIGHTS` directional and point lights (ambient ones don't count).
 *
 * The default scene has an ambient light at 0.25 and a directional light
 * at 0.75, so a face turned right at the light is exactly its own color.
 */

/** Direction light comes from when the scene doesn't set one: above, left, in front. */
export const DEFAULT_LIGHT = { x: -0.5, y: 1, z: -0.8 };

/** How bright a face turned fully away from the light still is (0..1). */
export const DEFAULT_AMBIENT = 0.25;

/** Most directional + point lights the renderers use; extra ones are ignored. */
export const MAX_LIGHTS = 8;

/**
 * The default lights: an ambient light at `ambient`, and a white
 * directional light from `direction` at `1 - ambient`.
 *
 * @param {{x:number,y:number,z:number}} [direction=DEFAULT_LIGHT]
 * @param {number} [ambient=DEFAULT_AMBIENT]
 * @returns {Object[]} A new list of lights
 */
export function defaultLights(direction = DEFAULT_LIGHT, ambient = DEFAULT_AMBIENT) {
  return [
    { type: "ambient", color: "#ffffff", intensity: ambient },
    // The given direction object is kept (so changing it moves the light), the default is copied
    { type: "directional", direction: direction === DEFAULT_LIGHT ? { ...DEFAULT_LIGHT } : direction, color: "#ffffff", intensity: 1 - ambient },
  ];
}

import { shadowOptions } from "./shadows.js";

let warnedTooMany = false;
let warnedPointShadows = false;

/**
 * A scene's lights, ready for shading: colors parsed and multiplied by
 * their intensity, directions made unit length.
 *
 * Reads `scene.lights`. A scene-like object without it (only `light` and
 * `ambient`, like before Trid 0.4) gets the default pair built from those.
 *
 * @param {Object} scene
 * @param {(css:string) => number[]} rgba - Parses a CSS color to [r, g, b, a] in 0..1
 * @returns {{
 *   ambient: number[],
 *   ambientLevel: number,
 *   lights: { point:boolean, dir:{x,y,z}|null, pos:{x,y,z}|null, color:number[], range:number }[],
 *   mainDir: {x,y,z},
 *   shadow: { index:number, dir:{x,y,z}, size:number, softness:number, bias:number, ground:number|null } | null,
 * }} `ambient` is the summed ambient color [r, g, b]; `ambientLevel` its brightest
 *   channel; `mainDir` the unit direction of the first directional light (for effects);
 *   `shadow` the light casting shadows (`index` in `lights`) and its settings
 */
export function sceneLights(scene, rgba) {
  const list = Array.isArray(scene.lights)
    ? scene.lights
    : defaultLights(scene.light ?? DEFAULT_LIGHT, scene.ambient ?? DEFAULT_AMBIENT);

  const ambient = [0, 0, 0];
  const lights = [];
  let mainDir = null;
  let shadow = null;
  for (const l of list) {
    if (!l || l.enabled === false) continue;
    const k = l.intensity ?? 1;
    const c = rgba(l.color ?? "#ffffff");
    const color = [c[0] * k, c[1] * k, c[2] * k];
    if (l.type === "ambient") {
      for (let i = 0; i < 3; i++) ambient[i] += color[i];
      continue;
    }
    if (lights.length >= MAX_LIGHTS) {
      if (!warnedTooMany) {
        warnedTooMany = true;
        console.warn(`Trid: only the first ${MAX_LIGHTS} directional and point lights are used`);
      }
      continue;
    }
    if (l.type === "point") {
      if (l.shadows && !warnedPointShadows) {
        warnedPointShadows = true;
        console.warn("Trid: point lights don't cast shadows yet, only directional ones");
      }
      const p = l.position ?? { x: 0, y: 0, z: 0 };
      lights.push({ point: true, dir: null, pos: { x: p.x, y: p.y, z: p.z }, color, range: l.range > 0 ? l.range : 0 });
    } else {
      const dir = unit(l.direction ?? DEFAULT_LIGHT);
      mainDir ??= dir;
      if (l.shadows && !shadow) shadow = { index: lights.length, dir, ...shadowOptions(l.shadows) };
      lights.push({ point: false, dir, pos: null, color, range: 0 });
    }
  }
  return {
    ambient,
    ambientLevel: Math.max(...ambient),
    lights,
    mainDir: mainDir ?? unit(DEFAULT_LIGHT),
    shadow,
  };
}

/**
 * The light reaching a point, as [r, g, b] (can go above 1).
 * The same math as the WebGL renderer's shader.
 *
 * @param {ReturnType<typeof sceneLights>} L - From `sceneLights`
 * @param {{x,y,z}} n - Unit normal, world space
 * @param {{x,y,z}} p - World position (for point lights)
 * @returns {number[]}
 */
export function lightAt(L, n, p) {
  const c = L.ambient.slice();
  for (const l of L.lights) {
    let d = l.dir, fade = 1;
    if (l.point) {
      const dx = l.pos.x - p.x, dy = l.pos.y - p.y, dz = l.pos.z - p.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      d = { x: dx / dist, y: dy / dist, z: dz / dist };
      fade = rangeFade(dist, l.range);
    }
    const k = Math.max(0, n.x * d.x + n.y * d.y + n.z * d.z) * fade;
    if (k <= 0) continue;
    c[0] += l.color[0] * k;
    c[1] += l.color[1] * k;
    c[2] += l.color[2] * k;
  }
  return c;
}

/**
 * The single numbers effects get, from the light at a point:
 * - `light`: its brightness (brightest channel)
 * - `diffuse`: how much of it comes from the lights rather than the
 *   ambient, 0..1 (with one light: how much the point faces it)
 *
 * @param {number[]} color - From `lightAt`
 * @param {number} ambientLevel - From `sceneLights`
 */
export function lightLevels(color, ambientLevel) {
  const light = Math.max(color[0], color[1], color[2]);
  const diffuse = Math.min(1, Math.max(0, (light - ambientLevel) / Math.max(1 - ambientLevel, 1e-4)));
  return { light, diffuse };
}

/** How much of a point light reaches `dist` away: 1 up close, 0 at `range` (0 = no fading). */
export function rangeFade(dist, range) {
  if (!(range > 0)) return 1;
  const k = Math.min(1, Math.max(0, 1 - (dist * dist) / (range * range)));
  return k * k;
}

function unit(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
