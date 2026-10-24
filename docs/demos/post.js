import { Scene, makeShape, gridHelper, WebGLRenderer, OrbitCamera, unlit, bloom, vignette, grade, grain } from "./trid/index.js";

export default function (canvas) {
  const effects = { bloom: bloom({ threshold: 0.6 }), grade: grade({ saturation: 1.3, contrast: 1.1 }), vignette: vignette({ strength: 0.7 }), grain: grain() };
  const scene = new Scene(canvas, {
    width: 800, height: 360, background: "#0d0d12", camera: { y: 0.6, z: -2.4 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
    post: Object.values(effects),
  });

  scene.add(gridHelper({ size: 3, divisions: 30 }));
  // Glowing rings: unlit, so they're fully bright and the bloom picks them up
  const ring = makeShape("torus", { R: 0.3, tube: 0.03 });
  ["#ff5d8f", "#5dd6ff", "#ffd45d"].forEach((fill, i) => {
    scene.add({ mesh: ring, pos: { x: (i - 1) * 0.8, y: 0.35, z: 0 }, rot: { x: Math.PI / 2, y: 0, z: 0 }, material: { fill, effects: [unlit()] } });
  });
  scene.add({ mesh: makeShape("cube", { size: 0.3 }), pos: { x: 0, y: 0.15, z: 0.6 }, material: { fill: "#8a8fa0" } });

  // Click the canvas to turn the effects off and on, one by one
  const names = Object.keys(effects);
  let step = 0;
  canvas.addEventListener("click", () => {
    step = (step + 1) % (names.length + 1);
    names.forEach((n, i) => (effects[n].enabled = step === 0 || i >= step));
  });

  scene.use(new OrbitCamera({ pitch: -0.3, autoRotate: true, autoRotateSpeed: 0.3 }));
  scene.start();
  return () => scene.destroy();
}
