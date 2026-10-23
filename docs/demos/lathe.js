import { Scene, lathe, extrude, OrbitCamera } from "./trid/index.js";

// A vase: the profile goes bottom to top, so the outside is on its right
const vase = lathe([
  { r: 0.16, y: -0.4 }, { r: 0.28, y: -0.25 }, { r: 0.3, y: -0.05 },
  { r: 0.14, y: 0.25 }, { r: 0.12, y: 0.35 }, { r: 0.18, y: 0.42 },
], { segments: 24, capBottom: true });

// A star: a concave outline in the XY plane
const star = extrude(Array.from({ length: 10 }, (_, i) => {
  const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.17 : 0.4;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}), 0.12, { bevel: 0.03, bevelSegments: 3 });

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, lineWidth: 1, camera: { z: -2 },
  });
  scene.add({ mesh: vase, pos: { x: -0.45, y: 0, z: 0 }, material: { fill: "#5f8fd8", wireframe: true } });
  const s = scene.add({ mesh: star, pos: { x: 0.45, y: 0, z: 0 }, material: { fill: "#e5c07b", wireframe: true } });

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start((dt) => (s.rot.y += dt * 0.6));

  return () => scene.destroy();
}
