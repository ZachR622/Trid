/**
 * Draws the frames per second in a corner of the canvas.
 *
 * The value is averaged and refreshed every `interval` seconds,
 * so it stays readable. It only counts while the scene is running.
 */
export class FpsMeter {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.color="#ffffff"] - Text color
   * @param {string} [opts.font="14px monospace"] - CSS font
   * @param {"top-left"|"top-right"|"bottom-left"|"bottom-right"} [opts.corner="top-left"]
   * @param {number} [opts.interval=0.5] - Seconds between refreshes
   */
  constructor({ color = "#ffffff", font = "14px monospace", corner = "top-left", interval = 0.5 } = {}) {
    this.color = color;
    this.font = font;
    this.corner = corner;
    this.interval = interval;

    /** Last measured frames per second. */
    this.fps = 0;
    this._frames = 0;
    this._time = 0;
  }

  update(dt) {
    // The loop's first frame has dt = 0; counting it would inflate the reading
    if (dt <= 0) return;
    this._frames++;
    this._time += dt;
    if (this._time >= this.interval) {
      this.fps = Math.round(this._frames / this._time);
      this._frames = 0;
      this._time = 0;
    }
  }

  draw(ctx, scene) {
    const pad = 8;
    const { width, height } = scene.canvas;
    const right = this.corner.endsWith("right");
    const bottom = this.corner.startsWith("bottom");

    ctx.font = this.font;
    ctx.fillStyle = this.color;
    ctx.textAlign = right ? "right" : "left";
    ctx.textBaseline = bottom ? "bottom" : "top";
    ctx.fillText(`${this.fps} FPS`, right ? width - pad : pad, bottom ? height - pad : pad);
  }
}
