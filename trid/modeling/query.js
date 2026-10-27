/**
 * Questions about a mesh's surface, asked in code: where a ray first meets
 * it, whether a point is inside it, how far a point is from it, and whether
 * it's closed. Also the same ray question against a whole scene.
 *
 *   const q = meshQuery(body);                 // prepared once (a BVH)
 *   const hit = q.raycast(from, { x: 0, y: 0, z: 1 });
 *   q.contains(p); q.distance(p); q.closest(p);
 *
 * A query is a snapshot: it copies the mesh's triangles when it's made, so
 * editing the mesh afterwards doesn't change its answers. Make a new one.
 *
 * Faces are clockwise from outside (like the built-in shapes), so normals
 * here point out of the mesh, whichever side a ray comes from.
 */
import { invertMat4, determinantMat4, transformPoint, transformDirection, normalMatrix, transformNormal } from "../math/matrix.js";
import { worldObjects, ancestors } from "../sceneGraph.js";
import { isPickable } from "../tools/helpers.js";
import { samePlace } from "./cleanup.js";

/** Most triangles in a BVH leaf */
const LEAF = 4;
/** Bins per split when building the BVH (surface area heuristic) */
const BINS = 12;

const SIDES = ["both", "front", "back"];

/** Odd-looking directions, so rays rarely run exactly along edges (for `contains`) */
const PROBES = [
  [0.5383, 0.6412, 0.5468], [-0.7071, 0.1934, 0.6797], [0.2311, -0.8417, -0.4878],
  [-0.3122, -0.4519, 0.8357], [0.8829, -0.2711, 0.3833], [-0.5867, 0.7713, -0.2467],
  [0.1471, 0.3378, -0.9296],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
});

const finite = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

function checkPoint(p, what) {
  if (!finite(p)) throw new Error(`${what} must be a point { x, y, z } of finite numbers`);
}

function unitDirection(d) {
  const l = finite(d) ? Math.hypot(d.x, d.y, d.z) : NaN;
  if (!(l > 0) || !Number.isFinite(l)) throw new Error("A ray needs a direction { x, y, z } that isn't zero");
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}

function checkSide(side) {
  if (!SIDES.includes(side)) throw new Error(`Unknown side "${side}": use "both", "front" or "back"`);
}

/**
 * Prepares a mesh for many questions: splits its faces into triangles (fans
 * from each face's first corner, like `pickHit`) and builds a bounding volume
 * hierarchy (boxes inside boxes) so each question only looks at the few
 * triangles near it. Making it costs about as much as one slow question.
 *
 * @param {Object} mesh - A mesh with `vertices` and `faces`
 * @returns {MeshQuery}
 */
export function meshQuery(mesh) {
  return new MeshQuery(mesh);
}

