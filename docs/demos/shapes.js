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
    width: 800, height: 380, lineWidth: 2, camera: { z: -3 },
  });

  const shapes = [
    // Top row
    makeShape("cube", { size: 0.45 }),
    makeShape("box", { w: 0.6, h: 0.3, d: 0.3 }),
    makeShape("sphere", { r: 0.3, rings: 8, segments: 14 }),
    pyramid,
    // Bottom row
    makeShape("cylinder", { r: 0.22, h: 0.5, segments: 16 }),
    makeShape("cone", { r: 0.25, h: 0.5, segments: 16 }),
    makeShape("torus", { R: 0.24, tube: 0.08, segments: 20, tubeSegments: 10 }),
    makeShape("plane", { size: 0.6, div: 6 }),
  ];
  const colors = ["#E9806E", "#e5c07b", "#7ae96e", "#8ab4f8", "#c678dd", "#56b6c2", "#f0a35e", "#98c379"];

  const objs = shapes.map((mesh, i) => scene.add({
    mesh, color: colors[i],
    pos: { x: ((i % 4) - 1.5) * 0.8, y: i < 4 ? 0.4 : -0.4, z: 0 },
    rot: { x: i === 6 || i === 7 ? -0.5 : 0, y: 0, z: 0 },
  }));

  scene.use(new OrbitCamera({ pitch: -0.3 }));
  scene.start((dt) => objs.forEach((o) => (o.rot.y += dt * 0.5)));

  return () => scene.destroy();
}
