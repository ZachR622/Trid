/** Faces meeting at a sharper angle than this (degrees) keep a hard edge with `smooth: true`. */
export const DEFAULT_CREASE = 60;

const cache = new WeakMap();

/**
 * Normals at each corner of each face, for smooth shading.
 *
 * A corner's normal is the average of the faces around its vertex
 * (bigger faces count more), skipping faces that meet this one at a
 * sharper angle than `crease`. So a sphere looks round while a cube
 * keeps its sharp edges.
 *
 * When the mesh has its own normals (`mesh.normals` and
 * `mesh.faceNormals`, as loaded from an OBJ file), those are used
 * for the faces that have them.
 *
 * The result is cached per mesh until its arrays are replaced,
 * resized, or `mesh.dirty` is set.
 *
 * @param {{ vertices:{x:number,y:number,z:number}[], faces?:number[][],
 *   normals?:{x:number,y:number,z:number}[], faceNormals?:(number[]|null)[] }} mesh
 * @param {number} [crease=60] - Angle in degrees
 * @returns {{x:number,y:number,z:number}[][]} For each face, one unit normal per corner
 */
export function cornerNormals(mesh, crease = DEFAULT_CREASE) {
  const faces = mesh.faces ?? [];
  const key = `${crease}/${mesh.vertices.length}/${faces.length}`;
  const hit = cache.get(mesh);
  if (hit && !mesh.dirty && hit.key === key && hit.vertices === mesh.vertices && hit.faces === faces) {
    return hit.result;
  }

  const v = mesh.vertices;
  const raw = faces.map((f) => (f.length >= 3 ? newell(f.map((i) => v[i])) : { x: 0, y: 0, z: 0 }));
  const unit = raw.map(normalize);

  // Faces touching each vertex
  const around = v.map(() => []);
  faces.forEach((f, k) => {
    for (const i of f) around[i].push(k);
  });

  const minDot = Math.cos((crease * Math.PI) / 180) - 1e-6;
  const result = faces.map((f, k) => {
    const own = mesh.faceNormals?.[k];
    if (own && mesh.normals) return own.map((n) => normalize(mesh.normals[n]));

    const u = unit[k];
    return f.map((i) => {
      let x = 0, y = 0, z = 0;
      for (const g of around[i]) {
        const w = unit[g];
        if (u.x * w.x + u.y * w.y + u.z * w.z < minDot) continue;
        x += raw[g].x; y += raw[g].y; z += raw[g].z;
      }
      return normalize({ x, y, z });
    });
  });

  cache.set(mesh, { key, vertices: mesh.vertices, faces, result });
  return result;
}

/** The `smooth` material setting as a crease angle, or null for flat shading. */
export function creaseOf(smooth) {
  if (smooth === true) return DEFAULT_CREASE;
  if (typeof smooth === "number" && smooth > 0) return smooth;
  return null;
}

/**
 * Normal of a polygon (Newell's method, works for any number of points).
 * Points clockwise as seen from a side give a normal pointing to that side.
 */
export function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return { x, y, z };
}

function normalize(p) {
  const len = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / len, y: p.y / len, z: p.z / len };
}
