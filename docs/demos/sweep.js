import { Scene, sweep, spline, OrbitCamera } from "./trid/index.js";

// A tail: a smooth path from 5 points, thick at the base, a point at the tip
const tail = sweep(spline([
  { x: 0, y: -0.35, z: 0 }, { x: 0.1, y: -0.1, z: 0.1 }, { x: -0.05, y: 0.1, z: 0 },
  { x: 0.1, y: 0.3, z: -0.1 }, { x: 0.2, y: 0.35, z: 0 },
], { count: 40 }), { radius: (t) => 0.09 * (1 - t) ** 0.7, segments: 12 });

// A star section twisted along a closed trefoil knot
const star = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.03 : 0.07;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});
const knotPath = Array.from({ length: 150 }, (_, i) => {
  const t = (i / 150) * Math.PI * 2;
  return { x: 0.1 * (Math.sin(t) + 2 * Math.sin(2 * t)), y: 0.1 * (Math.cos(t) - 2 * Math.cos(2 * t)), z: -0.1 * Math.sin(3 * t) };
});
const knot = sweep(knotPath, { profile: star, closed: true, twist: Math.PI * 4 });

// A road: an open, flat profile kept level along a winding path
const road = sweep(spline([
  { x: -0.3, y: -0.2, z: -0.3 }, { x: 0.2, y: -0.1, z: -0.1 }, { x: -0.2, y: 0, z: 0.1 }, { x: 0.3, y: 0.1, z: 0.3 },
], { count: 50 }), {
  profile: [{ x: 0.08, y: 0 }, { x: -0.08, y: 0 }], profileClosed: false, up: { x: 0, y: 1, z: 0 },
});

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2.2, fov: 0.6 } });
  scene.add({ mesh: tail, pos: { x: -0.8, y: 0, z: 0 }, material: { fill: "#e5c07b", smooth: true } });
  scene.add({ mesh: knot, pos: { x: 0, y: 0, z: 0 }, material: { fill: "#5f8fd8", wireframe: true } });
  scene.add({ mesh: road, pos: { x: 0.8, y: 0, z: 0 }, material: { fill: "#98c379", wireframe: true, doubleSided: true } }); // a flat strip: both sides show

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
