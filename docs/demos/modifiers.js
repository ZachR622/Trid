import { Scene, makeShape, applyModifiers, WebGLRenderer, OrbitCamera } from "./trid/index.js";

// One stack, as data: a box made soft, shaped like a gourd, bent, and roughened
const stack = [
  { type: "subdivide", levels: 3 },
  { type: "lattice", div: 3, interpolation: "cardinal", edits: [
    { select: { y: -1 }, scale: { x: 0.45, z: 0.45 } },
    { select: { y: 1 }, scale: { x: 1.25, z: 1.25 } },
  ] },
  { type: "bend", axis: "y", angle: 0.9, toward: "x", from: 0.4 },
  { type: "noise", amount: 0.02, size: 0.06, seed: 4 },
];
const base = makeShape("box", { w: 0.3, h: 0.5, d: 0.3 });

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 280, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  // The stack applied step by step: none, the first, the first two, ...
  for (let n = 0; n <= stack.length; n++) {
    scene.add({
      mesh: applyModifiers(base, stack.slice(0, n)),
      pos: { x: (n - 2) * 0.5, y: 0, z: 0 },
      material: { fill: "#E9806E", smooth: n > 0 },
    });
  }
  scene.use(new OrbitCamera({ distance: 2.2, pitch: -0.25 }));
  scene.start();
  return () => scene.destroy();
}
