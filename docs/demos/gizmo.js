import { Scene, makeShape, OrbitCamera, ViewGizmo, TransformGizmo, pick } from "./trid/index.js";

const MODES = ["move", "rotate", "scale"];

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, lineWidth: 1, camera: { y: 0.8, z: -2.6 },
  });

  const shapes = [
    scene.add({ mesh: makeShape("cube", { size: 0.4 }), pos: { x: -0.7, y: 0, z: 0 }, material: { fill: "#E9806E" } }),
    scene.add({ mesh: makeShape("torus", { R: 0.22, tube: 0.07 }), pos: { x: 0, y: 0, z: 0 }, material: { fill: "#e5c07b", smooth: true } }),
    scene.add({ mesh: makeShape("cone", { r: 0.2, h: 0.45 }), pos: { x: 0.7, y: 0, z: 0 }, material: { fill: "#7ae96e", smooth: true } }),
  ];
  scene.add({ mesh: makeShape("plane", { size: 2.4, div: 12 }), pos: { x: 0, y: -0.3, z: 0 }, color: "#333" });

  scene.use(new OrbitCamera({ pitch: -0.35 }));
  // Added after the camera, so they get clicks first
  scene.use(new ViewGizmo());
  const gizmo = scene.use(new TransformGizmo({ targets: [shapes[1]] }));

  // A click (not a drag) selects the shape under it, by its triangles: the torus's hole is empty
  let down = null;
  const toCanvas = (e) => ({
    x: (e.offsetX * canvas.width) / canvas.clientWidth,
    y: (e.offsetY * canvas.height) / canvas.clientHeight,
  });
  canvas.addEventListener("pointerdown", (e) => (down = toCanvas(e)));
  canvas.addEventListener("pointerup", (e) => {
    const p = toCanvas(e);
    if (!down || gizmo.dragging || Math.hypot(p.x - down.x, p.y - down.y) > 4) return;
    const hit = pick(scene, p.x, p.y, { exact: true, filter: (o) => shapes.includes(o) });
    gizmo.targets = hit ? [hit] : [];
  });

  // 1 / 2 / 3 switch the mode while the pointer is over the canvas
  let over = false;
  canvas.addEventListener("pointerenter", () => (over = true));
  canvas.addEventListener("pointerleave", () => (over = false));
  const onKey = (e) => {
    const mode = MODES[Number(e.key) - 1];
    if (over && mode) gizmo.mode = mode;
  };
  addEventListener("keydown", onKey);

  scene.start();
  return () => {
    removeEventListener("keydown", onKey);
    scene.destroy();
  };
}
