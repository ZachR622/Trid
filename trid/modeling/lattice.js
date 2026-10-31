/**
 * Lattice deform, like Blender's Lattice modifier: a coarse cage of control
 * points around a mesh. Move a few points and the whole shape follows
 * smoothly: widen a top, pinch a waist, lean a tower, bulge a belly.
 *
 *   const lattice = makeLattice(vase, { div: 3 });
 *   for (const p of latticePoints(lattice, { y: 2 })) p.x *= 1.5;   // the top layer, wider in x
 *   latticeMesh(vase, lattice);
 *
 * A lattice is plain data: its box (`min`, `max`), how many points per side
 * (`div`) and the points themselves, in the mesh's own space. The points
 * start evenly spread over the box (their rest places); a mesh changes by
 * how far they've moved from there, so an untouched lattice changes nothing.
 */
import { displaceMesh, meshBounds } from "../render/meshUtils.js";

const AXES = ["x", "y", "z"];
const INTERPOLATIONS = ["bspline", "cardinal", "linear"];

/** Points per side, from a number or { x, y, z }: at least 2 (1 along a side of no size). */
function divOf(div, size) {
  const d = typeof div === "object" && div ? div : { x: div, y: div, z: div };
  const out = {};
  for (const a of AXES) {
    const n = Number.isFinite(d[a]) ? Math.floor(d[a]) : 3;
    out[a] = size[a] > 0 ? Math.max(2, Math.min(64, n)) : 1;
  }
  return out;
}

/** Where point (i, j, k) rests: evenly spread over the box. */
function restPoint(lattice, i, j, k) {
  const { min, max, div } = lattice;
  const at = (a, n) => (div[a] > 1 ? min[a] + ((max[a] - min[a]) * n) / (div[a] - 1) : (min[a] + max[a]) / 2);
  return { x: at("x", i), y: at("y", j), z: at("z", k) };
}

/** Index of point (i, j, k) in `lattice.points`. */
const indexOf = (div, i, j, k) => i + div.x * (j + div.y * k);

/**
 * A lattice around a mesh's box (or any box `{ min, max }`), with `div`
 * points per side (a number, or `{ x, y, z }`; default 3, at least 2). The
 * points start evenly spread over the box. `padding` makes the box bigger
 * on every side, so the cage sits a little off the surface.
 *
 * `points[i + div.x * (j + div.y * k)]` is the point i along x, j along y
 * and k along z, from the low corner. Move them freely; `latticePoints`
 * picks them by layer.
 *
 * @param {import("../index.d.ts").Mesh | { min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }} input
 * @param {{ div?: number | { x?: number, y?: number, z?: number }, padding?: number }} [opts]
 * @returns {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number}, div: {x:number,y:number,z:number}, points: {x:number,y:number,z:number}[] }}
 */
export function makeLattice(input, { div = 3, padding = 0 } = {}) {
  const box = input?.vertices ? meshBounds(input) : input;
  if (!box?.min || !box?.max) throw new Error("makeLattice: give a mesh with vertices, or a box { min, max }");
  const pad = Number.isFinite(padding) ? padding : 0;
  const min = {}, max = {}, size = {};
  for (const a of AXES) {
    min[a] = box.min[a] - pad;
    max[a] = box.max[a] + pad;
    size[a] = max[a] - min[a];
  }
  const lattice = { min, max, div: divOf(div, size), points: [] };
  const d = lattice.div;
  for (let k = 0; k < d.z; k++) for (let j = 0; j < d.y; j++) for (let i = 0; i < d.x; i++) lattice.points.push(restPoint(lattice, i, j, k));
  return lattice;
}

/**
 * Some of a lattice's points, to move: give one index for a layer
 * (`{ y: 0 }`: the bottom layer), two for a row, three for one point.
 * Negative indices count from the end (`{ y: -1 }`: the top layer). The
 * points are the lattice's own, so changing them changes the lattice.
 *
 * @example
 * // A lattice of 3 × 3 × 3: pinch the middle layer, lift the top
 * for (const p of latticePoints(lattice, { y: 1 })) { p.x *= 0.6; p.z *= 0.6; }
 * for (const p of latticePoints(lattice, { y: -1 })) p.y += 0.2;
 *
 * @param {{ div: {x:number,y:number,z:number}, points: {x:number,y:number,z:number}[] }} lattice
 * @param {{ x?: number, y?: number, z?: number }} [which]
 * @returns {{x:number,y:number,z:number}[]}
 */
export function latticePoints(lattice, which = {}) {
  const d = lattice.div;
  const pick = (a) => {
    const n = which[a];
    if (n === undefined) return null;
    const i = n < 0 ? d[a] + n : n;
    if (!Number.isInteger(i) || i < 0 || i >= d[a]) throw new Error(`latticePoints: no ${a} index ${n} (the lattice has ${d[a]})`);
    return i;
  };
  const sx = pick("x"), sy = pick("y"), sz = pick("z");
  const out = [];
  for (let k = 0; k < d.z; k++) for (let j = 0; j < d.y; j++) for (let i = 0; i < d.x; i++) {
    if ((sx === null || i === sx) && (sy === null || j === sy) && (sz === null || k === sz)) out.push(lattice.points[indexOf(d, i, j, k)]);
  }
  return out;
}

/**
 * Which points weigh on a place `u` along one side (0 to n - 1 in points),
 * and how much: `[index, weight]` pairs. The cubic blends reach a point
 * past each end: it's carried on in a straight line from the last two, so
 * a lattice moved in a straight-line way (shifted, scaled, sheared) moves
 * the mesh exactly that way, up to its edges.
 */
