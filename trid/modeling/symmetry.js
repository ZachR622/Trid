/**
 * Symmetry and repeats, like Blender's Mirror and Array modifiers: mirror a
 * mesh across a plane (welded at the seam), cut it in half, symmetrize it,
 * and repeat it in a line, a spiral or around an axis. The same for scene
 * objects, whose copies keep sharing their mesh and material.
 *
 * A plane is an `axis` ("x", "y" or "z": the plane where that coordinate is
 * constant) or any `normal`, through `center` (default: the origin, so a
 * mesh mirrors across its own origin, and an object across its parent's).
 *
 * Everything here returns new meshes or objects; the input isn't changed.
 */
import { bake, cloneMesh, mergeMeshes, meshBounds } from "../render/meshUtils.js";
import { cleanMesh, weldVertices } from "./cleanup.js";
import { matFromEuler, eulerFromMat, mulMat, mulVec } from "../math/rotation.js";
import { mulMat4, transformPoint } from "../math/matrix.js";
import { vec, add, sub, mul, dot, norm } from "./vec.js";

const AXES = ["x", "y", "z"];
const UNIT = { x: vec(1, 0, 0), y: vec(0, 1, 0), z: vec(0, 0, 1) };
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const TURN = Math.PI * 2;

/** The plane of `opts`: unit normal `n`, a point `c` on it, and `d(p)`: how far p is in front of it. */
function planeOf({ axis = "x", normal, center } = {}) {
  let n;
  if (normal) {
    n = norm(normal);
    if (!n) throw new Error("The plane's normal has no length");
  } else {
    if (!AXES.includes(axis)) throw new Error(`Unknown axis "${axis}": use "x", "y" or "z"`);
    n = UNIT[axis];
  }
  const c = { ...vec(), ...(center ?? {}) };
  return { n, c, d: (p) => dot(sub(p, c), n) };
}

/** `p` reflected across the plane. */
const reflect = (plane, p) => sub(p, mul(plane.n, 2 * plane.d(p)));

