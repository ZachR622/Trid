import { Scene, makeShape, displaceMesh, fbm3, sculptMesh, WebGLRenderer, OrbitCamera } from "./trid/index.js";

// Dense balls to sculpt (a brush only moves vertices, so it needs many), facing the camera at -z
const R = 0.1;
const ball = () => makeShape("sphere", { r: R, rings: 48, segments: 96 });
const front = { x: 0, y: 0, z: -R };

const brushes = [
  // A bump, pushed out along the surface
  ["inflate", sculptMesh(ball(), "inflate", { center: front, radius: 0.06, strength: 0.03 })],
  // A snout, pulled forward and up
  ["grab", sculptMesh(ball(), "grab", { center: front, radius: 0.07, delta: { y: 0.02, z: -0.06 } })],
  // A lumpy ball, smoothed on the front only
  ["smooth", sculptMesh(
    displaceMesh(ball(), (v) => {
      const k = 1 + 0.3 * (fbm3(v.x * 25, v.y * 25, v.z * 25, { octaves: 3 }) - 0.5);
      return { x: v.x * k, y: v.y * k, z: v.z * k };
    }),
    "smooth", { center: front, radius: 0.1, strength: 1, iterations: 40 },
  )],
  // A flat face
  ["flatten", sculptMesh(ball(), "flatten", { center: front, radius: 0.08, strength: 1, falloff: "constant" })],
  // A ridge raised down the front, then pinched into a sharp fin
  ["pinch", (() => {
    const fin = [{ x: 0, y: 0.06, z: -0.08 }, { x: 0, y: 0, z: -0.1 }, { x: 0, y: -0.06, z: -0.08 }];
    const m = sculptMesh(ball(), "inflate", { along: fin, radius: 0.03, strength: 0.015 });
    return sculptMesh(m, "pinch", { along: fin.map((p) => ({ ...p, z: p.z - 0.015 })), radius: 0.035, strength: 1 });
  })()],
  // A smile: a groove along a curve
  ["crease", sculptMesh(ball(), "crease", {
    along: [{ x: -0.05, y: 0, z: -0.087 }, { x: -0.025, y: -0.025, z: -0.093 }, { x: 0, y: -0.032, z: -0.095 }, { x: 0.025, y: -0.025, z: -0.093 }, { x: 0.05, y: 0, z: -0.087 }],
    radius: 0.015, strength: 0.008,
  })],
  // Rough skin on the front
  ["noise", sculptMesh(ball(), "noise", { center: front, radius: 0.08, strength: 0.012, scale: 6 })],
];

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 240, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  const colors = ["#E9806E", "#e5c07b", "#a0a8b8", "#98c379", "#5f8fd8", "#c678dd", "#56b6c2"];
  // Each ball turned a bit, so its sculpted front is seen from the side
  brushes.forEach(([, mesh], i) => {
    scene.add({ mesh, pos: { x: (i - 3) * 0.27, y: 0, z: 0 }, rot: { x: 0, y: -0.7, z: 0 }, material: { fill: colors[i], smooth: true } });
  });
  scene.use(new OrbitCamera({ target: { x: 0, y: 0, z: 0 }, distance: 1.05, pitch: -0.15 }));
  scene.start();
  return () => scene.destroy();
}
