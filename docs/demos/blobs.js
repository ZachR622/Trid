import { Scene, blobMesh, WebGLRenderer, OrbitCamera } from "./trid/index.js";

const p = (x, y, z) => ({ x, y, z });

// A spiky ball: a sphere with 26 rounded cones (capsules with a thick and a thin end)
// spread evenly around it, melting into it where they meet
const spikes = Array.from({ length: 26 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 26, r = Math.sqrt(1 - y * y), a = i * 2.4; // golden-angle spiral
  const d = p(Math.cos(a) * r, y, Math.sin(a) * r);
  return { kind: "capsule", a: p(d.x * 0.15, d.y * 0.15, d.z * 0.15), b: p(d.x * 0.34, d.y * 0.34, d.z * 0.34), ra: 0.07, rb: 0.012 };
});
const ball = blobMesh([{ kind: "sphere", center: p(0, 0, 0), radius: 0.2 }, ...spikes], { blend: 0.04, resolution: 48 });

// A die: a rounded box with its pips carved out, as marching cubes
const pip = (x, y, z) => ({ kind: "sphere", center: p(x, y, z), radius: 0.035, op: "subtract", blend: 0.01 });
const die = blobMesh([
  { kind: "box", center: p(0, 0, 0), size: p(0.36, 0.36, 0.36), round: 0.05 },
  pip(0, 0, 0.18),
  pip(-0.08, 0.18, -0.08), pip(0.08, 0.18, 0.08),
  pip(0.18, -0.08, -0.08), pip(0.18, 0, 0), pip(0.18, 0.08, 0.08),
], { blend: 0, method: "cubes", resolution: 40 });

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -2, fov: 0.6 },
    // Blobs make thousands of small faces: WebGL draws them easily
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  scene.add({ mesh: ball, pos: p(-0.42, 0, 0), material: { fill: "#e5c07b", smooth: true } });
  scene.add({ mesh: die, pos: p(0.45, 0, 0), rot: p(0.4, Math.PI - 0.6, 0), material: { fill: "#E9806E", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.2, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