/** How close counts as on the plane / at the same place: `weld` itself, or a hundred-thousandth of the mesh's size. */
function closeness(weld, mesh) {
  if (!weld) return 0;
  if (typeof weld === "number" && weld > 0) return weld;
  const b = meshBounds(mesh);
  return (b ? Math.max(b.size.x, b.size.y, b.size.z) : 0) * 1e-5 || 1e-5;
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/**
 * Cuts a mesh along a plane and keeps one side: `keep: "+"` (default) the
 * side the normal points to, `"-"` the other. Faces crossing the plane are
 * cut, with texture coordinates and normals carried over, and the cut is
 * left open (like Blender's Bisect). Faces are assumed flat and convex,
 * like the ones the renderers draw.
 *
 * Points closer to the plane than `distance` (default: a hundred-thousandth
 * of the mesh's size) are moved onto it.
 *
 * @example
 * // The top half of a sphere: a dome
 * const dome = bisectMesh(makeShape("sphere"), { axis: "y" });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ axis?: "x"|"y"|"z", normal?: {x:number,y:number,z:number}, center?: {x?:number,y?:number,z?:number}, keep?: "+"|"-", distance?: number }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function bisectMesh(mesh, opts = {}) {
  const plane = planeOf(opts);
  const s = opts.keep === "-" ? -1 : 1;
  const eps = closeness(opts.distance ?? true, mesh);
  const out = cloneMesh(mesh);
  const vs = out.vertices;
  // Signed distance on the kept side (> 0 = kept); points near the plane are put on it
  const d = vs.map((v) => s * plane.d(v));
  vs.forEach((v, i) => {
    if (Math.abs(d[i]) > eps) return;
    Object.assign(v, sub(v, mul(plane.n, s * d[i])));
    d[i] = 0;
  });
  const crosses = (a, b) => (d[a] > 0 && d[b] < 0) || (d[a] < 0 && d[b] > 0);

  // Where an edge a–b crosses the plane: one new vertex per edge, shared by the faces and edges around it
  const cuts = new Map();
  const at = (cache, key, make) => {
    let i = cache.get(key);
    if (i === undefined) cache.set(key, (i = make()));
    return i;
  };
  const tOf = (a, b) => d[a] / (d[a] - d[b]);
  const cutVertex = (a, b) => {
    if (a > b) [a, b] = [b, a];
    return at(cuts, `${a},${b}`, () => vs.push(lerp(vs[a], vs[b], tOf(a, b))) - 1);
  };
  const uvCuts = new Map(), normalCuts = new Map();
  /** The corner where the edge from corner p to corner q crosses the plane. */
  const cut = (p, q) => {
    const [a, b] = p.v < q.v ? [p, q] : [q, p];
    const t = tOf(a.v, b.v);
    const c = { v: cutVertex(a.v, b.v) };
    if (a.uv !== undefined && b.uv !== undefined) {
      c.uv = at(uvCuts, `${a.v},${b.v},${a.uv},${b.uv}`, () => {
        const u = out.uvs[a.uv], w = out.uvs[b.uv];
        return out.uvs.push({ u: u.u + (w.u - u.u) * t, v: u.v + (w.v - u.v) * t }) - 1;
      });
    }
    if (a.n !== undefined && b.n !== undefined) {
      c.n = at(normalCuts, `${a.v},${b.v},${a.n},${b.n}`, () =>
        out.normals.push(norm(lerp(out.normals[a.n], out.normals[b.n], t), out.normals[a.n])) - 1);
    }
    return c;
  };

  if (out.faces) {
    const faces = [], faceUVs = [], faceNormals = [], faceMaterials = [];
    out.faces.forEach((f, fi) => {
      const fu = out.uvs && out.faceUVs?.[fi], fn = out.normals && out.faceNormals?.[fi];
      const corners = f.map((v, k) => ({ v, uv: fu?.[k], n: fn?.[k] }));
      // Sutherland–Hodgman: walk around the face, keeping corners on the kept side and adding the crossings
      const kept = [];
      corners.forEach((p, k) => {
        const q = corners[(k + 1) % corners.length];
        if (d[p.v] >= 0) kept.push(p);
        if (crosses(p.v, q.v)) kept.push(cut(p, q));
      });
      if (kept.length < 3) return;
      faces.push(kept.map((c) => c.v));
      faceUVs.push(fu ? kept.map((c) => c.uv) : null);
      faceNormals.push(fn ? kept.map((c) => c.n) : null);
      faceMaterials.push(out.faceMaterials?.[fi] ?? 0);
    });
    out.faces = faces;
    if (out.faceUVs) out.faceUVs = faceUVs;
    if (out.faceNormals) out.faceNormals = faceNormals;
    if (out.faceMaterials) out.faceMaterials = faceMaterials;
  }

  if (out.edges) {
    // An edge of 3 or more points is a closed loop: kept whole when it's all on the kept side, otherwise cut segment by segment
    const edges = [];
    for (const e of out.edges) {
      if (e.every((v) => d[v] >= 0)) {
        edges.push(e);
        continue;
      }
      const segments = e.length === 2 ? [e] : e.map((v, k) => [v, e[(k + 1) % e.length]]);
      for (const [a, b] of segments) {
        if (crosses(a, b)) edges.push(d[a] > 0 ? [a, cutVertex(a, b)] : [cutVertex(a, b), b]);
        else if (d[a] >= 0 && d[b] >= 0) edges.push([a, b]);
      }
    }
    out.edges = edges;
  }
  return cleanMesh(out);
}

