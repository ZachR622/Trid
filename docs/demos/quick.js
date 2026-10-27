import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 300,
    camera: { z: -1.6, fov: 0.6 }, // a step back, with a narrower lens
  });

  // A cube with rounded edges, filled and smoothly shaded
  const cube = scene.add({
    mesh: makeShape("cube", { radius: 0.08 }),
    material: { fill: "#E9806E", smooth: true },
  });

  scene.use(new OrbitCamera()); // drag to turn around it
  scene.start((dt) => {
    cube.rot.x += dt * 0.5;
    cube.rot.y += dt * 0.35;
  });

  return () => scene.destroy();
}
