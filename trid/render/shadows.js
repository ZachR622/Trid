/**
 * Shadows from directional and point lights.
 *
 *   scene.lights = [
 *     { type: "ambient", intensity: 0.3 },
 *     { type: "directional", direction: { x: -0.5, y: 1, z: -0.8 }, intensity: 0.7, shadows: true },
 *     { type: "point", position: { x: 0, y: 1, z: 0 }, range: 4, shadows: true },
 *   ];
 *
 * - Lights with `shadows` cast them: up to `MAX_SHADOWS.directional`
 *   directional and `MAX_SHADOWS.point` point lights at once (the first
 *   ones in the list; others light without shadows). `shadows` is `true`
 *   or options, see `shadowOptions`
 * - Objects cast and receive shadows unless they (or a group they're in)
 *   have `castShadow: false` / `receiveShadow: false`. Only faces cast
 *   shadows, not lines or see-through faces
 *
 * WebGL renderer: shadow maps. The scene is drawn from the light into a
 * picture of distances (a directional light: one, fitted around the casting
 * objects every frame; a point light: six, one per side of a cube around
 * it); each pixel then checks whether something is nearer the light than it.
 *
 * Canvas renderer: ground shadows. The casting objects are flattened onto
 * the floor (the level where most of the area of flat, upward faces is, or
 * `ground`) along the light, and drawn as one darker shape per light on the
 * floor's faces. Objects don't shadow each other there.
 */

import { transformPoint } from "../math/matrix.js";
import { newell } from "./normals.js";

/** Settings used for `shadows: true` (point lights: `size` is `POINT_SHADOW_SIZE`). */
export const DEFAULT_SHADOWS = Object.freeze({ size: 2048, softness: 1.5, bias: 1, ground: null });

/** Default shadow map size of a point light: each of its six sides. */
export const POINT_SHADOW_SIZE = 512;

/** How many lights of each kind can cast shadows at once. */
export const MAX_SHADOWS = Object.freeze({ directional: 2, point: 2 });

/**
 * A light's shadow settings, defaults filled in.
 *
 * @param {boolean|Object} value - The light's `shadows`
 * @param {boolean} [point=false] - For a point light (smaller default `size`)
 * @returns {{ size:number, softness:number, bias:number, ground:number|null }}
 *   - `size`: width of the shadow map in pixels (WebGL; a point light has six). Bigger: sharper, slower
 *   - `softness`: blur of the shadows' edges, in shadow map pixels (0: sharp)
 *   - `bias`: pushes the test away from surfaces, against speckles ("shadow acne")
 *     on surfaces facing the light. Raise it if they appear; too high and shadows
 *     come loose from their objects
 *   - `ground`: the floor's height for the canvas renderer (default: found)
 */
export function shadowOptions(value, point = false) {
  const o = value && typeof value === "object" ? value : {};
  return {
    size: Math.max(64, Math.min(8192, Math.round(o.size ?? (point ? POINT_SHADOW_SIZE : DEFAULT_SHADOWS.size)))),
    softness: Math.max(0, o.softness ?? DEFAULT_SHADOWS.softness),
    bias: Math.max(0, o.bias ?? DEFAULT_SHADOWS.bias),
    ground: typeof o.ground === "number" ? o.ground : null,
  };
}

/** False when the object or one of its groups sets `key` to false. */
export function shadowFlag(obj, key) {
  for (let o = obj; o; o = o.parent) if (o[key] === false) return false;
  return true;
}

const spheres = new WeakMap();

/** A sphere around a mesh's vertices, in its own space (cached per vertex array). */
function meshSphere(mesh) {
  const v = mesh.vertices;
  const hit = spheres.get(v);
  if (hit && hit.n === v.length && !mesh.dirty) return hit;
  let min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of v) {
    min = { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) };
    max = { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) };
  }
  const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  let r = 0;
  for (const p of v) r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z));
  const s = { c, r, n: v.length };
  spheres.set(v, s);
  return s;
}

/**
 * Where the shadow map looks: a box facing along the light, around every
 * casting object (each object's mesh sphere, placed and scaled).
 *
 * @param {Object[]} casters - Objects with `mesh` and `world`
 * @param {{x:number,y:number,z:number}} dir - Unit direction the light comes from
 * @returns {{ matrix: Float32Array, radius: number } | null} `matrix` takes world points to
 *   the shadow map's -1..1 cube (column-major, for WebGL)
 */
