import { Scene, makeShape, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, lineWidth: 1.5, background: "#0d0d10",
    camera: { y: 1.4, z: -1 },
  });

  const sun = scene.add({ mesh: makeShape("sphere", { r: 0.3 }), color: "#ffd166" });

  // Groups: the moon turns around the planet, the planet (with its moon) around the sun.
  // Only angles change each frame; every position follows from the tree.
  const planet = { mesh: makeShape("sphere", { r: 0.12, rings: 8, segments: 12 }), color: "#6ba8ff" };
  const moonOrbit = {
    rot: { x: 0.2, y: 0, z: 0 }, // tilted
    children: [{ mesh: makeShape("sphere", { r: 0.04, rings: 4, segments: 8 }), color: "#ccc", pos: { x: 0.25, y: 0, z: 0 } }],
  };
  const orbit = scene.add({
    children: [{ pos: { x: 1, y: 0, z: 0 }, children: [planet, moonOrbit] }],
  });

  // The planet's path, as one closed loop
  const path = { vertices: [], edges: [[]] };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    path.edges[0].push(path.vertices.push({ x: Math.cos(a), y: 0, z: Math.sin(a) }) - 1);
  }
  scene.add({ mesh: path, color: "#333", lineWidth: 1 });

  scene.use(new OrbitCamera());

  scene.start((dt) => {
    sun.rot.y += dt * 0.2;
    orbit.rot.y -= dt * 0.5;   // the planet and its moon go around the sun
    planet.rot.y += dt * 2;    // the planet spins (its moon doesn't follow that)
    moonOrbit.rot.y -= dt * 3; // the moon goes around the planet
  });

  return () => scene.destroy();
}
