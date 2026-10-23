import { worldToCamera, cameraToScreen, DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";
import { transformPoint } from "../math/matrix.js";
import { worldMatrix, worldObjects, ancestors } from "../sceneGraph.js";
import { edgeSegments, wireEdges } from "../render/draw.js";

/**
 * Screen-space bounding box of an object, in canvas pixels.
 * Only vertices in front of the camera's near plane are used.
 *
 * Objects inside groups are measured where they're drawn.
 *
 * @param {import("../scene.js").Scene} scene - Scene the object is in
 * @param {Object} obj - Mesh instance (mesh, pos, rot, scale)
 * @returns {{minX:number, minY:number, maxX:number, maxY:number} | null}
 *          The box, or null if the whole object is behind the camera
 */
export function screenBounds(scene, obj) {
  const { camera, canvas } = scene;
  const near = camera.near ?? DEFAULT_NEAR;
  const world = worldMatrix(obj);
  let box = null;

  for (const v of obj.mesh.vertices) {
    const pCam = worldToCamera(transformPoint(world, v), camera);
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
 * By default an object is hit when the point is inside its screen-space
 * bounding box (plus `padding`), and when several are hit, the one whose
 * center is closest to the camera wins. That's fast, but it can't tell apart
 * objects that overlap on screen (a sword guard in front of its blade).
 *
 * With `exact: true` it tests the object's actual triangles (see `pickHit`),
 * so the click always matches what's drawn.
 *
 * Objects inside groups are found too: the result is the object with the
 * mesh that was hit (use `pickHit(...).path`, or `obj.parent`, for its groups).
 *
 * @param {import("../scene.js").Scene} scene - Scene to search
 * @param {number} x - Canvas X in pixels
 * @param {number} y - Canvas Y in pixels
 * @param {Object} [opts]
 * @param {(obj:Object) => boolean} [opts.filter] - Only consider objects that pass
 * @param {number} [opts.padding=4] - Extra pixels around each box (exact: how close to a line counts, for objects without faces)
 * @param {boolean} [opts.exact=false] - Test triangles instead of bounding boxes
 * @returns {Object | null} The object, or null if nothing is hit
 */
export function pick(scene, x, y, { filter = () => true, padding = 4, exact = false } = {}) {
  if (exact) return pickHit(scene, x, y, { filter, padding })?.object ?? null;

  const near = scene.camera.near ?? DEFAULT_NEAR;
  let best = null;
  let bestDepth = Infinity;

  for (const obj of worldObjects(scene)) {
    if (!obj.mesh || !filter(obj)) continue;

    const depth = worldToCamera(transformPoint(obj.world, { x: 0, y: 0, z: 0 }), scene.camera).z;
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
 * Exact picking: the nearest object whose drawn surface is under a canvas
 * pixel, with which face was hit and how far it is. Every face is projected
 * with the same math as the renderers and tested triangle by triangle.
 * Objects without faces (wireframes) are hit within `padding` pixels of
 * one of their lines.
 *
 * Faces with a corner behind the camera's near plane are skipped. The cost
 * is one pass over the objects' vertices per call: fine for clicks and hover
 * on models of a few thousand faces.
 *
 * @example
 * canvas.addEventListener("click", (e) => {
 *   const hit = pickHit(scene, e.offsetX * canvas.width / canvas.clientWidth, e.offsetY * canvas.height / canvas.clientHeight);
 *   if (hit) console.log(hit.object.name, "face", hit.face);
 * });
 *
 * @param {import("../scene.js").Scene} scene - Scene to search
 * @param {number} x - Canvas X in pixels
 * @param {number} y - Canvas Y in pixels
 * @param {Object} [opts]
 * @param {(obj:Object) => boolean} [opts.filter] - Only consider objects that pass
 * @param {number} [opts.padding=4] - How many pixels from a line count as a hit (objects without faces)
 * @param {Object[]} [opts.objects=scene.objects] - Objects to test (with their children)
 * @returns {{ object:Object, face:number, depth:number, path:Object[] } | null}
 *   `object` has the mesh that was hit, `face` is the index in its
 *   `mesh.faces` (-1 for a line), `depth` the distance in front of the
 *   camera, `path` the object then its groups up to the top
 *   (`[part, group, ..., root]`); null if nothing is hit
 */
export function pickHit(scene, x, y, { filter = () => true, padding = 4, objects = scene.objects } = {}) {
  const { camera, canvas } = scene;
  const w = canvas.width, h = canvas.height;
  const near = camera.near ?? DEFAULT_NEAR;
  let best = null;

  for (const object of worldObjects(objects)) {
    if (!object.mesh?.vertices || !filter(object)) continue;
    const mesh = object.mesh;
    const cam = mesh.vertices.map((v) => worldToCamera(transformPoint(object.world, v), camera));
    const scr = cam.map((p) => (p.z > near ? cameraToScreen(p, camera, w, h) : null));
    const closer = (depth) => !best || depth < best.depth;

    if (mesh.faces?.length) {
      mesh.faces.forEach((f, face) => {
        // Polygons as triangle fans
        for (let i = 1; i < f.length - 1; i++) {
          const ia = f[0], ib = f[i], ic = f[i + 1];
          const a = scr[ia], b = scr[ib], c = scr[ic];
          if (!a || !b || !c) continue;
          const bary = barycentric(x, y, a, b, c);
          if (!bary) continue;
          // Depth blended by 1/z, like perspective does (exact on tilted faces)
          const depth = 1 / (bary[0] / cam[ia].z + bary[1] / cam[ib].z + bary[2] / cam[ic].z);
          if (closer(depth)) best = { object, face, depth };
        }
      });
    } else {
      for (const [i, j] of edgeSegments(wireEdges(mesh))) {
        const a = scr[i], b = scr[j];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) > padding) continue;
        const depth = 1 / ((1 - t) / cam[i].z + t / cam[j].z);
        if (closer(depth)) best = { object, face: -1, depth };
      }
    }
  }
  if (best) best.path = ancestors(best.object);
  return best;
}

/** Barycentric weights of (x, y) in triangle abc, or null if outside (or degenerate). */
function barycentric(x, y, a, b, c) {
  const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d;
  const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d;
  const t = 1 - u - v;
  return u >= 0 && v >= 0 && t >= 0 ? [u, v, t] : null;
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
