import { Scene, makeShape } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 300 });

  const cube = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });

  scene.start((dt) => {
    cube.rot.x += dt;
    cube.rot.y += dt * 0.7;
  });

  return () => scene.destroy();
}
