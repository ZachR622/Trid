import { Scene } from "./trid/index.js";

// A square ring in the XY plane
const ring = {
  vertices: [{ x: -1, y: -0.6, z: 0 }, { x: 1, y: -0.6, z: 0 }, { x: 1, y: 0.6, z: 0 }, { x: -1, y: 0.6, z: 0 }],
  edges: [[0, 1, 2, 3]],
};

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 340, lineWidth: 2, background: "#0b0b0b",
    camera: { z: 0, near: 0.05 },
  });

  const COUNT = 16, GAP = 0.6;
  const rings = Array.from({ length: COUNT }, (_, i) =>
    scene.add({ mesh: ring, pos: { x: 0, y: 0, z: i * GAP } }));

  scene.start((dt, t) => {
    for (const r of rings) {
      r.pos.z -= dt * 1.5;
      if (r.pos.z < -0.2) r.pos.z += COUNT * GAP; // recycle behind the far end
      r.rot.z = r.pos.z * 0.15 + t * 0.2;         // twist
      const fade = 1 - r.pos.z / (COUNT * GAP);
      r.color = `hsla(${(t * 40 + r.pos.z * 30) % 360}, 80%, 65%, ${fade})`;
    }
  });

  return () => scene.destroy();
}
