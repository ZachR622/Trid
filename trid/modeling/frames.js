/**
 * Frames along a 3D path (not exported from the library): where the path
 * goes at each point, and which way is "up" for a section placed there.
 * Shared by sweep and loft.
 */
import { vec, add, sub, mul, dot, cross, dist, norm, rotateAround, isPoint } from "./vec.js";

/** `v` without its part along the unit vector `t`, at length 1 (null when `v` is along `t`). */
export const across = (v, t) => norm(sub(v, mul(t, dot(v, t))));

/**
 * Carries the "up" direction `r` from one path point to the next without
 * spinning it (double reflection, Wang et al. 2008).
 */
export function transport(r, x0, t0, x1, t1) {
  const v1 = sub(x1, x0), c1 = dot(v1, v1);
  if (c1 < 1e-24) return across(r, t1) ?? r;
  const rL = sub(r, mul(v1, (2 * dot(v1, r)) / c1));
  const tL = sub(t0, mul(v1, (2 * dot(v1, t0)) / c1));
  const v2 = sub(t1, tL), c2 = dot(v2, v2);
  const out = c2 < 1e-24 ? rL : sub(rL, mul(v2, (2 * dot(v2, rL)) / c2));
  return across(out, t1) ?? r;
}

/**
 * A path's points without bad points and repeats in a row. A loop drops
 * its closing repeat, and needs 3 points (fewer: an open path).
 */
export function cleanPath(path, closed) {
  const pts = [];
  for (const p of path ?? []) if (isPoint(p) && (!pts.length || dist(p, pts[pts.length - 1]) > 1e-9)) pts.push(vec(p.x, p.y, p.z));
  let loop = !!closed;
  if (loop && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) <= 1e-9) pts.pop();
  if (pts.length < 3) loop = false;
  return { pts, loop };
}

/**
 * Frames at each point of a clean path (2 points or more):
 * - `dirs`: direction of each side (to the next point);
 * - `tangents`: direction at each point, halfway between its sides;
 * - `ups`: the section's "up", carried along without spinning, or kept
 *   toward `up` when given. On a loop, the turn the carried "up" picks up
 *   on the way round is spread evenly, so the ends meet without a seam;
 * - `along`: length from the start to each point (and around, for a loop), `total`.
 */
export function pathFrames(pts, loop, up = null) {
  const n = pts.length;
  const sides = loop ? n : n - 1;
  const along = [0];
  for (let i = 0; i < sides; i++) along.push(along[i] + dist(pts[i], pts[(i + 1) % n]));
  const total = along[sides] || 1;

  const dirs = Array.from({ length: sides }, (_, i) => norm(sub(pts[(i + 1) % n], pts[i]), vec(0, 0, 1)));
  const tangents = pts.map((_, i) => {
    const din = loop ? dirs[(i + n - 1) % n] : dirs[i - 1];
    const dout = dirs[i];
    return !din ? dout : !dout ? din : norm(add(din, dout), dout);
  });

  const upDir = up && isPoint(up) ? norm(up) : null;
  const t0 = tangents[0];
  const start = (upDir && across(upDir, t0)) ?? across(Math.abs(t0.y) < 0.99 ? vec(0, 1, 0) : vec(1, 0, 0), t0);
  const ups = [start];
  for (let i = 1; i < n; i++) {
    const carried = transport(ups[i - 1], pts[i - 1], tangents[i - 1], pts[i], tangents[i]);
    ups.push((upDir && across(upDir, tangents[i])) ?? carried);
  }
  if (loop && !upDir) {
    const back = transport(ups[n - 1], pts[n - 1], tangents[n - 1], pts[0], t0);
    const fix = Math.atan2(dot(cross(back, ups[0]), t0), dot(back, ups[0]));
    for (let i = 1; i < n; i++) ups[i] = rotateAround(ups[i], tangents[i], (fix * along[i]) / total);
  }
  return { dirs, tangents, ups, along, total };
}

/**
 * The frame at length `s` along the path (between its points):
 * `pos`, `tangent`, `up`, and `side` (= up × tangent: where a section's x goes).
 */
export function frameAt(pts, loop, frames, s) {
  const { along, total, tangents, ups } = frames;
  const n = pts.length;
  s = loop ? ((s % total) + total) % total : Math.min(total, Math.max(0, s));
  let lo = 0, hi = along.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] <= s) lo = mid;
    else hi = mid;
  }
  const i = Math.min(lo, loop ? n - 1 : n - 2), j = (i + 1) % n;
  const w = Math.min(1, Math.max(0, (s - along[i]) / (along[i + 1] - along[i] || 1)));
  const pos = add(pts[i], mul(sub(pts[j], pts[i]), w));
  const tangent = norm(add(mul(tangents[i], 1 - w), mul(tangents[j], w)), tangents[i]);
  const upv = across(add(mul(ups[i], 1 - w), mul(ups[j], w)), tangent) ?? ups[i];
  return { pos, tangent, up: upv, side: cross(upv, tangent) };
}
