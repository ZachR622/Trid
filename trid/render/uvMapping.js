/**
 * Texture mapping: texture coordinates made from a mesh's shape, for
 * meshes that don't have any (or to replace the ones they have).
 *
 * Every mode fits the image to the mesh's bounding box:
 *
 * - "planar":   the image is projected straight through the mesh along one axis
 * - "box":      each face takes the image from the side of the box it faces most
 * - "sphere":   wrapped around like a world map
 * - "cylinder": wrapped around the sides like a label; the ends get a planar image
 *
 * A mapping is a mode name, or an object with options:
 *
 *   mapping: "box"
 *   mapping: { type: "cylinder", axis: "x" }
 *
 * @typedef {"uv"|"planar"|"box"|"sphere"|"cylinder"} MappingType
 * @typedef {MappingType | { type: MappingType, axis?: "x"|"y"|"z" }} Mapping
 */

const TAU = Math.PI * 2;

/** Mapping modes accepted by `computeUVs` and `material.mapping`. */
export const MAPPINGS = ["uv", "planar", "box", "sphere", "cylinder"];

/**
 * Texture coordinates for a mesh's faces, made from its shape.
 * The mesh isn't changed. Every face corner gets its own entry in `uvs`.
 *
 * @param {{ vertices:{x:number,y:number,z:number}[], faces?:number[][] }} mesh
 * @param {Mapping} mapping
 * @returns {{ uvs:{u:number,v:number}[], faceUVs:number[][] }}
 * @throws {Error} For an unknown mapping
 */
export function computeUVs(mesh, mapping) {
  const { type, axis } = mappingOf(mapping);
  const faces = mesh.faces ?? [];
  const uvs = [], faceUVs = [];
  if (type === "uv") {
    return { uvs: mesh.uvs ?? [], faceUVs: mesh.faceUVs ?? [] };
  }

  // Sphere and cylinder wrap around Y; other axes are turned to Y first.
  // Cyclic swaps are rotations, so the image isn't mirrored.
  const turn = axis === "x" ? (p) => ({ x: p.z, y: p.x, z: p.y })
    : axis === "z" ? (p) => ({ x: p.y, y: p.z, z: p.x })
    : (p) => p;
  const wraps = type === "sphere" || type === "cylinder";
  const verts = wraps ? mesh.vertices.map(turn) : mesh.vertices;
  const box = bounds(verts);
  const center = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const size = { x: box.max.x - box.min.x || 1, y: box.max.y - box.min.y || 1, z: box.max.z - box.min.z || 1 };

  // A flat image seen from outside along +side of an axis ("y" with sign 1: from above)
  const flat = (p, ax, sign) => {
    const nx = (p.x - box.min.x) / size.x, ny = (p.y - box.min.y) / size.y, nz = (p.z - box.min.z) / size.z;
    if (ax === "x") return { u: sign > 0 ? nz : 1 - nz, v: ny };
    if (ax === "y") return { u: nx, v: sign > 0 ? nz : 1 - nz };
    return { u: sign > 0 ? 1 - nx : nx, v: ny };
  };

  for (const f of faces) {
    const p = f.map((i) => verts[i]);
    let ts;
    if (type === "planar") {
      // From the front: along the axis, seen from its negative side
      const ax = axis ?? "z";
      ts = p.map((q) => flat(q, ax, -1));
    } else if (type === "box") {
      const n = faceNormal(p);
      const ax = dominant(n);
      ts = p.map((q) => flat(q, ax, Math.sign(n[ax]) || 1));
    } else {
      const n = faceNormal(p);
      if (type === "cylinder" && Math.abs(n.y) > 0.7) {
        // An end cap: planar from above or below
        ts = p.map((q) => flat(q, "y", Math.sign(n.y)));
      } else {
        ts = p.map((q) => {
          const d = { x: q.x - center.x, y: q.y - center.y, z: q.z - center.z };
          const around = Math.hypot(d.x, d.z);
          const u = around < 1e-9 ? NaN : (((Math.atan2(d.z, d.x) / TAU) % 1) + 1) % 1;
          const v = type === "sphere"
            ? 0.5 + Math.atan2(d.y, around) / Math.PI
            : (q.y - box.min.y) / size.y;
          return { u, v };
        });
        fixSeam(ts);
      }
    }
    faceUVs.push(ts.map((t) => uvs.push(t) - 1));
  }
  return { uvs, faceUVs };
}

/**
 * Replaces a mesh's texture coordinates with ones made from its shape,
 * in place. Handy for OBJ files without any, or before exporting.
 *
 * @param {Object} mesh
 * @param {Mapping} mapping
 * @returns The same mesh
 */
export function mapUVs(mesh, mapping) {
  const { uvs, faceUVs } = computeUVs(mesh, mapping);
  mesh.uvs = uvs;
  mesh.faceUVs = faceUVs;
  mesh.dirty = true;
  return mesh;
}

