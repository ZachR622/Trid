/**
 * Booleans (CSG): join closed meshes, cut one with another, or keep where
 * they overlap, like Blender's Boolean modifier.
 *
 *   const wall = subtractMesh(makeShape("box", { w: 2, h: 1, d: 0.2 }), window);
 *   const nut = subtractMesh(hexPrism, [hole]);           // several cutters at once
 *   const both = unionMesh(body, { mesh: arm, pos, rot }); // scene objects are placed first
 *
 * - Inputs are meshes, or scene objects (and groups) placed where they
 *   stand, like `exportOBJ`. They should be closed (no holes in their
 *   surface): an open mesh has no inside, so the result can be wrong
 * - Faces keep their texture coordinates and material. By default faces
 *   that come from a cutter keep the cutter's own materials, numbered
 *   after the first mesh's (Blender's "Transfer"), so the walls of a hole
 *   cut with a blue box are blue. `result.materials` lists them when the
 *   inputs are objects with materials
 * - Faces that lie on each other (a box cut flush with another's side)
 *   are handled: the result keeps one of them, or none, as it should
 *
 * How: each face near the other mesh is cut where the other's surface
 * crosses it (only by the faces it actually touches), and each piece is
 * sorted: outside the other mesh, inside it (a ray test), or lying on its
 * surface. The pieces on the right side are kept and joined again: shared
 * corners welded, corners added where a piece's side touches another's
 * corner (so no cracks show), and pieces of the same face merged back into
 * bigger convex faces. Faces far from the other mesh are kept or dropped
 * whole, so a small hole in a big mesh stays quick.
 */

import { newell } from "../render/normals.js";
import { triangulate } from "../render/shapes.js";
import { mergeMeshes } from "../render/meshUtils.js";
import { isClosed, meshQuery } from "./query.js";
import { samePlace } from "./cleanup.js";

/** The operations, with Blender's names too. */
const OPS = { union: "union", subtract: "subtract", difference: "subtract", intersect: "intersect" };

let warnedOpen = false;
const checked = new WeakSet(); // meshes already checked for holes

/** Points made by cuts (the only corners that can land on another face's side). */
const cutPoints = new WeakSet();

/**
 * Where a plane crosses a side, made once per side and plane: pieces sharing
 * the side get the very same point (not copies off by rounding), so they fit.
 */
const crossings = new WeakMap(); // plane → Map(side key → point)
const pointIds = new WeakMap();
let nextPointId = 0;
const pointId = (p) => {
  let id = pointIds.get(p);
  if (id === undefined) pointIds.set(p, (id = nextPointId++));
  return id;
};
function crossing(plane, a, b) {
  let byPlane = crossings.get(plane);
  if (!byPlane) crossings.set(plane, (byPlane = new Map()));
  const ia = pointId(a), ib = pointId(b);
  const key = ia < ib ? `${ia},${ib}` : `${ib},${ia}`;
  let p = byPlane.get(key);
  if (!p) {
    // Always worked out from the same end, so it's the same either way round
    const [from, to] = ia < ib ? [a, b] : [b, a];
    const t = (plane.w - dot(plane.n, from)) / dot(plane.n, sub(to, from));
    p = lerp(from, to, t);
    cutPoints.add(p);
    byPlane.set(key, p);
  }
  return p;
}

/**
 * Combines closed meshes.
 *
 * @param {Object} a - A mesh, or a scene object / group (placed where it stands)
 * @param {Object|Object[]} b - Another one, or a list: applied one after the other
 *   (a subtract cuts every one of them out)
 * @param {"union"|"subtract"|"difference"|"intersect"} op
 * @param {Object} [opts]
 * @param {"transfer"|"index"} [opts.materials="transfer"] - Materials of faces from `b`:
 *   `"transfer"`: their own, numbered after `a`'s (then the next cutter's after those);
 *   `"index"`: their material numbers as they are, picking from `a`'s list
 * @param {number} [opts.epsilon] - How close counts as touching (default: a hundred-thousandth
 *   of the meshes' size)
 * @returns {import("../index.d.ts").Mesh & { materials?: Object[] }} A new mesh: `vertices`,
 *   `faces`, `faceMaterials`, and `uvs` / `faceUVs` when the inputs had texture coordinates.
 *   `materials` when the inputs are objects with materials
 */
