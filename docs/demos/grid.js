import { Scene, makeShape, gridHelper, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, camera: { y: 0.6, z: -2.4 } });
  scene.add(gridHelper({ size: 4, divisions: 40 }));
  scene.add({ mesh: makeShape("cube", { size: 0.4 }), pos: { x: 0, y: 0.2, z: 0 }, material: { fill: "#E9806E" } });
  scene.use(new OrbitCamera({ pitch: -0.35 }));
  scene.start();
  return () => scene.destroy();
}
