import { Scene, loft, spline, OrbitCamera } from "./trid/index.js";

const circle = (r, n = 24) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

// A bottle along Y: a few round sections, smooth between them
const bottle = loft([
  { at: -0.4, outline: circle(0.16) }, { at: -0.1, outline: circle(0.18) }, { at: 0.12, outline: circle(0.17) },
  { at: 0.25, outline: circle(0.06) }, { at: 0.42, outline: circle(0.055) },
], { axis: "y", segments: 8 });

// A hull: a square stern, a round middle, a sharp bow (different point counts)
const hull = loft([
  { at: -0.4, outline: [{ x: -0.15, y: 0.1 }, { x: -0.15, y: -0.05 }, { x: 0.15, y: -0.05 }, { x: 0.15, y: 0.1 }] },
  { at: 0, outline: circle(0.2), scale: { x: 1, y: 0.7 } },
  { at: 0.4, outline: [{ x: 0, y: 0.08 }] },
], { segments: 8 });

// A horn along a curved path, from round to a flattened tip
const path = spline([{ x: 0, y: -0.35, z: 0 }, { x: 0.05, y: 0, z: 0.1 }, { x: 0.25, y: 0.25, z: 0 }, { x: 0.3, y: 0.4, z: -0.15 }], { count: 40 });
const horn = loft([
  { at: 0, outline: circle(0.12) }, { at: 0.6, outline: circle(0.07), scale: { x: 1.4, y: 0.7 } }, { at: 1, outline: [{ x: 0, y: 0 }] },
], { path });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2.2 } });
  scene.add({ mesh: bottle, pos: { x: -0.8, y: 0, z: 0 }, material: { fill: "#98c379", smooth: true } });
  scene.add({ mesh: hull, pos: { x: 0, y: 0, z: 0 }, material: { fill: "#5f8fd8", wireframe: true } });
  scene.add({ mesh: horn, pos: { x: 0.65, y: 0, z: 0 }, material: { fill: "#e5c07b", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
