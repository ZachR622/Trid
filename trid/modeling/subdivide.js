/**
 * Catmull-Clark subdivision: a rough cage of a few faces becomes a smooth
 * surface, the way modelers use a subdivision surface modifier.
 */
import { newell } from "../render/normals.js";
import { samePlace, defaultEps, distinctCorners } from "./cleanup.js";

const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * One level of Catmull-Clark on points of any size (3D positions or 2D
 * texture coordinates): every face becomes one quad per corner.
 *
 * Sharp edges (in `sharp`, plus open borders and edges shared by 3 faces or
 * more) stay creased: their new points are midpoints, a vertex on 2 of them
 * slides only along them, and a vertex on 3 or more stays put (a corner).
 * Sharp edges stay sharp in the result.
 *
 * @param {number[][]} P Points
 * @param {number[][]} F Faces (indices into P)
 * @param {Set<string>} sharp Sharp edges as "a,b" keys (a < b)
 * @param {boolean} smooth false: only split the faces
 */
function step(P, F, sharp, smooth) {
  const dims = P[0]?.length ?? 0;
  const avg = (pts) => {
    const out = new Array(dims).fill(0);
    for (const p of pts) for (let d = 0; d < dims; d++) out[d] += p[d] / pts.length;
    return out;
  };
  const facePts = F.map((f) => avg(f.map((i) => P[i])));

  // Edges, with the faces on each side
  const edges = new Map();
  F.forEach((f, n) => f.forEach((a, c) => {
    const b = f[(c + 1) % f.length];
    const k = edgeKey(a, b);
    const e = edges.get(k);
    if (e) e.faces.push(n);
    else edges.set(k, { a: Math.min(a, b), b: Math.max(a, b), faces: [n] });
  }));
  const isSharp = (k, e) => sharp.has(k) || e.faces.length !== 2;

  // New points: the old ones moved, then one per face, then one per edge
  const vFaces = P.map(() => []), vEdges = P.map(() => []);
  F.forEach((f, n) => f.forEach((i) => vFaces[i].push(n)));
  for (const [k, e] of edges) {
    vEdges[e.a].push(k);
    vEdges[e.b].push(k);
  }
  const out = P.map((p, i) => {
    if (!smooth || !vFaces[i].length) return p.slice();
    const creased = vEdges[i].filter((k) => isSharp(k, edges.get(k)));
    // A corner: 3 sharp edges or more, or the corner of an open sheet (one face only)
    if (creased.length > 2 || (creased.length === 2 && vFaces[i].length === 1)) return p.slice();
    if (creased.length === 2) {
      const [a, b] = creased.map((k) => { const e = edges.get(k); return P[e.a === i ? e.b : e.a]; });
      return p.map((x, d) => 0.75 * x + 0.125 * (a[d] + b[d]));
    }
    const n = vFaces[i].length;
    const q = avg(vFaces[i].map((f) => facePts[f]));
    const r = avg(vEdges[i].map((k) => { const e = edges.get(k); return avg([P[e.a], P[e.b]]); }));
    return p.map((x, d) => (q[d] + 2 * r[d] + (n - 3) * x) / n);
  });
  const faceBase = out.length;
  out.push(...facePts);
  const edgeIndex = new Map();
  for (const [k, e] of edges) {
    const pt = smooth && !isSharp(k, e) ? avg([P[e.a], P[e.b], facePts[e.faces[0]], facePts[e.faces[1]]]) : avg([P[e.a], P[e.b]]);
    edgeIndex.set(k, out.push(pt) - 1);
  }

  // One quad per corner, in the face's own direction
  const faces = [], parent = [];
  F.forEach((f, n) => {
    const k = f.length;
    for (let c = 0; c < k; c++) {
      const prev = f[(c + k - 1) % k], next = f[(c + 1) % k];
      faces.push([f[c], edgeIndex.get(edgeKey(f[c], next)), faceBase + n, edgeIndex.get(edgeKey(prev, f[c]))]);
      parent.push(n);
    }
  });

  // Sharp edges are split in two, both halves sharp
  const nextSharp = new Set();
  for (const k of sharp) {
    const e = edges.get(k);
    if (!e) continue;
    const m = edgeIndex.get(k);
    nextSharp.add(edgeKey(e.a, m));
    nextSharp.add(edgeKey(m, e.b));
  }
  return { P: out, F: faces, sharp: nextSharp, parent };
}

