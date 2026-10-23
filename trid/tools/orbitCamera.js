import { cameraForward, cameraRight, cameraUp } from "../math/transform.js";
import { worldPerPixel } from "./helpers.js";

const MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * Mouse camera controls that turn around a target point.
 *
 * - Left drag: orbit around the target
 * - Right drag, middle drag or Shift + left drag: pan (moves the target)
 * - Scroll: zoom in and out
 *
 * The tool drives `scene.camera` (x, y, z, yaw, pitch). Its own
 * `target`, `distance`, `yaw` and `pitch` can be changed at any time.
 * Don't use it together with another tool that moves the camera.
 *
 * With `autoRotate: true` the camera also turns around the target on its
 * own, pausing while the user drags.
 */
export class OrbitCamera {
  /**
   * @param {Object} [opts]
   * @param {{x:number,y:number,z:number}} [opts.target={x:0,y:0,z:0}] - Point to orbit around
   * @param {number} [opts.distance] - Distance to the target (default: the camera's current distance)
   * @param {number} [opts.yaw] - Starting yaw (default: the camera's yaw)
   * @param {number} [opts.pitch] - Starting pitch (default: the camera's pitch)
   * @param {number} [opts.rotateSpeed=0.005] - Radians per dragged pixel
   * @param {number} [opts.zoomSpeed=0.001] - Zoom amount per scroll unit
   * @param {number} [opts.minDistance=0.1] - Closest zoom
   * @param {number} [opts.maxDistance=100] - Farthest zoom
   * @param {boolean} [opts.rotate=true] - Allow orbiting
   * @param {boolean} [opts.pan=true] - Allow panning
   * @param {boolean} [opts.zoom=true] - Allow zooming
   * @param {boolean} [opts.autoRotate=false] - Turn around the target on its own (paused while dragging)
   * @param {number} [opts.autoRotateSpeed=0.5] - Auto-rotate speed in radians per second (negative: other way)
   * @param {number} [opts.autoRotateDelay=0] - Seconds to wait after a drag before auto-rotating again
   */
  constructor({
    target = { x: 0, y: 0, z: 0 },
    distance,
    yaw,
    pitch,
    rotateSpeed = 0.005,
    zoomSpeed = 0.001,
    minDistance = 0.1,
    maxDistance = 100,
    rotate = true,
    pan = true,
    zoom = true,
    autoRotate = false,
    autoRotateSpeed = 0.5,
    autoRotateDelay = 0,
  } = {}) {
    this.target = target;
    this.distance = distance;
    this.yaw = yaw;
    this.pitch = pitch;
    this.rotateSpeed = rotateSpeed;
    this.zoomSpeed = zoomSpeed;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.rotate = rotate;
    this.pan = pan;
    this.zoom = zoom;
    this.autoRotate = autoRotate;
    this.autoRotateSpeed = autoRotateSpeed;
    this.autoRotateDelay = autoRotateDelay;

    this.blockContextMenu = true;
    this._mode = null;
    this._idle = 0; // seconds since the last drag ended
  }

  attach(scene) {
    const cam = scene.camera;
    const t = this.target;
    this.yaw ??= cam.yaw ?? 0;
    this.pitch ??= cam.pitch ?? 0;
    this.distance ??= Math.hypot(
      (cam.x ?? 0) - t.x, (cam.y ?? 0) - t.y, (cam.z ?? 0) - t.z
    ) || 1;
    this.apply(cam);
  }

  /**
   * Places the camera from the target, distance, yaw and pitch.
   * Called automatically every frame and after each drag or scroll.
   *
   * @param {import("../math/transform.js").Camera} camera - Camera to move
   */
  apply(camera) {
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));

    camera.yaw = this.yaw;
    camera.pitch = this.pitch;
    const f = cameraForward(camera);
    camera.x = this.target.x - f.x * this.distance;
    camera.y = this.target.y - f.y * this.distance;
    camera.z = this.target.z - f.z * this.distance;
  }

  pointerDown(e) {
    const panButton = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);

    if (panButton && this.pan) this._mode = "pan";
    else if (e.button === 0 && this.rotate) this._mode = "rotate";
    else return false;

    return true;
  }

  pointerMove(e, scene) {
    if (this._mode === "rotate") {
      this.yaw += e.dx * this.rotateSpeed;
      this.pitch -= e.dy * this.rotateSpeed;
    } else if (this._mode === "pan") {
      // Move the target so the point under the cursor follows it
      const k = worldPerPixel(scene, this.distance);
      const r = cameraRight(scene.camera);
      const u = cameraUp(scene.camera);
      this.target.x += (-r.x * e.dx + u.x * e.dy) * k;
      this.target.y += (-r.y * e.dx + u.y * e.dy) * k;
      this.target.z += (-r.z * e.dx + u.z * e.dy) * k;
    } else {
      return;
    }
    this.apply(scene.camera);
  }

  pointerUp() {
    this._mode = null;
    this._idle = 0;
  }

  wheel(e, scene) {
    if (!this.zoom) return false;
    this.distance *= Math.exp(e.deltaY * this.zoomSpeed);
    this.apply(scene.camera);
    return true;
  }

  update(dt, scene) {
    if (this.autoRotate && !this._mode) {
      this._idle += dt;
      if (this._idle >= this.autoRotateDelay) this.yaw += this.autoRotateSpeed * dt;
    }
    this.apply(scene.camera);
  }
}