class MeshQuery {
  constructor(mesh) {
    const v = mesh?.vertices ?? [];
    const corners = [], faceOf = [];
    (mesh?.faces ?? []).forEach((f, fi) => {
      if (!Array.isArray(f)) return;
      for (let i = 1; i + 1 < f.length; i++) {
        if (!finite(v[f[0]]) || !finite(v[f[i]]) || !finite(v[f[i + 1]])) continue;
        corners.push(f[0], f[i], f[i + 1]);
        faceOf.push(fi);
      }
    });
    const n = faceOf.length;
    const tris = new Float64Array(n * 9);
    for (let t = 0; t < n; t++) {
      for (let k = 0; k < 3; k++) {
        const p = v[corners[t * 3 + k]];
        tris[t * 9 + k * 3] = p.x;
        tris[t * 9 + k * 3 + 1] = p.y;
        tris[t * 9 + k * 3 + 2] = p.z;
      }
    }
    /** Triangles, 9 numbers each (in BVH order after building) */
    this._tris = tris;
    this._corners = Int32Array.from(corners);
    this._faceOf = Int32Array.from(faceOf);
    /** Number of triangles */
    this.triangleCount = n;
    buildBVH(this);

    const b = this._box;
    this.bounds = n
      ? { min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] } }
      : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    const size = n ? Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) || 1 : 1;
    // Tolerances relative to the mesh's size
    this._minDist = size * 1e-9;
    this._detEps = size * size * 1e-14;
    this._edgeEps = 1e-7;
    this._hit = { t: 0, tri: -1, u: 0, w: 0 };
    this._near = new Float64Array(5);
  }

  /**
   * The first place a ray meets the surface, or null.
   *
   * @param {Vec3} origin
   * @param {Vec3} direction - Any length but zero
   * @param {{maxDistance?:number, side?:"both"|"front"|"back"}} [opts]
   *   `side`: "front" only counts faces hit from outside, "back" from inside
   * @returns {{point, normal, distance, face, front, triangle, barycentric} | null}
   */
  raycast(origin, direction, { maxDistance = Infinity, side = "both" } = {}) {
    checkPoint(origin, "raycast: origin");
    checkSide(side);
    const d = unitDirection(direction);
    if (!this._cast(origin, d, maxDistance, side)) return null;
    const { t, tri, u, w } = this._hit;
    return this._describe(tri, u, w, { x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t }, t, d);
  }

  /**
   * Whether a point is inside. Only meaningful for a closed mesh (see
   * `isClosed`). Rays are sent in a few directions and their crossings
   * counted; rays that pass too close to an edge are ignored.
   *
   * @param {Vec3} p
   * @returns {boolean}
   */
  contains(p) {
    checkPoint(p, "contains: the point");
    const b = this._box;
    if (!this.triangleCount || p.x < b[0] || p.y < b[1] || p.z < b[2] || p.x > b[3] || p.y > b[4] || p.z > b[5]) return false;
    let inside = 0, outside = 0, unsureIn = 0, unsureOut = 0;
    for (const dir of PROBES) {
      const r = this._crossings(p, dir);
      if (r.sure) (r.count % 2 ? inside++ : outside++);
      else (r.count % 2 ? unsureIn++ : unsureOut++);
      if (inside >= 2 || outside >= 2) break;
    }
    if (inside !== outside) return inside > outside;
    return unsureIn > unsureOut;
  }

  /**
   * The nearest point of the surface, or null when there's none within `maxDistance`.
   *
   * @param {Vec3} p
   * @param {{maxDistance?:number}} [opts]
   * @returns {{point, normal, distance, face, triangle, barycentric} | null}
   */
  closest(p, { maxDistance = Infinity } = {}) {
    checkPoint(p, "closest: the point");
    const found = this._nearest(p, maxDistance);
    if (found < 0) return null;
    const c = this._near;
    const w1 = c[3], w2 = c[4];
    const point = { x: c[0], y: c[1], z: c[2] };
    return this._describe(found, w1, w2, point, Math.hypot(p.x - c[0], p.y - c[1], p.z - c[2]), null);
  }

  /**
   * Distance from a point to the surface (Infinity when nothing is within `maxDistance`).
   *
   * @param {Vec3} p
   * @param {number} [maxDistance=Infinity] - Stop looking past this (faster)
   * @returns {number}
   */
  distance(p, maxDistance = Infinity) {
    checkPoint(p, "distance: the point");
    const found = this._nearest(p, maxDistance);
    if (found < 0) return Infinity;
    const c = this._near;
    return Math.hypot(p.x - c[0], p.y - c[1], p.z - c[2]);
  }

  /** Unit normal of triangle `tri`, pointing out (clockwise faces). */
  _normal(tri) {
    const q = this._tris, i = tri * 9;
    const e1x = q[i + 3] - q[i], e1y = q[i + 4] - q[i + 1], e1z = q[i + 5] - q[i + 2];
    const e2x = q[i + 6] - q[i], e2y = q[i + 7] - q[i + 1], e2z = q[i + 8] - q[i + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / l, y: ny / l, z: nz / l };
  }

  _describe(tri, u, w, point, distance, dir) {
    const normal = this._normal(tri);
    const out = {
      point,
      normal,
      distance,
      face: this._faceOf[tri],
      triangle: [this._corners[tri * 3], this._corners[tri * 3 + 1], this._corners[tri * 3 + 2]],
      barycentric: [1 - u - w, u, w],
    };
    if (dir) out.front = dir.x * normal.x + dir.y * normal.y + dir.z * normal.z < 0;
    return out;
  }

  /**
   * First hit of the ray o + t·d (d any length), 0 < t < maxT in units of d.
   * Fills `this._hit` and returns true when something is hit.
   */
  _cast(o, d, maxT, side) {
    if (!this.triangleCount) return false;
    const dl = Math.hypot(d.x, d.y, d.z);
    const minT = this._minDist / dl, detEps = this._detEps * dl;
    const sign = side === "front" ? 1 : side === "back" ? -1 : 0;
    const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
    const box = this._box, first = this._first, count = this._count, tris = this._tris, stack = this._stack;
    const hit = this._hit;
    let best = maxT, found = -1, bu = 0, bw = 0;
    let top = 0;
    if (enter(box, 0, o, ix, iy, iz, best) === Infinity) return false;
    stack[top++] = 0;
    while (top) {
      const node = stack[--top];
      const n = count[node];
      if (n > 0) {
        for (let k = first[node], end = first[node] + n; k < end; k++) {
          const i = k * 9;
          const e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
          const e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
          const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          // det > 0: the ray meets the face from outside
          if (Math.abs(det) <= detEps || det * sign < 0) continue;
          const inv = 1 / det;
          const sx = o.x - tris[i], sy = o.y - tris[i + 1], sz = o.z - tris[i + 2];
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (w < 0 || u + w > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > minT && t < best) {
            best = t;
            found = k;
            bu = u;
            bw = w;
          }
        }
      } else {
        // Visit the nearer child first; skip boxes past the best hit
        const a = first[node], b = a + 1;
        const ta = enter(box, a * 6, o, ix, iy, iz, best), tb = enter(box, b * 6, o, ix, iy, iz, best);
        if (ta <= tb) {
          if (tb !== Infinity) stack[top++] = b;
          if (ta !== Infinity) stack[top++] = a;
        } else {
          if (ta !== Infinity) stack[top++] = a;
          stack[top++] = b;
        }
      }
    }
    if (found < 0) return false;
    hit.t = best;
    hit.tri = found;
    hit.u = bu;
    hit.w = bw;
    return true;
  }

  /** How many faces a ray from p crosses, and whether every crossing was clear of edges. */
  _crossings(p, [dx, dy, dz]) {
    const tris = this._tris, box = this._box, first = this._first, count = this._count, stack = this._stack;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz, minT = this._minDist, eps = this._edgeEps, detEps = this._detEps;
    let hits = 0, sure = true, top = 0;
    stack[top++] = 0;
    while (top) {
      const node = stack[--top];
      if (enter(box, node * 6, p, ix, iy, iz, Infinity) === Infinity) continue;
      const n = count[node];
      if (n === 0) {
        stack[top++] = first[node];
        stack[top++] = first[node] + 1;
        continue;
      }
      for (let k = first[node], end = first[node] + n; k < end; k++) {
        const i = k * 9;
        const e1x = tris[i + 3] - tris[i], e1y = tris[i + 4] - tris[i + 1], e1z = tris[i + 5] - tris[i + 2];
        const e2x = tris[i + 6] - tris[i], e2y = tris[i + 7] - tris[i + 1], e2z = tris[i + 8] - tris[i + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) <= detEps) continue;
        const inv = 1 / det;
        const sx = p.x - tris[i], sy = p.y - tris[i + 1], sz = p.z - tris[i + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < -eps || u > 1 + eps) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const w = (dx * qx + dy * qy + dz * qz) * inv;
        if (w < -eps || u + w > 1 + eps) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= -minT) continue;
        // Near an edge or the start point: this ray can't be trusted
        if (u < eps || w < eps || u + w > 1 - eps || t <= minT) sure = false;
        if (t > minT && u >= 0 && w >= 0 && u + w <= 1) hits++;
      }
    }
    return { count: hits, sure };
  }

  /** Nearest triangle to p within maxDist (its closest point in `this._near`), or -1. */
  _nearest(p, maxDist) {
    if (!this.triangleCount) return -1;
    const box = this._box, first = this._first, count = this._count, tris = this._tris, stack = this._stack;
    const near = this._near, tmp = new Float64Array(5);
    let best2 = maxDist === Infinity ? Infinity : maxDist * maxDist, found = -1, top = 0;
    if (boxDist2(box, 0, p) > best2) return -1;
    stack[top++] = 0;
    while (top) {
      const node = stack[--top];
      if (boxDist2(box, node * 6, p) > best2) continue;
      const n = count[node];
      if (n > 0) {
        for (let k = first[node], end = first[node] + n; k < end; k++) {
          const d2 = closestOnTriangle(tris, k * 9, p, tmp);
          if (d2 <= best2) {
            best2 = d2;
            found = k;
            near.set(tmp);
          }
        }
      } else {
        const a = first[node], b = a + 1;
        const da = boxDist2(box, a * 6, p), db = boxDist2(box, b * 6, p);
        // Push the farther first, so the nearer is looked at first
        if (da <= db) {
          if (db <= best2) stack[top++] = b;
          if (da <= best2) stack[top++] = a;
        } else {
          if (da <= best2) stack[top++] = a;
          if (db <= best2) stack[top++] = b;
        }
      }
    }
    return found;
  }
}

