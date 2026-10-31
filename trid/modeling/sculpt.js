/**
 * Sculpting brushes as plain functions, like Blender's sculpt mode in code:
 * inflate, grab, smooth, flatten, pinch, crease and noise. Each one changes
 * a mesh in place (like the deformers: the mesh's own normals are removed,
 * and `dirty` is set) around a point, or along a path, fading out at
 * `radius`.
 *
 *   sculptMesh(head, "inflate", { center: cheek, radius: 0.1, strength: 0.02, symmetry: "x" });
 *   sculptMesh(head, "crease", { along: [a, b, c], radius: 0.03, strength: 0.01 });
 *
 * A brush only moves vertices, so the mesh needs enough of them where it's
 * sculpted: subdivide it first, or build it dense (spheres, blobs, lofts).
 */
import { meshBounds } from "../render/meshUtils.js";
import { fbm3 } from "../math/noise.js";
import { samePlace } from "./cleanup.js";
import { newell } from "../render/normals.js";
import { vec, add, sub, mul, dot, norm } from "./vec.js";

export const SCULPT_BRUSHES = ["inflate", "grab", "smooth", "flatten", "pinch", "crease", "noise"];

const AXES = ["x", "y", "z"];

/** How much a brush acts at a distance, from t = distance / radius (0 in the middle, 1 at the edge). */
const FALLOFFS = {
  smooth: (t) => (1 - t * t) ** 2,
  sharp: (t) => (1 - t) ** 2,
  linear: (t) => 1 - t,
  constant: () => 1,
};

function falloffOf(falloff) {
  if (typeof falloff === "function") return falloff;
  const f = FALLOFFS[falloff];
  if (!f) throw new Error(`Unknown falloff "${falloff}": use "smooth", "sharp", "linear", "constant" or a function`);
  return f;
}

/** The brush paths for each mirror side: every mix of flipped axes, with the signs used. */
function mirrored(path, symmetry) {
  const axes = symmetry ? (Array.isArray(symmetry) ? symmetry : [symmetry]) : [];
  for (const a of axes) if (!AXES.includes(a)) throw new Error(`Unknown symmetry axis "${a}": use "x", "y" or "z"`);
  let out = [{ path, sign: vec(1, 1, 1) }];
  for (const a of new Set(axes)) {
    out = out.flatMap((s) => [s, { path: s.path.map((p) => ({ ...p, [a]: -p[a] })), sign: { ...s.sign, [a]: -s.sign[a] } }]);
  }
  return out;
}

