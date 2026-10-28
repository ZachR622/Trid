import { Scene, makeShape, subtractMesh, unionMesh, intersectMesh, WebGLRenderer, OrbitCamera } from "./trid/index.js";

const p = (x, y, z) => ({ x, y, z });

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { fov: 0.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  // A box, and a ball poking out of one corner. As objects with materials, the
  // results know their colors: the box's faces orange, the ball's blue
  const box = { mesh: makeShape("cube", { size: 0.5 }), material: { fill: "#e07a5f" } };
  const ball = { mesh: makeShape("sphere", { r: 0.32 }), pos: p(0.2, 0.2, -0.2), material: { fill: "#5f9be8", smooth: true } };

  const results = [subtractMesh(box, ball), unionMesh(box, ball), intersectMesh(box, ball)];
  const shapes = results.map((mesh, i) => scene.add({ mesh, material: mesh.materials, pos: p((i - 1) * 1.1, 0, 0) }));

  scene.use(new OrbitCamera({ target: p(0, 0, 0), distance: 3.3, yaw: 0.5, pitch: -0.45 }));
  scene.start((dt) => {
    for (const s of shapes) s.rot.y += dt * 0.4;
  });
  return () => scene.destroy();
}
