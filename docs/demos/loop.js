import { Scene, makeShape } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 300, camera: { z: -2 } });

  // One mesh, shared by five objects
  const mesh = makeShape("cube", { size: 0.3 });
  const cubes = [-2, -1, 0, 1, 2].map((i) => scene.add({
    mesh,
    pos: { x: i * 0.5, y: 0, z: 0 },
    color: `hsl(${10 + i * 25}, 75%, 65%)`,
  }));

  scene.start((dt, time) => {
    cubes.forEach((c, i) => {
      c.pos.y = Math.sin(time * 2 + i) * 0.25;
      c.rot.y += dt * (1 + i * 0.3);
    });
  });

  // Click to pause / resume
  canvas.addEventListener("click", () => {
    if (scene.running) scene.stop();
    else scene.start(update);
  });

  return () => scene.destroy();
}
