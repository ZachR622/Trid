import { Scene, makeShape, dropOnto, attachTo, alignObjects, distributeObjects, WebGLRenderer, OrbitCamera } from "./trid/index.js";

const box = (w, h, d, fill, pos = {}, rot = {}) => ({
  mesh: makeShape("box", { w, h, d }),
  pos: { x: 0, y: 0, z: 0, ...pos }, rot: { x: 0, y: 0, z: 0, ...rot },
  material: { fill },
});

const floor = box(2, 0.05, 1.2, "#3b4252", { y: -0.4 });
const wall = box(2, 1, 0.05, "#d8cbb8", { y: 0.075, z: 0.45 });

// A table built anywhere, then dropped onto the floor as one group
const legs = [-1, 1].flatMap((x) => [-1, 1].map((z) => box(0.04, 0.32, 0.04, "#8a5a3c", { x: x * 0.33, y: -0.18, z: z * 0.14 })));
const table = { pos: { x: -0.3, y: 0.6, z: 0.1 }, children: [box(0.76, 0.04, 0.34, "#a0704a"), ...legs] };
dropOnto(table, floor);

// Books of different sizes: spaced side by side, touching, then dropped onto the table
const colors = ["#E9806E", "#5f8fd8", "#e5c07b", "#98c379", "#c678dd", "#56b6c2"];
const books = colors.map((fill, i) => box(0.035 + (i % 3) * 0.012, 0.16 + ((i * 7) % 5) * 0.025, 0.12, fill, { x: -0.6 + i * 0.1, y: 0.8, z: 0.15 }));
distributeObjects(books, { axis: "x", gap: 0 });
for (const book of books) dropOnto(book, table);

// A ball on the table, and a box dropped onto its very top
const ball = { mesh: makeShape("sphere", { r: 0.07 }), pos: { x: -0.05, y: 0.8, z: 0.05 }, material: { fill: "#e06c75", smooth: true } };
dropOnto(ball, table);
const cube = box(0.05, 0.05, 0.05, "#e5c07b", { x: -0.05, y: 1, z: 0.05 }, { y: 0.6 });
dropOnto(cube, ball);

// Crates stacked on the floor: each dropped onto the floor and the crates already there
const crates = [];
for (const [x, z, s, turn] of [[0.5, 0.1, 0.24, 0.2], [0.53, 0.1, 0.19, -0.35], [0.49, 0.12, 0.13, 0.5], [0.8, 0.0, 0.16, 0.3]]) {
  const crate = box(s, s, s, "#b48a5a", { x, y: 1.2, z }, { y: turn });
  dropOnto(crate, [floor, ...crates]);
  crates.push(crate);
}

// Frames on the wall: snapped onto it facing out, spaced evenly, their tops level
const frames = [[0.3, 0.22], [0.18, 0.26], [0.24, 0.18]].map(([w, h], i) => box(w, h, 0.02, ["#5f8fd8", "#98c379", "#E9806E"][i], { x: -0.6 + i * 0.5, y: 0.3, z: 0 }));
for (const frame of frames) attachTo(frame, wall, { axis: "-z" }); // its back on the wall
alignObjects(frames, { axis: "y", to: "max", reference: 0.45 });
distributeObjects(frames, { axis: "x" });

export default function (canvas) {
  // Shadows show what rests on what
  const scene = new Scene(canvas, {
    width: 800, height: 360, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
    lights: [{ type: "ambient", intensity: 0.4 }, { type: "directional", direction: { x: -0.5, y: 1, z: -0.7 }, intensity: 0.7, shadows: true }],
  });
  for (const obj of [floor, wall, table, ...books, ball, cube, ...crates, ...frames]) scene.add(obj);
  scene.use(new OrbitCamera({ target: { x: 0, y: -0.05, z: 0.1 }, distance: 2.7, yaw: -0.25, pitch: -0.3 }));
  scene.start();
  return () => scene.destroy();
}
