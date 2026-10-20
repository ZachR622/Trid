import { localToWorld, worldToCamera, cameraToScreen, DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";

/**
 * Screen-space bounding box of an object, in canvas pixels.
 * Only vertices in front of the camera's near plane are used.
 *
 * @param {import("../scene.js").Scene} scene - Scene the object is in
 * @param {Object} obj - Mesh instance (mesh, pos, rot, scale)
 * @returns {{minX:number, minY:number, maxX:number, maxY:number} | null}
 *          The box, or null if the whole object is behind the camera
 */
export function screenBounds(scene, obj) {
  const { camera, canvas } = scene;
  const near = camera.near ?? DEFAULT_NEAR;
  let box = null;

  for (const v of obj.mesh.vertices) {
    const pCam = worldToCamera(localToWorld(v, obj), camera);
    if (pCam.z < near) continue;

    const p = cameraToScreen(pCam, camera, canvas.width, canvas.height);
    if (!box) {
      box = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    } else {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
  }

  return box;
}

/**
 * Finds the object under a canvas pixel.
 *
 * An object is hit when the point is inside its screen-space
 * bounding box (plus `padding`). When several objects are hit,
 * the one whose center is closest to the camera wins.
 *
 * @param {import("../scene.js").Scene} scene - Scene to search
 * @param {number} x - Canvas X in pixels
 * @param {number} y - Canvas Y in pixels
 * @param {Object} [opts]
 * @param {(obj:Object) => boolean} [opts.filter] - Only consider objects that pass
 * @param {number} [opts.padding=4] - Extra pixels around each box
 * @returns {Object | null} The object, or null if nothing is hit
 */
export function pick(scene, x, y, { filter = () => true, padding = 4 } = {}) {
  const near = scene.camera.near ?? DEFAULT_NEAR;
  let best = null;
  let bestDepth = Infinity;

  for (const obj of scene.objects) {
    if (!filter(obj)) continue;

    const depth = worldToCamera(obj.pos, scene.camera).z;
    if (depth < near || depth >= bestDepth) continue;

    const box = screenBounds(scene, obj);
    if (!box) continue;

    if (x >= box.minX - padding && x <= box.maxX + padding &&
        y >= box.minY - padding && y <= box.maxY + padding) {
      best = obj;
      bestDepth = depth;
    }
  }

  return best;
}

/**
 * How many world units one canvas pixel covers at a given distance
 * from the camera. Useful to make things follow the cursor exactly.
 *
 * @param {import("../scene.js").Scene} scene - Scene (for camera fov and canvas height)
 * @param {number} depth - Distance in front of the camera (camera-space z)
 * @returns {number} World units per pixel
 */
export function worldPerPixel(scene, depth) {
  const fov = scene.camera.fov ?? DEFAULT_FOV;
  return (depth * 2 * Math.tan(fov / 2)) / scene.canvas.height;
}