/** The mapping as `{ type, axis }`, checked. */
export function mappingOf(mapping) {
  const m = typeof mapping === "string" ? { type: mapping } : { ...(mapping ?? {}) };
  m.type ??= "uv";
  if (!MAPPINGS.includes(m.type)) throw new Error(`Unknown texture mapping: "${m.type}"`);
  if (m.axis != null && !["x", "y", "z"].includes(m.axis)) throw new Error(`Unknown mapping axis: "${m.axis}"`);
  return m;
}

/** A short string naming a mapping, for caches ("" for the mesh's own coordinates). */
export function mappingKey(mapping) {
  if (mapping == null) return "";
  const { type, axis } = mappingOf(mapping);
  return type === "uv" ? "" : type + (axis ? ":" + axis : "");
}

const cache = new WeakMap(); // mesh → Map(key → { counts, vertices, faces, result })

/**
 * Texture coordinates a renderer should use for a mesh: its own, or
 * computed for `mapping` and cached until the mesh changes.
 *
 * @returns {{ uvs:{u:number,v:number}[]|undefined, faceUVs:(number[]|null)[]|undefined }}
 */
export function uvsFor(mesh, mapping) {
  const key = mappingKey(mapping);
  if (!key) return { uvs: mesh.uvs, faceUVs: mesh.faceUVs };
  let byKey = cache.get(mesh);
  if (!byKey) cache.set(mesh, (byKey = new Map()));
  const counts = `${mesh.vertices.length}/${mesh.faces?.length ?? 0}`;
  let c = byKey.get(key);
  if (!c || mesh.dirty || c.counts !== counts || c.vertices !== mesh.vertices || c.faces !== mesh.faces) {
    c = { counts, vertices: mesh.vertices, faces: mesh.faces, result: computeUVs(mesh, mapping) };
    byKey.set(key, c);
  }
  return c.result;
}

/**
 * The 2D transform a material's `textureRepeat`, `textureOffset` and
 * `textureRotation` describe, as [a, b, c, d, e, f]:
 * u' = a·u + c·v + e, v' = b·u + d·v + f. Null when it changes nothing.
 *
 * Rotation turns the image around its center, then repeat scales it
 * (2 = the image twice across), then offset moves it.
 */
export function uvTransform(mat) {
  const r = mat.textureRepeat ?? 1, o = mat.textureOffset, a = mat.textureRotation ?? 0;
  const ru = typeof r === "number" ? r : r.u ?? 1, rv = typeof r === "number" ? r : r.v ?? 1;
  const ou = o?.u ?? 0, ov = o?.v ?? 0;
  if (ru === 1 && rv === 1 && !ou && !ov && !a) return null;
  const c = Math.cos(a), s = Math.sin(a);
  // Rotate around (0.5, 0.5): R·(t - 0.5) + 0.5, then scale and move
  return [
    ru * c, rv * s,
    -ru * s, rv * c,
    ru * (0.5 - 0.5 * c + 0.5 * s) + ou,
    rv * (0.5 - 0.5 * s - 0.5 * c) + ov,
  ];
}

/** Applies a `uvTransform` to one texture coordinate. */
export function applyUVTransform(m, t) {
  if (!m || !t) return t;
  return { u: m[0] * t.u + m[2] * t.v + m[4], v: m[1] * t.u + m[3] * t.v + m[5] };
}

/**
 * Corners that wrap past u = 1 get 1 added, so a face crossing the
 * seam doesn't stretch the whole image across itself. Corners on the
 * axis (u = NaN, like a sphere's poles) take the face's middle u.
 */
function fixSeam(ts) {
  const known = ts.filter((t) => !Number.isNaN(t.u));
  if (!known.length) {
    for (const t of ts) t.u = 0.5;
    return;
  }
  const us = known.map((t) => t.u);
  if (Math.max(...us) - Math.min(...us) > 0.5) {
    for (const t of known) if (t.u < 0.5) t.u += 1;
  }
  const mid = known.reduce((a, t) => a + t.u, 0) / known.length;
  for (const t of ts) if (Number.isNaN(t.u)) t.u = mid;
}

/** Outward normal of a clockwise face (not normalized). */
function faceNormal(p) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return { x, y, z };
}

/** The axis a vector points along most. */
function dominant(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  return ay >= ax && ay >= az ? "y" : ax >= az ? "x" : "z";
}

function bounds(verts) {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of verts) {
    if (v.x < min.x) min.x = v.x; if (v.x > max.x) max.x = v.x;
    if (v.y < min.y) min.y = v.y; if (v.y > max.y) max.y = v.y;
    if (v.z < min.z) min.z = v.z; if (v.z > max.z) max.z = v.z;
  }
  if (!verts.length) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  return { min, max };
}