function weights(u, n, mode) {
  if (n === 1) return [[0, 1]];
  const v = Math.max(0, Math.min(n - 1, u));
  if (mode === "linear") {
    const b = Math.min(Math.floor(v), n - 2), t = v - b;
    return [[b, 1 - t], [b + 1, t]];
  }
  const b = Math.min(Math.floor(v), n - 1), t = v - b;
  const t2 = t * t, t3 = t2 * t;
  const w = mode === "cardinal"
    // Catmull-Rom: passes through the points
    ? [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]
    // Cubic B-spline: the smoothest, near the points without passing through them
    : [(1 - t) ** 3 / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
  const out = [];
  w.forEach((wi, m) => {
    if (!wi) return;
    const i = b - 1 + m;
    // Past an end by e: the end point, plus e times the step to it from its neighbor
    if (i < 0) out.push([0, wi * (1 - i)], [1, wi * i]);
    else if (i > n - 1) out.push([n - 1, wi * (1 + i - (n - 1))], [n - 2, -wi * (i - (n - 1))]);
    else out.push([i, wi]);
  });
  return out;
}

/**
 * Deforms a mesh by a lattice, in place (like the deformers: the mesh's own
 * normals are removed, and `dirty` is set): each vertex moves by how far
 * the lattice points around it have moved from their rest places, blended
 * smoothly. Vertices outside the lattice's box move like the nearest place
 * on it.
 *
 * `interpolation` is how the points' moves blend:
 * - `"bspline"` (default, like Blender): the smoothest, but softer: vertices
 *   move less than the points near them. Inside a lattice, a vertex at a
 *   point moves 2/3 as far as its layer when the whole layer moves, and
 *   about 0.3 as far as the point when only that point moves.
 * - `"cardinal"`: smooth, and a vertex at a point moves exactly with it.
 * - `"linear"`: straight between points, with creases at them.
 *
 * Make the lattice for the mesh as it is, then move its points and apply
 * it once. To try again, apply it to a copy of the original (`cloneMesh`).
 *
 * @example
 * const lattice = makeLattice(body, { div: { x: 3, y: 4, z: 3 } });
 * for (const p of latticePoints(lattice, { y: 1 })) { p.x *= 1.3; p.z *= 1.3; } // a belly
 * latticeMesh(body, lattice);
 *
 * @template M
 * @param {M} mesh
 * @param {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number}, div: {x:number,y:number,z:number}, points: {x:number,y:number,z:number}[] }} lattice
 * @param {{ interpolation?: "bspline"|"cardinal"|"linear" }} [opts]
 * @returns {M} The same mesh
 */
export function latticeMesh(mesh, lattice, { interpolation = "bspline" } = {}) {
  if (!INTERPOLATIONS.includes(interpolation)) {
    throw new Error(`Unknown interpolation "${interpolation}": use "bspline", "cardinal" or "linear"`);
  }
  const { min, max, div: d, points } = lattice;
  if (points.length !== d.x * d.y * d.z) throw new Error(`latticeMesh: the lattice has ${points.length} points, expected ${d.x * d.y * d.z}`);
  // How far each point has moved from its rest place
  const moved = new Array(points.length);
  let any = false;
  for (let k = 0; k < d.z; k++) for (let j = 0; j < d.y; j++) for (let i = 0; i < d.x; i++) {
    const n = indexOf(d, i, j, k), p = points[n], r = restPoint(lattice, i, j, k);
    const m = { x: p.x - r.x, y: p.y - r.y, z: p.z - r.z };
    if (!Number.isFinite(m.x + m.y + m.z)) throw new Error(`latticeMesh: point ${n} isn't a point of finite numbers`);
    moved[n] = m;
    if (m.x || m.y || m.z) any = true;
  }
  if (!any) return mesh;
  // A vertex's place in the lattice, in points along each side
  const along = (v, a) => (d[a] > 1 && max[a] > min[a] ? ((v[a] - min[a]) / (max[a] - min[a])) * (d[a] - 1) : 0);
  return displaceMesh(mesh, (v) => {
    const wx = weights(along(v, "x"), d.x, interpolation);
    const wy = weights(along(v, "y"), d.y, interpolation);
    const wz = weights(along(v, "z"), d.z, interpolation);
    let x = v.x, y = v.y, z = v.z;
    for (const [k, c] of wz) for (const [j, b] of wy) for (const [i, a] of wx) {
      const w = a * b * c;
      if (!w) continue;
      const m = moved[indexOf(d, i, j, k)];
      x += m.x * w;
      y += m.y * w;
      z += m.z * w;
    }
    return { x, y, z };
  });
}

/**
 * The lattice as a wireframe mesh, to show it: its vertices are the
 * lattice's own points (the same objects), with lines between neighbors,
 * so it always shows the lattice as it is. Set the cage's `dirty` after
 * moving points, so it's drawn again.
 *
 * @example
 * const cage = scene.add({ mesh: latticeCage(lattice) }); // no material: drawn as lines
 *
 * @param {{ div: {x:number,y:number,z:number}, points: {x:number,y:number,z:number}[] }} lattice
 * @returns {import("../index.d.ts").Mesh}
 */
export function latticeCage(lattice) {
  const d = lattice.div;
  const edges = [];
  for (let k = 0; k < d.z; k++) for (let j = 0; j < d.y; j++) for (let i = 0; i < d.x; i++) {
    const n = indexOf(d, i, j, k);
    if (i + 1 < d.x) edges.push([n, indexOf(d, i + 1, j, k)]);
    if (j + 1 < d.y) edges.push([n, indexOf(d, i, j + 1, k)]);
    if (k + 1 < d.z) edges.push([n, indexOf(d, i, j, k + 1)]);
  }
  return { vertices: lattice.points, edges };
}
