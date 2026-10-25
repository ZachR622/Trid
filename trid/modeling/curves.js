/**
 * Smooth curves through a few points: paths for sweeps, profiles for lathe,
 * outlines for extrude. Points can be 2D ({ x, y }), 3D ({ x, y, z }) or
 * lathe profile points ({ r, y }): every number field of the first point is
 * used, and the result has the same fields.
 */

/** The number fields of a point (the curve's coordinates). */
function keysOf(p) {
  return p ? Object.keys(p).filter((k) => typeof p[k] === "number") : [];
}

const dist = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
};

/** Points as arrays of numbers, without repeats in a row (and without the closing repeat of a loop). */
function toArrays(points, keys, closed) {
  const out = [];
  for (const p of points) {
    const a = keys.map((k) => p[k]);
    if (a.some((x) => !Number.isFinite(x))) continue;
    if (!out.length || dist(a, out[out.length - 1]) > 1e-12) out.push(a);
  }
  if (closed && out.length > 2 && dist(out[0], out[out.length - 1]) <= 1e-12) out.pop();
  return out;
}

const toPoint = (a, keys) => Object.fromEntries(keys.map((k, i) => [k, a[i]]));

/** Total length of a polyline (with the closing side for loops). */
function lengths(pts, closed) {
  const along = [0];
  const n = pts.length;
  const sides = closed ? n : n - 1;
  for (let i = 0; i < sides; i++) along.push(along[i] + dist(pts[i], pts[(i + 1) % n]));
  return along;
}

/** Evenly spaced points (by length) along a polyline of number arrays. */
function evenly(pts, closed, count) {
  const n = pts.length;
  const along = lengths(pts, closed);
  const total = along[along.length - 1];
  if (total <= 0) return [pts[0].slice()];
  const out = [];
  const steps = closed ? count : count - 1;
  let side = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / steps) * total;
    while (side < along.length - 2 && along[side + 1] < d) side++;
    const a = pts[side], b = pts[(side + 1) % n];
    const t = (d - along[side]) / (along[side + 1] - along[side] || 1);
    out.push(a.map((x, i) => x + (b[i] - x) * t));
  }
  if (!closed) out[out.length - 1] = pts[n - 1].slice();
  return out;
}

/** How many evenly spaced points `count` / `spacing` ask for, or 0 to keep the points as they are. */
function wanted(pts, closed, count, spacing) {
  if (count != null) return Math.max(closed ? 3 : 2, Math.round(count));
  if (spacing > 0) {
    const along = lengths(pts, closed);
    const sides = Math.max(1, Math.round(along[along.length - 1] / spacing));
    return Math.max(closed ? 3 : 2, closed ? sides : sides + 1);
  }
  return 0;
}

/**
 * Points along a polyline, evenly spaced by length: give `count` (number
 * of points) or `spacing` (distance between them). The ends stay where they
 * are. Corners are kept as corners only if a point falls on them; to keep
 * a shape smooth, use `spline` instead.
 *
 * @template {Record<string, number>} P
 * @param {P[]} points
 * @param {{ count?: number, spacing?: number, closed?: boolean }} [opts]
 * @returns {P[]} New points, with the same number fields
 */
export function resamplePath(points, { count, spacing, closed = false } = {}) {
  const keys = keysOf(points?.[0]);
  const pts = toArrays(points ?? [], keys, closed);
  if (pts.length < 2) return pts.map((a) => toPoint(a, keys));
  const loop = closed && pts.length > 2;
  const n = wanted(pts, loop, count, spacing);
  return (n ? evenly(pts, loop, n) : pts).map((a) => toPoint(a, keys));
}

/**
 * A smooth curve through `points` (Catmull-Rom spline: the curve passes
 * through every point). With the default `alpha` (0.5, "centripetal") it
 * never loops or overshoots at sharp turns.
 *
 * @example
 * // A tail path from 4 points, 40 points evenly spaced along it
 * const path = spline([{ x: 0, y: 0, z: 0 }, { x: 0.2, y: 0.3, z: -0.4 }, { x: 0, y: 0.6, z: -0.7 }, { x: -0.2, y: 0.5, z: -1 }], { count: 40 });
 *
 * @template {Record<string, number>} P
 * @param {P[]} points Control points (2D, 3D or `{ r, y }`)
 * @param {object} [opts]
 * @param {number} [opts.segments=8] Points made between two control points
 * @param {boolean} [opts.closed=false] The last point joins the first (a loop); the result does not repeat the first point
 * @param {number} [opts.alpha=0.5] 0 = uniform, 0.5 = centripetal (no loops), 1 = chordal (hugs the points)
 * @param {number} [opts.tension=0] 0 = smooth, 1 = straight lines between the points
 * @param {number} [opts.count] Instead of `segments`: this many points in all, evenly spaced by length
 * @param {number} [opts.spacing] Instead of `segments`: points about this far apart, evenly spaced
 * @returns {P[]} New points, with the same number fields
 */
export function spline(points, { segments = 8, closed = false, alpha = 0.5, tension = 0, count, spacing } = {}) {
  const keys = keysOf(points?.[0]);
  const pts = toArrays(points ?? [], keys, closed);
  const n = pts.length;
  if (n < 2) return pts.map((a) => toPoint(a, keys));
  const loop = closed && n > 2;
  const even = count != null || spacing > 0;
  // Evenly spaced points are taken from a fine curve
  const steps = Math.max(1, Math.floor(even ? Math.max(32, segments) : segments));
  const tight = 1 - Math.min(1, Math.max(0, tension));
  const dims = keys.length;

  // Past the ends of an open curve: the next point mirrored through the end point
  const at = (i) => {
    if (loop) return pts[((i % n) + n) % n];
    if (i < 0) return pts[0].map((x, d) => 2 * x - pts[1][d]);
    if (i >= n) return pts[n - 1].map((x, d) => 2 * x - pts[n - 2][d]);
    return pts[i];
  };
  // Parameter step between two points (never 0)
  const knot = (a, b) => Math.max(1e-9, dist(a, b) ** alpha);

  const curve = [];
  const spans = loop ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d0 = knot(p0, p1), d1 = knot(p1, p2), d2 = knot(p2, p3);
    // Tangents at p1 and p2 (non-uniform Catmull-Rom), for t from 0 to 1 over this span
    const m1 = [], m2 = [];
    for (let d = 0; d < dims; d++) {
      m1.push(tight * d1 * ((p1[d] - p0[d]) / d0 - (p2[d] - p0[d]) / (d0 + d1) + (p2[d] - p1[d]) / d1));
      m2.push(tight * d1 * ((p2[d] - p1[d]) / d1 - (p3[d] - p1[d]) / (d1 + d2) + (p3[d] - p2[d]) / d2));
    }
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      curve.push(p1.map((x, d) => h00 * x + h10 * m1[d] + h01 * p2[d] + h11 * m2[d]));
    }
  }
  if (!loop) curve.push(pts[n - 1].slice());

  const out = even ? evenly(curve, loop, wanted(curve, loop, count, spacing)) : curve;
  return out.map((a) => toPoint(a, keys));
}