/**
 * Mirrors a mesh across a plane and keeps both halves, like Blender's Mirror
 * modifier: model one side, get the whole. With `weld` (on by default),
 * points on the plane are shared by both halves, so the seam is closed and
 * smooth, and faces lying on the plane (now inside) are removed. `weld` can
 * be a distance (default: a hundred-thousandth of the mesh's size).
 *
 * `bisect` first cuts away what's on the other side of the plane (`keep`
 * picks the side), so the result is exactly symmetric: see `symmetrizeMesh`.
 * A list of axes mirrors across each in turn: `["x", "z"]` gives 4 copies.
 *
 * The mirrored half has the same texture coordinates (the texture is
 * mirrored too) and materials.
 *
 * @example
 * // A chair: model the left legs, get all four
 * const legs = mirrorMesh(leftLegs, { axis: "x" });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ axis?: "x"|"y"|"z"|("x"|"y"|"z")[], normal?: {x:number,y:number,z:number}, center?: {x?:number,y?:number,z?:number}, weld?: boolean|number, bisect?: boolean, keep?: "+"|"-" }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function mirrorMesh(mesh, opts = {}) {
  const { axis = "x", weld = true, bisect = false, keep = "+" } = opts;
  if (!opts.normal && Array.isArray(axis)) {
    return axis.reduce((m, a) => mirrorMesh(m, { ...opts, axis: a }), cloneMesh(mesh));
  }
  const plane = planeOf(opts);
  const eps = closeness(weld, mesh);
  const out = bisect ? bisectMesh(mesh, { ...opts, keep, distance: eps || undefined }) : cloneMesh(mesh);
  const vs = out.vertices;
  const count = vs.length;
  const on = vs.map((v) => eps > 0 && Math.abs(plane.d(v)) <= eps);
  // A flat mesh lying on the plane is its own mirror image
  if (on.every(Boolean)) return out;
  vs.forEach((v, i) => {
    if (on[i]) Object.assign(v, sub(v, mul(plane.n, plane.d(v))));
  });

  // Mirrored vertices; those on the plane stay shared
  const index = new Array(count);
  for (let i = 0; i < count; i++) index[i] = on[i] ? i : vs.push(reflect(plane, vs[i])) - 1;
  const normalCount = out.normals?.length ?? 0;
  if (out.normals) {
    for (let i = 0; i < normalCount; i++) {
      const n = out.normals[i];
      out.normals.push(sub(n, mul(plane.n, 2 * dot(n, plane.n))));
    }
  }

  if (out.faces) {
    // Faces on the plane end up between the two halves: inside
    const kept = out.faces.map((f) => !(eps > 0 && f.every((i) => on[i])));
    const pick = (list) => list.filter((_, fi) => kept[fi]);
    const faces = pick(out.faces);
    // A mirror turns clockwise faces counter-clockwise: reverse them, with their corner lists
    out.faces = [...faces, ...faces.map((f) => f.map((i) => index[i]).reverse())];
    if (out.faceUVs) {
      const list = pick(out.faceUVs);
      out.faceUVs = [...list, ...list.map((c) => (c ? [...c].reverse() : null))];
    }
    if (out.faceNormals) {
      const list = pick(out.faceNormals);
      out.faceNormals = [...list, ...list.map((c) => (c ? c.map((i) => i + normalCount).reverse() : null))];
    }
    if (out.faceMaterials) {
      const list = pick(out.faceMaterials);
      out.faceMaterials = [...list, ...list];
    }
  }
  if (out.edges) {
    const mirrored = out.edges.filter((e) => !e.every((i) => on[i])).map((e) => e.map((i) => index[i]));
    out.edges = [...out.edges, ...mirrored];
  }
  return out;
}

/**
 * Makes a mesh exactly symmetric: cuts it along the plane, then mirrors the
 * kept side (`keep: "+"`, default, the side the normal points to) over the
 * other, welded at the seam. Like Blender's Symmetrize. The same as
 * `mirrorMesh(mesh, { ...opts, bisect: true })`.
 *
 * @example
 * // A face sculpted on its right side, copied to the left
 * const head = symmetrizeMesh(sculpted, { axis: "x", keep: "+" });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ axis?: "x"|"y"|"z"|("x"|"y"|"z")[], normal?: {x:number,y:number,z:number}, center?: {x?:number,y?:number,z?:number}, weld?: boolean|number, keep?: "+"|"-" }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function symmetrizeMesh(mesh, opts = {}) {
  return mirrorMesh(mesh, { ...opts, bisect: true });
}

/** A 4×4 matrix (column-major) from a 3×3 one (row-major) and a move. */
const mat4 = (m, t) => [
  m[0][0], m[1][0], m[2][0], 0,
  m[0][1], m[1][1], m[2][1], 0,
  m[0][2], m[1][2], m[2][2], 0,
  t.x, t.y, t.z, 1,
];

/**
 * The step from one copy to the next, from array options: turn `rot`
 * (3×3) and scale `s` around `center`, then move by `move`. `size` is the
 * size of what's repeated, for `relative`.
 */
function stepOf({ offset, relative, rotate, scale, center }, size) {
  const none = offset === undefined && relative === undefined && rotate === undefined && scale === undefined;
  const rel = { ...vec(), ...(none ? { x: 1 } : relative) };
  const move = add({ ...vec(), ...offset }, { x: rel.x * size.x, y: rel.y * size.y, z: rel.z * size.z });
  const rot = rotate ? matFromEuler({ ...vec(), ...rotate }) : IDENTITY;
  const s = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const c = { ...vec(), ...center };
  // p' = c + s·R·(p - c) + move
  const m = rot.map((row) => row.map((x) => x * s));
  const matrix = mat4(m, add(sub(c, mulVec(m, c)), move));
  return { rot, s, matrix };
}

const countOf = (count, fallback) => (Number.isFinite(count) ? Math.max(1, Math.floor(count)) : fallback);