export function booleanMesh(a, b, op, { materials = "transfer", epsilon } = {}) {
  const kind = OPS[op];
  if (!kind) throw new Error(`booleanMesh: unknown operation "${op}" (use "union", "subtract" or "intersect")`);
  const cutters = Array.isArray(b) ? b : [b];
  const inputs = [a, ...cutters].map(baked);
  [a, ...cutters].forEach((src, k) => {
    const key = src?.vertices ?? src?.mesh?.vertices; // once per mesh
    if (warnedOpen || !inputs[k].faces.length || (key && checked.has(key))) return;
    if (key) checked.add(key);
    if (!isClosed(inputs[k])) {
      warnedOpen = true;
      console.warn("Trid: booleanMesh needs closed meshes (an open one has no inside); the result may be wrong");
    }
  });

  // How close counts as touching: tiny next to everything involved
  const box = boundsOf(inputs.flatMap((m) => m.vertices));
  const size = box ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) : 1;
  const eps = epsilon > 0 ? epsilon : (size || 1) * 1e-5;

  // Material numbers: each cutter's after the previous ones' ("transfer")
  let offset = 0;
  const offsets = inputs.map((m) => {
    const here = materials === "index" ? 0 : offset;
    offset += materialCount(m);
    return here;
  });

  let id = 0;
  const nextId = () => id++;
  let polys = toPolygons(inputs[0], offsets[0], nextId, eps);
  for (let k = 1; k < inputs.length; k++) {
    polys = combine(polys, toPolygons(inputs[k], offsets[k], nextId, eps), kind, eps);
  }
  const out = toMesh(polys, eps);

  // Material list, when the inputs carry their materials
  const sources = [a, ...cutters];
  if (materials !== "index" && sources.every((s) => s && !s.vertices && s.material)) {
    out.materials = sources.flatMap((s, k) => {
      const list = Array.isArray(s.material) ? s.material : [s.material];
      return Array.from({ length: materialCount(inputs[k]) }, (_, i) => list[i] ?? list[0]);
    });
  }
  return out;
}

/** `a` joined with `b` (a list: all of them). */
export function unionMesh(a, b, opts) {
  return booleanMesh(a, b, "union", opts);
}

/** `a` with `b` cut out of it (a list: all of them). */
export function subtractMesh(a, b, opts) {
  return booleanMesh(a, b, "subtract", opts);
}

/** Only where `a` and `b` overlap (a list: all of them). */
export function intersectMesh(a, b, opts) {
  return booleanMesh(a, b, "intersect", opts);
}

// --- Inputs ---

/** A mesh as given, or an object / group baked where it stands (as one mesh). */
function baked(input) {
  if (!input) throw new Error("booleanMesh: missing mesh");
  const m = input.vertices ? input : mergeMeshes([input]);
  return { ...m, faces: m.faces ?? [] };
}

/** How many material slots a mesh uses (at least 1). */
function materialCount(m) {
  let n = 1;
  for (const k of m.faceMaterials ?? []) if (k + 1 > n) n = k + 1;
  return n;
}

/**
 * A mesh's faces as polygons: corners `{ p, uv }`, a `plane`, a material,
 * and the id of the face they come from. Faces that aren't convex are cut
 * into triangles first (splitting needs convex polygons).
 */
function toPolygons(mesh, matOffset, nextId, eps) {
  const out = [];
  const v = mesh.vertices;
  mesh.faces.forEach((face, fi) => {
    if (!Array.isArray(face) || face.length < 3) return;
    const t = mesh.uvs && mesh.faceUVs?.[fi];
    const corners = face.map((i, c) => ({ p: v[i], uv: t ? mesh.uvs[t[c]] ?? null : null }));
    if (corners.some((c) => !c.p)) return;
    const n = newell(corners.map((c) => c.p));
    const len = Math.hypot(n.x, n.y, n.z);
    if (!(len > eps * eps)) return; // no area
    const normal = { x: n.x / len, y: n.y / len, z: n.z / len };
    const plane = { n: normal, w: dot(normal, corners[0].p) };
    const mat = (mesh.faceMaterials?.[fi] ?? 0) + matOffset;
    const id = nextId();
    const pieces = convex(corners, normal, eps) ? [corners] : triangles(corners, normal);
    for (const c of pieces) out.push({ v: c, plane, mat, id });
  });
  return out;
}

/** Whether a polygon turns the same way at every corner (straight corners allowed). */
function convex(c, n, eps) {
  for (let i = 0; i < c.length; i++) {
    const a = c[i].p, b = c[(i + 1) % c.length].p, d = c[(i + 2) % c.length].p;
    const e1 = sub(b, a), e2 = sub(d, b);
    const turn = dot(cross(e1, e2), n);
    if (turn < -eps * eps) return false; // turns the other way than the face's normal says
    if (Math.abs(turn) <= eps * eps && dot(e1, e2) < 0) return false; // goes straight back
  }
  return true;
}

