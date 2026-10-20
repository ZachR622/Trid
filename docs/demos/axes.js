import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { OrbitCamera } from "./trid/tools/index.js";

// A custom mesh: one line from the origin along an axis
const axis = (x, y, z) => ({
  vertices: [{ x: 0, y: 0, z: 0 }, { x, y, z }],
  edges: [[0, 1]],
});

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 360, lineWidth: 2,
    camera: { x: 1.2, y: 1, z: -1.6 },
  });

  scene.add({ mesh: axis(1, 0, 0), color: "#ff6b6b", lineWidth: 4 }); // X
  scene.add({ mesh: axis(0, 1, 0), color: "#7ae96e", lineWidth: 4 }); // Y
  scene.add({ mesh: axis(0, 0, 1), color: "#6ba8ff", lineWidth: 4 }); // Z
  scene.add({ mesh: makeShape("cube", { size: 0.3 }), color: "#666" });

  scene.use(new OrbitCamera({ yaw: -0.6, pitch: -0.45 }));
  scene.start();

  return () => scene.destroy();
}
