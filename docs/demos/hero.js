import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { OrbitCamera, DragObject, HoverHighlight } from "./trid/tools/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 1000, height: 420, camera: { z: -2 } });

  const ball = scene.add({
    mesh: makeShape("sphere", { r: 0.45, rings: 10, segments: 16 }),
    pos: { x: -0.6, y: 0, z: 0 },
    color: "#E9806E",
  });
  const box = scene.add({
    mesh: makeShape("cube", { size: 0.6 }),
    pos: { x: 0.6, y: 0, z: 0 },
    color: "#7ae96e",
  });

  scene.use(new OrbitCamera());
  scene.use(new DragObject());
  scene.use(new HoverHighlight());

  scene.start((dt) => {
    ball.rot.y += dt * 0.6;
    box.rot.x += dt * 0.8;
    box.rot.y += dt * 0.5;
  });

  return () => scene.destroy();
}
