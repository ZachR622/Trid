import { worldToCamera, cameraForward, cameraRight, cameraUp } from "../math/transform.js";
import { pick, worldPerPixel } from "./helpers.js";
import { invertMat4, transformDirection } from "../math/matrix.js";
import { worldMatrix, worldPosition } from "../sceneGraph.js";

/**
 * Click an object to pick it, then drag to move it.
 *
 * - Drag: moves the object parallel to the screen, following the cursor
 * - Shift + drag: moves it toward or away from the camera instead
 *
 * Objects are picked with `pick`: by screen-space bounding box, or by their
 * triangles with `exact: true`.
 * Set `obj.draggable = false` to make an object ignore this tool.
 *
 * Inside a group, the part clicked moves within its group (it follows the
 * cursor however the group is turned or scaled). With `root: true`, the
 * whole group moves instead (the top-level object of what was clicked).
 *
 * Add this tool after a camera tool so clicking an object drags it
 * and clicking empty space still moves the camera.
 */
export class DragObject {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.button=0] - Mouse button that drags (0 left, 1 middle, 2 right)
   * @param {(obj:Object) => boolean} [opts.filter] - Which objects can be dragged
   *   (default: those without `draggable: false`)
   * @param {boolean} [opts.exact=false] - Pick by triangles instead of bounding boxes (see `pickHit`)
   * @param {boolean} [opts.root=false] - Drag the top-level object (the whole group) of what was clicked
   * @param {(obj:Object) => void} [opts.onPick] - Called when an object is picked
   * @param {(obj:Object) => void} [opts.onMove] - Called each time the object moves
   * @param {(obj:Object) => void} [opts.onDrop] - Called when the object is released
   */
  constructor({
    button = 0,
    filter = obj => obj.draggable !== false,
    exact = false,
    root = false,
    onPick,
    onMove,
    onDrop,
  } = {}) {
    this.button = button;
    this.filter = filter;
    this.exact = exact;
    this.root = root;
    this.onPick = onPick;
    this.onMove = onMove;
    this.onDrop = onDrop;

    /** The object being dragged, or null. */
    this.dragging = null;
  }

  pointerDown(e, scene) {
    if (e.button !== this.button) return false;

    let obj = pick(scene, e.x, e.y, { filter: this.filter, exact: this.exact });
    if (!obj) return false;
    if (this.root) {
      while (obj.parent) obj = obj.parent;
      if (obj.draggable === false) return false;
    }

    this.dragging = obj;
    this.onPick?.(obj);
    return true;
  }

  pointerMove(e, scene) {
    const obj = this.dragging;
    if (!obj) return;

    const cam = scene.camera;
    const depth = worldToCamera(worldPosition(obj), cam).z;
    const k = worldPerPixel(scene, depth);

    // How far to move in the world
    let move;
    if (e.shiftKey) {
      // Drag up pushes the object away, drag down pulls it closer
      const f = cameraForward(cam);
      const amount = -e.dy * k;
      move = { x: f.x * amount, y: f.y * amount, z: f.z * amount };
    } else {
      const r = cameraRight(cam);
      const u = cameraUp(cam);
      move = {
        x: (r.x * e.dx - u.x * e.dy) * k,
        y: (r.y * e.dx - u.y * e.dy) * k,
        z: (r.z * e.dx - u.z * e.dy) * k,
      };
    }
    // Inside a group, `pos` is in the group's space: turn the move into it
    if (obj.parent) move = transformDirection(invertMat4(worldMatrix(obj.parent)), move);
    obj.pos.x += move.x;
    obj.pos.y += move.y;
    obj.pos.z += move.z;

    this.onMove?.(obj);
  }

  pointerUp() {
    const obj = this.dragging;
    this.dragging = null;
    if (obj) this.onDrop?.(obj);
  }

  detach() {
    this.dragging = null;
  }
}