export function shadowFrame(casters, dir) {
  let min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let any = false;
  for (const obj of casters) {
    if (!obj.mesh?.vertices?.length) continue;
    const s = meshSphere(obj.mesh);
    const w = obj.world;
    const c = transformPoint(w, s.c);
    const k = Math.max(Math.hypot(w[0], w[1], w[2]), Math.hypot(w[4], w[5], w[6]), Math.hypot(w[8], w[9], w[10]));
    const r = s.r * k;
    min = { x: Math.min(min.x, c.x - r), y: Math.min(min.y, c.y - r), z: Math.min(min.z, c.z - r) };
    max = { x: Math.max(max.x, c.x + r), y: Math.max(max.y, c.y + r), z: Math.max(max.z, c.z + r) };
    any = true;
  }
  if (!any) return null;
  const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const R = Math.max(1e-6, Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2);

  // The light looks along -dir; right and up across it
  const f = { x: -dir.x, y: -dir.y, z: -dir.z };
  const up = Math.abs(f.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const r = unit(cross(up, f));
  const u = cross(f, r);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const m = new Float32Array([
    r.x / R, u.x / R, f.x / R, 0,
    r.y / R, u.y / R, f.y / R, 0,
    r.z / R, u.z / R, f.z / R, 0,
    -dot(r, c) / R, -dot(u, c) / R, -dot(f, c) / R, 1,
  ]);
  return { matrix: m, radius: R };
}

/**
 * How far a point light's shadow map reaches: its `range`, or else to the
 * far side of the farthest casting object.
 *
 * @param {Object[]} casters - Objects with `mesh` and `world`
 * @param {{x:number,y:number,z:number}} pos - The light's position
 * @param {number} range - The light's range (0: none)
 */
export function pointShadowFar(casters, pos, range) {
  if (range > 0) return range;
  let far = 0;
  for (const obj of casters) {
    if (!obj.mesh?.vertices?.length) continue;
    const s = meshSphere(obj.mesh);
    const w = obj.world;
    const c = transformPoint(w, s.c);
    const k = Math.max(Math.hypot(w[0], w[1], w[2]), Math.hypot(w[4], w[5], w[6]), Math.hypot(w[8], w[9], w[10]));
    far = Math.max(far, Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z) + s.r * k);
  }
  return far * 1.01 || 1;
}

/**
 * The floor for ground shadows: the height where receiving objects have the
 * most area of flat faces turned up. Null when there's none.
 *
 * @param {Object[]} receivers - Objects with `mesh` and `world`
 */
export function findGround(receivers) {
  const area = new Map();
  for (const obj of receivers) {
    const v = obj.mesh.vertices;
    for (const face of obj.mesh.faces ?? []) {
      if (face.length < 3) continue;
      const p = face.map((i) => transformPoint(obj.world, v[i]));
      const n = newell(p);
      const len = Math.hypot(n.x, n.y, n.z);
      if (!(len > 0) || n.y / len < 0.99) continue;
      const y = Math.round(p[0].y * 1e4) / 1e4;
      area.set(y, (area.get(y) ?? 0) + len / 2);
    }
  }
  let best = null, most = 0;
  for (const [y, a] of area) if (a > most) [best, most] = [y, a];
  return best;
}

/**
 * A world polygon's part above `ground`, flattened onto it along the light.
 * Empty when it's all at or below the ground.
 *
 * @param {{x:number,y:number,z:number}[]} pts - World points
 * @param {{x:number,y:number,z:number}} dir - Unit direction the light comes from (dir.y > 0)
 * @param {number} ground
 */
export function flattenOnGround(pts, dir, ground) {
  return cutY(pts, ground, true).map((p) => {
    const t = (p.y - ground) / dir.y;
    return { x: p.x - dir.x * t, y: ground, z: p.z - dir.z * t };
  });
}

/**
 * Like `flattenOnGround`, for a point light at `pos` (above the ground): the
 * polygon's part between the ground and the light's height, pushed down
 * along the rays from the light, so shadows spread out with distance.
 *
 * @param {{x:number,y:number,z:number}[]} pts - World points
 * @param {{x:number,y:number,z:number}} pos - The light's position
 * @param {number} ground
 */
export function flattenFromPoint(pts, pos, ground) {
  // Nothing at the light's height or above casts on the floor (its ray never comes down)
  const top = pos.y - Math.max(1e-4, (pos.y - ground) * 1e-3);
  return cutY(cutY(pts, ground, true), top, false).map((p) => {
    const t = (pos.y - ground) / (pos.y - p.y);
    return { x: pos.x + (p.x - pos.x) * t, y: ground, z: pos.z + (p.z - pos.z) * t };
  });
}

/** A polygon's part above (`keepAbove`) or below a height. Empty when nothing of it is there. */
function cutY(pts, y, keepAbove) {
  const eps = 1e-5;
  const inside = (p) => (keepAbove ? p.y >= y : p.y <= y);
  if (keepAbove ? pts.every((p) => p.y <= y + eps) : pts.every((p) => p.y >= y - eps)) return [];
  if (pts.every(inside)) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const aIn = inside(a), bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (y - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function unit(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