/**
 * Smooths a mesh by subdividing it (Catmull-Clark): each level splits every
 * face into one quad per corner (about 4 times the faces) and rounds the
 * surface, so a rough cage of a few boxes becomes a smooth organic shape.
 * Returns a new mesh; the original isn't changed.
 *
 * - Creases: edges sharper than `creaseAngle` (degrees), and edges in
 *   `creases`, stay hard. Open borders stay where they are (smoothed along
 *   the border only).
 * - Texture coordinates are smoothed with the surface, keeping their seams
 *   (`uvs: "linear"` only splits them). Faces without them drop them all.
 * - Materials: each new face keeps its face's material. The mesh's own
 *   normals are dropped (the renderers compute new ones).
 * - Vertices at the same place are treated as one, so an unwelded mesh is
 *   still smoothed as one surface; the result is welded.
 *
 * @example
 * // A rough cage: a box with a box on top, smoothed twice
 * const cage = mergeMeshes([makeShape("box", { w: 0.6, h: 0.4, d: 0.4 }), { mesh: makeShape("cube", { size: 0.3 }), pos: { x: 0, y: 0.35, z: 0 } }]);
 * const body = subdivideMesh(cage, { levels: 2 });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ levels?: number, smooth?: boolean, creaseAngle?: number, creases?: number[][], uvs?: "smooth"|"linear" }} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function subdivideMesh(mesh, { levels = 1, smooth = true, creaseAngle, creases, uvs: uvMode = "smooth" } = {}) {
  const vs = mesh?.vertices ?? [];
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < vs.length && Number.isFinite(vs[i].x + vs[i].y + vs[i].z);

  // Vertices at the same place become one point
  const rep = samePlace(vs, defaultEps(vs));
  const index = new Map();
  const P = [];
  const at = (i) => {
    const r = rep[i];
    if (!index.has(r)) index.set(r, P.push([vs[r].x, vs[r].y, vs[r].z]) - 1);
    return index.get(r);
  };

  // Faces that can be subdivided (others are dropped), with their texture corners and material
  const F = [], src = [];
  (mesh?.faces ?? []).forEach((f, n) => {
    if (!Array.isArray(f) || !f.every(ok)) return;
    const keep = distinctCorners(f.map(at));
    if (keep.length < 3 || new Set(keep.map(([v]) => v)).size !== keep.length) return;
    F.push(keep.map(([v]) => v));
    src.push({ n, corners: keep.map(([, c]) => c) });
  });
  if (!F.length) return { vertices: [], faces: [] };

  // Sharp edges: given ones (pairs or polylines of vertex indices), and ones sharper than the angle
  let sharp = new Set();
  for (const line of creases ?? []) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i + 1 < line.length; i++) {
      if (!ok(line[i]) || !ok(line[i + 1])) continue;
      const a = at(line[i]), b = at(line[i + 1]);
      if (a !== b) sharp.add(edgeKey(a, b));
    }
  }
  if (Number.isFinite(creaseAngle)) {
    const minDot = Math.cos((creaseAngle * Math.PI) / 180);
    const normals = F.map((f) => {
      const n = newell(f.map((i) => ({ x: P[i][0], y: P[i][1], z: P[i][2] })));
      const l = Math.hypot(n.x, n.y, n.z) || 1;
      return { x: n.x / l, y: n.y / l, z: n.z / l };
    });
    const onEdge = new Map();
    F.forEach((f, n) => f.forEach((a, c) => {
      const k = edgeKey(a, f[(c + 1) % f.length]);
      (onEdge.get(k) ?? onEdge.set(k, []).get(k)).push(n);
    }));
    for (const [k, fs] of onEdge) {
      if (fs.length !== 2) continue;
      const [p, q] = [normals[fs[0]], normals[fs[1]]];
      if (p.x * q.x + p.y * q.y + p.z * q.z < minDot - 1e-9) sharp.add(k);
    }
  }

  // Texture coordinates: their own surface, joined where corners share a vertex and the same coordinates
  const hasUV = Array.isArray(mesh.uvs) && Array.isArray(mesh.faceUVs) && src.every(({ n, corners }) => {
    const c = mesh.faceUVs[n];
    return Array.isArray(c) && c.length === mesh.faces[n].length && corners.every((k) => mesh.uvs[c[k]] && Number.isFinite(mesh.uvs[c[k]].u + mesh.uvs[c[k]].v));
  });
  let UP = null, UF = null;
  if (hasUV) {
    UP = [];
    const uvIndex = new Map();
    UF = src.map(({ n, corners }, f) => corners.map((k, c) => {
      const uv = mesh.uvs[mesh.faceUVs[n][k]];
      const key = `${F[f][c]}/${uv.u.toFixed(9)},${uv.v.toFixed(9)}`;
      if (!uvIndex.has(key)) uvIndex.set(key, UP.push([uv.u, uv.v]) - 1);
      return uvIndex.get(key);
    }));
  }

  // Subdivide, keeping track of which original face each new face comes from
  let origin = src.map((_, f) => f);
  let geo = { P, F, sharp };
  let tex = hasUV ? { P: UP, F: UF, sharp: new Set() } : null;
  const count = Math.max(0, Math.min(6, Math.round(levels)));
  for (let l = 0; l < count; l++) {
    const g = step(geo.P, geo.F, geo.sharp, smooth);
    if (tex) tex = step(tex.P, tex.F, tex.sharp, smooth && uvMode !== "linear");
    origin = g.parent.map((p) => origin[p]);
    geo = g;
  }

  const out = {
    vertices: geo.P.map(([x, y, z]) => ({ x, y, z })),
    faces: geo.F,
  };
  if (tex) {
    out.uvs = tex.P.map(([u, v]) => ({ u, v }));
    out.faceUVs = tex.F;
  }
  if (mesh.faceMaterials) out.faceMaterials = origin.map((f) => mesh.faceMaterials[src[f].n] ?? 0);
  if (mesh.materialNames) out.materialNames = [...mesh.materialNames];
  return out;
}
