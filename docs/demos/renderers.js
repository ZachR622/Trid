import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { CanvasRenderer } from "./trid/render/canvasRenderer.js";
import { WebGLRenderer } from "./trid/render/webglRenderer.js";
import { OrbitCamera } from "./trid/tools/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 360, camera: { z: -0.95 }, lineWidth: 2,
  });

  // Shapes that cut through each other: hard for sorting, easy for a depth buffer
  const bar = makeShape("box", { w: 1, h: 0.26, d: 0.26 });
  const a = scene.add({ mesh: bar, material: { fill: "#E9806E" } });
  const b = scene.add({ mesh: bar, rot: { x: 0, y: 0, z: Math.PI / 2 }, material: { fill: "#8ab4f8" } });
  scene.add({ mesh: makeShape("sphere", { r: 0.24 }), material: { fill: "#7ae96e" } });

  scene.use(new OrbitCamera({ pitch: -0.3, yaw: -0.4 }));

  // Switch renderers with a button. Nothing else in the scene changes.
  const canvas2d = scene.renderer;
  const webgl = WebGLRenderer.isSupported() ? new WebGLRenderer() : null;

  const bar2 = document.createElement("div");
  bar2.className = "trid-demo-bar";
  const label = document.createElement("span");
  const button = document.createElement("button");
  const show = () => {
    const gl = scene.renderer === webgl;
    label.textContent = gl ? "WebGL: exact, per pixel" : "Canvas 2D: sorted faces";
    button.textContent = gl ? "Use Canvas 2D" : "Use WebGL";
  };
  button.onclick = () => {
    scene.renderer = scene.renderer === webgl ? canvas2d : webgl;
    show();
  };
  button.disabled = !webgl;
  show();
  bar2.append(label, button);
  canvas.parentElement.append(bar2);

  scene.start((dt) => {
    a.rot.y += dt * 0.6;
    b.rot.x += dt * 0.4;
  });

  return () => {
    scene.destroy();
    webgl?.dispose();
    bar2.remove();
  };
}
