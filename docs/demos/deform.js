import { Scene, lathe, taperMesh, twistMesh, bendMesh, bulgeMesh, OrbitCamera } from "./trid/index.js";

// A square column with many rows (a lathe with 4 sides), so it can bend and twist smoothly
const column = () => lathe(
  Array.from({ length: 25 }, (_, i) => ({ r: 0.1, y: -0.35 + (i / 24) * 0.7 })),
  { segments: 4, capBottom: true, capTop: true },
);

const tapered = taperMesh(column(), { amount: 0.3 });
const twisted = twistMesh(column(), { angle: Math.PI });
const bent = bendMesh(column(), { angle: Math.PI / 2, toward: "x", from: 0.4, to: 0.8 });
const bulged = bulgeMesh(column(), { center: { x: 0.1, y: 0, z: 0 }, radius: 0.2, amount: 0.08 });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2 } });
  [tapered, twisted, bent, bulged].forEach((mesh, i) => {
    scene.add({ mesh, pos: { x: -0.75 + i * 0.5, y: 0, z: 0 }, material: { fill: ["#e5c07b", "#5f8fd8", "#98c379", "#E9806E"][i], wireframe: true } });
  });
  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