/** A polygon cut into triangles (ear clipping in its own plane), corners kept. */
function triangles(c, n) {
  const t1 = norm(Math.abs(n.x) < 0.9 ? cross(n, { x: 1, y: 0, z: 0 }) : cross(n, { x: 0, y: 1, z: 0 }));
  const t2 = cross(n, t1);
  const flat = c.map(({ p }) => ({ x: dot(p, t1), y: dot(p, t2) }));
  let area = 0;
  for (let i = 0; i < flat.length; i++) {
    const p = flat[i], q = flat[(i + 1) % flat.length];
    area += p.x * q.y - q.x * p.y;
  }
  const L = c.length;
  const tris = area >= 0
    ? triangulate(flat)
    : triangulate([...flat].reverse()).map((t) => t.map((i) => L - 1 - i).reverse());
  return tris.map((t) => t.map((i) => c[i]));
}

// --- Cutting and sorting ---

const FRONT = 1, BACK = 2, SPANNING = 3;

/**
 * Cuts a convex polygon by a plane: `[front, back]` pieces, or null when it
 * doesn't cross it. Corners and texture coordinates in between are interpolated.
 */
function cut(plane, poly, eps) {
  let type = 0;
  const types = poly.v.map((c) => {
    const t = dot(plane.n, c.p) - plane.w;
    const k = t < -eps ? BACK : t > eps ? FRONT : 0;
    type |= k;
    return k;
  });
  if (type !== SPANNING) return null;
  const f = [], b = [];
  const n = poly.v.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ti = types[i], tj = types[j];
    const vi = poly.v[i], vj = poly.v[j];
    if (ti !== BACK) f.push(vi);
    if (ti !== FRONT) b.push(vi);
    if ((ti | tj) === SPANNING) {
      const p = crossing(plane, vi.p, vj.p);
      // Texture coordinates belong to this face (seams differ): interpolated here
      const ab = sub(vj.p, vi.p);
      const t = dot(sub(p, vi.p), ab) / (dot(ab, ab) || 1);
      const uv = vi.uv && vj.uv ? { u: vi.uv.u + (vj.uv.u - vi.uv.u) * t, v: vi.uv.v + (vj.uv.v - vi.uv.v) * t } : null;
      const mid = { p, uv };
      f.push(mid);
      b.push(mid);
    }
  }
  return [f, b].filter((v) => v.length >= 3).map((v) => ({ ...poly, v }));
}

/** Where a piece is, next to the other mesh. */
const OUT = 0, IN = 1, SAME = 2, OPPOSITE = 3; // SAME / OPPOSITE: lying on its surface, facing the same way or not

/**
 * Cuts each polygon where the other mesh's surface crosses it (by the
 * planes of the other's faces it touches, and, where they lie flat on each
 * other, by the sides of those faces), then sorts every piece: outside,
 * inside, or lying on the other surface. Only polygons near the other mesh
 * get cut; the rest are sorted whole.
 */
function sortPieces(polys, other, eps) {
  const box = boundsOf(other.list.flatMap((p) => p.v.map((c) => c.p)));
  const out = [];
  for (const poly of polys) {
    if (!touches(poly, box, eps)) {
      out.push({ poly, where: OUT });
      continue;
    }
    const near = other.grid.near(poly, eps);
    // First a window around the faces it meets: the rest of this face stays whole
    let pieces = near.length ? windowed(poly, boundsOf(near.flatMap((q) => q.v.map((c) => c.p))), eps) : [poly];
    const flat = []; // the other's faces this one lies on
    for (const q of near) {
      if (Math.abs(dot(poly.plane.n, q.plane.n)) > 1 - 1e-9 && q.v.every((c) => Math.abs(dot(poly.plane.n, c.p) - poly.plane.w) <= eps)) {
        // Lying on it: cut along its sides, so each piece is all on it or all off it
        flat.push(q);
        for (let i = 0; i < q.v.length; i++) {
          const a = q.v[i].p, b = q.v[(i + 1) % q.v.length].p;
          const n = norm(cross(q.plane.n, sub(b, a)));
          pieces = cutAll(pieces, { n, w: dot(n, a) }, q, eps);
        }
      } else {
        pieces = cutAll(pieces, q.plane, q, eps);
      }
    }
    for (const piece of pieces) out.push({ poly: piece, where: place(piece, flat, near, other, eps) });
  }
  return out;
}

/**
 * A polygon cut along the sides of a box (the axis planes it crosses): the
 * part inside the box, and the strips around it, which no later cut touches.
 */
