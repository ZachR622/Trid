import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, lineWidth: 2, camera: { z: -2 },
  });
  scene.add({ mesh: makeShape("sphere", { r: 0.5 }), color: "#8ab4f8" });

  // Spins slowly on its own, and waits 2 s after each drag before spinning again
  scene.use(new OrbitCamera({
    pitch: -0.3, minDistance: 0.8, maxDistance: 5,
    autoRotate: true, autoRotateSpeed: 0.3, autoRotateDelay: 2,
  }));
  scene.start();

  return () => scene.destroy();
}
