import { rotateXYZ } from "./transform.js";

/**
 * Rotation matrices and move / rotate / scale operations on an object's
 * transform ({ pos, rot, scale }, applied scale → rotate X, Y, Z → move).
 *
 * Matrices are 3×3, row-major (`m[row][col]`), applied as M · v. They're
 * built from `rotateXYZ` itself, so they always match what the renderers draw.
 *
 * @typedef {[[number,number,number],[number,number,number],[number,number,number]]} Mat3
 * @typedef {{x:number, y:number, z:number}} Vec3
 * @typedef {{ pos:Vec3, rot:Vec3, scale:Vec3 }} Transform
 *
 * @typedef {{ mode:"move", delta:Vec3 }
 *   | { mode:"rotate", axis:Vec3, angle:number, center:Vec3 }
 *   | { mode:"scale", axis:Vec3|null, factor:number, center:Vec3 }} TransformOp
 *   An operation in world space. Rotate: a right-handed turn of `angle`
 *   radians around the unit `axis`, about `center`. Scale: `factor` about
 *   `center`, uniform when `axis` is null, otherwise along that unit axis.
 */

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });

/**
 * The matrix `rotateXYZ(p, rot)` applies.
 *
 * @param {Vec3} rot - Angles in radians (X, then Y, then Z)
 * @returns {Mat3}
 */
export function matFromEuler(rot) {
  const cx = rotateXYZ({ x: 1, y: 0, z: 0 }, rot);
  const cy = rotateXYZ({ x: 0, y: 1, z: 0 }, rot);
  const cz = rotateXYZ({ x: 0, y: 0, z: 1 }, rot);
  return [
    [cx.x, cy.x, cz.x],
    [cx.y, cy.y, cz.y],
    [cx.z, cy.z, cz.z],
  ];
}

/**
 * Angles for `rotateXYZ` (an object's `rot`) from a rotation matrix: the
 * inverse of `matFromEuler`. Looking straight along Y (gimbal lock), X and
 * Z turn the same way, so the whole turn goes into Z.
 *
 * @param {Mat3} m - A rotation matrix
 * @returns {Vec3} Angles in radians
 */
export function eulerFromMat(m) {
  // rotateXYZ's matrix is Rz·Ry·Rx: m[2][0] = sin(y), m[2][1] = cos(y)·sin(x), m[1][0] = sin(z)·cos(y)
  const sy = Math.max(-1, Math.min(1, m[2][0]));
  const y = Math.asin(sy);
  if (Math.abs(sy) < 0.99999) {
    return { x: Math.atan2(m[2][1], m[2][2]), y, z: Math.atan2(m[1][0], m[0][0]) };
  }
  return { x: 0, y, z: Math.atan2(-m[0][1], m[1][1]) };
}

/**
 * A right-handed turn of `angle` radians around a unit `axis` (Rodrigues).
 *
 * @param {Vec3} axis - Unit vector
 * @param {number} angle - Radians
 * @returns {Mat3}
 */
export function matFromAxisAngle(axis, angle) {
  const { x, y, z } = axis, c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/**
 * Matrix product a · b (b is applied first).
 *
 * @param {Mat3} a
 * @param {Mat3} b
 * @returns {Mat3}
 */
export function mulMat(a, b) {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]));
}

/**
 * Matrix times vector, m · v.
 *
 * @param {Mat3} m
 * @param {Vec3} v
 * @returns {Vec3}
 */
export function mulVec(m, v) {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  };
}

/**
 * Applies a world-space operation to a transform and returns the new one
 * (the input isn't changed). `TransformGizmo` reports these.
 *
 * - move: adds `delta` to `pos`
 * - rotate: turns the object around `center`: its position orbits and its
 *   orientation turns, both by the same rotation
 * - scale: scales about `center`. Stretching a rotated object along a world
 *   axis can't be stored as `scale` (it would shear), so it stretches the
 *   object's own axis that points most along it
 *
 * @example
 * Object.assign(obj, applyTransformOp(obj, { mode: "rotate", axis: { x: 0, y: 1, z: 0 }, angle: Math.PI / 2, center: { x: 0, y: 0, z: 0 } }));
 *
 * @param {Transform} t - The transform before the operation
 * @param {TransformOp} op
 * @returns {Transform}
 */
export function applyTransformOp(t, op) {
  switch (op.mode) {
    case "move":
      return { pos: add(t.pos, op.delta), rot: { ...t.rot }, scale: { ...t.scale } };
    case "rotate": {
      const r = matFromAxisAngle(op.axis, op.angle);
      return {
        pos: add(op.center, mulVec(r, sub(t.pos, op.center))),
        rot: eulerFromMat(mulMat(r, matFromEuler(t.rot))),
        scale: { ...t.scale },
      };
    }
    case "scale": {
      const f = op.factor;
      if (!op.axis) {
        return { pos: add(op.center, mul(sub(t.pos, op.center), f)), rot: { ...t.rot }, scale: mul(t.scale, f) };
      }
      const a = op.axis;
      const pos = add(t.pos, mul(a, (f - 1) * dot(sub(t.pos, op.center), a)));
      // The object's own axis most aligned with the stretch (columns of its rotation)
      const m = matFromEuler(t.rot);
      const along = [0, 1, 2].map((j) => Math.abs(m[0][j] * a.x + m[1][j] * a.y + m[2][j] * a.z));
      const j = along.indexOf(Math.max(...along));
      const scale = { ...t.scale };
      scale["xyz"[j]] *= f;
      return { pos, rot: { ...t.rot }, scale };
    }
    default:
      throw new Error("applyTransformOp: unknown mode " + op?.mode);
  }
}
