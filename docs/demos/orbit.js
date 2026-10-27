import { Scene, makeShape, gridHelper, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, camera: { z: -2, fov: 0.7 } });
  scene.add(gridHelper({ size: 4, divisions: 20 }));
  scene.add({ mesh: makeShape("torus", { R: 0.35, tube: 0.13 }), pos: { x: 0, y: 0.15, z: 0 }, rot: { x: 1.1, y: 0, z: 0.3 }, material: { fill: "#8ab4f8", smooth: true } });

  // Spins slowly on its own, and waits 2 s after each drag before spinning again
  scene.use(new OrbitCamera({
    pitch: -0.3, minDistance: 0.8, maxDistance: 5,
    autoRotate: true, autoRotateSpeed: 0.3, autoRotateDelay: 2,
  }));
  scene.start();

  return () => scene.destroy();
}