/** The point of a path (a polyline, or one point) nearest to p. */
function closestOnPath(path, p) {
  if (path.length === 1) return path[0];
  let best = null, bestD = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], ab = sub(path[i + 1], a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = add(a, mul(ab, t));
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Unit normals of the points the brush moves (indexed by their `rep`): the
 * faces around them averaged, bigger faces counting more, shared by points
 * at the same place. Only faces touching those points are looked at.
 */
function normalsAround(mesh, rep, weight) {
  const vs = mesh.vertices;
  const sum = new Map();
  for (const f of mesh.faces) {
    if (f.length < 3 || !f.some((i) => rep[i] >= 0 && weight[rep[i]] > 0)) continue;
    const pts = f.map((i) => vs[i]);
    if (!pts.every(Boolean)) continue;
    const nf = newell(pts);
    for (const i of f) {
      const r = rep[i];
      if (r < 0 || !(weight[r] > 0)) continue;
      const s = sum.get(r);
      if (s) {
        s.x += nf.x; s.y += nf.y; s.z += nf.z;
      } else sum.set(r, { x: nf.x, y: nf.y, z: nf.z });
    }
  }
  const out = [];
  for (const [r, s] of sum) out[r] = norm(s);
  return out;
}

const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/**
 * Sculpts a mesh with a brush, in place, around `center` or along a path
 * (`along`: a list of points, like a stroke), fading to nothing at `radius`.
 *
 * | Brush | Moves points | `strength` (default) |
 * | --- | --- | --- |
 * | `"inflate"` | out along the surface (in, when negative) | distance at the middle (radius / 5) |
 * | `"grab"` | by `delta` | a factor on `delta` (1) |
 * | `"smooth"` | toward the middle of their neighbors | 0 to 1 per pass (0.5); `iterations` passes (1) |
 * | `"flatten"` | onto the plane through the area | 0 to 1 (0.5) |
 * | `"pinch"` | toward the brush, along the surface | 0 to 1 (0.3) |
 * | `"crease"` | in, and toward the brush: a groove | depth at the middle (radius × 0.15); `pinch` 0 to 1 (0.5) |
 * | `"noise"` | in and out along the surface, lumpy | height of the lumps (radius × 0.15); `scale` lumps per radius (3), `seed` |
 *
 * `falloff` shapes the fade: `"smooth"` (default), `"sharp"`, `"linear"`,
 * `"constant"`, or a function of the distance over the radius (0 to 1).
 * With `symmetry` (`"x"`, or a list of axes), the brush also works mirrored
 * across the mesh's own origin, so a symmetric mesh stays exactly
 * symmetric; points on the mirror plane stay on it.
 *
 * Points at the same place (texture seams) move together, so the surface
 * doesn't tear.
 *
 * @example
 * // Cheekbones on both sides, then a smile groove
 * sculptMesh(head, "inflate", { center: { x: 0.3, y: 0.1, z: -0.8 }, radius: 0.25, strength: 0.05, symmetry: "x" });
 * sculptMesh(head, "crease", { along: [{ x: -0.2, y: -0.3, z: -0.9 }, { x: 0, y: -0.38, z: -0.95 }, { x: 0.2, y: -0.3, z: -0.9 }], radius: 0.06, strength: 0.02 });
 *
 * @template M
 * @param {M} mesh
 * @param {"inflate"|"grab"|"smooth"|"flatten"|"pinch"|"crease"|"noise"} brush
 * @param {{ center?: {x:number,y:number,z:number}, along?: {x:number,y:number,z:number}[], radius: number, strength?: number,
 *   falloff?: "smooth"|"sharp"|"linear"|"constant"|((t: number) => number), symmetry?: "x"|"y"|"z"|("x"|"y"|"z")[],
 *   delta?: {x?:number,y?:number,z?:number}, iterations?: number, pinch?: number, scale?: number, seed?: number }} opts
 * @returns {M} The same mesh
 */
export function sculptMesh(mesh, brush, opts = {}) {
  if (!SCULPT_BRUSHES.includes(brush)) throw new Error(`Unknown brush "${brush}": use ${SCULPT_BRUSHES.map((b) => `"${b}"`).join(", ")}`);
  const { radius, center, along, symmetry } = opts;
  const path = Array.isArray(along) && along.length ? along : center ? [center] : null;
  if (!path || !path.every(isPoint) || !(radius > 0) || !mesh.vertices?.length) return mesh;
  const fall = falloffOf(opts.falloff ?? "smooth");
  const sides = mirrored(path, symmetry);
  const vs = mesh.vertices;
  const n = vs.length;

  // Only points in the brushes' boxes can move: everything below looks at those alone
  const boxes = sides.map(({ path: p }) => {
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const q of p) for (const a of AXES) {
      lo[a] = Math.min(lo[a], q[a] - radius);
      hi[a] = Math.max(hi[a], q[a] + radius);
    }
    return { lo, hi };
  });
  const inBox = (v) => boxes.some(({ lo, hi }) => v.x >= lo.x && v.x <= hi.x && v.y >= lo.y && v.y <= hi.y && v.z >= lo.z && v.z <= hi.z);
  const cand = [];
  for (let i = 0; i < n; i++) if (isPoint(vs[i]) && inBox(vs[i])) cand.push(i);
  if (!cand.length) return mesh;

  // Points at the same place act as one: work on one of them (the first), copy to the others.
  // rep[i] is that point, or -1 outside the brushes
  const box = meshBounds(mesh);
  const size = box ? Math.max(box.size.x, box.size.y, box.size.z) : 0;
  const eps = (size || 1) * 1e-9;
  const rep = new Int32Array(n).fill(-1);
  const same = samePlace(cand.map((i) => vs[i]), eps);
  cand.forEach((i, k) => { rep[i] = cand[same[k]]; });

  // Each point's weight, and the brush point (and mirror side) nearest to it
  const weight = new Float64Array(n);
  const near = new Array(n), side = new Array(n);
  let any = false;
  for (const i of cand) {
    if (rep[i] !== i) continue;
    const v = vs[i];
    let bestD = Infinity;
    for (const s of sides) {
      const q = closestOnPath(s.path, v);
      const d = Math.hypot(q.x - v.x, q.y - v.y, q.z - v.z);
      if (d < bestD) {
        bestD = d;
        near[i] = q;
        side[i] = s.sign;
      }
    }
    if (bestD < radius) {
      const w = fall(bestD / radius);
      if (Number.isFinite(w) && w > 0) {
        weight[i] = w;
        any = true;
      }
    }
  }
  if (!any) return mesh;

  const needsNormals = brush !== "grab" && brush !== "smooth";
  const normals = needsNormals && mesh.faces?.length ? normalsAround(mesh, rep, weight) : null;
  const move = new Array(n).fill(null);
  const strength = (fallback) => (Number.isFinite(opts.strength) ? opts.strength : fallback);
  const active = [];
  for (let i = 0; i < n; i++) if (weight[i] > 0) active.push(i);

  if (brush === "inflate" || brush === "crease" || brush === "noise") {
    const depth = brush === "inflate" ? strength(radius / 5) : strength(radius * 0.15);
    const pinch = brush === "crease" ? Math.max(0, Math.min(1, opts.pinch ?? 0.5)) : 0;
    const freq = (Number.isFinite(opts.scale) ? opts.scale : 3) / radius;
    const seed = opts.seed ?? 0;
    for (const i of active) {
      const v = vs[i], w = weight[i], nv = normals?.[i];
      let d = vec();
      if (nv) {
        let k = brush === "inflate" ? depth : -depth;
        if (brush === "noise") {
          // Read the noise where the point is on the brush's own side, so mirrored sides get the same lumps
          const s = side[i];
          k = depth * 2 * (fbm3(v.x * s.x * freq, v.y * s.y * freq, v.z * s.z * freq, { seed }) - 0.5);
        }
        d = mul(nv, k * w);
      }
      if (pinch) {
        const to = sub(near[i], v);
        const along = nv ? sub(to, mul(nv, dot(to, nv))) : to;
        d = add(d, mul(along, Math.min(1, pinch * w)));
      }
      move[i] = d;
    }
  } else if (brush === "grab") {
    const delta = { ...vec(), ...opts.delta };
    const k = strength(1);
    for (const i of active) {
      const s = side[i];
      move[i] = mul({ x: delta.x * s.x, y: delta.y * s.y, z: delta.z * s.z }, k * weight[i]);
    }
  } else if (brush === "pinch") {
    const k = strength(0.3);
    for (const i of active) {
      const to = sub(near[i], vs[i]), nv = normals?.[i];
      const along = nv ? sub(to, mul(nv, dot(to, nv))) : to;
      move[i] = mul(along, Math.max(-1, Math.min(1, k * weight[i])));
    }
  } else if (brush === "flatten") {
    // The plane: the area's weighted middle, facing its weighted normal
    let total = 0, mid = vec(), up = vec();
    for (const i of active) {
      total += weight[i];
      mid = add(mid, mul(vs[i], weight[i]));
      if (normals?.[i]) up = add(up, mul(normals[i], weight[i]));
    }
    mid = mul(mid, 1 / total);
    const nrm = norm(up);
    if (!nrm) return mesh;
    const k = strength(0.5);
    for (const i of active) {
      const off = dot(sub(vs[i], mid), nrm);
      move[i] = mul(nrm, -off * Math.max(-1, Math.min(1, k * weight[i])));
    }
  } else if (brush === "smooth") {
    // Neighbors along face sides, between points at the same place
    const neighbors = new Map();
    const link = (a, b) => {
      if (a === b) return;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a).add(b);
    };
    const key = (i) => (rep[i] >= 0 ? rep[i] : i);
    for (const f of mesh.faces ?? []) {
      if (!f.some((i) => rep[i] >= 0 && weight[rep[i]] > 0)) continue;
      for (let k = 0; k < f.length; k++) {
        const a = f[k], b = f[(k + 1) % f.length];
        if (!vs[a] || !vs[b]) continue;
        link(key(a), key(b));
        link(key(b), key(a));
      }
    }
    const k = strength(0.5);
    const iterations = Math.max(1, Math.floor(opts.iterations ?? 1));
    const pos = new Map();
    const at = (j) => {
      if (!pos.has(j)) pos.set(j, vec(vs[j].x, vs[j].y, vs[j].z));
      return pos.get(j);
    };
    for (const nb of neighbors.values()) for (const j of nb) at(j);
    for (const i of active) at(i);
    for (let it = 0; it < iterations; it++) {
      const next = new Map();
      for (const i of active) {
        const nb = neighbors.get(i);
        if (!nb?.size) continue;
        // Neighbors outside the brushes weren't merged: count each place once
        const seen = [];
        for (const j of nb) if (!seen.some((p) => p.x === pos.get(j).x && p.y === pos.get(j).y && p.z === pos.get(j).z)) seen.push(pos.get(j));
        let avg = vec();
        for (const p of seen) avg = add(avg, p);
        avg = mul(avg, 1 / seen.length);
        next.set(i, add(pos.get(i), mul(sub(avg, pos.get(i)), Math.max(-1, Math.min(1, k * weight[i])))));
      }
      for (const [i, p] of next) pos.set(i, p);
    }
    for (const i of active) move[i] = sub(pos.get(i), vs[i]);
  }

  // Points on a mirror plane stay on it, so the two halves stay joined
  const planes = symmetry ? [...new Set(Array.isArray(symmetry) ? symmetry : [symmetry])] : [];
  for (const i of cand) {
    const r = rep[i];
    const d = move[r];
    if (!d) continue;
    const v = vs[i];
    let dx = d.x, dy = d.y, dz = d.z;
    for (const a of planes) {
      if (Math.abs(vs[r][a]) > eps) continue;
      if (a === "x") dx = 0;
      else if (a === "y") dy = 0;
      else dz = 0;
    }
    if (!Number.isFinite(dx + dy + dz)) continue;
    v.x += dx;
    v.y += dy;
    v.z += dz;
  }
  delete mesh.normals;
  delete mesh.faceNormals;
  mesh.dirty = true;
  return mesh;
}
