/**
 * Shapes that melt together: signed distance fields (negative inside),
 * joined with smooth unions, subtractions and intersections, then turned
 * into a mesh. Organic creatures, soft bodies, clay-like forms.
 */
import { rotateX, rotateY, rotateZ } from "../math/transform.js";
import { computeUVs } from "../render/uvMapping.js";
import { newell } from "../render/normals.js";
import { cleanMesh } from "./cleanup.js";

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const num = (x, fallback) => (Number.isFinite(x) ? x : fallback);
const pt = (p, fallback = { x: 0, y: 0, z: 0 }) => ({ x: num(p?.x, fallback.x), y: num(p?.y, fallback.y), z: num(p?.z, fallback.z) });

/** The point in a shape's own frame: moved to its center, then turned back by its `rot` (radians, X then Y then Z). */
function local(p, center, rot) {
  let q = { x: p.x - center.x, y: p.y - center.y, z: p.z - center.z };
  if (rot && (rot.x || rot.y || rot.z)) q = rotateX(rotateY(rotateZ(q, -(rot.z || 0)), -(rot.y || 0)), -(rot.x || 0));
  return q;
}

/**
 * A shape, checked and with defaults: its distance function and the box
 * around it. Unknown kinds throw.
 */
function prepare(s) {
  const kind = s?.kind;
  const op = s.op ?? (s.subtract ? "subtract" : "add");
  if (!["add", "subtract", "intersect"].includes(op)) throw new Error(`Unknown blob op "${op}": use "add", "subtract" or "intersect"`);
  const rot = s.rot;
  const around = (c, r) => ({ min: { x: c.x - r, y: c.y - r, z: c.z - r }, max: { x: c.x + r, y: c.y + r, z: c.z + r } });
  const between = (a, b, r) => ({
    min: { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r, z: Math.min(a.z, b.z) - r },
    max: { x: Math.max(a.x, b.x) + r, y: Math.max(a.y, b.y) + r, z: Math.max(a.z, b.z) + r },
  });
  let dist, box;
  switch (kind) {
    case "sphere": {
      const c = pt(s.center), r = Math.max(0, num(s.radius, 0.1));
      dist = (p) => len3(p.x - c.x, p.y - c.y, p.z - c.z) - r;
      box = around(c, r);
      break;
    }
    case "ellipsoid": {
      const c = pt(s.center), rr = pt(s.radii, { x: 0.1, y: 0.1, z: 0.1 });
      const r = { x: Math.max(1e-9, rr.x), y: Math.max(1e-9, rr.y), z: Math.max(1e-9, rr.z) };
      // Close to the true distance near the surface (Quilez), which is what meshing needs
      dist = (p) => {
        const q = local(p, c, rot);
        const k0 = len3(q.x / r.x, q.y / r.y, q.z / r.z);
        const k1 = len3(q.x / (r.x * r.x), q.y / (r.y * r.y), q.z / (r.z * r.z));
        return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -Math.min(r.x, r.y, r.z);
      };
      box = rot ? around(c, Math.max(r.x, r.y, r.z)) : { min: { x: c.x - r.x, y: c.y - r.y, z: c.z - r.z }, max: { x: c.x + r.x, y: c.y + r.y, z: c.z + r.z } };
      break;
    }
    case "capsule": {
      // A rounded cone between two points (a capsule when both radii match)
      const a = pt(s.a), b = pt(s.b, { x: 0, y: 0.2, z: 0 });
      const ra = Math.max(0, num(s.ra ?? s.radius, 0.05)), rb = Math.max(0, num(s.rb ?? s.radius, 0.05));
      const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z;
      const l2 = bx * bx + by * by + bz * bz || 1e-12;
      dist = (p) => {
        const px = p.x - a.x, py = p.y - a.y, pz = p.z - a.z;
        const t = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / l2));
        return len3(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
      };
      box = between(a, b, Math.max(ra, rb));
      break;
    }
    case "cylinder": {
      // A capped cylinder between two points, with edges rounded by `round`
      const a = pt(s.a), b = pt(s.b, { x: 0, y: 0.2, z: 0 }), r = Math.max(0, num(s.radius, 0.05));
      const h = len3(b.x - a.x, b.y - a.y, b.z - a.z) / 2;
      const rd = Math.max(0, Math.min(num(s.round, 0), r, h));
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      const ax = h > 0 ? { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) } : { x: 0, y: 1, z: 0 };
      dist = (p) => {
        const qx = p.x - c.x, qy = p.y - c.y, qz = p.z - c.z;
        const along = qx * ax.x + qy * ax.y + qz * ax.z;
        const across = len3(qx - ax.x * along, qy - ax.y * along, qz - ax.z * along);
        const dx = across - (r - rd), dy = Math.abs(along) - (h - rd);
        return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rd;
      };
      box = between(a, b, r);
      break;
    }
    case "box": {
      const c = pt(s.center), size = pt(s.size, { x: 0.2, y: 0.2, z: 0.2 });
      const hx = Math.abs(size.x) / 2, hy = Math.abs(size.y) / 2, hz = Math.abs(size.z) / 2;
      const rd = Math.max(0, Math.min(num(s.round, 0), hx, hy, hz));
      dist = (p) => {
        const q = local(p, c, rot);
        const dx = Math.abs(q.x) - hx + rd, dy = Math.abs(q.y) - hy + rd, dz = Math.abs(q.z) - hz + rd;
        return len3(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - rd;
      };
      box = rot ? around(c, len3(hx, hy, hz)) : { min: { x: c.x - hx, y: c.y - hy, z: c.z - hz }, max: { x: c.x + hx, y: c.y + hy, z: c.z + hz } };
      break;
    }
    case "torus": {
      // A ring lying flat in XZ (like makeShape("torus")), turned by `rot`
      const c = pt(s.center), R = Math.max(0, num(s.R, 0.2)), t = Math.max(0, num(s.tube, 0.05));
      dist = (p) => {
        const q = local(p, c, rot);
        return Math.hypot(Math.hypot(q.x, q.z) - R, q.y) - t;
      };
      box = around(c, R + t);
      break;
    }
    default:
      throw new Error(`Unknown blob kind "${kind}": use "sphere", "ellipsoid", "capsule", "cylinder", "box" or "torus"`);
  }
  return { dist, box, op, blend: Number.isFinite(s.blend) ? Math.max(0, s.blend) : null };
}

