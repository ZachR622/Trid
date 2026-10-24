import { cameraForward, worldToCamera, worldToScreen, DEFAULT_NEAR } from "../math/transform.js";
import { applyTransformOp, matFromAxisAngle, mulVec } from "../math/rotation.js";
import { meshBounds } from "../render/meshUtils.js";
import { transformOpToLocal } from "../math/matrix.js";
import { worldMatrix, worldPosition, ancestors } from "../sceneGraph.js";
import { worldPerPixel } from "./helpers.js";

const AXES = [
  { dir: { x: 1, y: 0, z: 0 }, color: "#e8605a" },
  { dir: { x: 0, y: 1, z: 0 }, color: "#7cc46b" },
  { dir: { x: 0, y: 0, z: 1 }, color: "#5f9be8" },
];
/** Handle id of the uniform-scale square */
const UNIFORM = 3;
/** Points per rotate ring */
const RING = 64;

/**
 * Move, rotate and scale handles on one or more objects, around a pivot:
 * by default the middle of their bounding box (see `pivot`). One tool,
 * three modes:
 *
 * - `"move"`: X, Y, Z arrows; drag one to move along that world axis
 * - `"rotate"`: X, Y, Z rings; drag along a ring to turn around that axis.
 *   The ring follows the mouse from any camera angle; where rings cross,
 *   the one facing the camera wins
 * - `"scale"`: X, Y, Z handles with square ends to stretch along an axis,
 *   and a center square for all axes at once (×2 per 100 px dragged right)
 *
 * Targets can be groups (their children move with them) or objects inside
 * groups: the handles work in world space, and each target is changed in
 * its parent's space, so it follows the mouse however its group is turned.
 *
 * By default it changes the targets' `pos`, `rot` and `scale`. With
 * `apply: false` it only reports what the drag does (a `TransformOp`,
 * applied with `applyTransformOp`) so an app can apply it to its own data.
 *
 * The pivot is where the handles sit and what rotate and scale turn and
 * grow around (it's the ops' `center`):
 * - `"bounds"` (default): the middle of the targets' bounding box
 * - `"origin"`: the targets' origins (their `pos`, in the world; the average
 *   of them for several targets)
 * - a point `{ x, y, z }` in the world. It moves with the targets when the
 *   gizmo moves them, so the handles stay on it
 * - a function `(targets) => point | null`, asked every frame (for a pivot
 *   an app keeps in its own data)
 *
 * Add it **after** the camera tool: tools added later get clicks first, so
 * grabbing a handle doesn't also orbit. Clicks that miss the handles fall
 * through to the tools below.
 *
 * @example
 * scene.use(new OrbitCamera());
 * const gizmo = scene.use(new TransformGizmo({ mode: "rotate" }));
 * gizmo.targets = [box];
 * addEventListener("keydown", (e) => { if (e.key === "g") gizmo.mode = "move"; });
 */
export class TransformGizmo {
  /**
   * @param {Object} [opts]
   * @param {"move"|"rotate"|"scale"} [opts.mode="move"]
   * @param {Object[]} [opts.targets=[]] - Objects it edits (change `targets` at any time)
   * @param {number} [opts.size=70] - Handle length in CSS pixels (same on screen at any distance)
   * @param {boolean} [opts.apply=true] - Change the targets' transforms while dragging
   * @param {"bounds"|"origin"|{x:number,y:number,z:number}|((targets:Object[]) => ({x:number,y:number,z:number}|null))} [opts.pivot="bounds"]
   *   Where the handles sit and what rotate / scale go around (change `pivot` at any time)
   * @param {(targets:Object[]) => void} [opts.onGrab] - A handle was grabbed
   * @param {(op:Object, targets:Object[]) => void} [opts.onChange] - While dragging: the operation since the grab
   * @param {(op:Object, targets:Object[]) => void} [opts.onDrop] - On release: the whole operation
   */
  constructor({ mode = "move", targets = [], size = 70, apply = true, pivot = "bounds", onGrab, onChange, onDrop } = {}) {
    this.mode = mode;
    this.targets = targets;
    this.size = size;
    this.apply = apply;
    this.pivot = pivot;
    this.onGrab = onGrab;
    this.onChange = onChange;
    this.onDrop = onDrop;
    /** Hide the handles (and ignore clicks) without removing the tool. */
    this.visible = true;
    /** True while a handle is being dragged. */
    this.dragging = false;

    this._handles = []; // from the last draw
    this._hover = -1;
    this._drag = null;
    this._cursor = false; // whether this tool set the canvas cursor
  }

  /** The pivot in world space (see `pivot`), or null when there are no targets. */
  center() {
    if (!this.targets.length) return null;
    const p = this.pivot;
    if (typeof p === "function") return p(this.targets) ?? null;
    if (p && typeof p === "object") return { x: p.x, y: p.y, z: p.z };
    if (p === "origin") {
      const sum = { x: 0, y: 0, z: 0 };
      for (const t of this.targets) {
        const o = worldPosition(t);
        sum.x += o.x; sum.y += o.y; sum.z += o.z;
      }
      const n = this.targets.length;
      return { x: sum.x / n, y: sum.y / n, z: sum.z / n };
    }
    return meshBounds(this.targets)?.center ?? null;
  }