function windowed(poly, box, eps) {
  let pieces = [poly];
  for (const [axis, n] of [["x", { x: 1, y: 0, z: 0 }], ["y", { x: 0, y: 1, z: 0 }], ["z", { x: 0, y: 0, z: 1 }]]) {
    // Right on the box's sides: where they line up with real corners (they often do),
    // the cut lands on them instead of leaving a sliver
    for (const w of [box.min[axis], box.max[axis]]) {
      const out = [];
      for (const p of pieces) {
        const halves = cut({ n, w }, p, eps);
        if (halves) out.push(...halves);
        else out.push(p);
      }
      pieces = out;
    }
  }
  return pieces;
}

/** Cuts the pieces reaching near polygon `q` by a plane. */
function cutAll(pieces, plane, q, eps) {
  const box = boundsOf(q.v.map((c) => c.p));
  const out = [];
  for (const p of pieces) {
    const halves = touches(p, box, eps) ? cut(plane, p, eps) : null;
    if (halves) out.push(...halves);
    else out.push(p);
  }
  return out;
}

/**
 * Where one piece is: on one of the faces it lies flat against; else, right
 * next to one of the other's faces (just above or below it), on that face's
 * side; else inside or outside by a ray test (unsure for points almost on
 * the surface, which is why the nearby faces are asked first).
 */
function place(piece, flat, near, other, eps) {
  const c = centroid(piece.v.map((x) => x.p));
  for (const q of flat) {
    if (insideConvex(c, q, eps)) return dot(piece.plane.n, q.plane.n) > 0 ? SAME : OPPOSITE;
  }
  // Right next to the other surface, a ray test can miss the hit at its start: ask the
  // nearest point instead, and which side of the faces there the piece is on
  let dist = Infinity;
  const at = [];
  for (const q of near) {
    const f = closestOnPolygon(c, q);
    const d = Math.hypot(c.x - f.x, c.y - f.y, c.z - f.z);
    if (d < dist - eps * 1e-3) {
      dist = d;
      at.length = 0;
    }
    if (d <= dist + eps * 1e-3) at.push(q);
  }
  if (dist > eps && dist < eps * 1000) {
    // On a side or corner several faces share: their normals together say which side
    let side = 0;
    for (const q of at) side += dot(norm(sub(c, closestOnPolygon(c, q))), q.plane.n);
    if (Math.abs(side) > 1e-6) return side > 0 ? OUT : IN;
  }
  return other.contains(c) ? IN : OUT;
}

/** The point of a convex polygon nearest to `p`. */
function closestOnPolygon(p, q) {
  const n = q.plane.n;
  const d = dot(n, p) - q.plane.w;
  const foot = sub(p, { x: n.x * d, y: n.y * d, z: n.z * d });
  if (insideConvex(foot, q, 0)) return foot;
  let best = null, bestD = Infinity;
  for (let i = 0; i < q.v.length; i++) {
    const a = q.v[i].p, b = q.v[(i + 1) % q.v.length].p;
    const ab = sub(b, a);
    const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
    const x = lerp(a, b, t);
    const dd = (x.x - p.x) ** 2 + (x.y - p.y) ** 2 + (x.z - p.z) ** 2;
    if (dd < bestD) [best, bestD] = [x, dd];
  }
  return best;
}

/** Whether a point in a convex polygon's plane is inside it (a hair of slack). */
function insideConvex(p, q, eps) {
  const n = q.v.length;
  for (let i = 0; i < n; i++) {
    const a = q.v[i].p, b = q.v[(i + 1) % n].p;
    const side = dot(cross(sub(b, a), sub(p, a)), q.plane.n);
    if (side < -eps * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)) return false;
  }
  return true;
}

/** Polygons in grid cells, to find the ones near a box quickly. */
function polygonGrid(list, eps) {
  const all = boundsOf(list.flatMap((p) => p.v.map((c) => c.p)));
  const size = all ? Math.max(all.max.x - all.min.x, all.max.y - all.min.y, all.max.z - all.min.z) : 1;
  const cell = Math.max(eps * 100, size / Math.max(1, Math.cbrt(list.length) * 2));
  const cells = new Map(), big = [];
  const range = (b) => [Math.floor(b.min.x / cell), Math.floor(b.max.x / cell), Math.floor(b.min.y / cell), Math.floor(b.max.y / cell), Math.floor(b.min.z / cell), Math.floor(b.max.z / cell)];
  const grow = (b) => ({ min: { x: b.min.x - eps, y: b.min.y - eps, z: b.min.z - eps }, max: { x: b.max.x + eps, y: b.max.y + eps, z: b.max.z + eps } });
  list.forEach((p, i) => {
    const [x0, x1, y0, y1, z0, z1] = range(grow(boundsOf(p.v.map((c) => c.p))));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 64) {
      big.push(i);
      return;
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = `${x},${y},${z}`;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(i);
    }
  });
  return {
    /** The polygons whose box meets a polygon's box. */
    near(poly, eps) {
      const pb = boundsOf(poly.v.map((c) => c.p));
      const [x0, x1, y0, y1, z0, z1] = range(grow(pb));
      const found = new Set(big);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        for (const i of cells.get(`${x},${y},${z}`) ?? []) found.add(i);
      }
      return [...found].map((i) => list[i]).filter((q) => touches(q, pb, eps));
    },
  };
}

