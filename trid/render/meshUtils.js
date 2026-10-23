import { localToWorld, rotateXYZ } from "../math/transform.js";

/** Deep copy of one mesh field: arrays and plain objects are copied, the rest kept. */
const copy = (x) => (Array.isArray(x) ? x.map(copy) : x && typeof x === "object" ? { ...x } : x);

/** A transform with every part filled in. */
const fullTransform = ({ pos, rot, scale } = {}) => ({
  pos: { x: 0, y: 0, z: 0, ...pos },
  rot: { x: 0, y: 0, z: 0, ...rot },
  scale: { x: 1, y: 1, z: 1, ...scale },
});

/**
 * Deep copy of a mesh: vertices, edges, faces, texture coordinates, normals
 * and materials. Change the copy without touching the original (or the other
 * objects that share it).
 *
 * @template M
 * @param {M} mesh
 * @returns {M} A new mesh
 */
export function cloneMesh(mesh) {
  const out = {};
  for (const k of Object.keys(mesh)) if (k !== "dirty") out[k] = copy(mesh[k]);
  return out;
}

/**
 * Bakes a transform into a mesh's vertices, in place: scale, then rotate
 * (X, then Y, then Z), then move, the same order objects use. Its own normals
 * turn with it, and a mirroring scale (an odd number of negative factors)
 * reverses the faces so they still face outward.
 *
 * Pass a scene object to bake its `pos`, `rot` and `scale` (then reset them
 * on the object, or it's transformed twice).
 *
 * @example
 * // A handle standing on the side of a mug
 * transformMesh(handle, { pos: { x: 0.3, y: 0, z: 0 }, rot: { x: 0, y: 0, z: Math.PI / 2 } });
 *
 * @template M
 * @param {M} mesh - Mesh to change
 * @param {{ pos?:{x:number,y:number,z:number}, rot?:{x:number,y:number,z:number}, scale?:{x:number,y:number,z:number} }} transform
 *   Parts left out don't change anything
 * @returns {M} The same mesh
 */
export function transformMesh(mesh, transform) {
  const t = fullTransform(transform);
  for (const v of mesh.vertices) Object.assign(v, localToWorld(v, t));

  // Normals: divide by the scale (keeps them perpendicular to stretched faces), turn, then normalize
  if (mesh.normals) {
    const s = t.scale;
    mesh.normals = mesh.normals.map((n) => {
      const r = rotateXYZ({ x: n.x / (s.x || 1), y: n.y / (s.y || 1), z: n.z / (s.z || 1) }, t.rot);
      const len = Math.hypot(r.x, r.y, r.z) || 1;
      return { x: r.x / len, y: r.y / len, z: r.z / len };
    });
  }

  // A mirror turns clockwise faces counter-clockwise: reverse them (and their corner lists)
  if (t.scale.x * t.scale.y * t.scale.z < 0 && mesh.faces) {
    const flip = (list) => list?.map((f) => (f ? [...f].reverse() : f));
    mesh.faces = flip(mesh.faces);
    if (mesh.faceUVs) mesh.faceUVs = flip(mesh.faceUVs);
    if (mesh.faceNormals) mesh.faceNormals = flip(mesh.faceNormals);
  }

  mesh.dirty = true;
  return mesh;
}

/**
 * Moves every vertex to `fn(vertex, index)`, in place: noise on a rock,
 * waves on a plane, a bend or a twist.
 *
 * The mesh's own normals (from an OBJ file) no longer fit the new shape, so
 * they're removed and the renderers compute new ones.
 *
 * @example
 * // A lumpy rock
 * displaceMesh(makeShape("sphere"), (v) => {
 *   const k = 1 + 0.3 * (fbm3(v.x * 3, v.y * 3, v.z * 3) - 0.5);
 *   return { x: v.x * k, y: v.y * k, z: v.z * k };
 * });
 *
 * @template M
 * @param {M} mesh - Mesh to change
 * @param {(v:{x:number,y:number,z:number}, index:number) => {x:number,y:number,z:number}} fn - New position of a vertex
 * @returns {M} The same mesh
 */
export function displaceMesh(mesh, fn) {
  mesh.vertices.forEach((v, i) => {
    const p = fn({ x: v.x, y: v.y, z: v.z }, i);
    v.x = p.x;
    v.y = p.y;
    v.z = p.z;
  });
  delete mesh.normals;
  delete mesh.faceNormals;
  mesh.dirty = true;
  return mesh;
}

