import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 300, camera: { z: -1.4, fov: 0.9 } });

  // The same low-poly sphere, flat on the left and smooth on the right
  const ball = makeShape("sphere", { r: 0.35, rings: 8, segments: 12 });
  scene.add({ mesh: ball, pos: { x: -0.5, y: 0, z: 0 }, material: { fill: "#8ab4f8" } });
  scene.add({ mesh: ball, pos: { x: 0.5, y: 0, z: 0 }, material: { fill: "#8ab4f8", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.2 }));
  scene.start();

  return () => scene.destroy();
}
