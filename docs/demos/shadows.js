import { Scene, makeShape, WebGLRenderer, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const sun = { type: "directional", direction: { x: -0.6, y: 1, z: -0.4 }, intensity: 0.75, shadows: true };
  const scene = new Scene(canvas, {
    width: 800, height: 380, background: "#cfe6f5", camera: { fov: 0.7 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
    lights: [{ type: "ambient", intensity: 0.35 }, sun],
  });

  // A floor that only receives shadows, and a cube on it
  scene.add({ mesh: makeShape("plane", { size: 4, div: 8 }), material: { fill: "#ece6da" }, castShadow: false });
  scene.add({ mesh: makeShape("cube", { size: 0.6 }), pos: { x: 0, y: 0.3, z: 0 }, material: { fill: "#e07a5f" } });

  scene.use(new OrbitCamera({ target: { x: 0, y: 0.3, z: 0 }, distance: 3, pitch: -0.5 }));
  scene.start((dt, time) => {
    // The sun circles slowly, so the shadow turns
    sun.direction.x = Math.cos(time * 0.4) * 0.8;
    sun.direction.z = Math.sin(time * 0.4) * 0.8;
  });
  return () => scene.destroy();
}
