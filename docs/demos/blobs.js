import { Scene, blobMesh, OrbitCamera } from "./trid/index.js";

const p = (x, y, z) => ({ x, y, z });

// A panda: body, head, ears, legs and arms melting together; eye patches as separate meshes
const panda = blobMesh([
  { kind: "ellipsoid", center: p(0, -0.1, 0), radii: p(0.26, 0.24, 0.22) },
  { kind: "sphere", center: p(0, 0.22, 0.02), radius: 0.17, blend: 0.06 },
  { kind: "sphere", center: p(-0.13, 0.36, 0), radius: 0.055, blend: 0.03 },
  { kind: "sphere", center: p(0.13, 0.36, 0), radius: 0.055, blend: 0.03 },
  { kind: "ellipsoid", center: p(0, 0.17, 0.16), radii: p(0.07, 0.05, 0.05), blend: 0.04 },
  { kind: "capsule", a: p(-0.15, -0.22, 0.05), b: p(-0.17, -0.34, 0.1), radius: 0.07 },
  { kind: "capsule", a: p(0.15, -0.22, 0.05), b: p(0.17, -0.34, 0.1), radius: 0.07 },
  { kind: "capsule", a: p(-0.2, 0.02, 0.05), b: p(-0.23, -0.12, 0.17), radius: 0.06 },
  { kind: "capsule", a: p(0.2, 0.02, 0.05), b: p(0.23, -0.12, 0.17), radius: 0.06 },
  { kind: "sphere", center: p(-0.06, 0.25, 0.16), radius: 0.02, op: "subtract", blend: 0.01 },
  { kind: "sphere", center: p(0.06, 0.25, 0.16), radius: 0.02, op: "subtract", blend: 0.01 },
], { blend: 0.05, resolution: 56 });

// A die: a rounded box with its pips carved out, as marching cubes
const pip = (x, y, z) => ({ kind: "sphere", center: p(x, y, z), radius: 0.035, op: "subtract", blend: 0.01 });
const die = blobMesh([
  { kind: "box", center: p(0, 0, 0), size: p(0.36, 0.36, 0.36), round: 0.05 },
  pip(0, 0, 0.18),
  pip(-0.08, 0.18, -0.08), pip(0.08, 0.18, 0.08),
  pip(0.18, -0.08, -0.08), pip(0.18, 0, 0), pip(0.18, 0.08, 0.08),
], { blend: 0, method: "cubes", resolution: 56 });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2 } });
  scene.add({ mesh: panda, pos: p(-0.4, 0, 0), material: { fill: "#eeeeee", smooth: true } });
  scene.add({ mesh: die, pos: p(0.45, 0, 0), rot: p(0.4, 0.6, 0), material: { fill: "#E9806E", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.2, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