/**
 * Joins meshes into one: one object to draw instead of many, or one mesh to
 * export. Faces, edges, texture coordinates, normals and materials are kept,
 * with their indices shifted.
 *
 * An object (`{ mesh, pos, rot, scale }`, added to a scene or not) in the
 * list is merged where it stands, with its transform baked in (its mesh
 * isn't changed).
 *
 * With `materialPerMesh`, the faces of the i-th mesh use material i, so an
 * object with `material: [blade, guard, grip]` paints each part its own way.
 * Otherwise each mesh's `faceMaterials` are kept; material names (from OBJ
 * files) are joined into one list when every mesh with materials has them.
 *
 * The meshes are copied, never changed.
 *
 * @example
 * const sword = mergeMeshes([blade, guard, grip], { materialPerMesh: true });
 * scene.add({ mesh: sword, material: [{ fill: "#ccd" }, { fill: "#c90" }, { fill: "#642" }] });
 *
 * @param {Object[]} items - Meshes, or scene objects with a `mesh`
 * @param {Object} [opts]
 * @param {boolean} [opts.materialPerMesh=false] - Faces of the i-th mesh use material i
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function mergeMeshes(items, { materialPerMesh = false } = {}) {
  const meshes = items.map((it) => (it.mesh ? transformMesh(cloneMesh(it.mesh), it) : it));
  const some = (k) => meshes.some((m) => m[k]);

  const out = { vertices: [], faces: [] };
  const hasEdges = some("edges");
  const hasUVs = some("faceUVs") && some("uvs");
  const hasNormals = some("faceNormals") && some("normals");
  const hasMats = materialPerMesh || some("faceMaterials");
  const withMats = meshes.filter((m) => m.faceMaterials);
  const names = !materialPerMesh && withMats.length > 0 && withMats.every((m) => m.materialNames) ? [] : null;
  if (hasEdges) out.edges = [];
  if (hasUVs) Object.assign(out, { uvs: [], faceUVs: [] });
  if (hasNormals) Object.assign(out, { normals: [], faceNormals: [] });
  if (hasMats) out.faceMaterials = [];

  meshes.forEach((m, mi) => {
    const vo = out.vertices.length, uo = out.uvs?.length ?? 0, no = out.normals?.length ?? 0;
    const shift = (list, o) => list.map((i) => i + o);
    out.vertices.push(...m.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z })));
    // A mesh without edges keeps showing its face outlines next to meshes that have some
    if (hasEdges) out.edges.push(...(m.edges ?? m.faces ?? []).map((e) => shift(e, vo)));
    if (hasUVs) out.uvs.push(...(m.uvs ?? []).map((t) => ({ u: t.u, v: t.v })));
    if (hasNormals) out.normals.push(...(m.normals ?? []).map((n) => ({ x: n.x, y: n.y, z: n.z })));

    // Material names: this mesh's index k → the index of its name in the joined list
    const remap = names && m.materialNames
      ? m.materialNames.map((n) => (names.includes(n) ? names.indexOf(n) : names.push(n) - 1))
      : null;

    (m.faces ?? []).forEach((f, fi) => {
      out.faces.push(shift(f, vo));
      if (hasUVs) {
        const fu = m.uvs && m.faceUVs?.[fi];
        out.faceUVs.push(fu ? shift(fu, uo) : null);
      }
      if (hasNormals) {
        const fn = m.normals && m.faceNormals?.[fi];
        out.faceNormals.push(fn ? shift(fn, no) : null);
      }
      if (hasMats) {
        const k = m.faceMaterials?.[fi] ?? 0;
        out.faceMaterials.push(materialPerMesh ? mi : remap ? (remap[k] ?? 0) : k);
      }
    });
  });

  if (names) out.materialNames = names;
  return out;
}

/**
 * The box around one or more meshes: `min` and `max` corners, plus its
 * `center` and `size`. Scene objects (and a whole Scene) are measured where
 * they stand, with their transform.
 *
 * @example
 * const { center, size } = meshBounds(scene);
 * orbit.target = center;
 * orbit.distance = Math.max(size.x, size.y, size.z) * 2;
 *
 * @param {Object|Object[]} input - A mesh, a scene object, a list of them, or a Scene
 * @returns {{ min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number},
 *   center:{x:number,y:number,z:number}, size:{x:number,y:number,z:number} } | null}
 *   null when there are no vertices
 */
export function meshBounds(input) {
  const items = Array.isArray(input) ? input : Array.isArray(input?.objects) ? input.objects : [input];
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let any = false;
  for (const it of items) {
    const mesh = it?.mesh ?? it;
    if (!mesh?.vertices) continue;
    const placed = it.mesh ? fullTransform(it) : null;
    for (const v of mesh.vertices) {
      const p = placed ? localToWorld(v, placed) : v;
      any = true;
      if (p.x < min.x) min.x = p.x;
      if (p.y < min.y) min.y = p.y;
      if (p.z < min.z) min.z = p.z;
      if (p.x > max.x) max.x = p.x;
      if (p.y > max.y) max.y = p.y;
      if (p.z > max.z) max.z = p.z;
    }
  }
  if (!any) return null;
  return {
    min, max,
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
  };
}
