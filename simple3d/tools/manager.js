/**
 * A tool plugs into a Scene to add interaction or extra drawing.
 * Every method is optional.
 *
 * @typedef {Object} Tool
 * @property {(scene:Scene) => void} [attach] - Called when the tool is added
 * @property {(scene:Scene) => void} [detach] - Called when the tool is removed
 * @property {(e:ToolPointerEvent, scene:Scene) => boolean} [pointerDown]
 *   Return true to take the drag: the following moves and the release
 *   go only to this tool
 * @property {(e:ToolPointerEvent, scene:Scene) => void} [pointerMove]
 *   Called for the tool holding the drag, or for every tool while hovering
 * @property {(e:ToolPointerEvent, scene:Scene) => void} [pointerUp] - Drag released
 * @property {(scene:Scene) => void} [pointerLeave] - Pointer left the canvas (not dragging)
 * @property {(e:ToolWheelEvent, scene:Scene) => boolean} [wheel]
 *   Return true to use the scroll (stops the page from scrolling)
 * @property {(dt:number, scene:Scene) => void} [update] - Called every frame before the scene's update
 * @property {(ctx:CanvasRenderingContext2D, scene:Scene) => void} [draw] - Called after the objects are drawn
 * @property {boolean} [blockContextMenu] - Disable the right-click menu on the canvas
 *
 * @typedef {Object} ToolPointerEvent
 * @property {number} x - Pointer X in canvas pixels
 * @property {number} y - Pointer Y in canvas pixels
 * @property {number} dx - X movement since the last event, in canvas pixels
 * @property {number} dy - Y movement since the last event, in canvas pixels
 * @property {number} button - Button that changed (0 left, 1 middle, 2 right)
 * @property {boolean} shiftKey
 * @property {boolean} ctrlKey
 * @property {boolean} altKey
 * @property {PointerEvent} original - The DOM event
 *
 * @typedef {Object} ToolWheelEvent
 * @property {number} x - Pointer X in canvas pixels
 * @property {number} y - Pointer Y in canvas pixels
 * @property {number} deltaY - Scroll amount (> 0 scrolls down)
 * @property {WheelEvent} original - The DOM event
 *
 * @typedef {import("../scene.js").Scene} Scene
 */

/**
 * Keeps a scene's tools and sends them canvas pointer events.
 *
 * Tools added later get the first chance at a pointer down or a
 * scroll, like layers stacked on top of each other. The first tool
 * that returns true takes it.
 *
 * Pointer positions are converted to canvas pixels, so they match
 * the drawing even when the canvas is resized with CSS.
 */
export class ToolManager {
  /**
   * @param {Scene} scene - Scene whose canvas receives the events
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Tool[]} */
    this.list = [];

    this._active = null;
    this._pointerId = null;
    this._last = { x: 0, y: 0 };
    this._listening = false;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  /**
   * Adds a tool and calls its `attach`. Adding the same tool twice does nothing.
   *
   * @param {Tool} tool
   */
  add(tool) {
    if (this.list.includes(tool)) return;
    this.list.push(tool);
    tool.attach?.(this.scene);
    this._listen();
  }

  /**
   * Removes a tool and calls its `detach`. Does nothing if it isn't added.
   *
   * @param {Tool} tool
   */
  remove(tool) {
    const i = this.list.indexOf(tool);
    if (i === -1) return;
    if (this._active === tool) this._release();
    this.list.splice(i, 1);
    tool.detach?.(this.scene);
    if (this.list.length === 0) this._unlisten();
  }

  /** Removes every tool. */
  clear() {
    for (const tool of [...this.list]) this.remove(tool);
  }

  /**
   * Calls every tool's `update`.
   *
   * @param {number} dt - Seconds since the last frame
   */
  update(dt) {
    for (const tool of this.list) tool.update?.(dt, this.scene);
  }

  /**
   * Calls every tool's `draw`.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    for (const tool of this.list) tool.draw?.(ctx, this.scene);
  }

  _listen() {
    if (this._listening) return;
    const c = this.scene.canvas;
    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove);
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("pointerleave", this._onLeave);
    c.addEventListener("wheel", this._onWheel, { passive: false });
    c.addEventListener("contextmenu", this._onContextMenu);
    // Let tools receive touch drags instead of the page scrolling
    c.style.touchAction = "none";
    this._listening = true;
  }

  _unlisten() {
    if (!this._listening) return;
    const c = this.scene.canvas;
    c.removeEventListener("pointerdown", this._onDown);
    c.removeEventListener("pointermove", this._onMove);
    c.removeEventListener("pointerup", this._onUp);
    c.removeEventListener("pointercancel", this._onUp);
    c.removeEventListener("pointerleave", this._onLeave);
    c.removeEventListener("wheel", this._onWheel);
    c.removeEventListener("contextmenu", this._onContextMenu);
    c.style.touchAction = "";
    this._listening = false;
  }

  /** Converts a DOM event position to canvas pixels. */
  _toCanvas(e) {
    const c = this.scene.canvas;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  }

  _pointerEvent(e) {
    const { x, y } = this._toCanvas(e);
    const ev = {
      x, y,
      dx: x - this._last.x,
      dy: y - this._last.y,
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      original: e,
    };
    this._last = { x, y };
    return ev;
  }

  _onDown(e) {
    if (this._active) return;
    const ev = this._pointerEvent(e);
    ev.dx = ev.dy = 0;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const tool = this.list[i];
      if (tool.pointerDown?.(ev, this.scene) === true) {
        this._active = tool;
        this._pointerId = e.pointerId;
        this.scene.canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
    }
  }

  _onMove(e) {
    if (this._active && e.pointerId !== this._pointerId) return;
    const ev = this._pointerEvent(e);

    if (this._active) {
      this._active.pointerMove?.(ev, this.scene);
    } else {
      for (const tool of this.list) tool.pointerMove?.(ev, this.scene);
    }
  }

  _onUp(e) {
    if (!this._active || e.pointerId !== this._pointerId) return;
    const ev = this._pointerEvent(e);
    const tool = this._active;
    this._release();
    tool.pointerUp?.(ev, this.scene);
  }

  _onLeave() {
    if (this._active) return;
    for (const tool of this.list) tool.pointerLeave?.(this.scene);
  }

  _onWheel(e) {
    const { x, y } = this._toCanvas(e);
    const ev = { x, y, deltaY: e.deltaY, original: e };

    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].wheel?.(ev, this.scene) === true) {
        e.preventDefault();
        return;
      }
    }
  }

  _onContextMenu(e) {
    if (this.list.some(tool => tool.blockContextMenu)) e.preventDefault();
  }

  _release() {
    if (this._pointerId !== null) {
      this.scene.canvas.releasePointerCapture?.(this._pointerId);
    }
    this._active = null;
    this._pointerId = null;
  }
}
