/**
 * Placing objects against other objects, like snapping in Blender: drop an
 * object onto another until their surfaces touch, attach it to the nearest
 * surface (turned to follow it), and align or spread out objects by their
 * boxes.
 *
 * Everything works in world space, through groups: an object inside a
 * group is moved in its parent's space so it ends up where asked in the
 * world. Objects inside groups need their `parent` set (`scene.add` does
 * it). These functions move the object in place (its `pos`, and `rot` for
 * `attachTo`); meshes are never changed.
 *
 * Targets are a Scene, an object, or a list of objects: each visible object
 * with faces under them counts, except the object being placed and its
 * children.
 */
import { bake, mergeMeshes, meshBounds } from "../render/meshUtils.js";
import { meshQuery, isClosed } from "./query.js";
import { forEachPlaced, worldMatrix, worldPosition } from "../sceneGraph.js";
import { invertMat4, transformPoint, transformDirection, normalMatrix, transformNormal, mat4FromTransform } from "../math/matrix.js";
import { matFromEuler, eulerFromMat, matFromAxisAngle, mulMat, mulVec } from "../math/rotation.js";
import { vec, add, sub, mul, dot, cross, norm } from "./vec.js";

const AXES = ["x", "y", "z"];
const DOWN = vec(0, -1, 0);

const rootsOf = (input) => (Array.isArray(input) ? input : Array.isArray(input?.objects) ? input.objects : input ? [input] : []);

/** World copies of the meshes (with faces) under some objects, each with the object it belongs to; `skip` and its children left out. */
function placedMeshes(input, skip = null) {
  const out = [];
  const skipped = new Set();
  forEachPlaced(rootsOf(input), (root) => (root.parent ? worldMatrix(root.parent) : null), (obj, world, parent) => {
    if (obj === skip || skipped.has(parent)) {
      skipped.add(obj);
      return;
    }
    const m = obj.mesh;
    if (Array.isArray(m?.vertices) && m.vertices.length && m.faces?.length) out.push({ object: obj, mesh: bake(m, world) });
  });
  return out;
}

/** Moves an object by a world-space offset (in its parent's space when it has one). */
function moveBy(obj, delta) {
  const d = obj.parent ? transformDirection(invertMat4(worldMatrix(obj.parent)), delta) : delta;
  obj.pos ??= vec();
  obj.pos.x = (obj.pos.x ?? 0) + d.x;
  obj.pos.y = (obj.pos.y ?? 0) + d.y;
  obj.pos.z = (obj.pos.z ?? 0) + d.z;
}

/** Largest side of the box around some meshes. */
function sizeOf(meshes) {
  const b = meshBounds(meshes);
  return b ? Math.max(b.size.x, b.size.y, b.size.z) : 0;
}

/** Each face side once, as [i, j]. */
function edgesOf(mesh) {
  const seen = new Set(), out = [];
  for (const f of mesh.faces) {
    for (let k = 0; k < f.length; k++) {
      const i = f[k], j = f[(k + 1) % f.length];
      if (i === j) continue;
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, j]);
    }
  }
  return out;
}

/** Two unit directions across `a`, perpendicular to it and to each other. */
function across(a) {
  const u = norm(cross(a, Math.abs(a.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0)));
  return [u, cross(a, u)];
}

/**
 * A mesh ready for placing: its world copy, a query, its face sides and its box.
 */
function prepared(mesh) {
  return { mesh, q: meshQuery(mesh), edges: edgesOf(mesh), box: meshBounds(mesh) };
}

/**
 * How far mesh A, first moved back by `shift` against the unit direction
 * `a`, can move along `a` before it touches mesh B, and where: its points
 * against B's faces, B's points against its faces, and edges crossing
 * edges (the first touch of two flat-faced shapes is always one of these).
 * Null when it never does. Only the parts of B in A's way are looked at.
 */
