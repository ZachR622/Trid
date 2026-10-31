import { Scene, makeShape, transformMesh, remeshMesh, sculptMesh, WebGLRenderer, OrbitCamera } from "./trid/index.js";

// A little creature from overlapping parts: a body, a head, four legs and two ears
const part = (shape, opts, place) => transformMesh(makeShape(shape, opts), place);
const parts = () => [
  part("sphere", { r: 0.16 }, { scale: { x: 1.3, y: 0.9, z: 1 } }),
  part("sphere", { r: 0.1 }, { pos: { x: 0, y: 0.13, z: -0.17 } }),
  ...[-1, 1].flatMap((x) => [-1, 1].map((z) => part("cylinder", { r: 0.035, h: 0.16 }, { pos: { x: x * 0.11, y: -0.15, z: z * 0.08 } }))),
  ...[-1, 1].map((x) => part("cone", { r: 0.035, h: 0.09 }, { pos: { x: x * 0.055, y: 0.24, z: -0.17 }, rot: { x: 0, y: 0, z: -x * 0.4 } })),
];

// One surface with small, even faces, where the parts were (without its smooth normals, so the faces show)
const clay = remeshMesh(parts(), { resolution: 40, normals: false });

// Now it can be sculpted anywhere: softened joins, round cheeks, a smile, a snout
const sculpted = remeshMesh(parts(), { resolution: 72 });
sculptMesh(sculpted, "smooth", { center: { x: 0, y: 0.04, z: -0.12 }, radius: 0.12, strength: 1, iterations: 10 });
for (const z of [-0.08, 0.08]) sculptMesh(sculpted, "smooth", { center: { x: 0.11, y: -0.08, z }, radius: 0.06, strength: 1, iterations: 6, symmetry: "x" });
sculptMesh(sculpted, "inflate", { center: { x: 0.06, y: 0.1, z: -0.24 }, radius: 0.06, strength: 0.025, symmetry: "x" });
sculptMesh(sculpted, "grab", { center: { x: 0, y: 0.1, z: -0.27 }, radius: 0.06, delta: { y: -0.01, z: -0.06 } });
sculptMesh(sculpted, "crease", {
  along: [{ x: -0.05, y: 0.085, z: -0.28 }, { x: 0, y: 0.065, z: -0.32 }, { x: 0.05, y: 0.085, z: -0.28 }],
  radius: 0.018, strength: 0.012,
});

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 300, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  const turn = { x: 0, y: -0.6, z: 0 }; // three-quarter view, face toward the camera
  // The parts as they are, each its own color
  const colors = ["#E9806E", "#E9806E", "#e5c07b", "#e5c07b", "#e5c07b", "#e5c07b", "#c678dd", "#c678dd"];
  parts().forEach((mesh, i) => scene.add({ mesh, pos: { x: -0.6, y: 0, z: 0 }, rot: turn, material: { fill: colors[i] } }));
  // Remeshed: one surface, its small faces showing with flat shading
  scene.add({ mesh: clay, pos: { x: 0, y: 0, z: 0 }, rot: turn, material: { fill: "#a0a8b8" } });
  scene.add({ mesh: sculpted, pos: { x: 0.6, y: 0, z: 0 }, rot: turn, material: { fill: "#E9806E", smooth: true } });
  scene.use(new OrbitCamera({ target: { x: 0, y: 0, z: 0 }, distance: 1.6, pitch: -0.2 }));
  scene.start();
  return () => scene.destroy();
}
