import { Scene, lathe, spline, OrbitCamera } from "./trid/index.js";

// The same 5 profile points: straight lines (left) and a spline through them (right)
const points = [{ r: 0.1, y: -0.4 }, { r: 0.3, y: -0.25 }, { r: 0.12, y: 0.05 }, { r: 0.08, y: 0.25 }, { r: 0.18, y: 0.4 }];
const rough = lathe(points, { segments: 24, capBottom: true });
const smooth = lathe(spline(points, { segments: 8 }), { segments: 24, capBottom: true });

// A 3D curve through 6 points, drawn as a line (vertices + edges)
const knot = spline([
  { x: -0.3, y: -0.35, z: 0 }, { x: 0.2, y: -0.2, z: 0.3 }, { x: 0.3, y: 0.1, z: -0.2 },
  { x: -0.2, y: 0.2, z: -0.3 }, { x: -0.25, y: 0.4, z: 0.25 }, { x: 0.25, y: 0.4, z: 0.1 },
], { count: 60 });
const curve = { vertices: knot, edges: knot.slice(1).map((_, i) => [i, i + 1]) };

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2.2 } });
  scene.add({ mesh: rough, pos: { x: -0.8, y: 0, z: 0 }, material: { fill: "#8a8f98", wireframe: true } });
  scene.add({ mesh: smooth, pos: { x: 0, y: 0, z: 0 }, material: { fill: "#5f8fd8", wireframe: true } });
  scene.add({ mesh: curve, pos: { x: 0.8, y: 0, z: 0 }, color: "#e5c07b" });

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
