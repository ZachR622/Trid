import { Scene, makeShape, extrude, OrbitCamera, TransformGizmo, pickHit } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, lineWidth: 1, camera: { y: 0.5, z: -2, fov: 0.7 },
  });
  const mat = (fill) => ({ fill, smooth: true });

  // A sword made of parts, in two levels of groups
  const blade = {
    name: "blade",
    mesh: extrude([{ x: -0.04, y: 0 }, { x: 0.04, y: 0 }, { x: 0.04, y: 0.7 }, { x: 0, y: 0.8 }, { x: -0.04, y: 0.7 }], 0.02),
    material: mat("#d8dce6"),
  };
  const hilt = {
    name: "hilt",
    children: [
      { name: "guard", mesh: makeShape("box", { w: 0.3, h: 0.04, d: 0.06 }), material: mat("#c9a227") },
      { name: "grip", mesh: makeShape("cylinder", { r: 0.02, h: 0.18, segments: 12 }), pos: { x: 0, y: -0.1, z: 0 }, material: mat("#6b4a2e") },
      { name: "pommel", mesh: makeShape("sphere", { r: 0.035, rings: 8, segments: 12 }), pos: { x: 0, y: -0.21, z: 0 }, material: mat("#c9a227") },
    ],
  };
  const sword = scene.add({ name: "sword", pos: { x: 0, y: -0.2, z: 0 }, children: [blade, hilt] });

  scene.use(new OrbitCamera({ pitch: -0.2 }));
  const gizmo = scene.use(new TransformGizmo({ mode: "rotate", targets: [sword] }));

  // Click a part: the first click selects the whole sword, the next one a level deeper
  let down = null;
  const at = (e) => ({ x: (e.offsetX * canvas.width) / canvas.clientWidth, y: (e.offsetY * canvas.height) / canvas.clientHeight });
  canvas.addEventListener("pointerdown", (e) => (down = at(e)));
  canvas.addEventListener("pointerup", (e) => {
    const p = at(e);
    if (!down || gizmo.dragging || Math.hypot(p.x - down.x, p.y - down.y) > 4) return;
    const hit = pickHit(scene, p.x, p.y);
    if (!hit) return void (gizmo.targets = []);
    const levels = [...hit.path].reverse(); // [sword, hilt, guard]
    const now = levels.indexOf(gizmo.targets[0]);
    gizmo.targets = [levels[Math.min(now + 1, levels.length - 1)]];
  });

  // Turning the group turns every part with it
  scene.start((dt) => {
    if (!gizmo.dragging && gizmo.targets[0] === sword) sword.rot.y += dt * 0.3;
  });

  return () => scene.destroy();
}
