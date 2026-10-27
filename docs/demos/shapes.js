import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

// Your own mesh: corners (vertices), faces (clockwise from outside) and lines (edges)
const pyramid = {
  vertices: [
    { x: -0.25, y: -0.25, z: -0.25 }, { x: 0.25, y: -0.25, z: -0.25 },
    { x:  0.25, y: -0.25, z:  0.25 }, { x: -0.25, y: -0.25, z: 0.25 },
    { x: 0, y: 0.3, z: 0 },
  ],
  faces: [[0, 1, 2, 3], [0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]],
  edges: [[0, 1, 2, 3, 0], [0, 4], [1, 4], [2, 4], [3, 4]],
};

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 380, camera: { fov: 0.6 }, lineWidth: 1, color: "#00000055" });

  const shapes = [
    // Top row
    makeShape("cube", { size: 0.45 }),
    makeShape("box", { w: 0.6, h: 0.3, d: 0.3, radius: 0.06, segments: 2 }),
    makeShape("sphere", { r: 0.3, rings: 12, segments: 20 }),
    pyramid,
    // Bottom row
    makeShape("cylinder", { r: 0.22, h: 0.5, segments: 20 }),
    makeShape("cone", { r: 0.25, h: 0.5, segments: 20 }),
    makeShape("torus", { R: 0.24, tube: 0.08, segments: 28, tubeSegments: 12 }),
    makeShape("plane", { size: 0.6, div: 6 }),
  ];
  const colors = ["#E9806E", "#e5c07b", "#7ae96e", "#8ab4f8", "#c678dd", "#56b6c2", "#f0a35e", "#98c379"];

  // Filled, with their lines drawn on top so you can see how each one is built
  const objs = shapes.map((mesh, i) => scene.add({
    mesh,
    pos: { x: ((i % 4) - 1.5) * 0.8, y: i < 4 ? 0.4 : -0.4, z: 0 },
    rot: { x: i === 6 || i === 7 ? -0.5 : 0, y: 0, z: 0 },
    material: { fill: colors[i], smooth: true, wireframe: true, doubleSided: i === 7 },
  }));

  scene.use(new OrbitCamera({ pitch: -0.3, distance: 3.3 }));
  scene.start((dt) => objs.forEach((o) => (o.rot.y += dt * 0.5)));

  return () => scene.destroy();
}
