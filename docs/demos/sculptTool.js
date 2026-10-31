import { Scene, makeShape, SculptTool, SCULPT_BRUSHES, WebGLRenderer, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 400, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  // A dense ball to sculpt
  scene.add({ mesh: makeShape("sphere", { r: 0.5, rings: 64, segments: 128 }), material: { fill: "#E9806E", smooth: true } });

  scene.use(new OrbitCamera({ distance: 3, pitch: -0.2 })); // drag off the ball to turn around it
  const sculpt = scene.use(new SculptTool({ brush: "inflate", radius: 35, symmetry: "x" }));

  // A row of brush names to click, drawn on the canvas (added last, so it gets clicks first)
  const items = [...SCULPT_BRUSHES, "mirror x"];
  const box = (i) => ({ x: 12 + i * 92, y: 12, w: 86, h: 26 });
  scene.use({
    pointerDown(e) {
      const i = items.findIndex((_, k) => {
        const b = box(k);
        return e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
      });
      if (i < 0) return false;
      if (items[i] === "mirror x") sculpt.symmetry = sculpt.symmetry ? undefined : "x";
      else sculpt.brush = items[i];
      return true;
    },
    draw(ctx) {
      ctx.save();
      ctx.font = "13px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      items.forEach((name, i) => {
        const b = box(i);
        const on = name === "mirror x" ? !!sculpt.symmetry : sculpt.brush === name;
        ctx.fillStyle = on ? "#E9806E" : "rgba(255,255,255,0.12)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = on ? "#1b1b1f" : "#ddd";
        ctx.fillText(name, b.x + 10, b.y + b.h / 2);
      });
      ctx.restore();
    },
  });

  scene.start();
  return () => scene.destroy();
}
