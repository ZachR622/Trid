import {
  Scene, makeShape, gridHelper, OrbitCamera, DragObject, HoverHighlight, FpsMeter,
} from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 360, camera: { fov: 0.6 }, lineWidth: 2, color: "#ffffff" });

  for (let i = 0; i < 5; i++) {
    scene.add({
      mesh: i % 2 ? makeShape("cube", { size: 0.35, radius: 0.04, segments: 2 }) : makeShape("sphere", { r: 0.2 }),
      pos: { x: (i - 2) * 0.55, y: 0.2, z: 0 },
      material: { fill: `hsl(${i * 60 + 10}, 75%, 65%)`, smooth: true },
    });
  }

  // A floor grid: helpers like it are never picked, dragged or highlighted
  scene.add(gridHelper({ size: 4, divisions: 20 }));

  scene.use(new OrbitCamera({ pitch: -0.35, distance: 2.6 }));
  scene.use(new HoverHighlight({ exact: true })); // exact: by triangles, not bounding boxes
  // Outline a shape while it's held
  scene.use(new DragObject({
    exact: true,
    onPick: (obj) => (obj.material.wireframe = true),
    onDrop: (obj) => (obj.material.wireframe = false),
  }));
  scene.use(new FpsMeter({ color: "#888", corner: "top-right" }));
  scene.start();

  return () => scene.destroy();
}
