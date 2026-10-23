import { Scene, makeShape, displaceMesh, fbm2, fbm3, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 340, lineWidth: 1, camera: { z: -2.4 },
  });

  // A rock: a sphere pushed in and out by 3D noise (no seam, since it's sampled in 3D)
  const rock = displaceMesh(makeShape("sphere", { r: 0.35, rings: 16, segments: 32 }), (v) => {
    const k = 0.75 + 0.5 * fbm3(v.x * 4, v.y * 4, v.z * 4, { seed: 3, octaves: 4 });
    return { x: v.x * k, y: v.y * k * 0.8, z: v.z * k };
  });
  scene.add({ mesh: rock, pos: { x: -0.55, y: 0, z: 0 }, material: { fill: "#9a8f84", smooth: true } });

  // Hills: a plane lifted by 2D noise
  const hills = makeShape("plane", {
    size: 1, div: 32,
    height: (x, z) => 0.8 * (fbm2(x * 3 + 10, z * 3, { octaves: 4 }) - 0.5),
  });
  scene.add({ mesh: hills, pos: { x: 0.6, y: -0.15, z: 0 }, material: { fill: "#6fae5c", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.45, autoRotate: true, autoRotateSpeed: 0.3, autoRotateDelay: 2 }));
  scene.start();

  return () => scene.destroy();
}
