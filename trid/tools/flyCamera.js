import { cameraForward, cameraRight } from "../math/transform.js";

const MAX_PITCH = Math.PI / 2 - 0.01;

/**
 * Keyboard + mouse camera that flies freely through the scene.
 *
 * - W / S: forward / back
 * - A / D: left / right
 * - E / Q: up / down
 * - Arrow keys: turn
 * - Left drag: look around
 * - Hold Shift: move faster
 *
 * Keys use physical positions (`KeyboardEvent.code`), so on AZERTY
 * the same keys are Z / Q / S / D. Keys are ignored while typing in
 * an input field. Don't use it together with another tool that
 * moves the camera.
 */
export class FlyCamera {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.speed=1] - Units per second
   * @param {number} [opts.fastMultiplier=3] - Speed multiplier while Shift is held
   * @param {number} [opts.turnSpeed=1.5] - Radians per second with the arrow keys
   * @param {number} [opts.lookSpeed=0.005] - Radians per dragged pixel
   */
  constructor({ speed = 1, fastMultiplier = 3, turnSpeed = 1.5, lookSpeed = 0.005 } = {}) {
    this.speed = speed;
    this.fastMultiplier = fastMultiplier;
    this.turnSpeed = turnSpeed;
    this.lookSpeed = lookSpeed;

    this._keys = new Set();
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = () => this._keys.clear();
  }

  attach() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    this._keys.clear();
  }

  _onKeyDown(e) {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    if (!HANDLED_KEYS.has(e.code)) return;

    this._keys.add(e.code);
    // Stop arrow keys from scrolling the page
    if (e.code.startsWith("Arrow")) e.preventDefault();
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  pointerDown(e) {
    return e.button === 0;
  }

  pointerMove(e, scene) {
    const cam = scene.camera;
    cam.yaw = (cam.yaw ?? 0) + e.dx * this.lookSpeed;
    cam.pitch = clampPitch((cam.pitch ?? 0) - e.dy * this.lookSpeed);
  }

  update(dt, scene) {
    const keys = this._keys;
    if (keys.size === 0) return;

    const cam = scene.camera;
    const turn = this.turnSpeed * dt;
    if (keys.has("ArrowLeft")) cam.yaw = (cam.yaw ?? 0) - turn;
    if (keys.has("ArrowRight")) cam.yaw = (cam.yaw ?? 0) + turn;
    if (keys.has("ArrowUp")) cam.pitch = clampPitch((cam.pitch ?? 0) + turn);
    if (keys.has("ArrowDown")) cam.pitch = clampPitch((cam.pitch ?? 0) - turn);

    const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const step = this.speed * (fast ? this.fastMultiplier : 1) * dt;
    const f = cameraForward(cam);
    const r = cameraRight(cam);

    const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const right = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const up = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);

    cam.x = (cam.x ?? 0) + (f.x * forward + r.x * right) * step;
    cam.y = (cam.y ?? 0) + (f.y * forward + up) * step;
    cam.z = (cam.z ?? 0) + (f.z * forward + r.z * right) * step;
  }
}

const HANDLED_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "ShiftLeft", "ShiftRight",
]);

function clampPitch(pitch) {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}
