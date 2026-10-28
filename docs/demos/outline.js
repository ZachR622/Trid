import { Scene, WebGLRenderer, OrbitCamera, toon, outline, worldObjects } from "./trid/index.js";
import { makeFox, makePlatform } from "./fox.js";

const p = (x, y, z) => ({ x, y, z });

export default function (canvas) {
  const webgl = WebGLRenderer.isSupported();
  const lines = outline({ color: "#2b1d16", width: 2.5 });
  const scene = new Scene(canvas, {
    width: 800, height: 400, background: "#f3e9d8", camera: { fov: 0.6 },
    renderer: webgl ? new WebGLRenderer() : undefined,
    post: [lines],
    lights: [
      { type: "ambient", intensity: 0.55 },
      { type: "directional", direction: p(-0.4, 0.8, 1), intensity: 0.6, color: "#fff4e6" },
      { type: "directional", direction: p(0.6, 0.6, -1), intensity: 0.45, color: "#ffe9d6" },
    ],
  });

  scene.add(makePlatform());
  scene.add(makeFox({ detail: webgl ? 1 : 0.5 }));

  // Toon shading: a few flat bands of light, like a cartoon
  for (const obj of worldObjects(scene)) {
    if (!obj.material) continue;
    const toonish = (m) => ({ ...m, effects: [toon({ steps: 3 })] });
    obj.material = Array.isArray(obj.material) ? obj.material.map(toonish) : toonish(obj.material);
  }

  // Click: inner lines too → outer lines only → no lines
  let step = 0;
  canvas.addEventListener("click", () => {
    step = (step + 1) % 3;
    lines.enabled = step < 2;
    lines.uniforms.uCreaseAngle = step === 0 ? 40 : 180;
  });

  scene.use(new OrbitCamera({ target: p(0, 0.33, 0), distance: 2.4, yaw: Math.PI + 0.5, pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.3 }));
  scene.start();
  return () => scene.destroy();
}