  /** Length of the handles in world units at a point, so they keep the same size on screen. */
  _length(scene, c) {
    const k = scene.canvas.width / (scene.canvas.clientWidth || scene.canvas.width);
    return this.size * k * worldPerPixel(scene, worldToCamera(c, scene.camera).z);
  }

  draw(ctx, scene) {
    this._handles = [];
    if (!this.visible) return;
    // Rings and scale handles stay where the drag started; arrows follow the move
    const c = this._drag && this.mode !== "move" ? this._drag.center : this.center();
    if (!c) return;
    const { canvas, camera } = scene;
    if (worldToCamera(c, camera).z <= (camera.near ?? DEFAULT_NEAR)) return;
    const k = canvas.width / (canvas.clientWidth || canvas.width);
    const len = this._length(scene, c);
    const scr = (p) => worldToScreen(p, camera, canvas.width, canvas.height);
    const o = scr(c);

    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round";
    AXES.forEach((a, i) => {
      const active = this._drag ? this._drag.id === i : this._hover === i;
      ctx.strokeStyle = ctx.fillStyle = active ? "#ffffff" : a.color;
      ctx.lineWidth = (active ? 3.5 : 2.5) * k;
      if (this.mode === "rotate") {
        const path = [];
        for (let s = 0; s <= RING; s++) path.push(scr(ringPoint(c, a.dir, len * 0.9, s)));
        stroke(ctx, path);
        const f = cameraForward(camera);
        this._handles.push({ id: i, path, facing: Math.abs(a.dir.x * f.x + a.dir.y * f.y + a.dir.z * f.z) });
      } else {
        const to = scr({ x: c.x + a.dir.x * len, y: c.y + a.dir.y * len, z: c.z + a.dir.z * len });
        stroke(ctx, [o, to]);
        if (this.mode === "move") arrowHead(ctx, o, to, 10 * k);
        else square(ctx, to, 5 * k);
        this._handles.push({ id: i, path: [o, to] });
      }
    });
    if (this.mode === "scale") {
      const active = this._drag ? this._drag.id === UNIFORM : this._hover === UNIFORM;
      ctx.fillStyle = active ? "#ffffff" : "#d0d4dc";
      square(ctx, o, 6 * k);
      this._handles.push({ id: UNIFORM, path: [o] });
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(o.x, o.y, 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The handle under a pointer, from the last draw. */
  _hit(e, scene) {
    const k = scene.canvas.width / (scene.canvas.clientWidth || scene.canvas.width);
    let best = null, bestD = 9 * k;
    for (const h of this._handles) {
      let d = h.path.length === 1 ? Math.hypot(e.x - h.path[0].x, e.y - h.path[0].y) - 3 * k : distToPath(e, h.path);
      // Where rings cross, take the one facing the camera (an edge-on ring barely turns)
      if (h.facing !== undefined) d -= 4 * k * h.facing;
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  pointerDown(e, scene) {
    if (!this.visible || !this.targets.length || e.button !== 0) return false;
    const h = this._hit(e, scene);
    const center = this.center();
    if (!h || !center) return false;
    const { canvas, camera } = scene;
    const scr = (p) => worldToScreen(p, camera, canvas.width, canvas.height);
    const cs = scr(center);
    const len = this._length(scene, center);
    const axis = h.id < 3 ? AXES[h.id].dir : { x: 0, y: 0, z: 0 };
    const tip = scr({ x: center.x + axis.x * len, y: center.y + axis.y * len, z: center.z + axis.z * len });

    // Which way +angle turns the grabbed point on screen depends on the view: measure it
    let turnSign = 1;
    if (this.mode === "rotate" && h.id < 3) {
      const s = nearestIndex(e, h.path);
      const grabbed = h.path[s];
      const world = ringPoint(center, axis, len * 0.9, s);
      const turned = mulVec(matFromAxisAngle(axis, 0.01), { x: world.x - center.x, y: world.y - center.y, z: world.z - center.z });
      const p1 = scr({ x: center.x + turned.x, y: center.y + turned.y, z: center.z + turned.z });
      turnSign = Math.sign(wrap(Math.atan2(p1.y - cs.y, p1.x - cs.x) - Math.atan2(grabbed.y - cs.y, grabbed.x - cs.x))) || 1;
    }

    this._drag = {
      id: h.id,
      x: e.x,
      y: e.y,
      center,
      centerScreen: cs,
      axisScreen: { x: tip.x - cs.x, y: tip.y - cs.y },
      length: len,
      angle0: Math.atan2(e.y - cs.y, e.x - cs.x),
      turnSign,
      start: this.targets.map((t) => ({ pos: { ...t.pos }, rot: { ...t.rot }, scale: { ...t.scale } })),
      // Parents' world matrices at the grab (ops are turned into each target's parent space)
      parents: this.targets.map((t) => (t.parent ? worldMatrix(t.parent) : null)),
      // A target inside another target already moves with it
      moves: this.targets.map((t) => !ancestors(t).slice(1).some((a) => this.targets.includes(a))),
      // A fixed pivot point, to move along with the targets
      pivot: this.pivot && typeof this.pivot === "object" ? { ...this.pivot } : null,
      op: null,
    };
    this.dragging = true;
    this.onGrab?.(this.targets);
    return true;
  }

  pointerMove(e, scene) {
    const d = this._drag;
    if (!d) {
      const h = this.visible && this.targets.length ? this._hit(e, scene) : null;
      this._hover = h?.id ?? -1;
      if (h) {
        scene.canvas.style.cursor = "pointer";
        this._cursor = true;
      } else if (this._cursor) {
        scene.canvas.style.cursor = "";
        this._cursor = false;
      }
      return;
    }
    // How far along the grabbed handle the pointer moved, in handle lengths
    const along = () => {
      const s = d.axisScreen;
      return ((e.x - d.x) * s.x + (e.y - d.y) * s.y) / (s.x * s.x + s.y * s.y || 1);
    };
    let op;
    if (this.mode === "move") {
      const a = AXES[d.id].dir, t = along() * d.length;
      op = { mode: "move", delta: { x: a.x * t, y: a.y * t, z: a.z * t } };
    } else if (this.mode === "rotate") {
      const angle = wrap(Math.atan2(e.y - d.centerScreen.y, e.x - d.centerScreen.x) - d.angle0) * d.turnSign;
      op = { mode: "rotate", axis: AXES[d.id].dir, angle, center: d.center };
    } else if (d.id === UNIFORM) {
      // Drag right to grow, left to shrink: ×2 per 100 CSS pixels
      const k = scene.canvas.width / (scene.canvas.clientWidth || scene.canvas.width);
      op = { mode: "scale", axis: null, factor: Math.pow(2, (e.x - d.x) / (100 * k)), center: d.center };
    } else {
      op = { mode: "scale", axis: AXES[d.id].dir, factor: Math.max(0.05, 1 + along()), center: d.center };
    }
    d.op = op;
    if (d.pivot && op.mode === "move" && this.pivot && typeof this.pivot === "object") {
      this.pivot.x = d.pivot.x + op.delta.x;
      this.pivot.y = d.pivot.y + op.delta.y;
      this.pivot.z = d.pivot.z + op.delta.z;
    }
    if (this.apply) {
      this.targets.forEach((t, i) => {
        if (!d.moves[i]) return;
        const local = d.parents[i] ? transformOpToLocal(op, d.parents[i]) : op;
        Object.assign(t, applyTransformOp(d.start[i], local));
      });
    }
    this.onChange?.(op, this.targets);
  }

  pointerUp() {
    const d = this._drag;
    this._drag = null;
    this.dragging = false;
    if (d?.op) this.onDrop?.(d.op, this.targets);
  }

  pointerLeave(scene) {
    this._hover = -1;
    if (this._cursor) scene.canvas.style.cursor = "";
    this._cursor = false;
  }

  detach(scene) {
    this.pointerLeave(scene);
    this._drag = null;
    this.dragging = false;
  }
}

/** Point s (0..RING) of the ring of radius r around `axis` at center c. */
function ringPoint(c, axis, r, s) {
  const u = Math.abs(axis.x) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const v = { x: axis.y * u.z - axis.z * u.y, y: axis.z * u.x - axis.x * u.z, z: axis.x * u.y - axis.y * u.x };
  const t = (s / RING) * Math.PI * 2, cs = Math.cos(t) * r, sn = Math.sin(t) * r;
  return { x: c.x + u.x * cs + v.x * sn, y: c.y + u.y * cs + v.y * sn, z: c.z + u.z * cs + v.z * sn };
}

/** Angle difference in -π..π */
function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function stroke(ctx, path) {
  ctx.beginPath();
  path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

function arrowHead(ctx, from, to, head) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(to.x + ux * head, to.y + uy * head);
  ctx.lineTo(to.x - uy * head * 0.5, to.y + ux * head * 0.5);
  ctx.lineTo(to.x + uy * head * 0.5, to.y - ux * head * 0.5);
  ctx.closePath();
  ctx.fill();
}

function square(ctx, at, r) {
  ctx.fillRect(at.x - r, at.y - r, r * 2, r * 2);
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPath(p, path) {
  let d = Infinity;
  for (let i = 1; i < path.length; i++) d = Math.min(d, distToSegment(p, path[i - 1], path[i]));
  return d;
}

function nearestIndex(p, path) {
  let best = 0, bestD = Infinity;
  path.forEach((q, i) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
