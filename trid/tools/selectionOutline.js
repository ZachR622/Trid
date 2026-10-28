import { worldToCamera, cameraToScreen, clipNear, DEFAULT_NEAR } from "../math/transform.js";
import { transformPoint, determinantMat4 } from "../math/matrix.js";
import { worldObjects } from "../sceneGraph.js";
import { edgeSegments, wireEdges } from "../render/draw.js";
import { materialsOf, clipPolygon } from "../render/canvasRenderer.js";
import { newell } from "../render/normals.js";

/**
 * A colored line around selected objects, like the selection in a 3D editor.
 * Where something in front hides part of them, that part's outline is drawn
 * faintly, so you can still see where the whole selection is.
 *
 * It draws on top of the finished picture (after post effects), so it looks
 * the same with both renderers. Groups are outlined as a whole: their
 * children's shapes join into one outline.
 *
 * Add it before tools that draw handles (like `TransformGizmo`), so the
 * handles stay on top, or use `TransformGizmo({ outline: true })`.
 *
 * @example
 * const selection = scene.use(new SelectionOutline());
 * selection.targets = [box];
 */
export class SelectionOutline {
  /**
   * @param {Object} [opts]
   * @param {Object[]|(() => Object[])} [opts.targets=[]] - Objects to outline, or a function
   *   asked every frame (like `() => gizmo.targets`)
   * @param {string} [opts.color="#ffa64d"] - Line color
   * @param {number} [opts.width=2] - Line width in CSS pixels
   * @param {number} [opts.hidden=0.35] - Opacity of the outline where the objects are hidden
   *   behind others (0: not shown)
   */
  constructor({ targets = [], color = "#ffa64d", width = 2, hidden = 0.35 } = {}) {
    this.targets = targets;
    this.color = color;
    this.width = width;
    this.hidden = hidden;
    /** Hide the outline without removing the tool. */
    this.visible = true;
    this._canvases = [];
  }

  /** The objects outlined this frame. */
  current() {
    const t = typeof this.targets === "function" ? this.targets() : this.targets;
    return Array.isArray(t) ? t.filter(Boolean) : [];
  }

  draw(ctx, scene) {
    if (!this.visible) return;
    const targets = this.current();
    if (!targets.length) return;
    const { canvas, camera } = scene;
    const W = canvas.width, H = canvas.height;
    const near = camera.near ?? DEFAULT_NEAR;
    const r = Math.max(0.5, this.width * (W / (canvas.clientWidth || W))); // canvas pixels

    // The selected objects' faces and lines on screen
    const selected = new Set(worldObjects(targets).filter((o) => o.mesh));
    const sel = [];
    for (const obj of selected) shapes(obj, scene, near, sel, true);
    if (!sel.length) return;

    // Only the area around them is worked on
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of sel) {
      for (const p of s.pts) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    const pad = Math.ceil(r) + 3;
    const rect = {
      x: Math.max(0, Math.floor(x0) - pad), y: Math.max(0, Math.floor(y0) - pad),
    };
    rect.w = Math.min(W, Math.ceil(x1) + pad) - rect.x;
    rect.h = Math.min(H, Math.ceil(y1) + pad) - rect.y;
    if (rect.w <= 0 || rect.h <= 0) return;

    // Everything else that has faces there, which can hide the selection
    const all = [...sel];
    for (const obj of worldObjects(scene)) {
      if (!obj.mesh || selected.has(obj) || !materialsOf(obj)) continue;
      shapes(obj, scene, near, all, false, rect);
    }
    all.sort((a, b) => b.depth - a.depth);

    const [full, seen, rim] = [0, 1, 2].map((i) => this._canvas(i, rect.w, rect.h));
    // The whole selection, and the part of it that's in front (drawn back to front:
    // nearer faces of other objects erase it)
    paint(full, sel, rect, () => true);
    paint(seen, all, rect, (s) => s.selected);

    const out = (mask, alpha) => {
      this._rim(mask, rim, r);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(rim, rect.x, rect.y);
      ctx.restore();
    };
    if (this.hidden > 0) out(full, this.hidden);
    out(seen, 1);
  }

