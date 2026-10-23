import { matFromEuler } from "./rotation.js";

/**
 * 4×4 transform matrices, for objects inside groups: an object's world
 * matrix is its parent's world matrix times its own.
 *
 * A matrix is an array of 16 numbers in column-major order (the order
 * WebGL uses): `m[col * 4 + row]`, translation in `m[12..14]`. They're
 * built with `matFromEuler`, so they match `localToWorld` exactly.
 *
 * @typedef {number[]} Mat4
 * @typedef {{x:number, y:number, z:number}} Vec3
 */

/** @returns {Mat4} The identity matrix (changes nothing). */
export function identityMat4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * The matrix of a transform: scale, then rotate (X, then Y, then Z), then
 * move. Parts left out change nothing.
 *
 * @param {{ pos?:Vec3, rot?:Vec3, scale?:Vec3 }} t - A transform, or a scene object
 * @returns {Mat4}
 */
export function mat4FromTransform({ pos, rot, scale } = {}) {
  const r = rot ? matFromEuler(rot) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const sx = scale?.x ?? 1, sy = scale?.y ?? 1, sz = scale?.z ?? 1;
  return [
    r[0][0] * sx, r[1][0] * sx, r[2][0] * sx, 0,
    r[0][1] * sy, r[1][1] * sy, r[2][1] * sy, 0,
    r[0][2] * sz, r[1][2] * sz, r[2][2] * sz, 0,
    pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0, 1,
  ];
}

/**
 * Matrix product a · b: b is applied first. A child's world matrix is
 * `mulMat4(parentWorld, childLocal)`.
 *
 * @param {Mat4} a
 * @param {Mat4} b
 * @returns {Mat4}
 */
export function mulMat4(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/**
 * Inverse of a transform matrix (scale, rotation and move; no perspective).
 * Turns world positions into an object's local ones.
 *
 * @param {Mat4} m
 * @returns {Mat4} The inverse, or the identity if `m` flattens space (a zero scale)
 */
export function invertMat4(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  // Inverse of the 3×3 part by cofactors
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return identityMat4();
  const k = 1 / det;
  const inv = [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
  const tx = m[12], ty = m[13], tz = m[14];
  return [
    inv[0], inv[1], inv[2], 0,
    inv[3], inv[4], inv[5], 0,
    inv[6], inv[7], inv[8], 0,
    -(inv[0] * tx + inv[3] * ty + inv[6] * tz),
    -(inv[1] * tx + inv[4] * ty + inv[7] * tz),
    -(inv[2] * tx + inv[5] * ty + inv[8] * tz),
    1,
  ];
}

/**
 * Determinant of the 3×3 part: < 0 when the matrix mirrors (an odd number
 * of negative scales), which turns faces inside out.
 *
 * @param {Mat4} m
 * @returns {number}
 */
export function determinantMat4(m) {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
}

/**
 * A point through a matrix (scaled, turned and moved).
 *
 * @param {Mat4} m
 * @param {Vec3} p
 * @returns {Vec3}
 */
export function transformPoint(m, p) {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/**
 * A direction or offset through a matrix: scaled and turned, not moved.
 *
 * @param {Mat4} m
 * @param {Vec3} v
 * @returns {Vec3}
 */
export function transformDirection(m, v) {
  return {
    x: m[0] * v.x + m[4] * v.y + m[8] * v.z,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z,
  };
}

/**
 * The 3×3 matrix that turns surface normals with an object (the inverse
 * transpose of its matrix), column-major. It keeps normals perpendicular to
 * stretched faces, and pointing outward on mirrored ones.
 *
 * @param {Mat4} m
 * @returns {number[]} 9 numbers, column-major (ready for `gl.uniformMatrix3fv`)
 */
export function normalMatrix(m) {
  const inv = invertMat4(m);
  // Transpose of the inverse's 3×3 part
  return [inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]];
}

/**
 * A surface normal through a normal matrix (from `normalMatrix`), unit length.
 *
 * @param {number[]} nm - 3×3 column-major
 * @param {Vec3} n
 * @returns {Vec3}
 */
export function transformNormal(nm, n) {
  const x = nm[0] * n.x + nm[3] * n.y + nm[6] * n.z;
  const y = nm[1] * n.x + nm[4] * n.y + nm[7] * n.z;
  const z = nm[2] * n.x + nm[5] * n.y + nm[8] * n.z;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Turns a world-space `TransformOp` (what `TransformGizmo` reports) into the
 * space of an object's parent, so `applyTransformOp(child, op)` works on an
 * object inside a group. Exact when the parents scale evenly (the same on
 * every axis); with uneven scales, the turn is the closest a plain rotation
 * can get.
 *
 * @example
 * const local = obj.parent ? transformOpToLocal(op, worldMatrix(obj.parent)) : op;
 * Object.assign(obj, applyTransformOp(saved, local));
 *
 * @param {Object} op - `{ mode: "move", delta }`, `{ mode: "rotate", axis, angle, center }`
 *   or `{ mode: "scale", axis, factor, center }`
 * @param {Mat4} parentWorld - The parent's world matrix
 * @returns {Object} The same operation, in the parent's space
 */
export function transformOpToLocal(op, parentWorld) {
  const inv = invertMat4(parentWorld);
  const unit = (v) => {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  };
  switch (op.mode) {
    case "move":
      return { mode: "move", delta: transformDirection(inv, op.delta) };
    case "rotate":
      // A mirrored parent turns the other way
      return {
        mode: "rotate",
        axis: unit(transformDirection(inv, op.axis)),
        angle: determinantMat4(parentWorld) < 0 ? -op.angle : op.angle,
        center: transformPoint(inv, op.center),
      };
    case "scale":
      return {
        mode: "scale",
        axis: op.axis ? unit(transformDirection(inv, op.axis)) : null,
        factor: op.factor,
        center: transformPoint(inv, op.center),
      };
    default:
      return op;
  }
}
