/**
 * Mesh cleanup and checks, for meshes written by code (or loaded from
 * files): merge vertices at the same place, drop broken faces, list what's
 * wrong, and turn faces so they all point outward.
 */
import { newell } from "../render/normals.js";

/** Per-face lists that follow the faces' corners. */
const CORNER_LISTS = ["faceUVs", "faceNormals"];

const finite = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/** Largest side of the box around the mesh's valid vertices (0 when there are none). */
function sizeOf(vertices) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vertices) {
    if (!finite(v)) continue;
    lo = Math.min(lo, v.x, v.y, v.z);
    hi = Math.max(hi, v.x, v.y, v.z);
  }
  return hi >= lo ? hi - lo : 0;
}

/**
 * For each vertex, the first vertex within `eps` of it (itself when it's the
 * first there). Uses a grid and looks in the neighboring cells, so close
 * vertices on either side of a cell boundary still meet. Bad vertices stay alone.
 */
export function samePlace(vertices, eps) {
  const cells = new Map();
  const cellOf = (x) => Math.floor(x / eps);
  return vertices.map((v, i) => {
    if (!finite(v)) return i;
    const cx = cellOf(v.x), cy = cellOf(v.y), cz = cellOf(v.z);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        const w = vertices[j];
        if (Math.abs(w.x - v.x) <= eps && Math.abs(w.y - v.y) <= eps && Math.abs(w.z - v.z) <= eps) return j;
      }
    }
    const key = `${cx},${cy},${cz}`;
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
    return i;
  });
}

const validIndex = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

/**
 * A face's corners without repeats in a row (and without the last when it
 * repeats the first): `[vertex, corner]` pairs.
 */
export function distinctCorners(face) {
  const keep = [];
  face.forEach((v, c) => {
    if (!keep.length || keep[keep.length - 1][0] !== v) keep.push([v, c]);
  });
  while (keep.length > 1 && keep[0][0] === keep[keep.length - 1][0]) keep.pop();
  return keep;
}

/**
 * Replaces the faces with `kept` (old face index, new vertex list, which
 * old corners it keeps), keeping texture coordinates, normals and
 * materials in step.
 */
function applyFaces(mesh, kept) {
  const old = mesh.faces ?? [];
  for (const key of CORNER_LISTS) {
    if (!mesh[key]) continue;
    const list = mesh[key];
    mesh[key] = kept.map(({ f, corners }) => {
      const c = list[f];
      return Array.isArray(c) && c.length === old[f].length ? corners.map((i) => c[i]) : null;
    });
  }
  if (mesh.faceMaterials) mesh.faceMaterials = kept.map(({ f }) => mesh.faceMaterials[f] ?? 0);
  mesh.faces = kept.map(({ verts }) => verts);
}

/** Default distance for "the same place": tiny next to the mesh. */
export const defaultEps = (vertices) => (sizeOf(vertices) || 1) * 1e-7;

/**
 * Merges vertices closer than `epsilon` (default: a ten-millionth of the
 * mesh's size), in place, so faces that touch share their vertices: smooth
 * shading has no seams, and tools that follow neighbors (subdivision,
 * fixWinding) see one surface. Texture coordinates and normals are per face
 * corner, so they're kept as they are. Corners that end up on the same
 * vertex are removed, and faces left with fewer than 3 corners dropped.
 *
 * @template M
 * @param {M} mesh
 * @param {number} [epsilon]
 * @returns {M} The same mesh
 */
export function weldVertices(mesh, epsilon) {
  const vs = mesh.vertices ?? [];
  const eps = epsilon > 0 ? epsilon : defaultEps(vs);
  const rep = samePlace(vs, eps);
  const remap = new Array(vs.length);
  const vertices = [];
  vs.forEach((v, i) => {
    remap[i] = rep[i] === i ? vertices.push(v) - 1 : remap[rep[i]];
  });
  const to = (i) => (validIndex(i, vs.length) ? remap[i] : -1);

  if (mesh.faces) {
    const kept = [];
    mesh.faces.forEach((f, n) => {
      if (!Array.isArray(f)) return;
      const keep = distinctCorners(f.map(to));
      if (keep.length >= 3) kept.push({ f: n, verts: keep.map(([v]) => v), corners: keep.map(([, c]) => c) });
    });
    applyFaces(mesh, kept);
  }
  if (mesh.edges) {
    mesh.edges = mesh.edges.map((e) => distinctCorners(e.map(to)).map(([v]) => v)).filter((e) => e.length >= 2);
  }
  mesh.vertices = vertices;
  mesh.dirty = true;
  return mesh;
}