  /**
   * The ring around a mask: the mask spread `r` pixels in every direction,
   * colored, minus the mask itself.
   */
  _rim(mask, rim, r) {
    const c = rim.getContext("2d");
    c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, rim.width, rim.height);
    const radii = [];
    for (let k = 1; k <= r; k++) radii.push(k);
    if (r % 1 || !radii.length) radii.push(r);
    for (const k of radii) {
      const n = Math.max(8, Math.ceil(2 * Math.PI * k));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        c.drawImage(mask, Math.cos(a) * k, Math.sin(a) * k);
      }
    }
    c.globalCompositeOperation = "source-in";
    c.fillStyle = this.color;
    c.fillRect(0, 0, rim.width, rim.height);
    c.globalCompositeOperation = "destination-out";
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = "source-over";
  }

  /** A spare canvas of a size (kept between frames). */
  _canvas(i, w, h) {
    let c = this._canvases[i];
    if (!c) c = this._canvases[i] = document.createElement("canvas");
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }
}

/**
 * Pushes an object's faces seen from the front (and double-sided ones) as
 * screen polygons `{ pts, depth, selected }`, or its lines for a wireframe.
 * With `rect`, only shapes reaching into it.
 */
function shapes(obj, scene, near, out, selected, rect) {
  const { camera, canvas } = scene;
  const cam = obj.mesh.vertices.map((v) => worldToCamera(transformPoint(obj.world, v), camera));
  const toScreen = (p) => cameraToScreen(p, camera, canvas.width, canvas.height);
  const inRect = (pts) => {
    if (!rect) return true;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of pts) {
      a = Math.min(a, p.x); b = Math.min(b, p.y);
      c = Math.max(c, p.x); d = Math.max(d, p.y);
    }
    return c >= rect.x && a <= rect.x + rect.w && d >= rect.y && b <= rect.y + rect.h;
  };
  const mats = materialsOf(obj);

  if (!mats) {
    // A wireframe: its lines are its shape
    const width = obj.lineWidth ?? scene.lineWidth ?? 1;
    for (const [i, j] of edgeSegments(wireEdges(obj.mesh))) {
      const seg = clipNear(cam[i], cam[j], near);
      if (!seg) continue;
      const pts = seg.map(toScreen);
      if (inRect(pts)) out.push({ pts, line: width, depth: (seg[0].z + seg[1].z) / 2, selected });
    }
    return;
  }

  const flip = determinantMat4(obj.world) < 0;
  const faceMats = obj.mesh.faceMaterials;
  for (const [F, face] of (obj.mesh.faces ?? []).entries()) {
    if (face.length < 3) continue;
    const pts = face.map((i) => cam[i]);
    const n = newell(pts);
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
    const back = (n.x * cx + n.y * cy + n.z * cz >= 0) !== flip;
    if (back && !(mats[faceMats?.[F] ?? 0] ?? mats[0])?.doubleSided) continue;
    const clipped = clipPolygon(pts, near);
    if (clipped.length < 3) continue;
    const screen = clipped.map(toScreen);
    if (inRect(screen)) out.push({ pts: screen, depth: cz / pts.length, selected });
  }
}

/**
 * Draws shapes on a mask canvas, in order: the ones passing `keep` add to
 * the mask, the others erase it. Each shape also gets a 1-pixel stroke, so
 * neighboring faces leave no hairline gaps between them.
 */
function paint(mask, list, rect, keep) {
  const c = mask.getContext("2d");
  c.clearRect(0, 0, mask.width, mask.height);
  c.save();
  c.translate(-rect.x, -rect.y);
  c.fillStyle = c.strokeStyle = "#ffffff";
  c.lineJoin = "round";
  // Runs of shapes of the same kind are drawn as one path
  for (let i = 0; i < list.length;) {
    const add = keep(list[i]);
    c.globalCompositeOperation = add ? "source-over" : "destination-out";
    c.beginPath();
    let lineWidth = 0;
    const faces = new Path2D();
    for (; i < list.length && keep(list[i]) === add; i++) {
      const s = list[i];
      if (s.line) {
        c.moveTo(s.pts[0].x, s.pts[0].y);
        c.lineTo(s.pts[1].x, s.pts[1].y);
        lineWidth = Math.max(lineWidth, s.line);
        continue;
      }
      // Same turning direction for every face, so overlapping ones add up instead of cancelling
      const p = signedArea(s.pts) < 0 ? [...s.pts].reverse() : s.pts;
      faces.moveTo(p[0].x, p[0].y);
      for (let k = 1; k < p.length; k++) faces.lineTo(p[k].x, p[k].y);
      faces.closePath();
    }
    if (lineWidth) {
      c.lineWidth = lineWidth;
      c.stroke();
    }
    c.lineWidth = 1;
    c.fill(faces);
    c.stroke(faces);
  }
  c.restore();
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}
