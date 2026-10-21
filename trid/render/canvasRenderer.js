import { localToWorld, worldToCamera, cameraToScreen, clipNear, rotateXYZ, DEFAULT_NEAR } from "../math/transform.js";
import { clear, drawInstance, edgeSegments } from "./draw.js";
import { parseColor } from "./color.js";
import { newell, cornerNormals, creaseOf } from "./normals.js";

export { newell };

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
 * @property {boolean|number} [smooth=false] - Blend the light across faces so curved
 *   shapes look round. `true` keeps edges sharper than 60° hard; a number sets that angle.
 * @property {Object[]} [effects] - Effects applied in order, like `[toon(), rim()]`.
 *   See trid/render/effects.js. The canvas renderer runs them once per face.
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
    this._colors = new Map();
    this._start = performance.now();
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
    // For effects
    const camPos = { x: camera.x ?? 0, y: camera.y ?? 0, z: camera.z ?? 0 };
    const time = (performance.now() - this._start) / 1000;
    const background = this._rgba(ctx, scene.background);

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

      // Smooth shading: a normal per face corner (split faces get midpoints' normals by averaging)
      const crease = shade ? creaseOf(mat.smooth) : null;
      const corners = crease ? cornerNormals(obj.mesh, crease) : null;
      const sourceFaces = obj.mesh.faces ?? [];
      const base = obj.mesh.vertices.length;
      const normalAt = (F, i) => {
        if (i < base) return corners[F][sourceFaces[F].indexOf(i)];
        const [a, b] = split.mids[i - base];
        const na = normalAt(F, a), nb = normalAt(F, b);
        return normalize({ x: na.x + nb.x, y: na.y + nb.y, z: na.z + nb.z });
      };
      const lightAt = (n, back) => {
        // Same steps as the vertices: undo the scale, then rotate (keeps normals right on stretched objects)
        const r = normalize(rotateXYZ({ x: n.x / obj.scale.x, y: n.y / obj.scale.y, z: n.z / obj.scale.z }, obj.rot));
        const d = (back ? -1 : 1) * (r.x * light.x + r.y * light.y + r.z * light.z);
        return ambient + (1 - ambient) * Math.max(0, d);
      };

      // Effects run once per face, at its center (see trid/render/effects.js)
      const effects = mat.effects?.length ? mat.effects : null;
      const toWorldNormal = (n) =>
        normalize(rotateXYZ({ x: n.x / obj.scale.x, y: n.y / obj.scale.y, z: n.z / obj.scale.z }, obj.rot));

      const faces = split ? split.faces : sourceFaces;
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

        // Which edges are real outlines (split faces have extra inner edges); null = all
        const edges = split && clipped === pts ? split.masks[f] : null;

        if (effects) {
          // Normal: the face's own, or the average of its corners when smooth
          let nw;
          if (corners) {
            const F = split ? split.origins[f] : f;
            const sum = face.map((i) => toWorldNormal(normalAt(F, i)))
              .reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }), { x: 0, y: 0, z: 0 });
            nw = normalize(sum);
          } else {
            nw = normalize(newell(face.map((i) => world[i])));
          }
          if (back) nw = { x: -nw.x, y: -nw.y, z: -nw.z };

          const position = centroid(face.map((i) => world[i]));
          const toCam = { x: camPos.x - position.x, y: camPos.y - position.y, z: camPos.z - position.z };
          const diffuse = Math.max(0, nw.x * light.x + nw.y * light.y + nw.z * light.z);
          const lit = shade ? ambient + (1 - ambient) * diffuse : 1;
          const base = this._rgba(ctx, fill);
          const s = {
            base, normal: nw, position, local: centroid(face.map((i) => verts[i])),
            view: normalize(toCam), lightDir: light, diffuse, light: lit, ambient,
            depth: Math.hypot(toCam.x, toCam.y, toCam.z), time, background,
            rgba: (v) => (typeof v === "string" ? this._rgba(ctx, v) : Array.isArray(v) ? v : [v.x, v.y, v.z, 1]),
          };
          let col = [base[0] * lit, base[1] * lit, base[2] * lit, base[3]];
          for (const e of effects) if (e.canvas) col = e.canvas(col, s, e.uniforms ?? {});
          const k = col.map((x) => Math.min(1, Math.max(0, x)));
          items.push({
            depth: c.z,
            poly: clipped.map(toScreen),
            fill: { css: `rgba(${Math.round(k[0] * 255)}, ${Math.round(k[1] * 255)}, ${Math.round(k[2] * 255)}, ${k[3]})`, opaque: k[3] >= 1 },
            outline, lineWidth, edges,
          });
          continue;
        }

        if (corners) {
          const F = split ? split.origins[f] : f;
          const lit = face.map((i) => lightAt(normalAt(F, i), back));
          if (clipped === pts) {
            // One gradient per triangle: brightness changes linearly across a triangle
            const screen = pts.map(toScreen);
            const n = face.length;
            for (let k = 1; k < n - 1; k++) {
              const tri = [screen[0], screen[k], screen[k + 1]];
              const fan = (k === 1 ? 1 : 0) | 2 | (k === n - 2 ? 4 : 0);
              items.push({
                depth: c.z,
                poly: tri,
                fill: this._gradient(ctx, fill, tri, [lit[0], lit[k], lit[k + 1]]),
                outline, lineWidth,
                edges: n === 3 ? edges : fan,
              });
            }
            continue;
          }
          // Cut by the near plane: use the average brightness
          const avg = lit.reduce((a, b) => a + b, 0) / lit.length;
          items.push({ depth: c.z, poly: clipped.map(toScreen), fill: this._shade(ctx, fill, avg), outline, lineWidth, edges });
          continue;
        }

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
          edges,
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

    // Meshes marked as changed have been redrawn from their new data
    for (const obj of scene.objects) if (obj.mesh.dirty) obj.mesh.dirty = false;
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
    if (cached && !mesh.dirty && cached.source === faces0 && cached.count === faces0.length && cached.size === this.maxFaceSize) {
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

    const faces = [], masks = [], origins = [];
    const MAX_DEPTH = 10;
    for (let f = 0; f < faces0.length; f++) {
      const face = faces0[f];
      if (face.length < 3) continue;
      const n = face.length;
      let big = false;
      for (let i = 0; i < n && !big; i++) big = len2(face[i], face[(i + 1) % n]) > limit2;
      if (!big || !(limit > 0)) {
        faces.push(face);
        masks.push(null);
        origins.push(f);
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
          origins.push(f);
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

    const out = { faces, masks, mids, origins, source: faces0, count: faces0.length, size: this.maxFaceSize };
    this._splits.set(mesh, out);
    return out;
  }

  /**
   * A fill for a triangle whose corners have different brightness:
   * a linear gradient along the direction brightness changes fastest.
   * Exact, because brightness changes linearly across a triangle.
   */
  _gradient(ctx, color, tri, lit) {
    const [p0, p1, p2] = tri;
    const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d2x = p2.x - p0.x, d2y = p2.y - p0.y;
    const db1 = lit[1] - lit[0], db2 = lit[2] - lit[0];
    const det = d1x * d2y - d1y * d2x;
    const lo = Math.min(...lit), hi = Math.max(...lit);
    if (Math.abs(det) < 1e-9 || hi - lo < 1 / 255) return this._shade(ctx, color, (lo + hi) / 2);

    // Brightness = lit[0] + g · (point - p0)
    const gx = (db1 * d2y - db2 * d1y) / det;
    const gy = (db2 * d1x - db1 * d2x) / det;
    const g2 = gx * gx + gy * gy;
    const s = (lo - lit[0]) / g2, e = (hi - lit[0]) / g2;
    const grad = ctx.createLinearGradient(p0.x + gx * s, p0.y + gy * s, p0.x + gx * e, p0.y + gy * e);
    const a = this._shade(ctx, color, lo), b = this._shade(ctx, color, hi);
    grad.addColorStop(0, a.css);
    grad.addColorStop(1, b.css);
    return { css: grad, opaque: a.opaque };
  }

  /** [r, g, b, a] from 0 to 1 for a CSS color, cached. */
  _rgba(ctx, css) {
    let c = this._colors.get(css);
    if (!c) {
      const [r, g, b, a] = parseColor(ctx, css);
      c = [r / 255, g / 255, b / 255, a];
      this._colors.set(css, c);
    }
    return c;
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
