import { project, screen } from "./projection.js";

/**
 * Camera object. Every field is optional and falls back to its default.
 *
 * The camera looks down +Z when yaw and pitch are 0.
 *
 * @typedef {Object} Camera
 * @property {number} [x=0] - Position on X
 * @property {number} [y=0] - Position on Y
 * @property {number} [z=0] - Position on Z
 * @property {number} [yaw=0] - Turn around Y in radians (> 0 turns right)
 * @property {number} [pitch=0] - Tilt around X in radians (> 0 looks up)
 * @property {number} [fov=Math.PI/2] - Vertical field of view in radians
 * @property {number} [near=0.01] - Near plane distance; closer geometry is clipped
 * @property {number} [far=1000] - Far distance; farther geometry isn't drawn (WebGL renderer only)
 */

/** Default vertical field of view (90°). */
export const DEFAULT_FOV = Math.PI / 2;

/** Default near plane distance. */
export const DEFAULT_NEAR = 0.01;

/**
 * Converts a vertex from local (mesh) space to world space
 * using an instance transform.
 *
 * Transformation order:
 * 1. Scale
 * 2. Rotate (X then Y then Z)
 * 3. Translate to world position
 *
 * @param {{x:number,y:number,z:number}} v - Local-space vertex
 * @param {{
 *   pos:{x:number,y:number,z:number},
 *   rot:{x:number,y:number,z:number},
 *   scale:{x:number,y:number,z:number}
 * }} inst - Mesh instance transform
 *
 * @returns {{x:number,y:number,z:number}} World-space vertex
 */
export function localToWorld(v, inst) {
  let p = scale(v, inst.scale.x, inst.scale.y, inst.scale.z);
  p = rotateXYZ(p, inst.rot);
  p = translate(p, inst.pos.x, inst.pos.y, inst.pos.z);
  return p;
}


/**
 * Converts a world-space point into camera space.
 *
 * Steps:
 * 1. Move the point relative to the camera position
 * 2. Undo the camera's yaw, then its pitch
 *
 * In camera space the camera sits at the origin looking down +Z.
 *
 * @param {{x:number,y:number,z:number}} pWorld - World-space point
 * @param {Camera} camera - Camera object
 *
 * @returns {{x:number,y:number,z:number}} Camera-space point
 */
export function worldToCamera(pWorld, camera) {
  let p = translate(pWorld, -(camera.x ?? 0), -(camera.y ?? 0), -(camera.z ?? 0));
  p = rotateY(p, camera.yaw ?? 0);
  p = rotateX(p, camera.pitch ?? 0);
  return p;
}

/**
 * Converts a camera-space point into screen-space coordinates.
 *
 * Steps:
 * 1. Perspective projection (3D → 2D) using the camera's fov
 *    and the canvas aspect ratio
 * 2. Convert normalized coords to screen pixels
 *
 * NOTE: z must be > 0 (in front of the camera). Use `clipNear`
 * on segments first if they may cross behind the camera.
 *
 * @param {{x:number,y:number,z:number}} pCam - Camera-space point
 * @param {Camera} camera - Camera object
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 *
 * @returns {{x:number,y:number}} Screen-space point
 */
export function cameraToScreen(pCam, camera, w, h) {
  return screen(project(pCam, camera.fov ?? DEFAULT_FOV, w / h), w, h);
}

/**
 * Converts a world-space point into screen-space coordinates.
 *
 * Steps:
 * 1. World space → camera space (`worldToCamera`)
 * 2. Camera space → screen pixels (`cameraToScreen`)
 *
 * @param {{x:number,y:number,z:number}} pWorld - World-space point
 * @param {Camera} camera - Camera object
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 *
 * @returns {{x:number,y:number}} Screen-space point
 */
export function worldToScreen(pWorld, camera, w, h) {
  return cameraToScreen(worldToCamera(pWorld, camera), camera, w, h);
}

/**
 * Direction the camera looks at, in world space (unit vector).
 *
 * @param {Camera} camera - Camera object
 * @returns {{x:number,y:number,z:number}} Forward vector
 */
export function cameraForward(camera) {
  const yaw = camera.yaw ?? 0;
  const pitch = camera.pitch ?? 0;
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
}

