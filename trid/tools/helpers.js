import { worldToCamera, cameraToScreen, DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";
import { transformPoint, determinantMat4 } from "../math/matrix.js";
import { worldMatrix, worldObjects, ancestors } from "../sceneGraph.js";
import { edgeSegments, wireEdges } from "../render/draw.js";
import { materialsOf } from "../render/canvasRenderer.js";
import { newell } from "../render/normals.js";
import { uvsFor, uvTransform, applyUVTransform } from "../render/uvMapping.js";

/**
 * Whether picking can find an object: not when it, or one of its groups,
 * has `pickable: false` (helpers like a floor grid).
 *
 * @param {Object} obj
 * @returns {boolean}
 */
export function isPickable(obj) {
  for (let o = obj; o; o = o.parent) if (o.pickable === false) return false;
  return true;
}

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
 * Objects with `pickable: false` (or inside a group with it) are never found.
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
    if (!obj.mesh || !isPickable(obj) || !filter(obj)) continue;

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
 * The hit also says where on the face: the point (in the world and in the
 * mesh's own space), the triangle and its barycentric weights, the face's
 * normal, and the texture coordinates there (for painting on a model).
 *
 * Objects with `pickable: false` (or inside a group with it) are skipped.
 * Faces with a corner behind the camera's near plane are skipped. The cost
 * is one pass over the objects' vertices per call: fine for clicks and hover
 * on models of a few thousand faces.
 *
 * @example
 * canvas.addEventListener("click", (e) => {
 *   const hit = pickHit(scene, e.offsetX * canvas.width / canvas.clientWidth, e.offsetY * canvas.height / canvas.clientHeight);
 *   if (hit) console.log(hit.object.name, "face", hit.face, "at", hit.point, "uv", hit.uv);
 * });
 *
 * @param {import("../scene.js").Scene} scene - Scene to search
 * @param {number} x - Canvas X in pixels
 * @param {number} y - Canvas Y in pixels
 * @param {Object} [opts]
 * @param {(obj:Object) => boolean} [opts.filter] - Only consider objects that pass
 * @param {number} [opts.padding=4] - How many pixels from a line count as a hit (objects without faces)
 * @param {Object[]} [opts.objects=scene.objects] - Objects to test (with their children)
 * @returns {PickHit | null} null if nothing is hit
 *
 * @typedef {Object} PickHit
 * @property {Object} object - The object with the mesh that was hit
 * @property {number} face - Index in its `mesh.faces`, or -1 for a line of a wireframe
 * @property {number} depth - Distance in front of the camera (camera-space z)
 * @property {Object[]} path - The object, then its groups up to the top: `[part, group, ..., root]`
 * @property {{x,y,z}} point - Where the hit is, in the world
 * @property {{x,y,z}} local - Where the hit is, in the mesh's own space (`mesh.vertices` space)
 * @property {number[]|null} triangle - The 3 vertex indices of the triangle hit (a face with
 *   more corners is cut into a fan from its first corner); null for a line
 * @property {number[]|null} barycentric - Weights of those 3 vertices at the hit (they add up
 *   to 1; `local` = their weighted sum); null for a line
 * @property {{x,y,z}|null} normal - Unit normal of the face hit, in the world, on its front
 *   side; null for a line
 * @property {{u,v}|null} uv - Texture coordinates at the hit (the face material's `mapping`,
 *   before `textureRepeat` / `textureOffset` / `textureRotation`); null without any
 * @property {{u,v}|null} textureUV - Where the texture is read at the hit: `uv` with the
 *   material's repeat, offset and rotation (can be outside 0..1 when it repeats; image
 *   pixel = `(fract(u) × width, (1 - fract(v)) × height)`); null without texture coordinates
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
    if (!object.mesh?.vertices || !isPickable(object) || !filter(object)) continue;
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
          if (closer(depth)) {
            // Screen weights → weights on the triangle itself (perspective-correct)
            const w = [bary[0] / cam[ia].z * depth, bary[1] / cam[ib].z * depth, bary[2] / cam[ic].z * depth];
            best = { object, face, depth, triangle: [ia, ib, ic], corners: [0, i, i + 1], barycentric: w };
          }
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
        if (closer(depth)) best = { object, face: -1, depth, segment: [i, j], along: (t / cam[j].z) * depth };
      }
    }
  }
  return best ? describeHit(best) : null;
}

/** Fills in where on the face (or line) a `pickHit` hit is. */
function describeHit(h) {
  const { object, face } = h;
  const mesh = object.mesh;
  const v = mesh.vertices;
  const out = {
    object, face, depth: h.depth, path: ancestors(object),
    point: null, local: null, triangle: null, barycentric: null, normal: null, uv: null, textureUV: null,
  };

  if (face < 0) {
    const [i, j] = h.segment, t = h.along;
    out.local = lerp(v[i], v[j], t);
    out.point = transformPoint(object.world, out.local);
    return out;
  }

  const [a, b, c] = h.triangle, w = h.barycentric;
  out.triangle = h.triangle;
  out.barycentric = w;
  out.local = {
    x: w[0] * v[a].x + w[1] * v[b].x + w[2] * v[c].x,
    y: w[0] * v[a].y + w[1] * v[b].y + w[2] * v[c].y,
    z: w[0] * v[a].z + w[1] * v[b].z + w[2] * v[c].z,
  };
  out.point = transformPoint(object.world, out.local);

  // The face's normal in the world; a mirrored object reverses its winding
  const f = mesh.faces[face];
  const n = newell(f.map((i) => transformPoint(object.world, v[i])));
  const k = (determinantMat4(object.world) < 0 ? -1 : 1) / (Math.hypot(n.x, n.y, n.z) || 1);
  out.normal = { x: n.x * k, y: n.y * k, z: n.z * k };

  // Texture coordinates, from the face's material (its mapping, repeat, offset...)
  const mats = materialsOf(object);
  let m = mesh.faceMaterials?.[face] ?? 0;
  if (mats && !(m >= 0 && m < mats.length && mats[m])) m = 0;
  const mat = mats ? mats[m] : null;
  const { uvs, faceUVs } = uvsFor(mesh, mat?.mapping);
  const ft = faceUVs?.[face];
  const ts = uvs && ft ? h.corners.map((corner) => uvs[ft[corner]]) : null;
  if (ts && ts.every(Boolean)) {
    out.uv = {
      u: w[0] * ts[0].u + w[1] * ts[1].u + w[2] * ts[2].u,
      v: w[0] * ts[0].v + w[1] * ts[1].v + w[2] * ts[2].v,
    };
    out.textureUV = applyUVTransform(mat ? uvTransform(mat) : null, out.uv);
  }
  return out;
}

function lerp(p, q, t) {
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t };
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
