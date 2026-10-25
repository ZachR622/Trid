import { Scene, makeShape, mergeMeshes, subdivideMesh, OrbitCamera } from "./trid/index.js";

// A rough cage: a body box and a head box (a little character, box modeling style)
const cage = mergeMeshes([
  makeShape("box", { w: 0.36, h: 0.3, d: 0.26 }),
  { mesh: makeShape("cube", { size: 0.2 }), pos: { x: 0, y: 0.25, z: 0 } },
  { mesh: makeShape("box", { w: 0.08, h: 0.2, d: 0.08 }), pos: { x: -0.11, y: -0.22, z: 0 } },
  { mesh: makeShape("box", { w: 0.08, h: 0.2, d: 0.08 }), pos: { x: 0.11, y: -0.22, z: 0 } },
]);

const smooth = subdivideMesh(cage, { levels: 2 });
// The same, with every edge sharper than 60° kept hard
const creased = subdivideMesh(makeShape("box", { w: 0.4, h: 0.3, d: 0.3 }), { levels: 3, creaseAngle: 60 });
const soft = subdivideMesh(makeShape("box", { w: 0.4, h: 0.3, d: 0.3 }), { levels: 3 });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2 } });
  scene.add({ mesh: cage, pos: { x: -0.8, y: 0, z: 0 }, material: { fill: "#8a8f98", wireframe: true } });
  scene.add({ mesh: smooth, pos: { x: -0.25, y: 0, z: 0 }, material: { fill: "#e5c07b", smooth: true } });
  scene.add({ mesh: soft, pos: { x: 0.3, y: 0, z: 0 }, material: { fill: "#5f8fd8", smooth: true } });
  scene.add({ mesh: creased, pos: { x: 0.8, y: 0, z: 0 }, material: { fill: "#98c379", smooth: true } });

  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