/** One side of an operation: its polygons, and helpers to look near them and inside them. */
function prepare(list, eps) {
  const mesh = { vertices: [], faces: [] };
  for (const p of list) mesh.faces.push(p.v.map((c) => mesh.vertices.push(c.p) - 1));
  let query = null; // made when first needed: the ray tests' boxes take a moment to build
  return { list, grid: polygonGrid(list, eps), contains: (p) => (query ??= meshQuery(mesh)).contains(p) };
}

/**
 * The operation on two closed sets of polygons. Each one's pieces are kept
 * by where they are next to the other:
 * - union: A's outside B, or on B facing the same way (one copy of a shared
 *   side); B's outside A
 * - subtract: A's outside B, or on B facing the other way (touching from
 *   outside); B's inside A, turned around (the walls of the hole)
 * - intersect: A's inside B, or on B facing the same way; B's inside A
 */
function combine(A, B, op, eps) {
  const a = prepare(A, eps), b = prepare(B, eps);
  const pa = sortPieces(A, b, eps), pb = sortPieces(B, a, eps);
  const keep = (list, ...where) => list.filter((x) => where.includes(x.where)).map((x) => x.poly);
  if (op === "union") return keep(pa, OUT, SAME).concat(keep(pb, OUT));
  if (op === "subtract") return keep(pa, OUT, OPPOSITE).concat(flip(keep(pb, IN)));
  return keep(pa, IN, SAME).concat(keep(pb, IN));
}

/** Polygons turned around: corners reversed, plane flipped. */
function flip(polys) {
  return polys.map((p) => ({ ...p, v: [...p.v].reverse(), plane: { n: neg(p.plane.n), w: -p.plane.w } }));
}

// --- Back to a mesh ---

/**
 * Polygons to a mesh: corners at the same place welded, corners added
 * where a side touches another polygon's corner (no cracks), pieces of the
 * same face merged back into convex faces, slivers dropped.
 */
function toMesh(polys, eps) {
  // Welded corners: the same point objects first (most corners are the input's vertices),
  // then what's left by distance
  const unique = new Map();
  for (const p of polys) for (const c of p.v) if (!unique.has(c.p)) unique.set(c.p, unique.size);
  const pts = [...unique.keys()];
  const same = samePlace(pts, eps);
  const vertices = [], index = new Map(), made = new Set();
  const welded = pts.map((p, i) => {
    const r = same[i];
    if (!index.has(r)) index.set(r, vertices.push({ x: pts[r].x, y: pts[r].y, z: pts[r].z }) - 1);
    if (cutPoints.has(p)) made.add(index.get(r));
    return index.get(r);
  });
  // Cut points computed twice (once from each mesh's side) can land a little farther apart
  // than eps where the surfaces cross at a grazing angle: snap them together too
  const snap = snapCutPoints(vertices, made, eps * 10);
  let vid = polys.flatMap((p) => p.v.map((c) => snap[welded[unique.get(c.p)]]));
  // Sides shorter than that are collapsed too (two meshes' corners nearly touching)
  const collapse = collapseShort(polys, vid, vertices, made, eps * 10);
  vid = vid.map(collapse);
  // A cut point snapped onto another corner hands its role on: that corner may now
  // sit on another face's side, so the crack fixing below has to look at it
  for (const m of [...made]) made.add(collapse(snap[m]));
  let k = 0;
  let faces = polys.map((p) => ({
    corners: dedupe(p.v.map((c) => ({ v: vid[k++], uv: c.uv }))),
    plane: p.plane, mat: p.mat, id: p.id,
  })).filter((f) => f.corners.length >= 3);

  // A cut corner can drift a few times eps from the side it's on, after many cuts
  // Near-duplicate corners first (so sides run where they should), then corners added on
  // sides that pass through them, which can bring new near-duplicates: twice over
  for (let round = 0; round < 2; round++) {
    faces = collapseShortSides(faces, vertices, made, eps * 10);
    faces = fixTJunctions(faces, vertices, made, eps * 4);
  }
  faces = collapseShortSides(faces, vertices, made, eps * 10);
  // Where the surfaces cross at a grazing angle, the two sides of a seam can still miss
  // each other by a little more: stitch what's left open
  for (let round = 0; round < 3; round++) faces = stitch(faces, vertices, eps * 50);
  faces = mergePieces(faces, vertices, eps);
  faces = faces.filter((f) => area(f.corners.map((c) => vertices[c.v])) > eps * eps);

  // Only the vertices still used, in order
  const keep = new Map();
  for (const f of faces) for (const c of f.corners) if (!keep.has(c.v)) keep.set(c.v, keep.size);
  const mesh = {
    vertices: [...keep.keys()].map((i) => vertices[i]),
    faces: faces.map((f) => f.corners.map((c) => keep.get(c.v))),
    faceMaterials: faces.map((f) => f.mat),
  };
  if (faces.some((f) => f.corners.some((c) => c.uv))) {
    const uvs = [], uvIndex = new Map(); // the same coordinate objects share an entry
    mesh.faceUVs = faces.map((f) => {
      if (!f.corners.every((c) => c.uv)) return null;
      return f.corners.map(({ uv }) => {
        if (!uvIndex.has(uv)) uvIndex.set(uv, uvs.push({ u: uv.u, v: uv.v }) - 1);
        return uvIndex.get(uv);
      });
    });
    mesh.uvs = uvs;
  }
  return mesh;
}

