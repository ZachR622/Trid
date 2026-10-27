import { Scene, makeShape, OrbitCamera, pick, screenBounds } from "./trid/index.js";

class SelectTool {
  constructor({ color = "#ffd166", onSelect } = {}) {
    this.color = color;
    this.onSelect = onSelect;
    this.selected = null;
    this._onKey = this._onKey.bind(this);
  }

  attach(scene) {
    this.scene = scene;
    window.addEventListener("keydown", this._onKey);
  }

  detach() {
    window.removeEventListener("keydown", this._onKey);
    this.selected = null;
  }

  pointerDown(e, scene) {
    if (e.button !== 0) return false;
    this.selected = pick(scene, e.x, e.y);
    this.onSelect?.(this.selected);
    return false; // let the camera tool below use the drag too
  }

  draw(ctx, scene) {
    if (!this.selected) return;
    const box = screenBounds(scene, this.selected);
    if (!box) return;
    const pad = 6;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.color;
    ctx.strokeRect(box.minX - pad, box.minY - pad,
                   box.maxX - box.minX + pad * 2, box.maxY - box.minY + pad * 2);
    ctx.restore();
  }

  _onKey(e) {
    if (e.key === "Delete" && this.selected) {
      this.scene.remove(this.selected);
      this.selected = null;
    }
  }
}

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -2.2, fov: 0.6 },
  });

  ["cube", "sphere", "box"].forEach((kind, i) => scene.add({
    mesh: makeShape(kind, { size: 0.4, r: 0.25, w: 0.5, h: 0.25, d: 0.3, radius: 0.04, segments: 2 }),
    pos: { x: (i - 1) * 0.7, y: 0, z: 0 },
    material: { fill: ["#E9806E", "#7ae96e", "#8ab4f8"][i], smooth: true },
  }));

  scene.use(new OrbitCamera());
  scene.use(new SelectTool()); // added last, so it sees clicks first
  scene.start();

  return () => scene.destroy();
}
