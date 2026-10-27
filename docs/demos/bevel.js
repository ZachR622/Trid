import { Scene, makeShape, extrude, bevelMesh, OrbitCamera } from "./trid/index.js";

const star = Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.1 : 0.22;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

// Every sharp edge rounded: caps, sides, and the concave inner corners
const starBevel = bevelMesh(extrude(star, 0.1), { radius: 0.02, segments: 3 });
// Only the rims are sharper than 30°: the sides stay smooth
const knob = bevelMesh(makeShape("cylinder", { r: 0.18, h: 0.16, segments: 32 }), { radius: 0.03, segments: 4 });
// Just one edge
const block = makeShape("box", { w: 0.3, h: 0.3, d: 0.3 });
const [a, b] = block.faces[2];
const oneEdge = bevelMesh(block, { edges: [[a, b]], radius: 0.08, segments: 6 });
// Corners cut, edges left sharp
const cut = bevelMesh(makeShape("cube", { size: 0.3 }), { mode: "vertices", radius: 0.07, segments: 1 });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2, fov: 0.65 } });
  const items = [[starBevel, "#e5c07b"], [knob, "#5f8fd8"], [oneEdge, "#98c379"], [cut, "#E9806E"]];
  items.forEach(([mesh, fill], i) => scene.add({ mesh, pos: { x: -0.75 + i * 0.5, y: 0, z: 0 }, rot: { x: 0.5, y: 0.6, z: 0 }, material: { fill, smooth: true } }));
  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