/** Key of a face that's the same whichever corner it starts at (but not reversed). */
function faceKey(verts) {
  let start = 0;
  for (let i = 1; i < verts.length; i++) if (verts[i] < verts[start]) start = i;
  return verts.slice(start).concat(verts.slice(0, start)).join(",");
}

/**
 * Fixes what can be fixed, in place, by removing what's broken:
 * - faces pointing to vertices that don't exist or aren't numbers;
 * - corners repeated in a row, faces left with fewer than 3 corners or
 *   that cross back on a vertex, faces of no area, and repeated faces;
 * - texture coordinate and normal lists that don't fit their face (set to null);
 * - edges to missing vertices;
 * - vertices nothing uses, texture coordinates and normals nothing uses.
 *
 * With `weld` (true or a distance), vertices at the same place are merged first.
 *
 * @template M
 * @param {M} mesh
 * @param {{ weld?: boolean | number }} [opts]
 * @returns {M} The same mesh
 */
export function cleanMesh(mesh, { weld = false } = {}) {
  if (!Array.isArray(mesh.vertices)) mesh.vertices = [];
  if (weld) weldVertices(mesh, typeof weld === "number" ? weld : undefined);
  const vs = mesh.vertices;
  const ok = (i) => validIndex(i, vs.length) && finite(vs[i]);
  const size = sizeOf(vs) || 1;
  const minArea = size * size * 1e-14;

  if (mesh.faces) {
    const kept = [];
    const seen = new Set();
    mesh.faces.forEach((f, n) => {
      if (!Array.isArray(f) || !f.every(ok)) return;
      const keep = distinctCorners(f);
      const verts = keep.map(([v]) => v);
      if (verts.length < 3 || new Set(verts).size !== verts.length) return;
      const nrm = newell(verts.map((i) => vs[i]));
      if (Math.hypot(nrm.x, nrm.y, nrm.z) / 2 <= minArea) return;
      const key = faceKey(verts);
      if (seen.has(key)) return;
      seen.add(key);
      kept.push({ f: n, verts, corners: keep.map(([, c]) => c) });
    });
    applyFaces(mesh, kept);
    // Corner lists pointing to missing entries are dropped for that face
    for (const [key, values] of [["faceUVs", "uvs"], ["faceNormals", "normals"]]) {
      if (!mesh[key]) continue;
      const count = mesh[values]?.length ?? 0;
      mesh[key] = mesh[key].map((c) => (c && c.every((i) => validIndex(i, count)) ? c : null));
    }
  }
  if (mesh.edges) {
    mesh.edges = mesh.edges
      .filter((e) => Array.isArray(e) && e.every(ok))
      .map((e) => distinctCorners(e).map(([v]) => v))
      .filter((e) => e.length >= 2);
  }

  // Keep only what's used, in order
  const compact = (count, lists) => {
    const used = new Array(count).fill(false);
    for (const list of lists) for (const item of list ?? []) for (const i of item ?? []) used[i] = true;
    const remap = new Array(count);
    let next = 0;
    for (let i = 0; i < count; i++) remap[i] = used[i] ? next++ : -1;
    return { used, remap, changed: next !== count };
  };
  const v = compact(vs.length, [mesh.faces, mesh.edges]);
  if (v.changed) {
    mesh.vertices = vs.filter((_, i) => v.used[i]);
    if (mesh.faces) mesh.faces = mesh.faces.map((f) => f.map((i) => v.remap[i]));
    if (mesh.edges) mesh.edges = mesh.edges.map((e) => e.map((i) => v.remap[i]));
  }
  for (const [key, values] of [["faceUVs", "uvs"], ["faceNormals", "normals"]]) {
    if (!mesh[values] || !mesh[key]) continue;
    const c = compact(mesh[values].length, [mesh[key]]);
    if (!c.changed) continue;
    mesh[values] = mesh[values].filter((_, i) => c.used[i]);
    mesh[key] = mesh[key].map((f) => (f ? f.map((i) => c.remap[i]) : f));
  }
  mesh.dirty = true;
  return mesh;
}

