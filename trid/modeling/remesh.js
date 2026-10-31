/**
 * Voxel remeshing, like Blender's Voxel Remesh: rebuilds any shape as one
 * new mesh with small, even faces, so it can be sculpted, smoothed or
 * deformed everywhere (a box included). Overlapping parts melt into one
 * solid, with no walls left inside.
 *
 * The shape is turned into a signed distance field (negative inside) and
 * meshed again with `sdfMesh`.
 */
import { mergeMeshes, meshBounds } from "../render/meshUtils.js";
import { sdfMesh } from "./blobs.js";
import { samePlace, fixWinding } from "./cleanup.js";
import { meshQuery, isClosed } from "./query.js";

/** Pieces of a mesh that touch, by vertex position: each as its own mesh (positions and faces only). */
function pieces(mesh, eps) {
  const vs = mesh.vertices;
  const rep = samePlace(vs, eps);
  const parent = rep.slice();
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const faces = (mesh.faces ?? []).filter((f) => Array.isArray(f) && f.length >= 3 && f.every((i) => vs[i]));
  for (const f of faces) {
    const a = find(rep[f[0]]);
    for (let k = 1; k < f.length; k++) {
      const b = find(rep[f[k]]);
      if (a !== b) parent[b] = a;
    }
  }
  const groups = new Map();
  for (const f of faces) {
    const root = find(rep[f[0]]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(f);
  }
  return [...groups.values()].map((list) => {
    const index = new Map(), vertices = [];
    const at = (i) => {
      const r = rep[i];
      if (!index.has(r)) index.set(r, vertices.push({ x: vs[r].x, y: vs[r].y, z: vs[r].z }) - 1);
      return index.get(r);
    };
    return { vertices, faces: list.map((f) => f.map(at)) };
  });
}

/** Distance from p to a box (0 inside it). */
function boxDistance(p, b) {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
  const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
  const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
  return Math.hypot(dx, dy, dz);
}

/**
 * Rebuilds a shape as one new mesh with small, even faces, like Blender's
 * Voxel Remesh: a box, a low-poly part or a few overlapping parts become one
 * smooth-topology surface that sculpting brushes, `subdivideMesh` and the
 * deformers can work on everywhere.
 *
 * Overlapping pieces are joined into one solid (no walls inside), and
 * pieces turned inside out are fixed first. Each closed piece counts as
 * solid; an open piece (a sheet) becomes a thin shell two cells thick.
 *
 * The faces are about `size` across (default: the shape's longest side
 * divided by `resolution`, 64). Details smaller than a cell are lost, and
 * sharp edges and corners come out slightly softened (by less than a cell). Texture
 * coordinates are made again (`uvs`, like `sdfMesh`: box mapping by
 * default), and materials per face aren't kept.
 *
 * @example
 * // A box made sculptable
 * const clay = remeshMesh(makeShape("box"), { resolution: 48 });
 * sculptMesh(clay, "inflate", { center: { x: 0, y: 0.3, z: 0 }, radius: 0.2, strength: 0.05 });
 * // A body, a head and four legs, as one surface
 * const creature = remeshMesh([body, head, ...legs], { size: 0.01 });
 *
 * @param {Object|Object[]} input - A mesh, a scene object, or a list of them
 *   (objects are placed by their own transform, like `mergeMeshes`)
 * @param {{ resolution?: number, size?: number, method?: "nets"|"cubes", normals?: boolean, uvs?: string|object|false }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function remeshMesh(input, opts = {}) {
  const items = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const merged = mergeMeshes(items);
  const bounds = meshBounds(merged);
  if (!bounds || !merged.faces.length) return { vertices: [], faces: [] };
  const longest = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  if (!(longest > 0)) return { vertices: [], faces: [] };
  const resolution = Number.isFinite(opts.size) && opts.size > 0
    ? longest / opts.size
    : Number.isFinite(opts.resolution) ? opts.resolution : 64;
  const steps = Math.max(4, Math.min(256, Math.round(resolution)));
  const cell = longest / steps;

  // Each piece answers on its own; the shape is their union (the smallest signed distance)
  const parts = pieces(merged, longest * 1e-7).map((mesh) => {
    const closed = isClosed(mesh);
    if (closed) fixWinding(mesh);
    return { q: meshQuery(mesh), box: meshBounds(mesh), closed };
  });
  // Exact distances are only needed near the surface: sdfMesh skips blocks it can tell are farther than ~5.4 cells
  const cap = cell * 6;
  // Half the thickness of the shell an open piece becomes: two cells in all, so grid points always fall inside it
  const shell = cell;
  const hair = cell * 1e-6;
  const field = (p) => {
    let best = Infinity;
    for (const part of parts) {
      // The box's distance is as close as the piece can be; inside its box, the point may be inside it (negative)
      const lb = boxDistance(p, part.box);
      if (lb > 0 && lb >= best) continue;
      let d;
      if (lb > cap) d = lb;
      else {
        const hit = part.q.closest(p, { maxDistance: cap });
        if (!hit) d = part.closed && lb === 0 && part.q.contains(p) ? -cap : cap;
        else if (!part.closed) d = hit.distance - shell;
        else {
          // Inside when the point is behind the nearest face. When the nearest point is on an edge or a
          // corner of it, that face alone can't tell (past a sharp edge, the point can be behind one face
          // and in front of the other): count crossings instead
          const [a, b, c] = hit.barycentric;
          let inside;
          if (Math.min(a, b, c) < 1e-6) inside = part.q.contains(p);
          else {
            const n = hit.normal;
            inside = (p.x - hit.point.x) * n.x + (p.y - hit.point.y) * n.y + (p.z - hit.point.z) * n.z < 0;
          }
          d = inside ? -hit.distance : hit.distance;
        }
      }
      if (d < best) best = d;
    }
    // On the surface, give or take rounding: outside. Grid points on a flat side (a box's, at round
    // coordinates) would otherwise come out inside or outside at random, and tear the surface there
    return Math.abs(best) < hair ? hair : best;
  };

  const pad = parts.some((p) => !p.closed) ? shell : 0;
  const box = {
    min: { x: bounds.min.x - pad, y: bounds.min.y - pad, z: bounds.min.z - pad },
    max: { x: bounds.max.x + pad, y: bounds.max.y + pad, z: bounds.max.z + pad },
  };
  const { method = "nets", normals = true, uvs = "box" } = opts;
  return sdfMesh(field, box, { resolution: steps, method, normals, uvs, sparse: true });
}