/**
 * Builds the BVH on `q`, sorting its triangles so each leaf's are together.
 * Nodes: `_box` (6 numbers each), `_count` (> 0 for a leaf: its triangles
 * from `_first`; 0 for an inner node: its children are `_first` and `_first + 1`).
 */
function buildBVH(q) {
  const n = q.triangleCount, src = q._tris;
  const triBox = new Float64Array(n * 6), cen = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let a = 0; a < 3; a++) {
      const x = src[t * 9 + a], y = src[t * 9 + 3 + a], z = src[t * 9 + 6 + a];
      const lo = Math.min(x, y, z), hi = Math.max(x, y, z);
      triBox[t * 6 + a] = lo;
      triBox[t * 6 + 3 + a] = hi;
      cen[t * 3 + a] = (lo + hi) / 2;
    }
  }
  const order = new Int32Array(n);
  for (let t = 0; t < n; t++) order[t] = t;

  const maxNodes = Math.max(1, 2 * n - 1);
  const box = new Float64Array(maxNodes * 6), first = new Int32Array(maxNodes), count = new Int32Array(maxNodes);
  let nodes = 1, depth = 1;
  const binCount = new Int32Array(BINS), binBox = new Float64Array(BINS * 6);
  const rightArea = new Float64Array(BINS), rightCount = new Int32Array(BINS);

  const work = [[0, 0, n, 1]];
  while (work.length) {
    const [node, start, end, level] = work.pop();
    depth = Math.max(depth, level);
    // Node box and centroid box
    const k = node * 6;
    box.fill(Infinity, k, k + 3);
    box.fill(-Infinity, k + 3, k + 6);
    let cminx = Infinity, cminy = Infinity, cminz = Infinity, cmaxx = -Infinity, cmaxy = -Infinity, cmaxz = -Infinity;
    for (let i = start; i < end; i++) {
      const t = order[i];
      for (let a = 0; a < 3; a++) {
        if (triBox[t * 6 + a] < box[k + a]) box[k + a] = triBox[t * 6 + a];
        if (triBox[t * 6 + 3 + a] > box[k + 3 + a]) box[k + 3 + a] = triBox[t * 6 + 3 + a];
      }
      const cx = cen[t * 3], cy = cen[t * 3 + 1], cz = cen[t * 3 + 2];
      if (cx < cminx) cminx = cx;
      if (cy < cminy) cminy = cy;
      if (cz < cminz) cminz = cz;
      if (cx > cmaxx) cmaxx = cx;
      if (cy > cmaxy) cmaxy = cy;
      if (cz > cmaxz) cmaxz = cz;
    }
    const size = end - start;
    if (size <= LEAF) {
      first[node] = start;
      count[node] = size;
      continue;
    }

    // Split along the longest side of the centroids' box
    const ex = cmaxx - cminx, ey = cmaxy - cminy, ez = cmaxz - cminz;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const lo = axis === 0 ? cminx : axis === 1 ? cminy : cminz;
    const extent = axis === 0 ? ex : axis === 1 ? ey : ez;
    let mid = -1;
    if (extent > 0) {
      // Surface area heuristic over BINS bins
      const scale = BINS / extent;
      const binOf = (t) => Math.min(BINS - 1, Math.floor((cen[t * 3 + axis] - lo) * scale));
      binCount.fill(0);
      for (let b = 0; b < BINS; b++) {
        binBox.fill(Infinity, b * 6, b * 6 + 3);
        binBox.fill(-Infinity, b * 6 + 3, b * 6 + 6);
      }
      for (let i = start; i < end; i++) {
        const t = order[i], b = binOf(t);
        binCount[b]++;
        for (let a = 0; a < 3; a++) {
          if (triBox[t * 6 + a] < binBox[b * 6 + a]) binBox[b * 6 + a] = triBox[t * 6 + a];
          if (triBox[t * 6 + 3 + a] > binBox[b * 6 + 3 + a]) binBox[b * 6 + 3 + a] = triBox[t * 6 + 3 + a];
        }
      }
      // Areas from the right, then sweep from the left
      const acc = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      let c = 0;
      for (let b = BINS - 1; b > 0; b--) {
        grow(acc, binBox, b * 6);
        c += binCount[b];
        rightArea[b] = c ? area(acc) : 0;
        rightCount[b] = c;
      }
      acc.splice(0, 6, Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity);
      c = 0;
      let bestCost = Infinity, bestBin = -1;
      for (let b = 1; b < BINS; b++) {
        grow(acc, binBox, (b - 1) * 6);
        c += binCount[b - 1];
        if (!c || !rightCount[b]) continue;
        const cost = area(acc) * c + rightArea[b] * rightCount[b];
        if (cost < bestCost) {
          bestCost = cost;
          bestBin = b;
        }
      }
      if (bestBin > 0) {
        // Partition: bins below bestBin to the left
        let i = start, j = end - 1;
        while (i <= j) {
          if (binOf(order[i]) < bestBin) i++;
          else {
            const s = order[i];
            order[i] = order[j];
            order[j--] = s;
          }
        }
        mid = i;
      }
    }
    // All centroids at one place, or no useful split: cut the list in half
    if (mid <= start || mid >= end) mid = (start + end) >> 1;

    const left = nodes;
    nodes += 2;
    first[node] = left;
    count[node] = 0;
    work.push([left + 1, mid, end, level + 1], [left, start, mid, level + 1]);
  }

  // Triangles in leaf order, so leaves read them in a row
  const tris = new Float64Array(n * 9), corners = new Int32Array(n * 3), faceOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const t = order[i];
    tris.set(src.subarray(t * 9, t * 9 + 9), i * 9);
    corners.set(q._corners.subarray(t * 3, t * 3 + 3), i * 3);
    faceOf[i] = q._faceOf[t];
  }
  q._tris = tris;
  q._corners = corners;
  q._faceOf = faceOf;
  q._box = box.subarray(0, nodes * 6);
  q._first = first.subarray(0, nodes);
  q._count = count.subarray(0, nodes);
  // An empty mesh: one empty leaf whose box nothing enters
  if (!n) q._box.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  q._stack = new Int32Array(depth * 2 + 2);
}

