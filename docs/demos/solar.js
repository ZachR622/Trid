import { Scene, makeShape, WebGLRenderer, OrbitCamera, unlit, bloom } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, camera: { fov: 0.7 }, lineWidth: 1, background: "#0d0d10",
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
    // The sun is the light: a point light in the middle, and a little ambient
    lights: [
      { type: "ambient", intensity: 0.08 },
      { type: "point", position: { x: 0, y: 0, z: 0 }, color: "#fff1d0", intensity: 1.6, range: 4 },
    ],
    post: [bloom({ threshold: 0.8, strength: 0.9 })],
  });

  // Unlit, so it's fully bright and the bloom makes it glow
  const sun = scene.add({ mesh: makeShape("sphere", { r: 0.3, rings: 24, segments: 36 }), material: { fill: "#ffd166", effects: [unlit()] } });

  // Groups: the moon turns around the planet, the planet (with its moon) around the sun.
  // Only angles change each frame; every position follows from the tree.
  const planet = { mesh: makeShape("sphere", { r: 0.12, rings: 16, segments: 24 }), material: { fill: "#6ba8ff", smooth: true } };
  const moonOrbit = {
    rot: { x: 0.2, y: 0, z: 0 }, // tilted
    children: [{ mesh: makeShape("sphere", { r: 0.04, rings: 10, segments: 14 }), pos: { x: 0.25, y: 0, z: 0 }, material: { fill: "#cccccc", smooth: true } }],
  };
  const orbit = scene.add({
    children: [{ pos: { x: 1, y: 0, z: 0 }, children: [planet, moonOrbit] }],
  });

  // The planet's path, as one closed loop of lines
  const path = { vertices: [], edges: [[]] };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    path.edges[0].push(path.vertices.push({ x: Math.cos(a), y: 0, z: Math.sin(a) }) - 1);
  }
  scene.add({ mesh: path, color: "#333" });

  scene.use(new OrbitCamera({ pitch: -0.55, distance: 2.8 }));

  scene.start((dt) => {
    sun.rot.y += dt * 0.2;
    orbit.rot.y -= dt * 0.5;   // the planet and its moon go around the sun
    planet.rot.y += dt * 2;    // the planet spins (its moon doesn't follow that)
    moonOrbit.rot.y -= dt * 3; // the moon goes around the planet
  });

  return () => scene.destroy();
}
