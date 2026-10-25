/** Small vector helpers shared by the modeling tools (not exported from the library). */

export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** `a` at length 1, or `fallback` when it has no length. */
export function norm(a, fallback = null) {
  const l = len(a);
  return l > 1e-12 ? mul(a, 1 / l) : fallback;
}

/** `a` turned by `angle` radians around the unit axis `k` (Rodrigues). */
export function rotateAround(a, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(a, c), mul(cross(k, a), s)), mul(k, dot(k, a) * (1 - c)));
}

/** A valid 3D point: three finite numbers. */
export const isPoint = (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Twice the signed area of a 2D outline: > 0 when counter-clockwise (x right, y up). */
export function signedArea2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}
