import { Scene, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const N = 20, SIZE = 2;
  const grid = { vertices: [], edges: [] };
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const k = grid.vertices.push({ x: (i / N - 0.5) * SIZE, y: 0, z: (j / N - 0.5) * SIZE }) - 1;
      if (i < N) grid.edges.push([k, k + N + 1]); // to the next column
      if (j < N) grid.edges.push([k, k + 1]);     // to the next row
    }
  }

  const scene = new Scene(canvas, {
    width: 800, height: 380, lineWidth: 1, color: "#7ae96e",
    camera: { y: 1.2, z: -2 },
  });
  scene.add({ mesh: grid });
  scene.use(new OrbitCamera());

  scene.start((dt, t) => {
    for (const v of grid.vertices) {
      const d = Math.hypot(v.x, v.z);
      v.y = Math.sin(d * 6 - t * 3) * 0.08 / (1 + d * 2);
    }
  });

  return () => scene.destroy();
}