/** Each copy's matrix: the step applied 0, 1, 2... times. */
function powers(step, count) {
  const out = [mat4(IDENTITY, vec())];
  while (out.length < count) out.push(mulMat4(step, out[out.length - 1]));
  return out;
}

/** Removes faces two by two where one is the other turned around (the touching sides of welded copies). */
function dropFacePairs(mesh) {
  const keyOf = (f) => {
    let s = 0;
    for (let i = 1; i < f.length; i++) if (f[i] < f[s]) s = i;
    return f.slice(s).concat(f.slice(0, s)).join(",");
  };
  const open = new Map();
  const drop = new Set();
  mesh.faces.forEach((f, i) => {
    const facing = open.get(keyOf([...f].reverse()));
    if (facing?.length) {
      drop.add(facing.pop());
      drop.add(i);
      return;
    }
    const k = keyOf(f);
    if (!open.has(k)) open.set(k, []);
    open.get(k).push(i);
  });
  if (!drop.size) return mesh;
  for (const key of ["faces", "faceUVs", "faceNormals", "faceMaterials"]) {
    if (mesh[key]) mesh[key] = mesh[key].filter((_, i) => !drop.has(i));
  }
  return cleanMesh(mesh);
}

/** Copies of a mesh placed by `matrices`, joined into one; welded when asked. */
function joinCopies(mesh, matrices, weld) {
  const out = mergeMeshes(matrices.map((m) => bake(mesh, m)));
  if (!weld) return out;
  weldVertices(out, closeness(weld, mesh));
  return out.faces ? dropFacePairs(out) : out;
}

/**
 * Repeats a mesh, like Blender's Array modifier: `count` copies (default 2),
 * each one a step further than the one before. A step is:
 * - `relative`: a move in sizes of the mesh (`{ x: 1 }` = one width to the
 *   right, so the copies touch). This is the default when no step is given.
 * - `offset`: a move in units
 * - `rotate`: a turn (angles in radians, like an object's `rot`) and
 *   `scale`: a size factor, both around `center` (default: the origin)
 *
 * Together they make rows, stairs, spirals and shells. With `weld` (true or
 * a distance), copies that touch share their points, and the faces between
 * them are removed. The copies are joined into one mesh.
 *
 * @example
 * // A fence: 8 planks side by side, a bit apart
 * const fence = arrayMesh(plank, { count: 8, relative: { x: 1.2 } });
 * // A spiral staircase: each step a bit higher and turned
 * const stairs = arrayMesh(step, { count: 16, offset: { y: 0.2 }, rotate: { y: Math.PI / 8 } });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ count?: number, offset?: {x?:number,y?:number,z?:number}, relative?: {x?:number,y?:number,z?:number}, rotate?: {x?:number,y?:number,z?:number}, scale?: number, center?: {x?:number,y?:number,z?:number}, weld?: boolean|number }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function arrayMesh(mesh, opts = {}) {
  const size = meshBounds(mesh)?.size ?? vec();
  const { matrix } = stepOf(opts, size);
  return joinCopies(mesh, powers(matrix, countOf(opts.count, 2)), opts.weld);
}

/** Array options for `count` copies spread over `angle` around an axis. */
function radialStep({ count, axis = "y", angle = TURN, center }) {
  if (!AXES.includes(axis)) throw new Error(`Unknown axis "${axis}": use "x", "y" or "z"`);
  const n = countOf(count, 6);
  // A full turn would put the last copy on the first: spread over the turn; otherwise from end to end
  const full = Math.abs(Math.abs(angle) - TURN) < 1e-9;
  const step = n > 1 ? angle / (full ? n : n - 1) : 0;
  return { count: n, rotate: { [axis]: step }, center };
}

/**
 * `count` copies of a mesh (default 6) around an axis through `center`
 * (default: the origin): chair legs, wheel spokes, petals, gears, columns
 * around a temple. They're spread evenly over a full turn, or over `angle`
 * radians from the first copy to the last. They turn the same way as an
 * object's `rot`. With `weld`, copies that touch are joined (see `arrayMesh`).
 *
 * @example
 * // 5 petals around the flower's center
 * const flower = radialArrayMesh(petal, { count: 5, axis: "y" });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ count?: number, axis?: "x"|"y"|"z", angle?: number, center?: {x?:number,y?:number,z?:number}, weld?: boolean|number }} [opts]
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function radialArrayMesh(mesh, opts = {}) {
  const r = radialStep(opts);
  return arrayMesh(mesh, { ...r, weld: opts.weld });
}

/** A copy of an object and its children, with their own transforms; meshes and materials are shared. */
function copyObject(obj) {
  const out = {
    ...obj,
    pos: { ...vec(), ...obj.pos },
    rot: { ...vec(), ...obj.rot },
    scale: { x: 1, y: 1, z: 1, ...obj.scale },
  };
  if (Array.isArray(obj.children)) out.children = obj.children.map(copyObject);
  return out;
}

