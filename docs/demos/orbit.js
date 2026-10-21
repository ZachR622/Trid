import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, lineWidth: 2, camera: { z: -2 },
  });
  scene.add({ mesh: makeShape("sphere", { r: 0.5 }), color: "#8ab4f8" });

  const orbit = scene.use(new OrbitCamera({ pitch: -0.3, minDistance: 0.8, maxDistance: 5 }));

  // Spin slowly when nobody touches it
  let idle = 0;
  canvas.addEventListener("pointerdown", () => (idle = 0));
  scene.start((dt) => {
    idle += dt;
    if (idle > 2) orbit.yaw += dt * 0.3;
  });

  return () => scene.destroy();
}
