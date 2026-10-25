/**
 * Everyday deformers: taper, twist, bend and bulge. Each one changes a mesh
 * in place (like `displaceMesh`: the mesh's own normals are removed, and
 * `dirty` is set) and returns it.
 *
 * Taper, twist and bend work along an `axis`. Where a vertex is along it is
 * measured over the mesh's size: 0 at its low end, 1 at its high end.
 * `from` and `to` (in that 0 to 1 measure) limit the effect to a part of the
 * mesh: below `from` nothing changes, above `to` the full effect carries on.
 * The axis line goes through `center` (default: the middle of the mesh's box).
 */
import { displaceMesh, meshBounds } from "../render/meshUtils.js";
import { newell } from "../render/normals.js";

const AXES = ["x", "y", "z"];
/** The two other axes, in an order that keeps turns the same handedness as rotateX / Y / Z. */
const OTHERS = { x: ["y", "z"], y: ["x", "z"], z: ["x", "y"] };

/**
 * Where things are along the axis: the mesh's span on it, the range in
 * coordinates, the axis line's center, and `w(v)`: how far into the range a
 * vertex is (0 before it, 1 after it).
 */
function along(mesh, { axis = "y", from = 0, to = 1, center } = {}) {
  if (!AXES.includes(axis)) throw new Error(`Unknown axis "${axis}": use "x", "y" or "z"`);
  const box = meshBounds(mesh);
  if (!box || !(box.size[axis] > 0)) return null;
  const f = Number.isFinite(from) ? from : 0, t = Number.isFinite(to) ? to : 1;
  const a = box.min[axis] + box.size[axis] * Math.min(f, t);
  const b = box.min[axis] + box.size[axis] * Math.max(f, t);
  const c = { ...box.center, ...(center ?? {}) };
  const w = (v) => (b > a ? Math.min(1, Math.max(0, (v[axis] - a) / (b - a))) : v[axis] >= a ? 1 : 0);
  return { a, b, c, w };
}

/**
 * Narrows or widens a mesh along an axis, around the axis line: the start of
 * the range keeps its size, the end is `amount` times as wide (0.2 = almost a
 * point, 2 = twice as wide). A function gets how far into the range a
 * vertex is (0 to 1) and returns its size.
 *
 * @example
 * taperMesh(makeShape("cylinder"), { axis: "y", amount: 0.3 }); // a cone-ish column
 *
 * @template M
 * @param {M} mesh
 * @param {{ axis?: "x"|"y"|"z", amount?: number | ((w: number) => number), from?: number, to?: number, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {M} The same mesh
 */
export function taperMesh(mesh, opts = {}) {
  const r = along(mesh, opts);
  if (!r) return mesh;
  const { amount = 0.5, axis = "y" } = opts;
  const size = typeof amount === "function" ? amount : (w) => 1 + (amount - 1) * w;
  const [p, q] = OTHERS[axis];
  return displaceMesh(mesh, (v) => {
    const k = size(r.w(v));
    if (!Number.isFinite(k)) return v;
    return { ...v, [p]: r.c[p] + (v[p] - r.c[p]) * k, [q]: r.c[q] + (v[q] - r.c[q]) * k };
  });
}

/**
 * Turns a mesh around an axis line, more and more along it: `angle` radians
 * in all, from the start of the range to its end (the rest of the mesh past
 * the end turns the full angle). A function gets how far into the range a
 * vertex is (0 to 1) and returns its angle.
 *
 * @template M
 * @param {M} mesh
 * @param {{ axis?: "x"|"y"|"z", angle?: number | ((w: number) => number), from?: number, to?: number, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {M} The same mesh
 */
export function twistMesh(mesh, opts = {}) {
  const r = along(mesh, opts);
  if (!r) return mesh;
  const { angle = Math.PI / 2, axis = "y" } = opts;
  const turn = typeof angle === "function" ? angle : (w) => angle * w;
  const [p, q] = OTHERS[axis];
  return displaceMesh(mesh, (v) => {
    const a = turn(r.w(v));
    if (!Number.isFinite(a) || a === 0) return v;
    const c = Math.cos(a), s = Math.sin(a);
    const dp = v[p] - r.c[p], dq = v[q] - r.c[q];
    return { ...v, [p]: r.c[p] + dp * c - dq * s, [q]: r.c[q] + dp * s + dq * c };
  });
}