/**
 * The surface's edges, by vertex position (so an unwelded mesh still counts
 * as one surface): for each edge, the faces on it and which way each one
 * goes along it (+1 from the lower to the higher vertex, -1 the other way).
 */
function edgeMap(mesh, faceOk) {
  const vs = mesh.vertices;
  const rep = samePlace(vs, defaultEps(vs));
  const edges = new Map();
  (mesh.faces ?? []).forEach((f, n) => {
    if (!faceOk(n)) return;
    for (let c = 0; c < f.length; c++) {
      const a = rep[f[c]], b = rep[f[(c + 1) % f.length]];
      if (a === b) continue;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const entry = { face: n, dir: a < b ? 1 : -1 };
      const list = edges.get(key);
      if (list) list.push(entry);
      else edges.set(key, [entry]);
    }
  });
  return { edges, rep };
}

/** Faces whose corners are all valid vertices. */
const faceChecker = (mesh) => {
  const vs = mesh.vertices ?? [];
  return (n) => {
    const f = mesh.faces?.[n];
    return Array.isArray(f) && f.length >= 3 && f.every((i) => validIndex(i, vs.length) && finite(vs[i]));
  };
};

/** Signed volume of some faces (> 0: outward), measured from `origin`, with some faces counted reversed. */
function volumeOf(mesh, faces, flipped, origin) {
  const p = mesh.vertices;
  let vol = 0;
  for (const n of faces) {
    const f = flipped[n] ? [...mesh.faces[n]].reverse() : mesh.faces[n];
    const a = p[f[0]];
    for (let i = 1; i + 1 < f.length; i++) {
      const b = p[f[i]], c = p[f[i + 1]];
      const ax = a.x - origin.x, ay = a.y - origin.y, az = a.z - origin.z;
      const bx = b.x - origin.x, by = b.y - origin.y, bz = b.z - origin.z;
      const cx = c.x - origin.x, cy = c.y - origin.y, cz = c.z - origin.z;
      vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
  }
  return vol / 6;
}

/**
 * Pieces of the surface: faces joined by edges shared by exactly two faces,
 * each with the faces it must reverse so that neighbors agree.
 */
function orientPieces(mesh) {
  const faceOk = faceChecker(mesh);
  const { edges } = edgeMap(mesh, faceOk);
  // Each face's neighbors across two-face edges, and whether they go the same way on it
  const nb = (mesh.faces ?? []).map(() => []);
  for (const list of edges.values()) {
    if (list.length !== 2 || list[0].face === list[1].face) continue;
    const [p, q] = list;
    const same = p.dir === q.dir;
    nb[p.face].push([q.face, same]);
    nb[q.face].push([p.face, same]);
  }
  const flipped = new Array(nb.length).fill(false);
  const seen = new Array(nb.length).fill(false);
  const pieces = [];
  for (let s = 0; s < nb.length; s++) {
    if (seen[s] || !faceOk(s)) continue;
    const faces = [s];
    seen[s] = true;
    let conflicts = 0;
    for (let k = 0; k < faces.length; k++) {
      const f = faces[k];
      for (const [g, same] of nb[f]) {
        // Neighbors must go opposite ways along their shared edge
        const want = same ? !flipped[f] : flipped[f];
        if (!seen[g]) {
          seen[g] = true;
          flipped[g] = want;
          faces.push(g);
        } else if (flipped[g] !== want) conflicts++;
      }
    }
    pieces.push({ faces, conflicts: conflicts / 2 });
  }
  return { pieces, flipped, edges, faceOk };
}

/** Is every edge of these faces shared by exactly two of them? */
function isClosed(mesh, faces, edges) {
  const inPiece = new Set(faces);
  for (const list of edges.values()) {
    const here = list.filter((e) => inPiece.has(e.face));
    if (here.length && here.length !== 2) return false;
  }
  return true;
}

const centerOf = (mesh, faces) => {
  let x = 0, y = 0, z = 0, n = 0;
  for (const f of faces) for (const i of mesh.faces[f]) {
    const v = mesh.vertices[i];
    x += v.x; y += v.y; z += v.z; n++;
  }
  return { x: x / n, y: y / n, z: z / n };
};

/**
 * Turns faces around, in place, so that faces next to each other agree,
 * then each piece of the mesh points outward (clockwise from outside, like
 * the built-in shapes). Pieces are found by vertex position, so the mesh
 * doesn't need welding first.
 *
 * For an open piece (a cup, a sheet), "outward" is a guess: away from its
 * middle. A flat piece keeps the way most of its faces already point.
 *
 * @template M
 * @param {M} mesh
 * @returns {M} The same mesh
 */
export function fixWinding(mesh) {
  if (!mesh.faces?.length) return mesh;
  const { pieces, flipped } = orientPieces(mesh);
  const size = sizeOf(mesh.vertices) || 1;
  for (const { faces } of pieces) {
    const vol = volumeOf(mesh, faces, flipped, centerOf(mesh, faces));
    const turned = faces.filter((f) => flipped[f]).length;
    // Inside out, or (when it encloses nothing) more faces turned than not: the other way round
    const flat = Math.abs(vol) <= size ** 3 * 1e-9;
    if (flat ? turned * 2 > faces.length : vol < 0) for (const f of faces) flipped[f] = !flipped[f];
  }
  let any = false;
  mesh.faces.forEach((f, n) => {
    if (!flipped[n]) return;
    any = true;
    mesh.faces[n] = [...f].reverse();
    for (const key of CORNER_LISTS) if (mesh[key]?.[n]) mesh[key][n] = [...mesh[key][n]].reverse();
  });
  if (any) mesh.dirty = true;
  return mesh;
}

/**
 * Lists what's wrong with a mesh, without changing it. Each entry is one
 * kind of problem, with how bad it is, a short message, and the faces,
 * vertices or edges concerned:
 *
 * - `"error"`: breaks drawing or export (missing vertices, numbers that
 *   aren't numbers, lists that don't fit their faces);
 * - `"warning"`: draws wrong (faces of no area, repeated or crossed faces,
 *   faces turned the wrong way, inside out, edges shared by 3 faces or more);
 * - `"info"`: worth knowing (open edges, unused vertices, vertices at the same place).
 *
 * An empty list means nothing was found.
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @returns {{ kind: string, level: "error"|"warning"|"info", message: string, faces?: number[], vertices?: number[], edges?: number[] }[]}
 */
export function validateMesh(mesh) {
  const out = [];
  const report = (kind, level, what, items, text) => {
    if (!items.length) return;
    const list = items.slice(0, 5).join(", ") + (items.length > 5 ? ", …" : "");
    out.push({ kind, level, message: `${text(items.length)} (${what} ${list})`, [what]: items });
  };
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const vs = Array.isArray(mesh?.vertices) ? mesh.vertices : null;
  if (!vs) return [{ kind: "no-vertices", level: "error", message: "The mesh has no vertices list" }];
  const faces = Array.isArray(mesh.faces) ? mesh.faces : [];

  const badVertex = [];
  vs.forEach((v, i) => { if (!finite(v)) badVertex.push(i); });
  report("bad-vertex", "error", "vertices", badVertex, (n) => `${plural(n, "vertex", "vertices")} with a position that isn't 3 numbers`);

  const badIndex = [], fewCorners = [], crossed = [], noArea = [], repeated = [];
  const seen = new Map();
  const size = sizeOf(vs) || 1;
  faces.forEach((f, n) => {
    if (!Array.isArray(f) || !f.every((i) => validIndex(i, vs.length))) return badIndex.push(n);
    if (!f.every((i) => finite(vs[i]))) return;
    const verts = distinctCorners(f).map(([v]) => v);
    if (verts.length < 3) return fewCorners.push(n);
    if (new Set(verts).size !== verts.length) return crossed.push(n);
    const nrm = newell(verts.map((i) => vs[i]));
    if (Math.hypot(nrm.x, nrm.y, nrm.z) / 2 <= size * size * 1e-14) noArea.push(n);
    const key = faceKey(verts);
    if (seen.has(key)) repeated.push(n);
    else seen.set(key, n);
  });
  report("bad-index", "error", "faces", badIndex, (n) => `${plural(n, "face")} pointing to vertices that don't exist`);
  report("few-corners", "warning", "faces", fewCorners, (n) => `${plural(n, "face")} with fewer than 3 different corners`);
  report("crossed-face", "warning", "faces", crossed, (n) => `${plural(n, "face")} going through the same vertex twice`);
  report("no-area", "warning", "faces", noArea, (n) => `${plural(n, "face")} of no area`);
  report("repeated-face", "warning", "faces", repeated, (n) => `${plural(n, "face")} repeating another face`);

  for (const [key, values, label] of [["faceUVs", "uvs", "texture coordinates"], ["faceNormals", "normals", "normals"]]) {
    if (!mesh[key]) continue;
    const count = mesh[values]?.length ?? 0;
    const bad = [];
    faces.forEach((f, n) => {
      const c = mesh[key][n];
      if (c == null) return;
      if (!Array.isArray(c) || !Array.isArray(f) || c.length !== f.length || !c.every((i) => validIndex(i, count))) bad.push(n);
    });
    if (mesh[key].length !== faces.length) {
      out.push({ kind: `bad-${key}`, level: "error", message: `${key} has ${mesh[key].length} entries for ${faces.length} faces` });
    }
    report(`bad-${key}`, "error", "faces", bad, (n) => `${plural(n, "face")} whose ${label} don't fit (wrong count or missing entries)`);
  }
  if (mesh.faceMaterials) {
    const bad = [];
    faces.forEach((_, n) => { if (!Number.isInteger(mesh.faceMaterials[n]) || mesh.faceMaterials[n] < 0) bad.push(n); });
    report("bad-material", "warning", "faces", bad, (n) => `${plural(n, "face")} without a valid material number`);
  }
  if (mesh.edges) {
    const bad = [];
    mesh.edges.forEach((e, n) => { if (!Array.isArray(e) || e.length < 2 || !e.every((i) => validIndex(i, vs.length))) bad.push(n); });
    report("bad-edge", "error", "edges", bad, (n) => `${plural(n, "edge")} pointing to vertices that don't exist`);
  }

  // Shape of the surface (faces with valid corners only)
  const { pieces, edges, flipped } = orientPieces(mesh);
  const open = [], many = [];
  const turned = [];
  for (const list of edges.values()) {
    if (list.length === 1) open.push(list[0].face);
    else if (list.length > 2) many.push(...list.map((e) => e.face));
  }
  report("open-edge", "info", "faces", [...new Set(open)].sort((a, b) => a - b), (n) => `${plural(n, "face")} on an open border (fine for sheets, holes in a solid)`);
  report("many-faces-edge", "warning", "faces", [...new Set(many)].sort((a, b) => a - b), (n) => `${plural(n, "face")} on edges shared by 3 faces or more`);
  const insideOut = [];
  for (const piece of pieces) {
    const flips = piece.faces.filter((f) => flipped[f]);
    // The smaller group is the one turned the wrong way
    const wrong = flips.length * 2 > piece.faces.length ? piece.faces.filter((f) => !flipped[f]) : flips;
    turned.push(...wrong);
    if (!wrong.length && piece.faces.length > 1 && isClosed(mesh, piece.faces, edges) && volumeOf(mesh, piece.faces, flipped, centerOf(mesh, piece.faces)) < 0) {
      insideOut.push(...piece.faces);
    }
  }
  report("turned-face", "warning", "faces", turned.sort((a, b) => a - b), (n) => `${plural(n, "face")} turned the other way from their neighbors (fixWinding fixes it)`);
  report("inside-out", "warning", "faces", insideOut.sort((a, b) => a - b), (n) => `${plural(n, "face")} of a closed part that's inside out (fixWinding fixes it)`);

  const used = new Array(vs.length).fill(false);
  for (const list of [faces, mesh.edges ?? []]) for (const f of list) if (Array.isArray(f)) for (const i of f) if (validIndex(i, vs.length)) used[i] = true;
  const unused = [];
  used.forEach((u, i) => { if (!u) unused.push(i); });
  report("unused-vertex", "info", "vertices", unused, (n) => `${plural(n, "vertex", "vertices")} no face or edge uses`);
  const rep = samePlace(vs, defaultEps(vs));
  const dup = [];
  rep.forEach((r, i) => { if (r !== i) dup.push(i); });
  report("same-place", "info", "vertices", dup, (n) => `${plural(n, "vertex", "vertices")} at the same place as another (weldVertices merges them)`);
  return out;
}
