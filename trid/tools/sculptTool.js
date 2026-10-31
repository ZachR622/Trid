import { worldToCamera, cameraRight, cameraUp } from "../math/transform.js";
import { invertMat4, transformPoint, transformDirection, determinantMat4 } from "../math/matrix.js";
import { worldObjects } from "../sceneGraph.js";
import { meshQuery } from "../modeling/query.js";
import { sculptMesh, SCULPT_BRUSHES } from "../modeling/sculpt.js";
import { isPickable, screenRay, worldPerPixel } from "./helpers.js";

/**
 * Strength of one dab, for a tool strength of 1, by brush: a distance in brush radii, or a fraction.
 * A point under a stroke gets several dabs (about 2 / spacing), so these are small.
 */
const DAB = { inflate: 0.08, crease: 0.06, noise: 0.06, smooth: 0.5, flatten: 0.3, pinch: 0.12 };
/** How much one crease dab pulls toward the stroke, for a tool strength of 1. */
const CREASE_PINCH = 0.1;

/**
 * Sculpt meshes with the mouse, like Blender's sculpt mode: drag on a
 * mesh to paint a brush onto it (`sculptMesh` under the hood). A circle
 * shows the brush under the cursor.
 *
 * - Drag: the brush (`inflate` by default)
 * - Ctrl + drag: the other way (in instead of out, for inflate, crease and pinch)
 * - Shift + drag: smooth
 *
 * The radius is in screen pixels, so the brush looks the same size however
 * close the mesh is. Strokes put a dab every so often along the way
 * (`spacing`); `grab` instead pulls the area under the cursor along with
 * it. A drag that doesn't start on a mesh is left to the tools below
 * (an `OrbitCamera` added before this tool still turns the view).
 *
 * The meshes are changed in place, so objects sharing a mesh change
 * together. A mesh needs plenty of vertices to sculpt well: see
 * `remeshMesh`.
 *
 * @example
 * scene.use(new OrbitCamera());
 * const sculpt = scene.use(new SculptTool({ brush: "inflate", radius: 40, symmetry: "x" }));
 * sculpt.brush = "crease"; // change it any time
 */
export class SculptTool {
  /**
   * @param {Object} [opts]
   * @param {"inflate"|"grab"|"smooth"|"flatten"|"pinch"|"crease"|"noise"} [opts.brush="inflate"]
   * @param {number} [opts.radius=40] - Brush radius in CSS pixels
   * @param {number} [opts.strength=0.5] - 0 to 1 (more is allowed)
   * @param {"smooth"|"sharp"|"linear"|"constant"|((t:number) => number)} [opts.falloff="smooth"]
   * @param {"x"|"y"|"z"|("x"|"y"|"z")[]} [opts.symmetry] - Mirror strokes across each mesh's own origin
   * @param {number} [opts.spacing=0.15] - Distance between dabs, in brush radii
   * @param {Object[]|(() => Object[])} [opts.targets] - Objects that can be sculpted (default: every
   *   object in the scene with faces), or a function asked on each stroke
   * @param {(obj:Object) => boolean} [opts.filter] - Which of them can be sculpted
   *   (default: those without `sculptable: false`)
   * @param {number} [opts.button=0] - Mouse button that sculpts
   * @param {string} [opts.color="#ffffff"] - Color of the brush circle
   * @param {(obj:Object) => void} [opts.onStrokeStart] - A stroke starts on this object (save it here, for undo)
   * @param {(obj:Object) => void} [opts.onStroke] - Its mesh just changed
   * @param {(obj:Object) => void} [opts.onStrokeEnd] - The stroke ended
   */
  constructor({
    brush = "inflate",
    radius = 40,
    strength = 0.5,
    falloff = "smooth",
    symmetry,
    spacing = 0.15,
    targets,
    filter = (obj) => obj.sculptable !== false,
    button = 0,
    color = "#ffffff",
    onStrokeStart,
    onStroke,
    onStrokeEnd,
  } = {}) {
    this.brush = brush;
    this.radius = radius;
    this.strength = strength;
    this.falloff = falloff;
    this.symmetry = symmetry;
    this.spacing = spacing;
    this.targets = targets;
    this.filter = filter;
    this.button = button;
    this.color = color;
    this.onStrokeStart = onStrokeStart;
    this.onStroke = onStroke;
    this.onStrokeEnd = onStrokeEnd;
    /** Turn the tool off without removing it: no strokes, no circle. */
    this.enabled = true;
    /** The object being sculpted during a stroke, or null. */
    this.sculpting = null;

    this._queries = new Map(); // mesh → { query, vertices, count }
    this._hover = null; // { x, y, r } in canvas pixels
    this._stroke = null;
  }

  /** Forget prepared meshes, after changing a mesh in code (strokes do this on their own). */
  refresh() {
    this._queries.clear();
  }

  _targets(scene) {
    const t = typeof this.targets === "function" ? this.targets() : this.targets;
    return t ?? scene.objects;
  }

  /** A query for a mesh: kept during a stroke (the surface hardly moves under one dab), made again after. */
  _query(mesh) {
    const c = this._queries.get(mesh);
    if (c && c.vertices === mesh.vertices && c.count === mesh.vertices.length) return c.query;
    const query = meshQuery(mesh);
    this._queries.set(mesh, { query, vertices: mesh.vertices, count: mesh.vertices.length });
    return query;
  }

  /** CSS pixels → canvas pixels. */
  _px(scene) {
    const c = scene.canvas;
    return c.width / (c.clientWidth || c.width);
  }

