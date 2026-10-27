import { Scene, makeShape, displaceMesh, noise3, rng, meshQuery, raycastScene, OrbitCamera } from "./trid/index.js";

const p = (x, y, z) => ({ x, y, z });

// A lumpy rock
const rock = displaceMesh(makeShape("sphere", { r: 0.28, rings: 32, segments: 48 }), (v) => {
  const k = 1 + 0.35 * noise3(v.x * 6, v.y * 6, v.z * 6);
  return p(v.x * k, v.y * k, v.z * k);
});

// Dots stuck on it: a ray from far away toward the middle lands exactly on the surface
const rockQuery = meshQuery(rock);
const random = rng(4);
const dots = [];
for (let i = 0; i < 60; i++) {
  const d = p(random() - 0.5, random() - 0.5, random() - 0.5);
  const hit = rockQuery.raycast(p(-d.x * 10, -d.y * 10, -d.z * 10), d, { side: "front" });
  if (hit) dots.push(hit.point);
}

// A ring, and the points of a grid that are inside it
const torus = makeShape("torus", { R: 0.22, tube: 0.09, segments: 32, tubeSegments: 12 });
const torusQuery = meshQuery(torus);
const inside = [];
for (let x = -0.33; x <= 0.33; x += 0.06) for (let y = -0.12; y <= 0.12; y += 0.06) for (let z = -0.33; z <= 0.33; z += 0.06) {
  if (torusQuery.contains(p(x, y, z))) inside.push(p(x, y, z));
}

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 340, lineWidth: 1, camera: { z: -2 } });
  const dot = makeShape("sphere", { r: 0.014, rings: 6, segments: 8 });

  const rockObj = scene.add({ mesh: rock, pos: p(-0.42, 0, 0), material: { fill: "#8a8f98", smooth: true } });
  for (const d of dots) scene.add({ mesh: dot, pos: p(d.x - 0.42, d.y, d.z), material: { fill: "#e5c07b" }, pickable: false });

  // A ray turning around the rock, found with raycastScene (world space)
  const ray = { vertices: [p(0, 0, 0), p(0, 0, 0)], edges: [[0, 1]] };
  scene.add({ mesh: ray, color: "#E9806E", pickable: false });
  const marker = scene.add({ mesh: makeShape("sphere", { r: 0.025, rings: 8, segments: 12 }), material: { fill: "#E9806E" }, pickable: false });

  const ring = scene.add({ pos: p(0.45, 0, 0), rot: p(0.5, 0, 0.2), children: [{ mesh: torus, color: "#5f8fd8" }] });
  for (const q of inside) ring.children.push({ mesh: dot, pos: q, material: { fill: "#98c379" } });

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.3, autoRotateDelay: 2 }));
  scene.start((dt, t) => {
    const from = p(-0.42 + Math.cos(t * 0.7) * 0.7, Math.sin(t * 0.45) * 0.35, Math.sin(t * 0.7) * 0.7);
    const to = rockObj.pos;
    const hit = raycastScene(scene, from, p(to.x - from.x, to.y - from.y, to.z - from.z), { filter: (o) => o === rockObj });
    ray.vertices[0] = from;
    ray.vertices[1] = hit ? hit.point : to;
    ray.dirty = true;
    marker.visible = !!hit;
    if (hit) marker.pos = hit.point;
  });

  return () => scene.destroy();
}