/**
 * Direction of the screen's right side, in world space (unit vector).
 *
 * @param {Camera} camera - Camera object
 * @returns {{x:number,y:number,z:number}} Right vector
 */
export function cameraRight(camera) {
  const yaw = camera.yaw ?? 0;
  return {
    x: Math.cos(yaw),
    y: 0,
    z: -Math.sin(yaw),
  };
}

/**
 * Direction of the screen's top side, in world space (unit vector).
 *
 * @param {Camera} camera - Camera object
 * @returns {{x:number,y:number,z:number}} Up vector
 */
export function cameraUp(camera) {
  const yaw = camera.yaw ?? 0;
  const pitch = camera.pitch ?? 0;
  return {
    x: -Math.sin(pitch) * Math.sin(yaw),
    y: Math.cos(pitch),
    z: -Math.sin(pitch) * Math.cos(yaw),
  };
}

/**
 * Clips a camera-space segment against the near plane (z = near).
 *
 * - Both ends in front: segment returned unchanged
 * - Both ends behind: returns null (nothing to draw)
 * - One end behind: that end is moved onto the near plane
 *
 * @param {{x:number,y:number,z:number}} a - Segment start (camera space)
 * @param {{x:number,y:number,z:number}} b - Segment end (camera space)
 * @param {number} near - Near plane distance (> 0)
 *
 * @returns {[{x:number,y:number,z:number}, {x:number,y:number,z:number}] | null}
 */
export function clipNear(a, b, near) {
  const aIn = a.z >= near;
  const bIn = b.z >= near;

  if (aIn && bIn) return [a, b];
  if (!aIn && !bIn) return null;

  const t = (near - a.z) / (b.z - a.z);
  const p = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: near,
  };

  return aIn ? [a, p] : [p, b];
}

/**
 * Scales a 3D point along each axis.
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {number} sx - Scale factor on X axis
 * @param {number} sy - Scale factor on Y axis
 * @param {number} sz - Scale factor on Z axis
 * @returns {{x:number,y:number,z:number}} Scaled point
 */
export function scale(p, sx, sy, sz) {
  return {
    x: p.x * sx,
    y: p.y * sy,
    z: p.z * sz,
  };
}

/**
 * Translates a 3D point in space.
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {number} dx - Translation on X axis
 * @param {number} dy - Translation on Y axis
 * @param {number} dz - Translation on Z axis
 * @returns {{x:number,y:number,z:number}} Translated point
 */
export function translate(p, dx, dy, dz) {
  return {
    x: p.x + dx,
    y: p.y + dy,
    z: p.z + dz,
  };
}

/**
 * Rotates a 3D point around the X axis (YZ plane).
 *
 * This creates an up/down “pitch” rotation.
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {number} angle - Rotation angle in radians
 * @returns {{x:number,y:number,z:number}} Rotated point
 */
export function rotateX(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: p.x,
    y: p.y * c - p.z * s,
    z: p.y * s + p.z * c,
  };
}

/**
 * Rotates a 3D point around the Y axis (XZ plane).
 *
 * This creates a left/right “yaw” rotation.
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {number} angle - Rotation angle in radians
 * @returns {{x:number,y:number,z:number}} Rotated point
 */
export function rotateY(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: p.x * c - p.z * s,
    y: p.y,
    z: p.x * s + p.z * c,
  };
}

/**
 * Rotates a 3D point around the Z axis (XY plane).
 *
 * This creates a “roll” rotation (spins in 2D).
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {number} angle - Rotation angle in radians
 * @returns {{x:number,y:number,z:number}} Rotated point
 */
export function rotateZ(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
    z: p.z,
  };
}

/**
 * Applies Euler rotations to a point.
 *
 * Rotation order matters. This function applies:
 * 1) rotateX
 * 2) rotateY
 * 3) rotateZ
 *
 * If you change the order, the final orientation will change.
 *
 * @param {{x:number,y:number,z:number}} p - Input point
 * @param {{x:number,y:number,z:number}} rot - Rotation angles in radians
 * @returns {{x:number,y:number,z:number}} Rotated point
 */
export function rotateXYZ(p, rot) {
  let r = rotateX(p, rot.x);
  r = rotateY(r, rot.y);
  r = rotateZ(r, rot.z);
  return r;
}
