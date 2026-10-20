/**
 * Converts normalized device coordinates (-1 to +1)
 * into actual screen (pixel) coordinates.
 *
 * Normalized space:
 *   x: -1 (left)  -> +1 (right)
 *   y: -1 (bottom)-> +1 (top)
 *
 * Canvas space:
 *   x: 0 -> width
 *   y: 0 -> height (top-down)
 *
 * @param {{x:number, y:number}} p - Normalized 2D point
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @returns {{x:number, y:number}} Screen-space point
 */
export function screen(p, w, h) {
  return {
    x: (p.x + 1) / 2 * w,
    y: (1 - (p.y + 1) / 2) * h,
  };
}

/**
 * Projects a 3D point onto a 2D plane using
 * a perspective projection.
 *
 * The result is in normalized device coordinates (-1 to +1).
 * `fov` is the vertical field of view; X is divided by `aspect`
 * so shapes are not stretched on non-square canvases.
 *
 * NOTE:
 * - z must be > 0 (in front of the camera)
 * - smaller z => appears larger
 * - larger z => appears smaller
 *
 * @param {{x:number, y:number, z:number}} p - 3D point (camera space)
 * @param {number} fov - Vertical field of view in radians (default: 90°)
 * @param {number} aspect - Canvas width / height (default: 1)
 * @returns {{x:number, y:number}} 2D projected point
 */
export function project(p, fov = Math.PI / 2, aspect = 1) {
  const f = 1 / Math.tan(fov / 2);
  return {
    x: (p.x * f) / (p.z * aspect),
    y: (p.y * f) / p.z,
  };
}