  /** The front surface under a pixel, among the targets: object, point (world and mesh), and camera depth. */
  _hit(scene, x, y, only = null) {
    const { origin, direction } = screenRay(scene, x, y);
    let best = null;
    for (const object of only ? [only] : worldObjects(this._targets(scene))) {
      const mesh = object.mesh;
      if (!mesh?.faces?.length || !Array.isArray(mesh.vertices) || !isPickable(object) || !this.filter(object)) continue;
      const world = object.world;
      if (!(Math.abs(determinantMat4(world)) > 1e-18)) continue;
      const inv = invertMat4(world);
      const h = this._query(mesh).raycast(transformPoint(inv, origin), transformDirection(inv, direction), { side: "front" });
      if (!h) continue;
      const point = transformPoint(world, h.point);
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
      if (!best || distance < best.distance) best = { object, local: h.point, point, distance };
    }
    if (best) best.depth = worldToCamera(best.point, scene.camera).z;
    return best;
  }

  /** The brush radius at a hit, in the mesh's own units. */
  _localRadius(scene, hit) {
    const worldRadius = this.radius * this._px(scene) * worldPerPixel(scene, hit.depth);
    // The object's size: the cube root of how much its matrix scales volumes
    const k = Math.cbrt(Math.abs(determinantMat4(hit.object.world))) || 1;
    return worldRadius / k;
  }

  /**
   * One dab of the stroke's brush where `hit` is: along the way from the
   * last dab, so crease and pinch pull toward the stroke's line (dabs
   * around single points would leave a row of puckers).
   */
  _dab(scene, hit) {
    const s = this._stroke;
    const radius = this._localRadius(scene, hit);
    const mesh = hit.object.mesh;
    const k = Number.isFinite(this.strength) ? this.strength : 0.5;
    const opts = { radius, falloff: this.falloff, symmetry: this.symmetry };
    if (s.lastLocal) opts.along = [s.lastLocal, hit.local];
    else opts.center = hit.local;
    s.lastLocal = hit.local;
    const brush = s.brush;
    // Distances scale with the brush; fractions don't
    if (brush === "inflate" || brush === "crease" || brush === "noise") opts.strength = DAB[brush] * k * radius * s.sign;
    else if (brush === "pinch") opts.strength = DAB.pinch * k * s.sign;
    else opts.strength = DAB[brush] * k;
    if (brush === "crease") opts.pinch = CREASE_PINCH * k;
    sculptMesh(mesh, brush, opts);
    this.onStroke?.(hit.object);
  }

  pointerDown(e, scene) {
    if (!this.enabled || e.button !== this.button || this._stroke) return false;
    const hit = this._hit(scene, e.x, e.y);
    if (!hit) return false;
    const brush = e.shiftKey ? "smooth" : this.brush;
    if (!SCULPT_BRUSHES.includes(brush)) throw new Error(`Unknown brush "${brush}"`);
    this._stroke = { object: hit.object, brush, sign: e.ctrlKey ? -1 : 1, last: { x: e.x, y: e.y }, grab: null };
    this.sculpting = hit.object;
    this.onStrokeStart?.(hit.object);
    if (brush === "grab") this._stroke.grab = { local: hit.local, depth: hit.depth, radius: this._localRadius(scene, hit) };
    else this._dab(scene, hit);
    this._hover = { x: e.x, y: e.y };
    return true;
  }

  pointerMove(e, scene) {
    if (!this.enabled) return;
    this._hover = { x: e.x, y: e.y };
    const s = this._stroke;
    if (!s) return;
    const obj = s.object;

    if (s.grab) {
      // Grab: the area caught at the start follows the cursor, at the depth it was caught
      const g = s.grab;
      const k = worldPerPixel(scene, g.depth);
      const r = cameraRight(scene.camera), u = cameraUp(scene.camera);
      const world = { x: (r.x * e.dx - u.x * e.dy) * k, y: (r.y * e.dx - u.y * e.dy) * k, z: (r.z * e.dx - u.z * e.dy) * k };
      const delta = transformDirection(invertMat4(obj.world), world);
      if (!delta.x && !delta.y && !delta.z) return;
      sculptMesh(obj.mesh, "grab", { center: g.local, radius: g.radius, delta, falloff: this.falloff, symmetry: this.symmetry });
      g.local = { x: g.local.x + delta.x, y: g.local.y + delta.y, z: g.local.z + delta.z };
      this.onStroke?.(obj);
      return;
    }

    // Dabs every `spacing` radii along the way from the last one
    const step = Math.max(1, this.radius * this._px(scene) * (this.spacing > 0 ? this.spacing : 0.15));
    let { x, y } = s.last;
    let gap = Math.hypot(e.x - x, e.y - y);
    while (gap >= step) {
      x += ((e.x - x) / gap) * step;
      y += ((e.y - y) / gap) * step;
      gap -= step;
      const hit = this._hit(scene, x, y, obj);
      if (hit) this._dab(scene, hit);
      s.last = { x, y };
    }
  }

  pointerUp(e, scene) {
    const s = this._stroke;
    if (!s) return;
    this._stroke = null;
    this.sculpting = null;
    // The surface moved: prepare it again before the next stroke
    this._queries.delete(s.object.mesh);
    this.onStrokeEnd?.(s.object);
  }

  pointerLeave() {
    this._hover = null;
  }

  detach() {
    this._stroke = null;
    this.sculpting = null;
    this._hover = null;
    this._queries.clear();
  }

  draw(ctx, scene) {
    if (!this.enabled || !this._hover) return;
    // The circle shows only over something it can sculpt (or during a stroke)
    if (!this._stroke && !this._hit(scene, this._hover.x, this._hover.y)) return;
    const px = this._px(scene);
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5 * px;
    ctx.globalAlpha = this._stroke ? 0.9 : 0.6;
    ctx.beginPath();
    ctx.arc(this._hover.x, this._hover.y, this.radius * px, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