/** Smooth minimum (polynomial): like min, but rounded over a distance k. */
function smin(a, b, k) {
  if (!(k > 0)) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** The size of the box around the shapes that add matter, and that box. */
function extentOf(prepared) {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const s of prepared) {
    if (s.op !== "add") continue;
    for (const a of ["x", "y", "z"]) {
      min[a] = Math.min(min[a], s.box.min[a]);
      max[a] = Math.max(max[a], s.box.max[a]);
    }
  }
  return min.x <= max.x ? { min, max } : null;
}

/**
 * The distance field of a list of shapes: negative inside, positive
 * outside, about the distance to the surface. Shapes are applied in order:
 * "add" melts into what's before it, "subtract" carves it, "intersect"
 * keeps only the overlap. Each joins over its `blend` distance (default
 * `opts.blend`, or a tenth of the model's size).
 *
 * Use it to mix shapes with your own math, then mesh it with `sdfMesh`.
 *
 * @param {object[]} shapes
 * @param {{ blend?: number }} [opts]
 * @returns {(p: {x:number,y:number,z:number}) => number}
 */
export function blobField(shapes, opts = {}) {
  const list = (Array.isArray(shapes) ? shapes : []).filter(Boolean).map(prepare);
  const ext = extentOf(list);
  const size = ext ? Math.max(ext.max.x - ext.min.x, ext.max.y - ext.min.y, ext.max.z - ext.min.z) : 1;
  const blend = Number.isFinite(opts.blend) ? Math.max(0, opts.blend) : size / 10;
  return (p) => {
    let d = Infinity;
    for (const s of list) {
      const k = s.blend ?? blend;
      const ds = s.dist(p);
      if (s.op === "add") d = d === Infinity ? ds : smin(d, ds, k);
      else if (d === Infinity) continue;
      else if (s.op === "subtract") d = -smin(-d, ds, k);
      else d = -smin(-d, -ds, k);
    }
    return d;
  };
}

