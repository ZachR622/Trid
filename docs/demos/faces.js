import { Scene, makeShape, OrbitCamera, HoverHighlight } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -1.6 }, lineWidth: 1.5,
  });

  const cube = scene.add({
    mesh: makeShape("cube", { size: 0.5 }),
    pos: { x: -0.7, y: 0, z: 0 },
    material: { fill: "#E9806E" },
  });

  const sphere = scene.add({
    mesh: makeShape("sphere", { r: 0.32 }),
    material: { fill: "#8ab4f8", smooth: true },
  });

  const box = scene.add({
    mesh: makeShape("box", { w: 0.5, h: 0.3, d: 0.3 }),
    pos: { x: 0.7, y: 0, z: 0 },
    color: "#7ae96e",
    material: { fill: "#1f2a1e", wireframe: true },
  });

  scene.use(new OrbitCamera({ pitch: -0.3 }));
  scene.use(new HoverHighlight({ color: "#ffffff" }));

  scene.start((dt) => {
    for (const obj of [cube, sphere, box]) {
      obj.rot.y += dt * 0.5;
      obj.rot.x += dt * 0.2;
    }
  });

  return () => scene.destroy();
}
