import { localToWorld, worldToCamera, cameraToScreen, clipNear, DEFAULT_NEAR } from "../math/transform.js";
import { clear, drawInstance, edgeSegments } from "./draw.js";

/** Direction light comes from when the scene doesn't set one: above, left, in front. */
export const DEFAULT_LIGHT = { x: -0.5, y: 1, z: -0.8 };

/** How bright a face turned fully away from the light still is (0..1). */
export const DEFAULT_AMBIENT = 0.25;

/**
 * Material: how an object's faces look. Objects without one are drawn
 * as wireframes using their `color` and `lineWidth`.
 *
 * @typedef {Object} Material
 * @property {string} [fill] - Face color, any CSS color (default: the scene's color)
 * @property {boolean} [shade=true] - Darken faces that turn away from the light
 * @property {boolean} [wireframe=false] - Also draw the face outlines, with the object's `color` and `lineWidth`
 * @property {boolean} [doubleSided=false] - Also draw faces seen from behind
 */

/**
 * Draws a scene with the canvas 2D context.
 *
 * - Objects without a `material` are wireframes. If no object has one,
 *   they're drawn exactly like `drawInstance` does, as fast as before.
 * - Objects with a `material` draw their mesh's `faces`. Faces and
 *   wireframe lines from every object are sorted far to near and drawn
 *   in that order (painter's algorithm), so near things cover far ones.
 * - Faces seen from behind are skipped unless `doubleSided` is set.
 *   A face's front is the side its vertices go clockwise from.
 *
 * The painter's algorithm is an approximation: faces that cross each
 * other, or a long face next to small ones, can be drawn in the wrong order.
 * `maxFaceSize` reduces this by splitting big faces into small triangles.
 * For exact results, use a renderer with a depth buffer (WebGL).
 *
 * A renderer is any object with a `render(scene)` method, so another
 * one (for example WebGL) can replace this one through `new Scene(canvas, { renderer })`.
 */
export class CanvasRenderer {
  /**
   * @param {Object} [opts]
   * @param {number|null} [opts.maxFaceSize=null] - Split faces bigger than this
   *   fraction of their mesh's size (for example 0.05) into smaller triangles,
   *   so they sort better. Off by default: more faces means slower drawing.
   */
  constructor({ maxFaceSize = null } = {}) {
    this.maxFaceSize = maxFaceSize;
    this._shades = new Map();
    this._splits = new WeakMap();
  }

  /**
   * Clears the canvas and draws every object of the scene.
   *
   * @param {import("../scene.js").Scene} scene
   */
  render(scene) {
    const { ctx, canvas, camera } = scene;
    const w = canvas.width, h = canvas.height;
    clear(ctx, w, h, scene.background);

    // Wireframes only: nothing to sort
    if (!scene.objects.some((o) => o.material)) {
      for (const obj of scene.objects) {
        drawInstance(ctx, obj, camera, w, h, obj.color ?? scene.color, obj.lineWidth ?? scene.lineWidth);
      }
      return;
    }

    const near = camera.near ?? DEFAULT_NEAR;
    const light = normalize(scene.light ?? DEFAULT_LIGHT);
    const ambient = scene.ambient ?? DEFAULT_AMBIENT;
    const toScreen = (p) => cameraToScreen(p, camera, w, h);
    const items = [];

    for (const obj of scene.objects) {
      // Split big faces (cached per mesh); extra vertices are midpoints of existing ones
      const split = obj.material && this.maxFaceSize ? this._split(obj.mesh) : null;
      const verts = split ? withMidpoints(obj.mesh.vertices, split.mids) : obj.mesh.vertices;
      const world = verts.map((v) => localToWorld(v, obj));
      const cam = world.map((p) => worldToCamera(p, camera));
      const color = obj.color ?? scene.color;
      const lineWidth = obj.lineWidth ?? scene.lineWidth;
      const mat = obj.material;

      if (!mat) {
        for (const [i, j] of edgeSegments(obj.mesh.edges)) {
          const seg = clipNear(cam[i], cam[j], near);
          if (!seg) continue;
          items.push({
            depth: (seg[0].z + seg[1].z) / 2,
            line: [toScreen(seg[0]), toScreen(seg[1])],
            color, lineWidth,
          });
        }
        continue;
      }

      const fill = mat.fill ?? scene.color;
      const shade = mat.shade !== false;
      const outline = mat.wireframe ? color : null;

      const faces = split ? split.faces : obj.mesh.faces ?? [];
      for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        if (face.length < 3) continue;
        const pts = face.map((i) => cam[i]);

        // Seen from behind? (camera sits at the origin of camera space)
        const n = newell(pts);
        const c = centroid(pts);
        const back = n.x * c.x + n.y * c.y + n.z * c.z >= 0;
        if (back && !mat.doubleSided) continue;

        const clipped = clipPolygon(pts, near);
        if (clipped.length < 3) continue;

        let brightness = 1;
        if (shade) {
          const nw = normalize(newell(face.map((i) => world[i])));
          const s = back ? -1 : 1;
          const d = s * (nw.x * light.x + nw.y * light.y + nw.z * light.z);
          brightness = ambient + (1 - ambient) * Math.max(0, d);
        }

        items.push({
          depth: c.z,
          poly: clipped.map(toScreen),
          fill: this._shade(ctx, fill, brightness),
          outline, lineWidth,
          // Which edges are real outlines (split faces have extra inner edges); null = all
          edges: split && clipped === pts ? split.masks[f] : null,
        });
      }
    }