function sweepDistance(PA, PB, a, eps, shift) {
  const A = PA.mesh, B = PB.mesh, qA = PA.q, qB = PB.q;
  const [u, v] = across(a);
  // A's shadow on the plane across `a`: B's points and edges outside it can't be met
  let sh = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of A.vertices) {
    const x = dot(p, u), y = dot(p, v);
    sh = { x0: Math.min(sh.x0, x), y0: Math.min(sh.y0, y), x1: Math.max(sh.x1, x), y1: Math.max(sh.y1, y) };
  }
  const pad = eps * 10;
  const inShadow = (x, y) => x >= sh.x0 - pad && x <= sh.x1 + pad && y >= sh.y0 - pad && y <= sh.y1 + pad;

  let best = Infinity, point = null;
  const start = mul(a, shift + eps);
  // A's points moving toward B's faces; rays start a hair back, so points already touching count
  for (const p of A.vertices) {
    const h = qB.raycast(sub(p, start), a, { maxDistance: best + eps });
    if (h && h.distance - eps < best) {
      best = h.distance - eps;
      point = h.point;
    }
  }
  // B's points meeting A's faces: the same move, seen from B
  const back = mul(a, -1);
  for (const q of B.vertices) {
    if (!inShadow(dot(q, u), dot(q, v))) continue;
    const h = qA.raycast(add(q, start), back, { maxDistance: best + eps });
    if (h && h.distance - eps < best) {
      best = h.distance - eps;
      point = { ...q };
    }
  }

  // Edges: seen along `a`, an edge of A crossing an edge of B touches it after moving the height between them
  const flat = (mesh, dh) => mesh.vertices.map((p) => ({ x: dot(p, u), y: dot(p, v), h: dot(p, a) + dh }));
  const fa = flat(A, -shift), fb = flat(B, 0);
  const ea = PA.edges;
  const eb = PB.edges.filter(([i, j]) => {
    const p = fb[i], q = fb[j];
    return Math.max(p.x, q.x) >= sh.x0 - pad && Math.min(p.x, q.x) <= sh.x1 + pad
      && Math.max(p.y, q.y) >= sh.y0 - pad && Math.min(p.y, q.y) <= sh.y1 + pad;
  });
  if (ea.length && eb.length) {
    // B's edges in a grid over the plane across `a`, so each edge of A only meets the ones nearby
    let lo = { x: Infinity, y: Infinity }, hi = { x: -Infinity, y: -Infinity }, total = 0;
    for (const [i, j] of eb) {
      const p = fb[i], q = fb[j];
      lo = { x: Math.min(lo.x, p.x, q.x), y: Math.min(lo.y, p.y, q.y) };
      hi = { x: Math.max(hi.x, p.x, q.x), y: Math.max(hi.y, p.y, q.y) };
      total += Math.hypot(q.x - p.x, q.y - p.y);
    }
    const extent = Math.max(hi.x - lo.x, hi.y - lo.y);
    const cell = Math.max(total / eb.length, extent / 256, eps);
    const cellOf = (x) => Math.floor(x / cell);
    const grid = new Map();
    eb.forEach(([i, j], n) => {
      const p = fb[i], q = fb[j];
      for (let cx = cellOf(Math.min(p.x, q.x)); cx <= cellOf(Math.max(p.x, q.x)); cx++) {
        for (let cy = cellOf(Math.min(p.y, q.y)); cy <= cellOf(Math.max(p.y, q.y)); cy++) {
          const key = `${cx},${cy}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(n);
        }
      }
    });
    const stamp = new Int32Array(eb.length).fill(-1);
    ea.forEach(([i, j], m) => {
      const p0 = fa[i], p1 = fa[j];
      const rx = p1.x - p0.x, ry = p1.y - p0.y;
      for (let cx = cellOf(Math.min(p0.x, p1.x)); cx <= cellOf(Math.max(p0.x, p1.x)); cx++) {
        for (let cy = cellOf(Math.min(p0.y, p1.y)); cy <= cellOf(Math.max(p0.y, p1.y)); cy++) {
          for (const n of grid.get(`${cx},${cy}`) ?? []) {
            if (stamp[n] === m) continue;
            stamp[n] = m;
            const q0 = fb[eb[n][0]], q1 = fb[eb[n][1]];
            const sx = q1.x - q0.x, sy = q1.y - q0.y;
            const den = rx * sy - ry * sx;
            // Parallel edges touch at a point too, and that point is a corner: the rays found it
            if (Math.abs(den) < 1e-12 * (Math.hypot(rx, ry) * Math.hypot(sx, sy) || 1)) continue;
            const wx = q0.x - p0.x, wy = q0.y - p0.y;
            const s = (wx * sy - wy * sx) / den, w = (wx * ry - wy * rx) / den;
            if (s < 0 || s > 1 || w < 0 || w > 1) continue;
            const t = q0.h + (q1.h - q0.h) * w - (p0.h + (p1.h - p0.h) * s);
            if (t >= -eps && t < best) {
              best = t;
              const b0 = B.vertices[eb[n][0]], b1 = B.vertices[eb[n][1]];
              point = add(b0, mul(sub(b1, b0), w));
            }
          }
        }
      }
    });
  }
  return Number.isFinite(best) ? { t: Math.max(0, best), point } : null;
}

/** Whether two meshes' surfaces cross (an edge of one goes through a face of the other), or one is inside the other. Touching isn't crossing. */
function overlapping(PA, PB, eps) {
  const A = PA.mesh, B = PB.mesh, qA = PA.q, qB = PB.q;
  const ba = PA.box, bb = PB.box;
  for (const k of ["x", "y", "z"]) if (ba.max[k] < bb.min[k] - eps || bb.max[k] < ba.min[k] - eps) return false;
  const crosses = (M, edges, q) => edges.some(([i, j]) => {
    const p = M.vertices[i], d = sub(M.vertices[j], p);
    const len = Math.hypot(d.x, d.y, d.z);
    if (!(len > eps * 2)) return false;
    const h = q.raycast(p, d, { maxDistance: len - eps });
    return !!h && h.distance > eps;
  });
  if (crosses(A, PA.edges, qB) || crosses(B, PB.edges, qA)) return true;
  // One inside the other: a point of it clearly off the other's surface, inside
  const inside = (M, q, other) => {
    const p = M.vertices.find((v) => q.distance(v, eps * 4) > eps * 2);
    return !!p && q.contains(p) && isClosed(other);
  };
  return inside(A, qB, B) || inside(B, qA, A);
}

/**
 * Moves an object along `direction` (default: down) until its surface
 * touches a target's: a cup onto a table, a rock onto terrain, a box
 * pushed against a wall. The contact is exact for flat-faced meshes
 * (corners and edges included), so nothing floats and nothing sinks.
 *
 * If the object is already sunk into a target, it's lifted back out
 * (against `direction`) and set on top. `gap` stops it that far before
 * touching. Nothing moves when nothing is in the way (within
 * `maxDistance`).
 *
 * @example
 * dropOnto(cup, table);                                           // rests on the table
 * dropOnto(crate, scene, { direction: { x: 1, y: 0, z: 0 } });     // pushed against what's on its right
 *
 * @param {Object} obj - The object to move (with its children)
 * @param {Object|Object[]} targets - A Scene, an object or a list of objects
 * @param {{ direction?: {x:number,y:number,z:number}, gap?: number, maxDistance?: number }} [opts]
 * @returns {{ distance: number, point: {x:number,y:number,z:number}, object: Object } | null}
 *   How far it moved along `direction` (negative when lifted out), where it
 *   touches and what; null when nothing is in the way
 */
export function dropOnto(obj, targets, { direction = DOWN, gap = 0, maxDistance = Infinity } = {}) {
  const a = norm(direction ?? DOWN);
  if (!a) throw new Error("dropOnto: direction can't be zero");
  const parts = placedMeshes(obj);
  if (!parts.length) return null;
  const A = parts.length === 1 ? parts[0].mesh : mergeMeshes(parts.map((p) => p.mesh));
  const fixed = placedMeshes(targets, obj);
  const eps = (sizeOf([A, ...fixed.map((f) => f.mesh)]) || 1) * 1e-7;
  const PA = prepared(A);

  let best = null;
  for (const { object, mesh: B } of fixed) {
    const PB = prepared(B);
    let lift = 0;
    if (overlapping(PA, PB, eps)) {
      // Start from where it's clear of B along the direction
      let lead = -Infinity, back = Infinity;
      for (const p of A.vertices) lead = Math.max(lead, dot(p, a));
      for (const q of B.vertices) back = Math.min(back, dot(q, a));
      lift = Math.max(0, lead - back) + eps * 10;
    }
    const hit = sweepDistance(PA, PB, a, eps, lift);
    if (!hit) continue;
    const t = hit.t - lift;
    if (!best || t < best.t) best = { t, point: hit.point, object };
  }
  if (!best || best.t > maxDistance) return null;
  const distance = best.t - (Number.isFinite(gap) ? gap : 0);
  moveBy(obj, mul(a, distance));
  return { distance, point: best.point, object: best.object };
}

/** "y", "-x"...: the axis and its sign. */
function parseAxis(axis) {
  const m = /^([+-]?)([xyz])$/.exec(String(axis));
  if (!m) throw new Error(`Unknown axis "${axis}": use "x", "y", "z", "-x", "-y" or "-z"`);
  return { name: m[2], sign: m[1] === "-" ? -1 : 1 };
}

/** The box around an object and its children, in the object's own space (before its transform). */
function ownBounds(obj) {
  return meshBounds({ ...obj, pos: vec(), rot: vec(), scale: vec(1, 1, 1) });
}

/** The rotation matrix turning unit `from` onto unit `to`, the shortest way. */
function turnBetween(from, to) {
  const c = Math.max(-1, Math.min(1, dot(from, to)));
  const k = norm(cross(from, to));
  if (k) return matFromAxisAngle(k, Math.acos(c));
  if (c > 0) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // Opposite: half a turn around any axis across them
  return matFromAxisAngle(across(from)[0], Math.PI);
}

/**
 * Puts an object on the nearest surface of the targets: horns on a head,
 * a handle on a mug, a window on a wall, eyes on a face. The surface point
 * nearest to `at` (default: the object's position) is found, the object is
 * turned so its `axis` (default `"y"`, its up) points out of the surface
 * (`align: false` keeps its turn), and moved so its base touches that
 * point.
 *
 * The base is the middle of the side of its box that `axis` points away
 * from (the bottom, for `"y"`); `anchor: "origin"` uses its origin instead,
 * and a point uses that point (in the object's own space). `offset` moves
 * it out along the surface's normal (negative: sunk in, so a horn grows out
 * of the head instead of sitting on it).
 *
 * @example
 * // A horn grown out of the head, near where it was roughly placed
 * attachTo(horn, head, { offset: -0.02 });
 * // An eye on the face, facing out: its local z points along the surface
 * attachTo(eye, head, { at: { x: 0.1, y: 0.2, z: 0.5 }, axis: "z" });
 *
 * @param {Object} obj - The object to move and turn (with its children)
 * @param {Object|Object[]} targets - A Scene, an object or a list of objects
 * @param {{ at?: {x:number,y:number,z:number}, axis?: string, align?: boolean, anchor?: "base"|"origin"|{x:number,y:number,z:number}, offset?: number }} [opts]
 * @returns {{ point: {x:number,y:number,z:number}, normal: {x:number,y:number,z:number}, object: Object, distance: number } | null}
 *   The surface point, its normal, the object it belongs to and how far it
 *   was from `at`; null when there's no surface
 */
export function attachTo(obj, targets, { at, axis = "y", align = true, anchor = "base", offset = 0 } = {}) {
  const { name, sign } = parseAxis(axis);
  const from = at ?? worldPosition(obj);
  let best = null;
  for (const { object, mesh } of placedMeshes(targets, obj)) {
    const c = meshQuery(mesh).closest(from, { maxDistance: best ? best.distance : Infinity });
    if (c && (!best || c.distance < best.distance)) best = { point: c.point, normal: c.normal, object, distance: c.distance };
  }
  if (!best) return null;

  const toParent = obj.parent ? invertMat4(worldMatrix(obj.parent)) : null;
  obj.pos ??= vec();
  obj.rot ??= vec();
  obj.scale ??= vec(1, 1, 1);
  if (align) {
    const n = toParent ? transformNormal(normalMatrix(toParent), best.normal) : best.normal;
    const R = matFromEuler({ ...vec(), ...obj.rot });
    // Where the axis points now (a mirrored axis points the other way)
    const flip = sign * Math.sign(obj.scale[name] || 1);
    const now = norm(mul(mulVec(R, { ...vec(), [name]: 1 }), flip));
    Object.assign(obj.rot, eulerFromMat(mulMat(turnBetween(now, n), R)));
  }

  let local = vec();
  if (anchor && typeof anchor === "object") local = { ...vec(), ...anchor };
  else if (anchor !== "origin") {
    const b = ownBounds(obj);
    if (b) local = { ...b.center, [name]: sign > 0 ? b.min[name] : b.max[name] };
  }
  const goal = add(best.point, mul(best.normal, Number.isFinite(offset) ? offset : 0));
  const goalHere = toParent ? transformPoint(toParent, goal) : goal;
  const anchorHere = transformPoint(mat4FromTransform(obj), local);
  const d = sub(goalHere, anchorHere);
  obj.pos.x += d.x;
  obj.pos.y += d.y;
  obj.pos.z += d.z;
  return best;
}

/** An object's box in the world, or a point box at its position when it has no mesh. */
function worldBox(obj) {
  const b = meshBounds(obj);
  if (b) return b;
  const p = worldPosition(obj);
  return { min: p, max: p, center: p, size: vec() };
}

const SIDES = ["min", "center", "max"];

/**
 * Lines objects up by their boxes along one or more axes, like Blender's
 * Align: `to: "min"` (default) puts their low sides level (the bottoms, for
 * `"y"`), `"center"` their middles, `"max"` their high sides. They line up
 * with `reference`: a number (a world coordinate), an object (its box), or
 * by default the box around all of them.
 *
 * @example
 * alignObjects(legs, { axis: "y", to: "min" });                      // all legs on the same floor
 * alignObjects([lamp, vase], { axis: ["x", "z"], to: "center", reference: table }); // centered on the table
 *
 * @param {Object[]} objects
 * @param {{ axis?: "x"|"y"|"z"|("x"|"y"|"z")[], to?: "min"|"center"|"max", reference?: number|Object }} [opts]
 * @returns {Object[]} The same objects
 */
export function alignObjects(objects, { axis = "y", to = "min", reference } = {}) {
  if (!SIDES.includes(to)) throw new Error(`Unknown side "${to}": use "min", "center" or "max"`);
  for (const ax of Array.isArray(axis) ? axis : [axis]) {
    if (!AXES.includes(ax)) throw new Error(`Unknown axis "${ax}": use "x", "y" or "z"`);
    const boxes = objects.map(worldBox);
    let value;
    if (typeof reference === "number") value = reference;
    else if (reference && typeof reference === "object") value = worldBox(reference)[to][ax];
    else {
      if (!boxes.length) return objects;
      const lo = Math.min(...boxes.map((b) => b.min[ax])), hi = Math.max(...boxes.map((b) => b.max[ax]));
      value = to === "min" ? lo : to === "max" ? hi : (lo + hi) / 2;
    }
    objects.forEach((obj, i) => {
      const d = value - boxes[i][to][ax];
      if (d) moveBy(obj, { ...vec(), [ax]: d });
    });
  }
  return objects;
}

/**
 * Spreads objects out along an axis by their boxes, in the order they're
 * already in along it. Without `gap`, the first and last stay and the ones
 * between are moved so the spaces between neighbors are all the same. With
 * `gap`, the first stays and each next one starts `gap` after the one
 * before ends (0: touching), so the row grows or shrinks.
 *
 * @example
 * distributeObjects(books, { axis: "x", gap: 0 });     // side by side on the shelf
 * distributeObjects(posts, { axis: "z" });             // evenly spaced between the end posts
 *
 * @param {Object[]} objects
 * @param {{ axis?: "x"|"y"|"z", gap?: number }} [opts]
 * @returns {Object[]} The same objects
 */
export function distributeObjects(objects, { axis = "x", gap } = {}) {
  if (!AXES.includes(axis)) throw new Error(`Unknown axis "${axis}": use "x", "y" or "z"`);
  const items = objects.map((obj) => ({ obj, box: worldBox(obj) })).sort((p, q) => p.box.center[axis] - q.box.center[axis]);
  if (items.length < 2) return objects;
  const fixed = Number.isFinite(gap);
  if (!fixed && items.length < 3) return objects;
  const first = items[0].box, last = items[items.length - 1].box;
  let space = gap;
  if (!fixed) {
    const sizes = items.reduce((s, it) => s + it.box.size[axis], 0);
    space = (last.max[axis] - first.min[axis] - sizes) / (items.length - 1);
  }
  let cursor = first.max[axis];
  for (const { obj, box } of items.slice(1, fixed ? items.length : -1)) {
    const d = cursor + space - box.min[axis];
    if (d) moveBy(obj, { ...vec(), [axis]: d });
    cursor += space + box.size[axis];
  }
  return objects;
}