function grow(acc, b, k) {
  for (let a = 0; a < 3; a++) {
    if (b[k + a] < acc[a]) acc[a] = b[k + a];
    if (b[k + 3 + a] > acc[3 + a]) acc[3 + a] = b[k + 3 + a];
  }
}

function area(b) {
  const x = b[3] - b[0], y = b[4] - b[1], z = b[5] - b[2];
  return x * y + y * z + z * x;
}

/** Where the ray o + t·(1/inv) enters box k, within [0, far]; Infinity if it doesn't. */
function enter(box, k, o, ix, iy, iz, far) {
  let t0 = 0, t1 = far;
  const lx = box[k], ly = box[k + 1], lz = box[k + 2], hx = box[k + 3], hy = box[k + 4], hz = box[k + 5];
  if (ix === Infinity || ix === -Infinity) {
    if (o.x < lx || o.x > hx) return Infinity;
  } else {
    let a = (lx - o.x) * ix, b = (hx - o.x) * ix;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  }
  if (iy === Infinity || iy === -Infinity) {
    if (o.y < ly || o.y > hy) return Infinity;
  } else {
    let a = (ly - o.y) * iy, b = (hy - o.y) * iy;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  }
  if (iz === Infinity || iz === -Infinity) {
    if (o.z < lz || o.z > hz) return Infinity;
  } else {
    let a = (lz - o.z) * iz, b = (hz - o.z) * iz;
    if (a > b) [a, b] = [b, a];
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
  }
  // A little slack, so rays along a box's face aren't lost to rounding
  return t0 <= t1 * (1 + 1e-12) + 1e-12 ? t0 : Infinity;
}

