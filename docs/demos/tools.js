import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { OrbitCamera, DragObject, HoverHighlight, FpsMeter } from "./trid/tools/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 360, lineWidth: 2, camera: { y: 0.6, z: -2.5 },
  });

  for (let i = 0; i < 5; i++) {
    scene.add({
      mesh: makeShape(i % 2 ? "cube" : "sphere", { size: 0.35, r: 0.2, rings: 6, segments: 10 }),
      pos: { x: (i - 2) * 0.55, y: 0, z: 0 },
      color: `hsl(${i * 60 + 10}, 75%, 65%)`,
    });
  }

  // A floor that can't be dragged or highlighted
  scene.add({
    mesh: makeShape("box", { w: 3, h: 0.01, d: 1.5 }),
    pos: { x: 0, y: -0.3, z: 0 },
    color: "#444", draggable: false, hoverable: false,
  });

  scene.use(new OrbitCamera());
  scene.use(new HoverHighlight());
  // Make a shape's lines thicker while it's held
  scene.use(new DragObject({
    onPick: (obj) => (obj.lineWidth = 4),
    onDrop: (obj) => delete obj.lineWidth,
  }));
  scene.use(new FpsMeter({ color: "#888", corner: "top-right" }));
  scene.start();

  return () => scene.destroy();
}