/**
 * For each vertex, the one it becomes: points made by cuts move onto the
 * nearest vertex within `tol` (an original one if there is one), others stay.
 */
function snapCutPoints(vertices, made, tol) {
  const to = vertices.map((_, i) => i);
  if (!made.size) return to;
  const cell = tol;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  vertices.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const find = (i) => {
    while (to[i] !== i) i = to[i] = to[to[i]];
    return i;
  };
  for (const m of made) {
    const p = vertices[m];
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    let best = -1, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
        if (j === m) continue;
        const q = vertices[j];
        const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        if (d > tol) continue;
        // Original vertices first, then the closest; among cut points only lower numbers (no loops)
        const rank = (made.has(j) ? 1 : 0) * 1e9 + d;
        if ((!made.has(j) || j < m) && rank < bestD) [best, bestD] = [j, rank];
      }
    }
    if (best >= 0) to[find(m)] = find(best);
  }
  return to.map((_, i) => find(i));
}

/** Merges the two ends of every side shorter than `tol` (keeping an original corner over a cut point). */
function collapseShort(polys, vid, vertices, made, tol) {
  const to = vertices.map((_, i) => i);
  const find = (i) => {
    while (to[i] !== i) i = to[i] = to[to[i]];
    return i;
  };
  let k = 0;
  for (const p of polys) {
    const n = p.v.length;
    for (let i = 0; i < n; i++) {
      const a = find(vid[k + i]), b = find(vid[k + (i + 1) % n]);
      if (a === b) continue;
      const pa = vertices[a], pb = vertices[b];
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) > tol) continue;
      if (made.has(a) && !made.has(b)) to[a] = b;
      else to[b] = a;
    }
    k += n;
  }
  return find;
}

/** `collapseShort` on finished faces: the corners of sides shorter than `tol` merged. */
function collapseShortSides(faces, vertices, made, tol) {
  const to = vertices.map((_, i) => i);
  const find = (i) => {
    while (to[i] !== i) i = to[i] = to[to[i]];
    return i;
  };
  let any = false;
  for (const f of faces) {
    const n = f.corners.length;
    for (let i = 0; i < n; i++) {
      const a = find(f.corners[i].v), b = find(f.corners[(i + 1) % n].v);
      if (a === b) continue;
      const pa = vertices[a], pb = vertices[b];
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z) > tol) continue;
      if (made.has(a) && !made.has(b)) to[a] = b;
      else to[b] = a;
      any = true;
    }
  }
  if (!any) return faces;
  for (const m of [...made]) made.add(find(m));
  return faces
    .map((f) => ({ ...f, corners: withoutSpikes(dedupe(f.corners.map((c) => ({ ...c, v: find(c.v) })))) }))
    .filter((f) => f.corners.length >= 3);
}

/**
 * Closes what's still open: corners on open sides that are within `tol` of
 * each other are merged, and corners lying along an open side are added to
 * it. Sides already shared by two faces aren't touched.
 */