/** Squared distance from p to box k (0 inside). */
function boxDist2(box, k, p) {
  const dx = Math.max(box[k] - p.x, 0, p.x - box[k + 3]);
  const dy = Math.max(box[k + 1] - p.y, 0, p.y - box[k + 4]);
  const dz = Math.max(box[k + 2] - p.z, 0, p.z - box[k + 5]);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Closest point on the triangle at `i` to p (Ericson's method): writes
 * x, y, z and the weights of the 2nd and 3rd corners into `out`, returns
 * the squared distance.
 */
function closestOnTriangle(q, i, p, out) {
  const ax = q[i], ay = q[i + 1], az = q[i + 2];
  const abx = q[i + 3] - ax, aby = q[i + 4] - ay, abz = q[i + 5] - az;
  const acx = q[i + 6] - ax, acy = q[i + 7] - ay, acz = q[i + 8] - az;
  const apx = p.x - ax, apy = p.y - ay, apz = p.z - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let v, w;
  if (d1 <= 0 && d2 <= 0) {
    v = 0; w = 0;
  } else {
    const bpx = p.x - q[i + 3], bpy = p.y - q[i + 4], bpz = p.z - q[i + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = p.x - q[i + 6], cpy = p.y - q[i + 7], cpz = p.z - q[i + 8];
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      v = 1; w = 0;
    } else if (d6 >= 0 && d5 <= d6) {
      v = 0; w = 1;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      v = d1 / (d1 - d3); w = 0;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      v = 0; w = d2 / (d2 - d6);
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      w = (d4 - d3) / (d4 - d3 + (d5 - d6)); v = 1 - w;
    } else {
      const den = 1 / (va + vb + vc);
      v = vb * den; w = vc * den;
    }
  }
  const x = ax + abx * v + acx * w, y = ay + aby * v + acy * w, z = az + abz * v + acz * w;
  out[0] = x; out[1] = y; out[2] = z; out[3] = v; out[4] = w;
  return (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
}

// One-off questions: each builds a query and throws it away. For many
// questions on one mesh, use meshQuery.

/** The first place a ray meets a mesh, or null. Same as `meshQuery(mesh).raycast(...)`. */
export function raycastMesh(mesh, origin, direction, opts) {
  return meshQuery(mesh).raycast(origin, direction, opts);
}

/** Whether a point is inside a closed mesh. Same as `meshQuery(mesh).contains(p)`. */
export function pointInMesh(mesh, p) {
  return meshQuery(mesh).contains(p);
}

/** Distance from a point to a mesh's surface. Same as `meshQuery(mesh).distance(p, maxDistance)`. */
export function distanceToMesh(mesh, p, maxDistance) {
  return meshQuery(mesh).distance(p, maxDistance);
}

/** The nearest point of a mesh's surface. Same as `meshQuery(mesh).closest(p, opts)`. */
export function closestPointOnMesh(mesh, p, opts) {
  return meshQuery(mesh).closest(p, opts);
}

/**
 * Whether a mesh is closed (watertight): every edge, matched by vertex
 * position (texture seams split vertices), is shared by exactly two faces.
 * Only a closed mesh has an inside.
 *
 * @param {Object} mesh
 * @returns {boolean}
 */
export function isClosed(mesh) {
  const v = mesh?.vertices ?? [];
  if (!mesh?.faces?.length || !v.length) return false;
  let size = 0;
  for (const p of v) if (finite(p)) size = Math.max(size, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  const same = samePlace(v, (size || 1) * 1e-7);
  const edges = new Map();
  for (const f of mesh.faces) {
    if (!Array.isArray(f)) return false;
    for (let i = 0; i < f.length; i++) {
      const a = same[f[i]], b = same[f[(i + 1) % f.length]];
      if (a === undefined || b === undefined) return false;
      if (a === b) continue; // a collapsed edge (a sphere's poles)
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  if (!edges.size) return false;
  for (const n of edges.values()) if (n !== 2) return false;
  return true;
}

// Scene rays

/** Prepared queries for meshes in scenes, rebuilt when a mesh changes. */
const cache = new WeakMap();

function cachedQuery(mesh) {
  const c = cache.get(mesh);
  if (c && !mesh.dirty && c.vertices === mesh.vertices && c.faces === mesh.faces
    && c.vertexCount === mesh.vertices.length && c.faceCount === mesh.faces.length) return c.query;
  const query = meshQuery(mesh);
  cache.set(mesh, { query, vertices: mesh.vertices, faces: mesh.faces, vertexCount: mesh.vertices.length, faceCount: mesh.faces.length });
  return query;
}

/**
 * Forgets the prepared query `raycastScene` keeps for a mesh, so the next
 * ray rebuilds it. Needed only after changing a mesh's vertices in place
 * once a renderer has already cleared its `dirty` flag.
 *
 * @param {Object} mesh
 */
export function clearQueryCache(mesh) {
  if (mesh) cache.delete(mesh);
}

/**
 * The first object a ray meets in a scene, in world space: the 3D version
 * of `pickHit`. Each object's position, rotation, scale and groups are
 * taken into account. Hidden objects, objects with `pickable: false` and
 * objects without faces are skipped.
 *
 * Each mesh's query is prepared once and kept until the mesh changes
 * (new arrays, a different count, or `mesh.dirty`).
 *
 * @param {Object} scene - A Scene, or a list of objects
 * @param {Vec3} origin - In the world
 * @param {Vec3} direction - In the world, any length but zero
 * @param {Object} [opts]
 * @param {(obj:Object) => boolean} [opts.filter] - Return false to skip an object
 * @param {number} [opts.maxDistance=Infinity]
 * @param {"both"|"front"|"back"} [opts.side="both"]
 * @param {Object[]} [opts.objects] - Only these objects (and their children)
 * @returns {Object|null} The hit: object, path, point, local, normal, distance, face, front, triangle, barycentric
 */
export function raycastScene(scene, origin, direction, { filter = () => true, maxDistance = Infinity, side = "both", objects } = {}) {
  checkPoint(origin, "raycastScene: origin");
  checkSide(side);
  const d = unitDirection(direction);
  let best = maxDistance, hit = null;
  for (const object of worldObjects(objects ?? scene)) {
    const mesh = object.mesh;
    if (!mesh?.faces?.length || !Array.isArray(mesh.vertices) || !isPickable(object) || !filter(object)) continue;
    const world = object.world;
    if (!(Math.abs(determinantMat4(world)) > 1e-18)) continue; // scaled to nothing
    const inv = invertMat4(world);
    // The ray in the mesh's space; t stays the world distance since d is unit length
    const lo = transformPoint(inv, origin), ld = transformDirection(inv, d);
    const q = cachedQuery(mesh);
    if (!q._cast(lo, ld, best, side)) continue;
    const { t, tri, u, w } = q._hit;
    best = t;
    hit = { object, world, q, tri, u, w, t, lo, ld };
  }
  if (!hit) return null;
  const { object, world, q, tri, u, w, t, lo, ld } = hit;
  const local = { x: lo.x + ld.x * t, y: lo.y + ld.y * t, z: lo.z + ld.z * t };
  const out = q._describe(tri, u, w, { x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t }, t, ld);
  out.normal = transformNormal(normalMatrix(world), out.normal);
  return { object, path: ancestors(object), local, ...out };
}