/**
 * Bends a mesh along an axis into an arc of `angle` radians, curving toward
 * `toward` (another axis; a negative angle curves the other way). The range
 * is the part that curves: before it nothing moves, after it the mesh
 * carries on straight in the new direction, like a bent pipe. π/2 is a
 * quarter turn. The part that curves keeps its length along the axis line.
 *
 * @example
 * // A banana: a stretched sphere bent a third of a turn
 * bendMesh(scaleMesh(makeShape("sphere"), 0.4, 1.6, 0.4), { axis: "y", angle: 2, toward: "x" });
 *
 * @template M
 * @param {M} mesh
 * @param {{ axis?: "x"|"y"|"z", angle?: number, toward?: "x"|"y"|"z", from?: number, to?: number, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {M} The same mesh
 */
export function bendMesh(mesh, opts = {}) {
  const { angle = Math.PI / 2, axis = "y" } = opts;
  const toward = opts.toward && opts.toward !== axis ? opts.toward : OTHERS[axis][1];
  if (!AXES.includes(toward)) throw new Error(`Unknown axis "${toward}": use "x", "y" or "z"`);
  const r = along(mesh, opts);
  if (!r || !Number.isFinite(angle) || Math.abs(angle) < 1e-9) return mesh;
  const len = r.b - r.a;
  if (!(len > 0)) return mesh;
  const R = len / angle;
  const c0 = r.c[toward];
  const end = { cos: Math.cos(angle), sin: Math.sin(angle) };
  return displaceMesh(mesh, (v) => {
    const x = v[axis];
    if (x <= r.a) return v;
    const d = v[toward] - c0;
    const th = Math.min(x - r.a, len) / R;
    let ax = r.a + (R - d) * Math.sin(th);
    let tw = c0 + R - (R - d) * Math.cos(th);
    // Past the range: straight on from the end of the arc
    if (x > r.b) {
      ax += (x - r.b) * end.cos;
      tw += (x - r.b) * end.sin;
    }
    return { ...v, [axis]: ax, [toward]: tw };
  });
}

/** A unit normal per vertex: faces around it averaged (bigger faces count more), the same for vertices at the same place. */
function vertexNormals(mesh) {
  const v = mesh.vertices;
  const sum = v.map(() => ({ x: 0, y: 0, z: 0 }));
  for (const f of mesh.faces ?? []) {
    if (f.length < 3) continue;
    const n = newell(f.map((i) => v[i]));
    for (const i of f) {
      sum[i].x += n.x; sum[i].y += n.y; sum[i].z += n.z;
    }
  }
  // Vertices at the same place (texture seams, OBJ files) share one normal, so they move together
  const groups = new Map();
  v.forEach((p, i) => {
    const k = `${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });
  const out = new Array(v.length);
  for (const g of groups.values()) {
    let x = 0, y = 0, z = 0;
    for (const i of g) {
      x += sum[i].x; y += sum[i].y; z += sum[i].z;
    }
    const l = Math.hypot(x, y, z);
    const n = l > 1e-12 ? { x: x / l, y: y / l, z: z / l } : null;
    for (const i of g) out[i] = n;
  }
  return out;
}

/**
 * Pushes the surface out (or in, with a negative `amount`) around `center`,
 * fading smoothly to nothing at `radius`: cheeks, bellies, muscles, dents.
 * `amount` is how far the middle moves.
 *
 * By default each point moves along the surface (its normal), like a
 * sculpting "inflate" brush, so it works on flat sides too. With
 * `mode: "radial"`, points move away from `center` instead.
 *
 * @template M
 * @param {M} mesh
 * @param {{ center: {x:number,y:number,z:number}, radius: number, amount?: number, mode?: "normal"|"radial" }} opts
 * @returns {M} The same mesh
 */
export function bulgeMesh(mesh, { center, radius, amount = 0.1, mode = "normal" } = {}) {
  if (!center || !(radius > 0) || !Number.isFinite(amount) || amount === 0) return mesh;
  const normals = mode === "radial" || !mesh.faces?.length ? null : vertexNormals(mesh);
  return displaceMesh(mesh, (v, i) => {
    const dx = v.x - center.x, dy = v.y - center.y, dz = v.z - center.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= radius) return v;
    const fall = (1 - (d / radius) ** 2) ** 2;
    const n = normals ? normals[i] : d > 1e-12 ? { x: dx / d, y: dy / d, z: dz / d } : null;
    if (!n) return v;
    const k = amount * fall;
    return { x: v.x + n.x * k, y: v.y + n.y * k, z: v.z + n.z * k };
  });
}
