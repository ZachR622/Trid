import { triangulate } from "../render/shapes.js";
import { vec, add, sub, mul, dot, cross, dist, norm, rotateAround, isPoint, signedArea2 } from "./vec.js";

const EMPTY = () => ({ vertices: [], edges: [], faces: [], uvs: [], faceUVs: [] });

/**
 * A size along the path: a number, a list of numbers spread evenly from the
 * start (first) to the end (last), or a function of t (0 at the start, 1 at the end).
 */
function sizeAt(opt, t, fallback) {
  let v = fallback;
  if (typeof opt === "function") v = opt(t);
  else if (typeof opt === "number") v = opt;
  else if (Array.isArray(opt) && opt.length) {
    const x = t * (opt.length - 1), i = Math.min(opt.length - 2, Math.floor(x));
    v = opt.length === 1 ? opt[0] : opt[i] + (opt[i + 1] - opt[i]) * (x - i);
  }
  return Number.isFinite(v) ? v : fallback;
}

/** `v` without its part along the unit vector `t`, at length 1 (null when `v` is along `t`). */
const across = (v, t) => norm(sub(v, mul(t, dot(v, t))));

/**
 * Carries the section's "up" direction `r` from one path point to the next
 * without spinning it (double reflection, Wang et al. 2008).
 */
function transport(r, x0, t0, x1, t1) {
  const v1 = sub(x1, x0), c1 = dot(v1, v1);
  if (c1 < 1e-24) return across(r, t1) ?? r;
  const rL = sub(r, mul(v1, (2 * dot(v1, r)) / c1));
  const tL = sub(t0, mul(v1, (2 * dot(v1, t0)) / c1));
  const v2 = sub(t1, tL), c2 = dot(v2, v2);
  const out = c2 < 1e-24 ? rL : sub(rL, mul(v2, (2 * dot(v2, rL)) / c2));
  return across(out, t1) ?? r;
}