/**
 * A mirrored copy of a scene object: placed across the plane (in its
 * parent's space: the plane goes through the parent's origin by default)
 * and mirrored, by a negative scale on the local axis that points most
 * along the plane's normal. Its children come along (copied); meshes and
 * materials are shared with the original, so nothing is duplicated.
 *
 * @example
 * // The right arm from the left one
 * robot.children.push(mirrorObject(leftArm, { axis: "x" }));
 *
 * @template O
 * @param {O} obj - A scene object, added to a scene or not
 * @param {{ axis?: "x"|"y"|"z", normal?: {x:number,y:number,z:number}, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {O} A new object (not added to the scene)
 */
export function mirrorObject(obj, opts = {}) {
  const plane = planeOf(opts);
  const out = copyObject(obj);
  out.pos = reflect(plane, out.pos);
  const { x, y, z } = plane.n;
  const H = [
    [1 - 2 * x * x, -2 * x * y, -2 * x * z],
    [-2 * x * y, 1 - 2 * y * y, -2 * y * z],
    [-2 * x * z, -2 * y * z, 1 - 2 * z * z],
  ];
  const R = matFromEuler(out.rot);
  // H·R·S = (H·R·F)·(F·S), F flipping one local axis: H·R·F is a plain rotation, F·S a scale
  let a = 0;
  for (let k = 1; k < 3; k++) {
    const along = (j) => Math.abs(R[0][j] * x + R[1][j] * y + R[2][j] * z);
    if (along(k) > along(a)) a = k;
  }
  const turned = mulMat(H, R).map((row) => row.map((v, j) => (j === a ? -v : v)));
  out.rot = eulerFromMat(turned);
  out.scale[AXES[a]] = -out.scale[AXES[a]];
  return out;
}

/**
 * Copies of a scene object, like `arrayMesh` but as separate objects that
 * share the mesh and material: each can still be moved or hidden on its
 * own. The steps are the same (`relative` is in sizes of the object as it
 * stands in its parent), except that `scale` is a single factor. The first
 * copy is where the object is. Add them instead of the object, or next to
 * it without the first.
 *
 * @example
 * // A row of 5 columns, 2 units apart
 * scene.add({ children: arrayObject(column, { count: 5, offset: { x: 2 } }) });
 *
 * @template O
 * @param {O} obj - A scene object, added to a scene or not
 * @param {{ count?: number, offset?: {x?:number,y?:number,z?:number}, relative?: {x?:number,y?:number,z?:number}, rotate?: {x?:number,y?:number,z?:number}, scale?: number, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {O[]} New objects (not added to the scene)
 */
export function arrayObject(obj, opts = {}) {
  const size = meshBounds(copyObject(obj))?.size ?? vec();
  const { rot, s, matrix } = stepOf(opts, size);
  const R = matFromEuler({ ...vec(), ...obj.rot });
  let turn = IDENTITY, k = 1;
  return powers(matrix, countOf(opts.count, 2)).map((m, i) => {
    const out = copyObject(obj);
    if (i > 0) {
      turn = mulMat(rot, turn);
      k *= s;
    }
    out.pos = transformPoint(m, out.pos);
    out.rot = eulerFromMat(mulMat(turn, R));
    out.scale = mul(out.scale, k);
    return out;
  });
}

/**
 * `count` copies of a scene object (default 6) around an axis, like
 * `radialArrayMesh` but as separate objects sharing the mesh and material.
 * The axis goes through `center` in the object's parent's space (default:
 * the parent's origin). The first copy is where the object is.
 *
 * @example
 * // Four legs around the middle of a round table
 * table.children.push(...radialArrayObject(leg, { count: 4, axis: "y" }));
 *
 * @template O
 * @param {O} obj - A scene object, added to a scene or not
 * @param {{ count?: number, axis?: "x"|"y"|"z", angle?: number, center?: {x?:number,y?:number,z?:number} }} [opts]
 * @returns {O[]} New objects (not added to the scene)
 */
export function radialArrayObject(obj, opts = {}) {
  return arrayObject(obj, radialStep(opts));
}
