import { pick } from "./helpers.js";

/**
 * Changes an object's color while the pointer is over it.
 *
 * The object's own `color` is put back when the pointer leaves it,
 * when it leaves the canvas, or when the tool is removed. Objects
 * with a `material` get their fill changed too.
 * Set `obj.hoverable = false` to make an object ignore this tool.
 */
export class HoverHighlight {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.color="#ffffff"] - Highlight color
   * @param {(obj:Object) => boolean} [opts.filter] - Which objects can be highlighted
   *   (default: those without `hoverable: false`)
   * @param {(obj:Object|null) => void} [opts.onChange] - Called when the hovered object changes
   */
  constructor({ color = "#ffffff", filter = obj => obj.hoverable !== false, onChange } = {}) {
    this.color = color;
    this.filter = filter;
    this.onChange = onChange;

    /** The object under the pointer, or null. */
    this.hovered = null;
    this._savedColor = undefined;
    this._savedMaterial = undefined;
  }

  pointerMove(e, scene) {
    this._set(pick(scene, e.x, e.y, { filter: this.filter }));
  }

  pointerLeave() {
    this._set(null);
  }

  detach() {
    this._set(null);
  }

  _set(obj) {
    if (obj === this.hovered) return;

    if (this.hovered) {
      if (this._savedColor === undefined) delete this.hovered.color;
      else this.hovered.color = this._savedColor;
      if (this._savedMaterial) this.hovered.material = this._savedMaterial;
    }

    this.hovered = obj;
    if (obj) {
      this._savedColor = obj.color;
      obj.color = this.color;
      // Swap in a copy, so other objects sharing the material don't change
      this._savedMaterial = obj.material;
      if (obj.material) obj.material = { ...obj.material, fill: this.color };
    }

    this.onChange?.(obj);
  }
}