/** A circle of `n` points of radius 1, counter-clockwise, starting at the bottom. */
function circle(n) {
  return Array.from({ length: n }, (_, j) => {
    const a = -Math.PI / 2 + (j / n) * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/**
 * Moves a cross-section along a 3D path: tails, horns, tentacles, handles,
 * pipes, cables, rails, picture frames. The section is a 2D outline: its x
 * goes to the path's side and its y to the path's "up". By default the
 * section is carried along the path without spinning (so it never flips at
 * bends); with `up`, its y stays pointed that way (roads, rails, frames).
 *
 * Without `profile`, the section is a circle of `radius` (a tube). An end
 * whose size is 0 closes into a point (a horn, a tail tip).
 *
 * Faces are clockwise from outside, like the built-in shapes. Texture
 * coordinates: u goes around the section (by length), v along the path (by
 * length). Caps map the section's box.
 *
 * @example
 * // A tail: thick at the base, a point at the tip
 * const tail = sweep(spline(controlPoints, { count: 40 }), { radius: (t) => 0.08 * (1 - t) });
 *
 * @param {{x:number, y:number, z:number}[]} path Points the section follows (use `spline` for a smooth path)
 * @param {object} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function sweep(path, opts = {}) {
  const {
    profile, radius = 0.1, scale = 1, segments = 16, twist = 0,
    closed = false, caps = true, up = null, miter = true, profileClosed = true,
  } = opts;

  // The path, without bad points and repeats
  const pts = [];
  for (const p of path ?? []) if (isPoint(p) && (!pts.length || dist(p, pts[pts.length - 1]) > 1e-9)) pts.push(vec(p.x, p.y, p.z));
  let loop = !!closed;
  if (loop && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= 1e-9) pts.pop();
  if (pts.length < 3) loop = false;

  // The section: counter-clockwise when closed, so the outside is on its right
  const ring = profile ? profileClosed !== false : true;
  const sec = [];
  for (const q of profile ?? circle(Math.max(3, Math.floor(segments)))) {
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    const last = sec[sec.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 1e-12) sec.push({ x: q.x, y: q.y });
  }
  if (ring && sec.length > 2 && Math.hypot(sec[0].x - sec[sec.length - 1].x, sec[0].y - sec[sec.length - 1].y) <= 1e-12) sec.pop();
  if (ring && signedArea2(sec) < 0) sec.reverse();
  const m = sec.length;
  const n = pts.length;
  if (n < 2 || m < (ring ? 3 : 2)) return EMPTY();

  // Length along the path (t for sizes and twist, v for textures)
  const sides = loop ? n : n - 1;
  const along = [0];
  for (let i = 0; i < sides; i++) along.push(along[i] + dist(pts[i], pts[(i + 1) % n]));
  const total = along[sides] || 1;
  const tOf = (i) => along[i] / total;

  // Direction at each point: halfway between the sides around it.
  // At a corner, the section is stretched toward the bend so the tube keeps its thickness (miter).
  const dirs = Array.from({ length: sides }, (_, i) => norm(sub(pts[(i + 1) % n], pts[i])));
  const tangents = [], miters = [];
  for (let i = 0; i < n; i++) {
    const din = loop ? dirs[(i + n - 1) % n] : dirs[i - 1];
    const dout = loop ? dirs[i] : dirs[i];
    const t = !din ? dout : !dout ? din : norm(add(din, dout), dout);
    tangents.push(t);
    let mt = null;
    if (miter && din && dout) {
      const k = Math.min(3, 1 / Math.max(dot(t, dout), 1 / 3));
      const bend = across(sub(dout, din), t);
      if (k > 1 + 1e-9 && bend) mt = { bend, k };
    }
    miters.push(mt);
  }

  // The section's "up" at each point
  const upDir = up && isPoint(up) ? norm(up) : null;
  const t0 = tangents[0];
  const start = (upDir && across(upDir, t0)) ?? across(Math.abs(t0.y) < 0.99 ? vec(0, 1, 0) : vec(1, 0, 0), t0);
  const ups = [start];
  for (let i = 1; i < n; i++) {
    const carried = transport(ups[i - 1], pts[i - 1], tangents[i - 1], pts[i], tangents[i]);
    ups.push((upDir && across(upDir, tangents[i])) ?? carried);
  }

  // A loop: the carried "up" comes back a little turned; spread the difference along it so there's no seam.
  // The twist is rounded to whole turns there, so the ends still meet.
  let fix = 0, turn = twist || 0;
  if (loop) {
    if (!upDir) {
      const back = transport(ups[n - 1], pts[n - 1], tangents[n - 1], pts[0], t0);
      fix = Math.atan2(dot(cross(back, ups[0]), t0), dot(back, ups[0]));
    }
    turn = Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
  }

  // Rings of vertices; a ring of size 0 is a single point
  const vertices = [];
  const rings = pts.map((p, i) => {
    const t = tOf(i);
    const k = sizeAt(scale, t, 1) * (profile ? 1 : sizeAt(radius, t, 0.1));
    if (Math.abs(k) < 1e-9) {
      const tip = vertices.push(vec(p.x, p.y, p.z)) - 1;
      return new Array(m).fill(tip);
    }
    const tan = tangents[i];
    const nrm = rotateAround(ups[i], tan, (fix + turn) * t);
    const side = cross(nrm, tan);
    const mt = miters[i];
    return sec.map((q) => {
      let o = add(mul(side, q.x * k), mul(nrm, q.y * k));
      if (mt) o = add(o, mul(mt.bend, (mt.k - 1) * dot(o, mt.bend)));
      return vertices.push(add(p, o)) - 1;
    });
  });
  const isTip = (r) => r[0] === r[m - 1] && m > 1 && r[0] === r[1];

  // Texture grid: an extra column for the section's seam, an extra row for the path's
  const secLen = [0];
  const secSides = ring ? m : m - 1;
  for (let j = 0; j < secSides; j++) secLen.push(secLen[j] + Math.hypot(sec[(j + 1) % m].x - sec[j].x, sec[(j + 1) % m].y - sec[j].y));
  const secTotal = secLen[secSides] || 1;
  const cols = secSides + 1, rows = sides + 1;
  const uvs = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) uvs.push({ u: secLen[j] / secTotal, v: along[i] / total });
  const uvAt = (i, j) => i * cols + j;

  // Sides: one quad per section side and path step (a triangle next to a point)
  const faces = [], faceUVs = [];
  for (let i = 0; i < sides; i++) {
    const a = rings[i], b = rings[(i + 1) % n];
    for (let j = 0; j < secSides; j++) {
      const j1 = (j + 1) % m;
      const corners = [[a[j], uvAt(i, j)], [a[j1], uvAt(i, j + 1)], [b[j1], uvAt(i + 1, j + 1)], [b[j], uvAt(i + 1, j)]];
      const keep = corners.filter(([v], c) => v !== corners[(c + 3) % 4][0]);
      if (keep.length < 3) continue;
      faces.push(keep.map(([v]) => v));
      faceUVs.push(keep.map(([, u]) => u));
    }
  }

  // Caps: the start faces back along the path, the end forward
  if (!loop && ring && caps !== false) {
    const xs = sec.map((q) => q.x), ys = sec.map((q) => q.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
    const first = uvs.length;
    for (const q of sec) uvs.push({ u: (q.x - x0) / w, v: (q.y - y0) / h });
    const tris = triangulate(sec);
    for (const [r, flip] of [[rings[0], true], [rings[n - 1], false]]) {
      if (isTip(r)) continue;
      for (const tri of tris) {
        const t = flip ? [tri[2], tri[1], tri[0]] : tri;
        faces.push(t.map((j) => r[j]));
        faceUVs.push(t.map((j) => first + j));
      }
    }
  }

  // Edges: each section, and a line along the path from each section point
  const edges = [];
  for (const r of rings) {
    if (isTip(r)) continue;
    if (ring) edges.push(r.slice());
    else for (let j = 0; j < m - 1; j++) edges.push([r[j], r[j + 1]]);
  }
  for (let j = 0; j < m; j++) {
    if (loop) edges.push(rings.map((r) => r[j]));
    else for (let i = 0; i < n - 1; i++) if (rings[i][j] !== rings[i + 1][j]) edges.push([rings[i][j], rings[i + 1][j]]);
  }

  return { vertices, edges, faces, uvs, faceUVs };
}
