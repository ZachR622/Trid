import { CanvasRenderer, DEFAULT_LIGHT, DEFAULT_AMBIENT } from "./render/canvasRenderer.js";
import { loop } from "./render/loop.js";
import { ToolManager } from "./tools/manager.js";

/**
 * Holds a canvas, a camera and a list of objects, and draws them.
 *
 * Objects are mesh instances. Any missing transform field is filled
 * with a default when the object is added:
 * - `pos`   → { x: 0, y: 0, z: 0 }
 * - `rot`   → { x: 0, y: 0, z: 0 }
 * - `scale` → { x: 1, y: 1, z: 1 }
 *
 * Each object can also set its own `color` and `lineWidth`;
 * otherwise the scene's defaults are used. An object with a
 * `material` draws its mesh's faces (filled and shaded) instead of
 * only lines: `{ mesh, material: { fill: "#E9806E" } }`.
 *
 * Tools (camera controls, dragging, overlays...) are added with
 * `use`. See `trid/tools/`.
 *
 * Typical usage:
 *   const scene = new Scene(canvas, { width: 800, height: 800 });
 *   const box = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });
 *   scene.start((dt) => { box.rot.y += dt; });
 */
export class Scene {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas to draw on
   * @param {Object} [opts]
   * @param {number} [opts.width] - Sets canvas.width (keeps the current one if omitted)
   * @param {number} [opts.height] - Sets canvas.height (keeps the current one if omitted)
   * @param {string} [opts.background="#141414"] - Clear color
   * @param {string} [opts.color="#ffffff"] - Default wireframe color
   * @param {number} [opts.lineWidth=3] - Default wireframe width
   * @param {import("./math/transform.js").Camera} [opts.camera={ z: -1 }] - Camera
   * @param {{x:number,y:number,z:number}} [opts.light] - Direction light comes from
   *   (default: above, left and in front)
   * @param {number} [opts.ambient=0.25] - Brightness of faces turned away from the light (0..1)
   * @param {{ render(scene:Scene): void }} [opts.renderer] - What draws the scene
   *   (default: a new `CanvasRenderer`)
   */
  constructor(canvas, {
    width,
    height,
    background = "#141414",
    color = "#ffffff",
    lineWidth = 3,
    camera = { z: -1 },
    light = { ...DEFAULT_LIGHT },
    ambient = DEFAULT_AMBIENT,
    renderer = new CanvasRenderer(),
  } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (width !== undefined) canvas.width = width;
    if (height !== undefined) canvas.height = height;

    this.background = background;
    this.color = color;
    this.lineWidth = lineWidth;
    this.camera = camera;
    this.light = light;
    this.ambient = ambient;
    this.renderer = renderer;
    this.objects = [];
    this.tools = new ToolManager(this);

    this._stop = null;
  }

  /**
   * Adds an object to the scene, filling in missing transform fields.
   *
   * @param {{ mesh:{ vertices:{x:number,y:number,z:number}[], edges:number[][] } }} obj - Mesh instance
   * @returns The same object, so it can be kept and animated
   */
  add(obj) {
    obj.pos ??= { x: 0, y: 0, z: 0 };
    obj.rot ??= { x: 0, y: 0, z: 0 };
    obj.scale ??= { x: 1, y: 1, z: 1 };
    this.objects.push(obj);
    return obj;
  }

  /**
   * Removes an object from the scene. Does nothing if it isn't in it.
   *
   * @param {Object} obj - Object previously passed to `add`
   */
  remove(obj) {
    const i = this.objects.indexOf(obj);
    if (i !== -1) this.objects.splice(i, 1);
  }

  /**
   * Adds a tool to the scene. Tools added later get the first chance
   * at mouse clicks and scrolls, so add camera tools first and
   * object tools (like `DragObject`) after them.
   *
   * @param {import("./tools/manager.js").Tool} tool - Tool to add
   * @returns The same tool
   */
  use(tool) {
    this.tools.add(tool);
    return tool;
  }

  /**
   * Removes a tool from the scene. Does nothing if it isn't in it.
   *
   * @param {import("./tools/manager.js").Tool} tool - Tool previously passed to `use`
   */
  unuse(tool) {
    this.tools.remove(tool);
  }

  /**
   * Clears the canvas, draws every object once (through the
   * renderer), then lets tools draw on top.
   */
  render() {
    this.renderer.render(this);
    this.tools.draw(this.ctx);
  }

  /**
   * Starts the frame loop: each frame updates the tools, calls
   * `update`, then calls `render`.
   * Calling `start` while running restarts the loop with the new `update`.
   *
   * @param {(dt:number, time:number, scene:Scene) => void} [update] - Per-frame logic
   * @returns {Scene} This scene
   */
  start(update) {
    this.stop();
    this._stop = loop((dt, time) => {
      this.tools.update(dt);
      update?.(dt, time, this);
      this.render();
    });
    return this;
  }

  /**
   * Stops the frame loop. The last frame stays on the canvas.
   */
  stop() {
    this._stop?.();
    this._stop = null;
  }

  /**
   * Stops the loop and removes every tool (and its event listeners).
   * Use it when the scene is no longer needed.
   */
  destroy() {
    this.stop();
    this.tools.clear();
  }

  /** Whether the frame loop is running. */
  get running() {
    return this._stop !== null;
  }
}