    items.sort((a, b) => b.depth - a.depth);

    for (const it of items) {
      ctx.beginPath();
      if (it.line) {
        ctx.moveTo(it.line[0].x, it.line[0].y);
        ctx.lineTo(it.line[1].x, it.line[1].y);
        ctx.lineWidth = it.lineWidth;
        ctx.strokeStyle = it.color;
        ctx.stroke();
        continue;
      }

      ctx.moveTo(it.poly[0].x, it.poly[0].y);
      for (let k = 1; k < it.poly.length; k++) ctx.lineTo(it.poly[k].x, it.poly[k].y);
      ctx.closePath();
      ctx.fillStyle = it.fill.css;
      ctx.fill();

      if (it.outline) {
        ctx.lineWidth = it.lineWidth;
        ctx.strokeStyle = it.outline;
        if (it.edges !== null) {
          // Only the edges that belong to the original face
          const p = it.poly;
          ctx.beginPath();
          for (let k = 0; k < p.length; k++) {
            if (!(it.edges & (1 << k))) continue;
            const q = p[(k + 1) % p.length];
            ctx.moveTo(p[k].x, p[k].y);
            ctx.lineTo(q.x, q.y);
          }
        }
        ctx.stroke();
      } else if (it.fill.opaque) {
        // A thin stroke in the face's own color hides the hairline gaps between faces
        ctx.lineWidth = 1;
        ctx.strokeStyle = it.fill.css;
        ctx.stroke();
      }
    }
  }

  /**
   * Splits a mesh's big faces into triangles no longer than
   * maxFaceSize × the mesh's size. Cached until the mesh's faces change.
   *
   * @returns {{ faces:number[][], masks:(number|null)[], mids:number[][] }}
   *   `mids[k]` is the pair of vertices whose midpoint is vertex `vertices.length + k`.
   *   `masks[f]` has bit k set when edge k of face f is part of an original face
   *   outline (null when the face wasn't split).
   */
  _split(mesh) {
    const faces0 = mesh.faces ?? [];
    const cached = this._splits.get(mesh);
    if (cached && cached.source === faces0 && cached.count === faces0.length && cached.size === this.maxFaceSize) {
      return cached;
    }

    const pos = mesh.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z }));
    let min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const v of pos) {
      min = { x: Math.min(min.x, v.x), y: Math.min(min.y, v.y), z: Math.min(min.z, v.z) };
      max = { x: Math.max(max.x, v.x), y: Math.max(max.y, v.y), z: Math.max(max.z, v.z) };
    }
    const limit = this.maxFaceSize * Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z);
    const limit2 = limit * limit;
    const len2 = (a, b) => (pos[a].x - pos[b].x) ** 2 + (pos[a].y - pos[b].y) ** 2 + (pos[a].z - pos[b].z) ** 2;

    const mids = [];
    const midOf = new Map(); // shared midpoints, so neighbours split the same way
    const midpoint = (a, b) => {
      const key = a < b ? a + "," + b : b + "," + a;
      let m = midOf.get(key);
      if (m === undefined) {
        m = pos.length;
        pos.push({ x: (pos[a].x + pos[b].x) / 2, y: (pos[a].y + pos[b].y) / 2, z: (pos[a].z + pos[b].z) / 2 });
        mids.push([a, b]);
        midOf.set(key, m);
      }
      return m;
    };

    const faces = [], masks = [];
    const MAX_DEPTH = 10;
    for (const face of faces0) {
      if (face.length < 3) continue;
      const n = face.length;
      let big = false;
      for (let i = 0; i < n && !big; i++) big = len2(face[i], face[(i + 1) % n]) > limit2;
      if (!big || !(limit > 0)) {
        faces.push(face);
        masks.push(null);
        continue;
      }

      // Fan into triangles; mask bits mark edges on the face's outline (ab = 1, bc = 2, ca = 4)
      const stack = [];
      for (let i = 1; i < n - 1; i++) {
        const mask = (i === 1 ? 1 : 0) | 2 | (i === n - 2 ? 4 : 0);
        stack.push([face[0], face[i], face[i + 1], mask, 0]);
      }

      // Cut each triangle at the middle of its longest edge until it's small enough
      while (stack.length) {
        const [a, b, c, mask, depth] = stack.pop();
        const ab = len2(a, b), bc = len2(b, c), ca = len2(c, a);
        const longest = Math.max(ab, bc, ca);
        if (longest <= limit2 || depth >= MAX_DEPTH) {
          faces.push([a, b, c]);
          masks.push(mask);
          continue;
        }
        // Rotate so the longest edge is a-b, keeping the mask in step
        let t = [a, b, c], m = mask;
        if (bc === longest) { t = [b, c, a]; m = ((mask >> 1) | (mask << 2)) & 7; }
        else if (ca === longest) { t = [c, a, b]; m = ((mask >> 2) | (mask << 1)) & 7; }
        const [p, q, r] = t;
        const mid = midpoint(p, q);
        const onAB = m & 1, onBC = (m >> 1) & 1, onCA = (m >> 2) & 1;
        stack.push([p, mid, r, onAB | (onCA << 2), depth + 1]); // p-mid, mid-r (inner), r-p
        stack.push([mid, q, r, onAB | (onBC << 1), depth + 1]); // mid-q, q-r, r-mid (inner)
      }
    }

    const out = { faces, masks, mids, source: faces0, count: faces0.length, size: this.maxFaceSize };
    this._splits.set(mesh, out);
    return out;
  }

  /** CSS color for `color` at a brightness, cached (brightness is rounded to 1/255). */
  _shade(ctx, color, brightness) {
    const level = Math.round(brightness * 255);
    const key = color + "|" + level;
    let out = this._shades.get(key);
    if (!out) {
      const [r, g, b, a] = parseColor(ctx, color);
      const k = level / 255;
      out = {
        css: `rgba(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)}, ${a})`,
        opaque: a >= 1,
      };
      this._shades.set(key, out);
    }
    return out;
  }
}

/** The mesh's vertices followed by the midpoints listed in `mids`. */
function withMidpoints(vertices, mids) {
  const out = vertices.slice();
  for (const [a, b] of mids) {
    const p = out[a], q = out[b];
    out.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 });
  }
  return out;
}

/**
 * Turns any CSS color into [r, g, b, a], using the canvas to understand it.
 * Unknown colors come out black.
 */
function parseColor(ctx, color) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  const s = String(ctx.fillStyle);
  ctx.restore();

  if (s[0] === "#") {
    const hex = s.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1);
  }
  const nums = (s.match(/[\d.]+/g) ?? []).map(Number);
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}

/**
 * Normal of a polygon (Newell's method, works for any number of points).
 * Points clockwise as seen from a side give a normal pointing to that side.
 */
export function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return { x, y, z };
}

function centroid(pts) {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p.x; y += p.y; z += p.z; }
  return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** Cuts a camera-space polygon at z = near, keeping the part in front. */
function clipPolygon(pts, near) {
  if (pts.every((p) => p.z >= near)) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const aIn = a.z >= near, bIn = b.z >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (near - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near });
    }
  }
  return out;
}