function stitch(faces, vertices, tol) {
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const count = new Map();
  for (const f of faces) f.corners.forEach((c, i) => {
    const k = key(c.v, f.corners[(i + 1) % f.corners.length].v);
    count.set(k, (count.get(k) ?? 0) + 1);
  });
  const loose = new Set();
  for (const [k, n] of count) if (n !== 2) for (const v of k.split(",")) loose.add(+v);
  if (!loose.size) return faces;

  // Merge loose corners close together
  const to = new Map([...loose].map((v) => [v, v]));
  const find = (i) => {
    while (to.get(i) !== i) i = to.get(i);
    return i;
  };
  const list = [...loose];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = vertices[list[i]], b = vertices[list[j]];
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= tol) {
      const ra = find(list[i]), rb = find(list[j]);
      if (ra !== rb) to.set(rb, ra);
    }
  }
  const at = (v) => (to.has(v) ? find(v) : v);
  faces = faces
    .map((f) => ({ ...f, corners: withoutSpikes(dedupe(f.corners.map((c) => ({ ...c, v: at(c.v) })))) }))
    .filter((f) => f.corners.length >= 3);

  // Loose corners lying along open sides join them
  const roots = [...new Set(list.map(at))];
  return faces.map((f) => {
    const out = [];
    const n = f.corners.length;
    for (let i = 0; i < n; i++) {
      const c0 = f.corners[i], c1 = f.corners[(i + 1) % n];
      out.push(c0);
      if (count.get(key(c0.v, c1.v)) === 2) continue;
      const a = vertices[c0.v], b = vertices[c1.v], ab = sub(b, a), len2 = dot(ab, ab);
      if (!(len2 > 0)) continue;
      const on = [];
      for (const j of roots) {
        if (j === c0.v || j === c1.v) continue;
        const t = dot(sub(vertices[j], a), ab) / len2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const q = lerp(a, b, t), p = vertices[j];
        if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= tol) on.push({ t, j });
      }
      on.sort((x, y) => x.t - y.t);
      for (const { t, j } of on) {
        out.push({ v: j, uv: c0.uv && c1.uv ? { u: c0.uv.u + (c1.uv.u - c0.uv.u) * t, v: c0.uv.v + (c1.uv.v - c0.uv.v) * t } : null });
      }
    }
    return { ...f, corners: withoutSpikes(dedupe(out)) };
  });
}

/**
 * Removes there-and-back detours (corners a, b, a): when two pieces shared
 * several sides in a row, joining them across one leaves the rest as a spike.
 */
function withoutSpikes(corners) {
  let c = corners;
  for (let again = true; again && c.length >= 3;) {
    again = false;
    const out = [];
    for (const x of c) {
      // ..., a, b, then a again: drop b (the tip), and don't add a twice
      if (out.length >= 2 && out[out.length - 2].v === x.v) {
        out.pop();
        again = true;
      } else if (!out.length || out[out.length - 1].v !== x.v) out.push(x);
    }
    // Around the end: the last corners and the first ones
    while (out.length >= 3 && out[out.length - 2].v === out[0].v) {
      out.pop();
      again = true;
    }
    while (out.length >= 3 && out[out.length - 1].v === out[1].v) {
      out.shift();
      again = true;
    }
    while (out.length > 1 && out[0].v === out[out.length - 1].v) out.pop();
    c = out;
  }
  return c;
}

/** Corners without repeats in a row (welding can join neighbors). */
function dedupe(corners) {
  const out = [];
  for (const c of corners) if (!out.length || out[out.length - 1].v !== c.v) out.push(c);
  while (out.length > 1 && out[0].v === out[out.length - 1].v) out.pop();
  return out;
}

/**
 * Where a corner of one face lies on the side of another (a "T-junction"),
 * that side gets the corner too, so both faces share it and no hairline
 * crack shows between them.
 */