// Corners of a grid cell (bit 1 = +x, 2 = +y, 4 = +z), its 12 edges, and its 6 sides (4 corners in order round, with their edges)
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const edgeOf = (a, b) => EDGES.findIndex(([p, q]) => (p === a && q === b) || (p === b && q === a));
const SIDES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].map((c) => ({
  corners: c,
  edges: c.map((a, i) => edgeOf(a, c[(i + 1) % 4])),
}));

/**
 * Samples the field on a grid. Far from the surface (more than the block's
 * size away), a block of 4×4×4 points takes the value at its middle: same
 * sign, much less work.
 */
function sample(field, o, cell, nx, ny, nz, sparse) {
  const values = new Float64Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  const eval_ = (i, j, k) => {
    const v = field({ x: o.x + i * cell, y: o.y + j * cell, z: o.z + k * cell });
    // Exactly 0 counts as outside, a hair away, so every crossing is between two different values
    return Number.isFinite(v) ? (v === 0 ? cell * 1e-9 : v) : 1e9;
  };
  const B = sparse ? 4 : 1;
  const reach = ((Math.sqrt(3) * (B - 1)) / 2 + 1) * cell * 1.5;
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const ei = Math.min(nx, bi + B), ej = Math.min(ny, bj + B), ek = Math.min(nz, bk + B);
    if (B > 1) {
      const mid = eval_((bi + ei - 1) / 2, (bj + ej - 1) / 2, (bk + ek - 1) / 2);
      if (Math.abs(mid) > reach) {
        for (let k = bk; k < ek; k++) for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) values[at(i, j, k)] = mid;
        continue;
      }
    }
    for (let k = bk; k < ek; k++) for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) values[at(i, j, k)] = eval_(i, j, k);
  }
  return values;
}

/** Field gradient by central differences (points outward). */
function gradient(field, p, h) {
  const g = {
    x: field({ x: p.x + h, y: p.y, z: p.z }) - field({ x: p.x - h, y: p.y, z: p.z }),
    y: field({ x: p.x, y: p.y + h, z: p.z }) - field({ x: p.x, y: p.y - h, z: p.z }),
    z: field({ x: p.x, y: p.y, z: p.z + h }) - field({ x: p.x, y: p.y, z: p.z - h }),
  };
  return { x: g.x / (2 * h), y: g.y / (2 * h), z: g.z / (2 * h) };
}

/**
 * The surface's pieces inside one grid cell, as loops of the cell's edges it
 * crosses. On each side of the cell the crossings are joined in pairs; a
 * side with 4 crossings is settled by the value at its middle (asymptotic
 * decider), which both cells sharing the side agree on, so neighbors fit.
 */
