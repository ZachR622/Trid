import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

const pyramid = {
  vertices: [
    { x: -0.25, y: -0.25, z: -0.25 }, { x: 0.25, y: -0.25, z: -0.25 },
    { x:  0.25, y: -0.25, z:  0.25 }, { x: -0.25, y: -0.25, z: 0.25 },
    { x: 0, y: 0.3, z: 0 },
  ],
  edges: [[0, 1, 2, 3], [0, 4], [1, 4], [2, 4], [3, 4]],
};

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 300, lineWidth: 2, camera: { z: -2.4 },
  });

  const shapes = [
    makeShape("cube", { size: 0.45 }),
    makeShape("box", { w: 0.6, h: 0.3, d: 0.3 }),
    makeShape("sphere", { r: 0.3, rings: 8, segments: 14 }),
    pyramid,
  ];
  const colors = ["#E9806E", "#e5c07b", "#7ae96e", "#8ab4f8"];

  const objs = shapes.map((mesh, i) => scene.add({
    mesh, color: colors[i], pos: { x: (i - 1.5) * 0.75, y: 0, z: 0 },
  }));

  scene.use(new OrbitCamera({ pitch: -0.3 }));
  scene.start((dt) => objs.forEach((o) => (o.rot.y += dt * 0.5)));

  return () => scene.destroy();
}
