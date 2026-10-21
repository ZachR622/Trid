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
 *
 * A renderer is any object with a `render(scene)` method, so another
 * one (for example WebGL) can replace this one through `new Scene(canvas, { renderer })`.
 */
export class CanvasRenderer {
  constructor() {
    this._shades = new Map();
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
      const world = obj.mesh.vertices.map((v) => localToWorld(v, obj));
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

      for (const face of obj.mesh.faces ?? []) {
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
        ctx.stroke();
      } else if (it.fill.opaque) {
        // A thin stroke in the face's own color hides the hairline gaps between faces
        ctx.lineWidth = 1;
        ctx.strokeStyle = it.fill.css;
        ctx.stroke();
      }
    }
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
