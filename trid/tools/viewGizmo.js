import { cameraForward, cameraRight, cameraUp } from "../math/transform.js";
import { OrbitCamera } from "./orbitCamera.js";

const AXES = [
  { dir: { x: 1, y: 0, z: 0 }, label: "X", color: "#e8605a" },
  { dir: { x: 0, y: 1, z: 0 }, label: "Y", color: "#7cc46b" },
  { dir: { x: 0, y: 0, z: 1 }, label: "Z", color: "#5f9be8" },
];

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The X, Y and Z axes in a corner of the canvas, turning with the camera
 * (like Blender's navigation gizmo). Axes pointing away from you are dimmed;
 * the dots without a letter are the negative ends. Click an axis and the
 * `OrbitCamera` smoothly turns to look along it.
 *
 * Add it **after** the OrbitCamera: tools added later get clicks first, so
 * clicks on the gizmo don't start an orbit drag.
 *
 * @example
 * scene.use(new OrbitCamera());
 * const gizmo = scene.use(new ViewGizmo({ corner: "top-right" }));
 * gizmo.lookAlong({ x: 0, y: 1, z: 0 }); // look down from above
 */
export class ViewGizmo {
  /**
   * @param {Object} [opts]
   * @param {OrbitCamera} [opts.orbit] - Camera controls to turn (default: the scene's first OrbitCamera).
   *   Without one, the gizmo only shows the axes
   * @param {"top-right"|"top-left"|"bottom-right"|"bottom-left"} [opts.corner="top-right"] - Where it sits
   * @param {number} [opts.size=42] - Radius in CSS pixels
   * @param {number|{x:number,y:number}} [opts.margin=14] - Distance from the canvas corner in CSS pixels
   * @param {number} [opts.duration=0.35] - Seconds the camera takes to turn to a clicked axis
   */
  constructor({ orbit, corner = "top-right", size = 42, margin = 14, duration = 0.35 } = {}) {
    this.orbit = orbit ?? null;
    this.corner = corner;
    this.size = size;
    this.margin = typeof margin === "number" ? { x: margin, y: margin } : margin;
    this.duration = duration;
    /** Hide or show the gizmo without removing the tool. */
    this.visible = true;

    this._scene = null;
    this._bubbles = []; // clickable axis ends, far to near, from the last draw
    this._disc = null;
    this._turn = null;
  }

  attach(scene) {
    this._scene = scene;
  }

  detach() {
    this._scene = null;
    this._turn = null;
  }

  /** The OrbitCamera it turns: the one given, or the scene's first. */
  _orbit() {
    return this.orbit ?? this._scene?.tools.list.find((t) => t instanceof OrbitCamera) ?? null;
  }

  /**
   * Whether a canvas pixel is on the gizmo (as last drawn).
   *
   * @param {number} x - Canvas X in pixels
   * @param {number} y - Canvas Y in pixels
   * @returns {boolean}
   */
  contains(x, y) {
    return this.visible && !!this._disc && Math.hypot(x - this._disc.x, y - this._disc.y) <= this._disc.r;
  }

  /**
   * Turns the camera smoothly so it looks at its target from `dir`:
   * `{ x: 1, y: 0, z: 0 }` looks from the +X side, `{ x: 0, y: 1, z: 0 }` from above.
   *
   * @param {{x:number,y:number,z:number}} dir - Direction from the target to the camera
   */
  lookAlong(dir) {
    const orbit = this._orbit();
    if (!orbit) return;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    // The camera looks against `dir`, toward the target
    const f = { x: -dir.x / len, y: -dir.y / len, z: -dir.z / len };
    const pitch1 = Math.asin(Math.max(-1, Math.min(1, f.y)));
    // Straight up or down: keep the current heading
    const yaw1 = Math.abs(f.y) > 0.999 ? orbit.yaw : Math.atan2(f.x, f.z);
    // Turn the short way round
    let yaw0 = orbit.yaw;
    while (yaw1 - yaw0 > Math.PI) yaw0 += Math.PI * 2;
    while (yaw0 - yaw1 > Math.PI) yaw0 -= Math.PI * 2;
    this._turn = { orbit, yaw0, pitch0: orbit.pitch, yaw1, pitch1, t: 0 };
  }

  pointerDown(e) {
    if (!this.visible || e.button !== 0 || !this._orbit()) return false;
    // The nearest end wins where two overlap (bubbles are stored far to near)
    const hit = [...this._bubbles].reverse().find((b) => Math.hypot(e.x - b.x, e.y - b.y) <= b.r);
    if (!hit) return false;
    this.lookAlong(hit.dir);
    return true;
  }

  update(dt, scene) {
    const turn = this._turn;
    if (!turn) return;
    turn.t = this.duration > 0 ? Math.min(1, turn.t + dt / this.duration) : 1;
    const e = 1 - Math.pow(1 - turn.t, 3); // ease out
    turn.orbit.yaw = turn.yaw0 + (turn.yaw1 - turn.yaw0) * e;
    turn.orbit.pitch = turn.pitch0 + (turn.pitch1 - turn.pitch0) * e;
    turn.orbit.holdAutoRotate?.();
    turn.orbit.apply(scene.camera);
    if (turn.t >= 1) this._turn = null;
  }

  draw(ctx, scene) {
    this._bubbles = [];
    this._disc = null;
    if (!this.visible) return;
    const { canvas, camera } = scene;
    const k = canvas.width / (canvas.clientWidth || canvas.width); // CSS px → canvas px
    const r = this.size * k, mx = this.margin.x * k, my = this.margin.y * k;
    const cx = this.corner.endsWith("right") ? canvas.width - mx - r : mx + r;
    const cy = this.corner.startsWith("top") ? my + r : canvas.height - my - r;
    this._disc = { x: cx, y: cy, r };
    const right = cameraRight(camera), up = cameraUp(camera), fwd = cameraForward(camera);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const reach = r * 0.68, dotR = r * 0.2;
    const items = AXES.flatMap((a) => [1, -1].map((sign) => {
      const dir = { x: a.dir.x * sign, y: a.dir.y * sign, z: a.dir.z * sign };
      return {
        ...a, sign, dir,
        x: cx + dot(dir, right) * reach,
        y: cy - dot(dir, up) * reach,
        depth: dot(dir, fwd), // > 0: points away from the viewer
      };
    }));
    // Far ones first, so the near ones are drawn on top
    items.sort((a, b) => b.depth - a.depth);

    for (const it of items) {
      const fade = 0.55 + 0.45 * Math.max(0, -it.depth);
      if (it.sign > 0) {
        ctx.strokeStyle = it.color;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(it.x, it.y);
        ctx.stroke();
      }
      ctx.globalAlpha = it.sign > 0 ? fade : fade * 0.6;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.sign > 0 ? dotR : dotR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      if (it.sign > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#15171c";
        ctx.font = `600 ${Math.round(dotR * 1.1)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(it.label, it.x, it.y + 0.5 * k);
      }
      this._bubbles.push({ x: it.x, y: it.y, r: dotR * 1.3, dir: it.dir });
    }
    ctx.restore();
  }
}
