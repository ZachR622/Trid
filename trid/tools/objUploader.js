import { readOBJFile, pickOBJFile } from "../loaders/obj.js";

/**
 * Lets the user load .obj files into the scene.
 *
 * - Drag and drop a .obj file onto the canvas
 * - Or call `open()` from a button click to show the file dialog
 *
 * By default the new model replaces the last one it loaded. Pass
 * `onLoad` to decide yourself what happens with it.
 */
export class ObjUploader {
  /**
   * @param {Object} [opts]
   * @param {number|null} [opts.fit=1] - Size of the model's largest side (null keeps the file's units)
   * @param {string} [opts.color] - Color of loaded models (default: the scene's color)
   * @param {boolean} [opts.replace=true] - Remove the previously loaded model first
   * @param {string} [opts.hint="Drop an .obj file here"] - Text shown while nothing is loaded ("" for none)
   * @param {(obj:Object, file:File, scene:Scene) => void} [opts.onLoad] - Called with the object after it's added
   * @param {(err:Error, file:File) => void} [opts.onError] - Called when a file can't be read
   */
  constructor({
    fit = 1,
    color,
    replace = true,
    hint = "Drop an .obj file here",
    onLoad,
    onError = (err) => console.error(err),
  } = {}) {
    this.fit = fit;
    this.color = color;
    this.replace = replace;
    this.hint = hint;
    this.onLoad = onLoad;
    this.onError = onError;

    /** The last object this tool added, or null. */
    this.object = null;

    this._scene = null;
    this._dragging = false;
    this._onDragOver = this._onDragOver.bind(this);
    this._onDragLeave = this._onDragLeave.bind(this);
    this._onDrop = this._onDrop.bind(this);
  }

  attach(scene) {
    this._scene = scene;
    const c = scene.canvas;
    c.addEventListener("dragover", this._onDragOver);
    c.addEventListener("dragleave", this._onDragLeave);
    c.addEventListener("drop", this._onDrop);
  }

  detach(scene) {
    const c = scene.canvas;
    c.removeEventListener("dragover", this._onDragOver);
    c.removeEventListener("dragleave", this._onDragLeave);
    c.removeEventListener("drop", this._onDrop);
    this._scene = null;
  }

  /**
   * Shows the file dialog and loads the chosen file.
   * Call it from a user action, like a button click.
   *
   * @returns {Promise<Object|null>} The added object, or null if cancelled or failed
   */
  async open() {
    const file = await pickOBJFile();
    return file ? this.load(file) : null;
  }

  /**
   * Loads a .obj `File` (or `Blob`) into the scene.
   *
   * @param {File} file
   * @returns {Promise<Object|null>} The added object, or null if it failed
   */
  async load(file) {
    const scene = this._scene;
    if (!scene) return null;

    let mesh;
    try {
      mesh = await readOBJFile(file, this.fit == null ? {} : { fit: this.fit });
    } catch (err) {
      this.onError(err, file);
      return null;
    }
    if (this._scene !== scene) return null;

    if (this.replace && this.object) scene.remove(this.object);
    const obj = { mesh };
    if (this.color) obj.color = this.color;
    this.object = scene.add(obj);
    this.onLoad?.(this.object, file, scene);
    this._redraw();
    return this.object;
  }

  draw(ctx, scene) {
    const { width, height } = scene.canvas;
    const showHint = this.hint && !this.object;
    if (!this._dragging && !showHint) return;

    ctx.save();
    if (this._dragging) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(8, 8, width - 16, height - 16);
    }
    if (showHint || this._dragging) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this._dragging ? "Drop to load" : this.hint, width / 2, height / 2);
    }
    ctx.restore();
  }

  // A running scene redraws every frame; a stopped one needs a nudge
  _redraw() {
    if (this._scene && !this._scene.running) this._scene.render();
  }

  _onDragOver(e) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault(); // allows the drop
    e.dataTransfer.dropEffect = "copy";
    if (!this._dragging) {
      this._dragging = true;
      this._redraw();
    }
  }

  _onDragLeave() {
    this._dragging = false;
    this._redraw();
  }

  _onDrop(e) {
    e.preventDefault();
    this._dragging = false;
    this._redraw();
    const files = [...(e.dataTransfer?.files ?? [])];
    const file = files.find((f) => f.name.toLowerCase().endsWith(".obj"));
    if (file) this.load(file);
    else if (files.length) this.onError(new Error("Not an .obj file"), files[0]);
  }
}