function cellLoops(v, corner) {
  const link = new Array(12).fill(null);
  const join = (e1, e2) => {
    (link[e1] ??= []).push(e2);
    (link[e2] ??= []).push(e1);
  };
  for (const side of SIDES) {
    const crossed = side.edges.filter((e) => corner[EDGES[e][0]] !== corner[EDGES[e][1]]);
    if (crossed.length === 2) join(crossed[0], crossed[1]);
    else if (crossed.length === 4) {
      // Cut off the corners whose sign differs from the side's middle
      const [c0, c1, c2, c3] = side.corners.map((c) => v[c]);
      const den = c0 + c2 - c1 - c3;
      const midInside = (den !== 0 ? (c0 * c2 - c1 * c3) / den : (c0 + c1 + c2 + c3) / 4) < 0;
      for (let q = 0; q < 4; q++) if (corner[side.corners[q]] !== midInside) join(side.edges[(q + 3) % 4], side.edges[q]);
    }
  }
  const loops = [];
  const used = new Array(12).fill(false);
  for (let s = 0; s < 12; s++) {
    if (!link[s] || used[s]) continue;
    const loop = [];
    let prev = -1, cur = s;
    while (cur !== undefined && !used[cur]) {
      used[cur] = true;
      loop.push(cur);
      const next = link[cur].find((e) => e !== prev && !used[e]) ?? link[cur].find((e) => e !== prev);
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Reads a cell's 8 corner values and signs; returns how many are inside. */
function readCell(values, at, i, j, k, v, corner) {
  let inside = 0;
  for (let c = 0; c < 8; c++) {
    v[c] = values[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
    corner[c] = v[c] < 0;
    if (corner[c]) inside++;
  }
  return inside;
}

/**
 * Surface nets: one vertex per piece of surface in each cell (at the middle
 * of its crossings), one quad per grid edge the surface crosses. With one
 * vertex per piece rather than per cell, two thin layers passing through
 * the same cell aren't stitched together, so the mesh stays watertight.
 */
function surfaceNets(values, o, cell, nx, ny, nz) {
  const at = (i, j, k) => i + nx * (j + ny * k);
  const cx = nx - 1, cy = ny - 1;
  const cellAt = (i, j, k) => i + cx * (j + cy * k);
  const edgeVertex = new Map(); // cell → for each of its 12 edges, the vertex of the piece crossing it
  const vertices = [];
  const v = new Float64Array(8), corner = new Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const inside = readCell(values, at, i, j, k, v, corner);
    if (inside === 0 || inside === 8) continue;
    const ids = new Int32Array(12).fill(-1);
    for (const loop of cellLoops(v, corner)) {
      let sx = 0, sy = 0, sz = 0;
      for (const e of loop) {
        const [a, b] = EDGES[e];
        const t = v[a] / (v[a] - v[b]);
        sx += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
        sy += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
        sz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
      }
      const n = loop.length;
      const id = vertices.push({ x: o.x + (i + sx / n) * cell, y: o.y + (j + sy / n) * cell, z: o.z + (k + sz / n) * cell }) - 1;
      for (const e of loop) ids[e] = id;
    }
    edgeVertex.set(cellAt(i, j, k), ids);
  }
  // The vertex in cell (ci, cj, ck) on its edge from corner a to corner b
  const vertexAt = (ci, cj, ck, a, b) => edgeVertex.get(cellAt(ci, cj, ck))?.[edgeOf(a, b)] ?? -1;
  const faces = [];
  const quad = (a, b, c, d, inside) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    faces.push(inside ? [a, b, c, d] : [d, c, b, a]);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const here = values[at(i, j, k)] < 0;
    // Grid edge along x from (i, j, k): in the 4 cells around it, it's the edge from corner (0, dy, dz) to (1, dy, dz)
    if (here !== values[at(i + 1, j, k)] < 0) {
      quad(vertexAt(i, j - 1, k - 1, 6, 7), vertexAt(i, j, k - 1, 4, 5), vertexAt(i, j, k, 0, 1), vertexAt(i, j - 1, k, 2, 3), here);
    }
    if (here !== values[at(i, j + 1, k)] < 0) {
      quad(vertexAt(i - 1, j, k - 1, 5, 7), vertexAt(i - 1, j, k, 1, 3), vertexAt(i, j, k, 0, 2), vertexAt(i, j, k - 1, 4, 6), here);
    }
    if (here !== values[at(i, j, k + 1)] < 0) {
      quad(vertexAt(i - 1, j - 1, k, 3, 7), vertexAt(i, j - 1, k, 2, 6), vertexAt(i, j, k, 0, 4), vertexAt(i - 1, j, k, 1, 5), here);
    }
  }
  return { vertices, faces };
}

/**
 * Marching cubes without a table: each piece of surface in a cell (a loop
 * of crossings, see cellLoops) is turned to face outward and cut into
 * triangles. Vertices on grid edges are shared with the cells around.
 */
function marchingCubes(values, o, cell, nx, ny, nz) {
  const at = (i, j, k) => i + nx * (j + ny * k);
  const vertices = [];
  const edgeVertex = new Map();
  const v = new Float64Array(8), corner = new Array(8);
  // Vertex on the grid edge from corner a to corner b of cell (i, j, k), shared with the cells around it
  const vertexOn = (i, j, k, a, b) => {
    const pa = CORNERS[a], pb = CORNERS[b];
    const ia = at(i + pa[0], j + pa[1], k + pa[2]), ib = at(i + pb[0], j + pb[1], k + pb[2]);
    const axis = pb[0] - pa[0] ? 0 : pb[1] - pa[1] ? 1 : 2;
    const key = Math.min(ia, ib) * 3 + axis;
    let id = edgeVertex.get(key);
    if (id === undefined) {
      const t = v[a] / (v[a] - v[b]);
      id = vertices.push({
        x: o.x + (i + pa[0] + (pb[0] - pa[0]) * t) * cell,
        y: o.y + (j + pa[1] + (pb[1] - pa[1]) * t) * cell,
        z: o.z + (k + pa[2] + (pb[2] - pa[2]) * t) * cell,
      }) - 1;
      edgeVertex.set(key, id);
    }
    return id;
  };
  const faces = [];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const inside = readCell(values, at, i, j, k, v, corner);
    if (inside === 0 || inside === 8) continue;
    for (const loop of cellLoops(v, corner)) {
      const ids = loop.map((e) => vertexOn(i, j, k, EDGES[e][0], EDGES[e][1]));
      // Outward: from the inside corner to the outside one, summed over the loop
      let ox = 0, oy = 0, oz = 0;
      for (const e of loop) {
        const [a, b] = EDGES[e];
        const sg = corner[a] ? 1 : -1;
        ox += sg * (CORNERS[b][0] - CORNERS[a][0]);
        oy += sg * (CORNERS[b][1] - CORNERS[a][1]);
        oz += sg * (CORNERS[b][2] - CORNERS[a][2]);
      }
      const nrm = newell(ids.map((id) => vertices[id]));
      if (nrm.x * ox + nrm.y * oy + nrm.z * oz < 0) ids.reverse();
      for (let t = 1; t + 1 < ids.length; t++) faces.push([ids[0], ids[t], ids[t + 1]]);
    }
  }
  return { vertices, faces };
}

/**
 * Turns a distance field into a mesh: the surface where `field(p)` is 0
 * (negative inside), within `bounds`.
 *
 * The field should be about the distance to the surface (or less): far from
 * it, blocks of the grid are skipped by trusting that. For a field that
 * isn't (strong noise, a scaled distance), pass `sparse: false`.
 *
 * @param {(p: {x:number,y:number,z:number}) => number} field
 * @param {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }} bounds
 * @param {{ resolution?: number, method?: "nets"|"cubes", project?: boolean, normals?: boolean, uvs?: string|object|false, sparse?: boolean }} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function sdfMesh(field, bounds, opts = {}) {
  const { resolution = 64, method = "nets", project = true, normals = true, uvs = "box", sparse = true } = opts;
  if (typeof field !== "function") throw new Error("sdfMesh: field must be a function of a point");
  if (method !== "nets" && method !== "cubes") throw new Error(`Unknown method "${method}": use "nets" or "cubes"`);
  const lo = pt(bounds?.min), hi = pt(bounds?.max);
  const size = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
  if (!(size > 0)) return { vertices: [], faces: [] };
  const cell = size / Math.max(4, Math.min(256, Math.round(num(resolution, 64))));
  // Two empty cells all around, so the surface closes
  const o = { x: lo.x - 2 * cell, y: lo.y - 2 * cell, z: lo.z - 2 * cell };
  const nx = Math.ceil((hi.x - lo.x) / cell) + 5, ny = Math.ceil((hi.y - lo.y) / cell) + 5, nz = Math.ceil((hi.z - lo.z) / cell) + 5;

  const values = sample(field, o, cell, nx, ny, nz, sparse);
  const mesh = (method === "cubes" ? marchingCubes : surfaceNets)(values, o, cell, nx, ny, nz);

  // Pull each vertex onto the surface (Newton steps along the gradient, at most a cell)
  const h = cell * 0.05;
  if (project) {
    for (const p of mesh.vertices) {
      for (let it = 0; it < 2; it++) {
        const d = field(p);
        const g = gradient(field, p, h);
        const g2 = g.x * g.x + g.y * g.y + g.z * g.z;
        if (!(g2 > 1e-12) || !Number.isFinite(d)) break;
        let k = d / g2;
        const step = Math.abs(k) * Math.sqrt(g2);
        if (step > cell) k *= cell / step;
        p.x -= g.x * k; p.y -= g.y * k; p.z -= g.z * k;
        if (Math.abs(d) < cell * 1e-4) break;
      }
    }
  }
  cleanMesh(mesh);
  if (normals && mesh.faces.length) {
    mesh.normals = mesh.vertices.map((p) => {
      const g = gradient(field, p, h);
      const l = len3(g.x, g.y, g.z);
      return l > 1e-12 ? { x: g.x / l, y: g.y / l, z: g.z / l } : { x: 0, y: 1, z: 0 };
    });
    mesh.faceNormals = mesh.faces.map((f) => f.slice());
  }
  if (uvs && mesh.faces.length) Object.assign(mesh, computeUVs(mesh, uvs));
  delete mesh.dirty;
  return mesh;
}

/**
 * One smooth mesh of shapes that melt together: spheres, ellipsoids,
 * capsules, cylinders, boxes and tori, each added, subtracted or intersected
 * with a smooth join. Organic creatures, soft bodies, clay-like forms.
 *
 * @example
 * // A snowman: three balls melting into each other, a carrot nose
 * const snowman = blobMesh([
 *   { kind: "sphere", center: { x: 0, y: -0.25, z: 0 }, radius: 0.3 },
 *   { kind: "sphere", center: { x: 0, y: 0.15, z: 0 }, radius: 0.22 },
 *   { kind: "sphere", center: { x: 0, y: 0.45, z: 0 }, radius: 0.15 },
 *   { kind: "capsule", a: { x: 0, y: 0.45, z: 0.12 }, b: { x: 0, y: 0.43, z: 0.3 }, ra: 0.035, rb: 0.005, blend: 0.01 },
 * ], { blend: 0.08 });
 *
 * @param {object[]} shapes
 * @param {{ blend?: number, resolution?: number, method?: "nets"|"cubes", project?: boolean, normals?: boolean, uvs?: string|object|false }} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function blobMesh(shapes, opts = {}) {
  const list = (Array.isArray(shapes) ? shapes : []).filter(Boolean);
  const ext = extentOf(list.map(prepare));
  if (!ext) return { vertices: [], faces: [] };
  const size = Math.max(ext.max.x - ext.min.x, ext.max.y - ext.min.y, ext.max.z - ext.min.z) || 1;
  const blend = Number.isFinite(opts.blend) ? Math.max(0, opts.blend) : size / 10;
  // A smooth union swells by up to a quarter of its blend
  const maxBlend = Math.max(blend, ...list.map((s) => (Number.isFinite(s.blend) ? s.blend : 0)));
  const pad = maxBlend / 4;
  const bounds = {
    min: { x: ext.min.x - pad, y: ext.min.y - pad, z: ext.min.z - pad },
    max: { x: ext.max.x + pad, y: ext.max.y + pad, z: ext.max.z + pad },
  };
  return sdfMesh(blobField(list, { blend }), bounds, { ...opts, sparse: true });
}