function fixTJunctions(faces, vertices, made, eps) {
  // Corners made by cuts, in a grid, to find the ones near each side quickly
  const cell = eps * 1000;
  const grid = new Map();
  const used = made;
  if (!used.size) return faces;
  const key = (x, y, z) => `${x},${y},${z}`;
  for (const i of used) {
    const p = vertices[i];
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const near = (a, b) => {
    const lo = { x: Math.min(a.x, b.x) - eps, y: Math.min(a.y, b.y) - eps, z: Math.min(a.z, b.z) - eps };
    const hi = { x: Math.max(a.x, b.x) + eps, y: Math.max(a.y, b.y) + eps, z: Math.max(a.z, b.z) + eps };
    const cells = (Math.floor(hi.x / cell) - Math.floor(lo.x / cell) + 1) * (Math.floor(hi.y / cell) - Math.floor(lo.y / cell) + 1) * (Math.floor(hi.z / cell) - Math.floor(lo.z / cell) + 1);
    if (cells > used.size) return [...used]; // a long side: just look at all corners
    const out = [];
    for (let x = Math.floor(lo.x / cell); x <= Math.floor(hi.x / cell); x++)
      for (let y = Math.floor(lo.y / cell); y <= Math.floor(hi.y / cell); y++)
        for (let z = Math.floor(lo.z / cell); z <= Math.floor(hi.z / cell); z++) out.push(...(grid.get(key(x, y, z)) ?? []));
    return out;
  };

  return faces.map((f) => {
    const out = [];
    const n = f.corners.length;
    for (let i = 0; i < n; i++) {
      const c0 = f.corners[i], c1 = f.corners[(i + 1) % n];
      out.push(c0);
      const a = vertices[c0.v], b = vertices[c1.v];
      const ab = sub(b, a);
      const len2 = dot(ab, ab);
      if (!(len2 > 0)) continue;
      const on = [];
      for (const j of near(a, b)) {
        if (j === c0.v || j === c1.v) continue;
        const p = vertices[j];
        const t = dot(sub(p, a), ab) / len2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const q = lerp(a, b, t);
        if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= eps) on.push({ t, j });
      }
      on.sort((x, y) => x.t - y.t);
      for (const { t, j } of on) {
        out.push({ v: j, uv: c0.uv && c1.uv ? { u: c0.uv.u + (c1.uv.u - c0.uv.u) * t, v: c0.uv.v + (c1.uv.v - c0.uv.v) * t } : null });
      }
    }
    return { ...f, corners: dedupe(out) };
  });
}

/**
 * Pieces of the same original face, sharing a side, are joined back into
 * one face while the result stays convex (renderers draw faces as fans).
 */
function mergePieces(faces, vertices, eps) {
  const groups = new Map();
  for (const f of faces) {
    if (!groups.has(f.id)) groups.set(f.id, []);
    groups.get(f.id).push(f);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    // Each side a → b of a live piece, to find its neighbor (which has b → a)
    const sides = new Map();
    const key = (a, b) => `${a},${b}`;
    const add = (f) => f.corners.forEach((c, i) => sides.set(key(c.v, f.corners[(i + 1) % f.corners.length].v), f));
    const remove = (f) => f.corners.forEach((c, i) => {
      const k = key(c.v, f.corners[(i + 1) % f.corners.length].v);
      if (sides.get(k) === f) sides.delete(k);
    });
    const alive = new Set(list);
    list.forEach(add);
    const queue = [...list];
    while (queue.length) {
      const f = queue.pop();
      if (!alive.has(f)) continue;
      const fc = f.corners;
      for (let i = 0; i < fc.length; i++) {
        const g = sides.get(key(fc[(i + 1) % fc.length].v, fc[i].v));
        if (!g || g === f || !alive.has(g)) continue;
        const gc = g.corners;
        const j = gc.findIndex((c, k) => c.v === fc[(i + 1) % fc.length].v && gc[(k + 1) % gc.length].v === fc[i].v);
        if (j < 0) continue;
        // f from b around to a, then g from a around to b (without the shared side)
        const joined = [];
        for (let k = 1; k <= fc.length; k++) joined.push(fc[(i + k) % fc.length]);
        for (let k = 2; k < gc.length; k++) joined.push(gc[(j + k) % gc.length]);
        const corners = withoutSpikes(dedupe(joined));
        if (corners.length < 3 || !convex(corners.map((c) => ({ p: vertices[c.v] })), f.plane.n, eps)) continue;
        remove(f);
        remove(g);
        alive.delete(f);
        alive.delete(g);
        const h = { ...f, corners };
        alive.add(h);
        add(h);
        queue.push(h);
        break;
      }
    }
    out.push(...alive);
  }
  return out;
}

// --- Small vector helpers ---

function boundsOf(points) {
  if (!points.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}

/** Whether a polygon reaches into a box (grown by eps). */
function touches(poly, box, eps) {
  if (!box) return false;
  let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
  for (const { p } of poly.v) {
    if (p.x < lx) lx = p.x;
    if (p.y < ly) ly = p.y;
    if (p.z < lz) lz = p.z;
    if (p.x > hx) hx = p.x;
    if (p.y > hy) hy = p.y;
    if (p.z > hz) hz = p.z;
  }
  return hx >= box.min.x - eps && lx <= box.max.x + eps && hy >= box.min.y - eps && ly <= box.max.y + eps
    && hz >= box.min.z - eps && lz <= box.max.z + eps;
}

function centroid(pts) {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  return { x: c.x / pts.length, y: c.y / pts.length, z: c.z / pts.length };
}

function area(pts) {
  const n = newell(pts);
  return Math.hypot(n.x, n.y, n.z) / 2;
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const neg = (a) => ({ x: -a.x, y: -a.y, z: -a.z });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function norm(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
