import { localToWorld, worldToCamera, cameraToScreen, clipNear, rotateXYZ, DEFAULT_NEAR } from "../math/transform.js";
import { clear, drawInstance, edgeSegments, wireEdges } from "./draw.js";
import { parseColor } from "./color.js";
import { newell, cornerNormals, creaseOf } from "./normals.js";
import { textureReady, textureSize, textureIsLive } from "../loaders/texture.js";
import { uvsFor, uvTransform, applyUVTransform } from "./uvMapping.js";

export { newell };

/**
 * An object's materials as a list (`material` can be one material or a
 * list of them, picked per face by `mesh.faceMaterials`). Null when the
 * object is a wireframe.
 *
 * @returns {Material[]|null}
 */
export function materialsOf(obj) {
  const m = obj.material;
  if (!m) return null;
  if (!Array.isArray(m)) return [m];
  return m.length && m[0] ? m : null;
}

/** Direction light comes from when the scene doesn't set one: above, left, in front. */
export const DEFAULT_LIGHT = { x: -0.5, y: 1, z: -0.8 };

/** How bright a face turned fully away from the light still is (0..1). */
export const DEFAULT_AMBIENT = 0.25;

/**
 * Material: how an object's faces look. Objects without one are drawn
 * as wireframes using their `color` and `lineWidth`.
 *
 * An object's `material` can also be a list: each face then uses the
 * entry `mesh.faceMaterials[face]` points at (the first one by default).
 * Built-in cubes and boxes number their sides 0 to 5.
 *
 * @typedef {Object} Material
 * @property {string} [fill] - Face color, any CSS color (default: the scene's color)
 * @property {boolean} [shade=true] - Darken faces that turn away from the light
 * @property {boolean} [wireframe=false] - Also draw the face outlines, with the object's `color` and `lineWidth`
 * @property {boolean} [doubleSided=false] - Also draw faces seen from behind
 * @property {boolean|number} [smooth=false] - Blend the light across faces so curved
 *   shapes look round. `true` keeps edges sharper than 60° hard; a number sets that angle.
 * @property {CanvasImageSource} [texture] - Image drawn on the faces (needs texture coordinates:
 *   built-in shapes and OBJ files with `vt` have them). `fill` tints it (default white).
 * @property {boolean} [pixelated=false] - Keep texture pixels sharp instead of smoothing them
 * @property {import("./uvMapping.js").Mapping} [mapping="uv"] - Where texture coordinates come
 *   from: the mesh's own ("uv"), or made from its shape ("planar", "box", "sphere", "cylinder")
 * @property {number|{u:number,v:number}} [textureRepeat=1] - How many times the image repeats across
 * @property {{u:number,v:number}} [textureOffset] - Moves the image (1 = its whole width or height)
 * @property {number} [textureRotation=0] - Turns the image around its center, in radians
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
    this._patterns = new Map(); // texture source → canvas pattern
    this._warned = new WeakSet();
    this._frame = 0;
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
    this._frame++;

    // Wireframes only: nothing to sort
    if (!scene.objects.some((o) => materialsOf(o))) {
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
      const mats = materialsOf(obj);
      // Split big faces (cached per mesh); extra vertices are midpoints of existing ones
      const split = mats && this.maxFaceSize ? this._split(obj.mesh) : null;
      const verts = split ? withMidpoints(obj.mesh.vertices, split.mids) : obj.mesh.vertices;
      const world = verts.map((v) => localToWorld(v, obj));
      const cam = world.map((p) => worldToCamera(p, camera));
      const color = obj.color ?? scene.color;
      const lineWidth = obj.lineWidth ?? scene.lineWidth;

      if (!mats) {
        for (const [i, j] of edgeSegments(wireEdges(obj.mesh))) {
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

      const sourceFaces = obj.mesh.faces ?? [];
      const base = obj.mesh.vertices.length;

      // Smooth shading: a normal per face corner (split faces get midpoints' normals by averaging)
      const normalAt = (corners, F, i) => {
        if (i < base) return corners[F][sourceFaces[F].indexOf(i)];
        const [a, b] = split.mids[i - base];
        const na = normalAt(corners, F, a), nb = normalAt(corners, F, b);
        return normalize({ x: na.x + nb.x, y: na.y + nb.y, z: na.z + nb.z });
      };
      const lightAt = (n, back) => {
        // Same steps as the vertices: undo the scale, then rotate (keeps normals right on stretched objects)
        const r = normalize(rotateXYZ({ x: n.x / obj.scale.x, y: n.y / obj.scale.y, z: n.z / obj.scale.z }, obj.rot));
        const d = (back ? -1 : 1) * (r.x * light.x + r.y * light.y + r.z * light.z);
        return ambient + (1 - ambient) * Math.max(0, d);
      };
      const flatLight = (face, back) => {
        const nw = normalize(newell(face.map((i) => world[i])));
        const d = (back ? -1 : 1) * (nw.x * light.x + nw.y * light.y + nw.z * light.z);
        return ambient + (1 - ambient) * Math.max(0, d);
      };
      const toWorldNormal = (n) =>
        normalize(rotateXYZ({ x: n.x / obj.scale.x, y: n.y / obj.scale.y, z: n.z / obj.scale.z }, obj.rot));

      // Everything a material needs, worked out once per object and frame
      const prepare = (mat) => {
        const shade = mat.shade !== false;
        const crease = shade ? creaseOf(mat.smooth) : null;
        // Texture coordinates: the mesh's own, or made from its shape (mat.mapping)
        const { uvs: meshUVs, faceUVs } = uvsFor(obj.mesh, mat.mapping);
        const xf = uvTransform(mat);
        const rawUV = (F, i) => {
          const t = faceUVs?.[F];
          if (!t || !meshUVs) return null;
          if (i < base) return meshUVs[t[sourceFaces[F].indexOf(i)]];
          const [a, b] = split.mids[i - base];
          const ta = rawUV(F, a), tb = rawUV(F, b);
          return ta && tb ? { u: (ta.u + tb.u) / 2, v: (ta.v + tb.v) / 2 } : null;
        };
        let tex = null;
        if (mat.texture && textureReady(mat.texture)) {
          if (faceUVs && meshUVs) tex = mat.texture;
          else if (!this._warned.has(obj.mesh)) {
            this._warned.add(obj.mesh);
            console.warn("Trid: this mesh has no texture coordinates (uvs / faceUVs), so its texture isn't drawn. Set material.mapping to make some.");
          }
        }
        return {
          mat, shade, tex,
          fill: mat.fill ?? (mat.texture ? "#ffffff" : scene.color),
          outline: mat.wireframe ? color : null,
          corners: crease ? cornerNormals(obj.mesh, crease) : null,
          effects: mat.effects?.length ? mat.effects : null,
          uvAt: (F, i) => applyUVTransform(xf, rawUV(F, i)),
        };
      };
      // Which material each face uses (mesh.faceMaterials), prepared when first needed
      const looks = new Array(mats.length);
      const faceMats = obj.mesh.faceMaterials;
      const lookOf = (F) => {
        let k = faceMats?.[F] ?? 0;
        if (!(k >= 0 && k < mats.length && mats[k])) k = 0;
        return (looks[k] ??= prepare(mats[k]));
      };

      const faces = split ? split.faces : sourceFaces;
      for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        if (face.length < 3) continue;
        const F = split ? split.origins[f] : f; // the mesh face this one comes from
        const L = lookOf(F);
        const { fill, shade, outline, corners } = L;
        const pts = face.map((i) => cam[i]);

        // Seen from behind? (camera sits at the origin of camera space)
        const n = newell(pts);
        const c = centroid(pts);
        const back = n.x * c.x + n.y * c.y + n.z * c.z >= 0;
        if (back && !L.mat.doubleSided) continue;

        const clipped = clipPolygon(pts, near);
        if (clipped.length < 3) continue;

        // Which edges are real outlines (split faces have extra inner edges); null = all
        const edges = split && clipped === pts ? split.masks[f] : null;

        // Textures: each triangle is filled with the image, mapped by its corners' texture coordinates
        if (L.tex && clipped === pts) {
          const ts = face.map((i) => L.uvAt(F, i));
          if (ts.every(Boolean)) {
            let lit;
            if (!shade) lit = face.map(() => 1);
            else if (corners) lit = face.map((i) => lightAt(normalAt(corners, F, i), back));
            else lit = face.map(() => flatLight(face, back));
            const screen = pts.map(toScreen);
            const n = face.length;
            for (let k = 1; k < n - 1; k++) {
              const fan = (k === 1 ? 1 : 0) | 2 | (k === n - 2 ? 4 : 0);
              items.push({
                depth: c.z,
                poly: [screen[0], screen[k], screen[k + 1]],
                texture: { src: L.tex, uvs: [ts[0], ts[k], ts[k + 1]], pixelated: !!L.mat.pixelated, tint: fill },
                lit: [lit[0], lit[k], lit[k + 1]],
                outline, lineWidth,
                edges: n === 3 ? edges : fan,
              });
            }
            continue;
          }
        }

        // Effects run once per face, at its center (see trid/render/effects.js)
        if (L.effects) {
          // Normal: the face's own, or the average of its corners when smooth
          let nw;
          if (corners) {
            const sum = face.map((i) => toWorldNormal(normalAt(corners, F, i)))
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
          const rgba = this._rgba(ctx, fill);
          const s = {
            base: rgba, normal: nw, position, local: centroid(face.map((i) => verts[i])),
            view: normalize(toCam), lightDir: light, diffuse, light: lit, ambient,
            uv: centerUV(face.map((i) => L.uvAt(F, i))),
            depth: Math.hypot(toCam.x, toCam.y, toCam.z), time, background,
            rgba: (v) => (typeof v === "string" ? this._rgba(ctx, v) : Array.isArray(v) ? v : [v.x, v.y, v.z, 1]),
          };
          let col = [rgba[0] * lit, rgba[1] * lit, rgba[2] * lit, rgba[3]];
          for (const e of L.effects) if (e.canvas) col = e.canvas(col, s, e.uniforms ?? {});
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
          const lit = face.map((i) => lightAt(normalAt(corners, F, i), back));
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

        const brightness = shade ? flatLight(face, back) : 1;
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

      if (it.texture) {
        this._drawTextured(ctx, it);
        if (it.outline) {
          ctx.beginPath();
          ctx.moveTo(it.poly[0].x, it.poly[0].y);
          for (let k = 1; k < it.poly.length; k++) ctx.lineTo(it.poly[k].x, it.poly[k].y);
          ctx.closePath();
        }
      } else {
        ctx.moveTo(it.poly[0].x, it.poly[0].y);
        for (let k = 1; k < it.poly.length; k++) ctx.lineTo(it.poly[k].x, it.poly[k].y);
        ctx.closePath();
        ctx.fillStyle = it.fill.css;
        ctx.fill();
      }

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
      } else if (it.fill?.opaque) {
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
    const g = gradientLine(tri, lit);
    if (!g) return this._shade(ctx, color, (Math.min(...lit) + Math.max(...lit)) / 2);
    const grad = ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
    const a = this._shade(ctx, color, g.lo), b = this._shade(ctx, color, g.hi);
    grad.addColorStop(0, a.css);
    grad.addColorStop(1, b.css);
    return { css: grad, opaque: a.opaque };
  }

  /**
   * Draws a textured triangle: the image as a pattern mapped onto the
   * triangle's corners, tinted by the fill color, then darkened by the light.
   */
  _drawTextured(ctx, it) {
    const { src, uvs, pixelated, tint } = it.texture;
    const { w: W, h: H } = textureSize(src);
    const [p0, p1, p2] = it.poly;

    // Image pixels of each corner (v goes up, image rows go down)
    const U = uvs.map((t) => t.u * W), V = uvs.map((t) => (1 - t.v) * H);
    const du1 = U[1] - U[0], dv1 = V[1] - V[0], du2 = U[2] - U[0], dv2 = V[2] - V[0];
    const det = du1 * dv2 - du2 * dv1;

    const path = (poly) => {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
      ctx.closePath();
    };

    // Slightly enlarged so neighbouring triangles leave no hairline gap. The image,
    // tint and light all use this shape: the next triangle paints over the overlap
    // with its own image and light, so nothing gets darkened twice.
    const shape = grow(it.poly, 0.5);
    path(shape);
    if (Math.abs(det) > 1e-12) {
      // The transform that sends image pixel (U, V) to the screen
      const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y, dx2 = p2.x - p0.x, dy2 = p2.y - p0.y;
      const a = (dx1 * dv2 - dx2 * dv1) / det, b = (dy1 * dv2 - dy2 * dv1) / det;
      const c = (dx2 * du1 - dx1 * du2) / det, d = (dy2 * du1 - dy1 * du2) / det;
      const pattern = this._pattern(ctx, src);
      pattern.setTransform(new DOMMatrix([a, b, c, d, p0.x - a * U[0] - c * V[0], p0.y - b * U[0] - d * V[0]]));
      ctx.imageSmoothingEnabled = !pixelated;
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = tint;
    }
    ctx.fill();
    ctx.imageSmoothingEnabled = true;

    // Tint: multiply by the fill color
    const t = this._rgba(ctx, tint);
    if (t[0] < 1 || t[1] < 1 || t[2] < 1) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = tint;
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    // Light: black on top, as see-through as the face is bright
    const lo = Math.min(...it.lit), hi = Math.max(...it.lit);
    if (lo >= 0.999) return;
    const g = gradientLine(it.poly, it.lit);
    if (g) {
      const grad = ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
      grad.addColorStop(0, `rgba(0, 0, 0, ${1 - g.lo})`);
      grad.addColorStop(1, `rgba(0, 0, 0, ${1 - g.hi})`);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - (lo + hi) / 2})`;
    }
    ctx.fill();
  }

  /** A repeating pattern for a texture (made again each frame for canvases and videos). */
  _pattern(ctx, src) {
    let p = this._patterns.get(src);
    if (!p || (textureIsLive(src) && p.frame !== this._frame)) {
      p = { pattern: ctx.createPattern(src, "repeat"), frame: this._frame };
      this._patterns.set(src, p);
    }
    return p.pattern;
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

/**
 * Where a linear gradient must start and end so its value matches `lit`
 * at the triangle's three corners. Null when the values are all the same.
 */
function gradientLine(tri, lit) {
  const [p0, p1, p2] = tri;
  const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d2x = p2.x - p0.x, d2y = p2.y - p0.y;
  const db1 = lit[1] - lit[0], db2 = lit[2] - lit[0];
  const det = d1x * d2y - d1y * d2x;
  const lo = Math.min(...lit), hi = Math.max(...lit);
  if (Math.abs(det) < 1e-9 || hi - lo < 1 / 255) return null;

  // Value = lit[0] + g · (point - p0)
  const gx = (db1 * d2y - db2 * d1y) / det;
  const gy = (db2 * d1x - db1 * d2x) / det;
  const g2 = gx * gx + gy * gy;
  const s = (lo - lit[0]) / g2, e = (hi - lit[0]) / g2;
  return { x0: p0.x + gx * s, y0: p0.y + gy * s, x1: p0.x + gx * e, y1: p0.y + gy * e, lo, hi };
}

/** A polygon pushed outward from its center by `px` pixels. */
function grow(poly, px) {
  const cx = poly.reduce((a, p) => a + p.x, 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p.y, 0) / poly.length;
  return poly.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
  });
}

/** Average of texture coordinates, or 0, 0 when some are missing. */
function centerUV(ts) {
  if (!ts.every(Boolean)) return { u: 0, v: 0 };
  return { u: ts.reduce((a, t) => a + t.u, 0) / ts.length, v: ts.reduce((a, t) => a + t.v, 0) / ts.length };
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
