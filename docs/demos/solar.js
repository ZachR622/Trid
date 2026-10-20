import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { OrbitCamera } from "./trid/tools/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, lineWidth: 1.5, background: "#0d0d10",
    camera: { y: 1.4, z: -1 },
  });

  const sun = scene.add({ mesh: makeShape("sphere", { r: 0.3 }), color: "#ffd166" });
  const planet = scene.add({ mesh: makeShape("sphere", { r: 0.12, rings: 8, segments: 12 }), color: "#6ba8ff" });
  const moon = scene.add({ mesh: makeShape("sphere", { r: 0.04, rings: 4, segments: 8 }), color: "#ccc" });

  // The planet's path, as one closed loop
  const path = { vertices: [], edges: [[]] };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    path.edges[0].push(path.vertices.push({ x: Math.cos(a), y: 0, z: Math.sin(a) }) - 1);
  }
  scene.add({ mesh: path, color: "#333", lineWidth: 1 });

  scene.use(new OrbitCamera());

  scene.start((dt, t) => {
    sun.rot.y += dt * 0.2;
    planet.rot.y += dt * 2;
    planet.pos.x = Math.cos(t * 0.5);
    planet.pos.z = Math.sin(t * 0.5);
    moon.pos.x = planet.pos.x + Math.cos(t * 3) * 0.25;
    moon.pos.y = Math.sin(t * 3) * 0.05;
    moon.pos.z = planet.pos.z + Math.sin(t * 3) * 0.25;
  });

  return () => scene.destroy();
}
