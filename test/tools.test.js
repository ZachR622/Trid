import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeShape, worldToScreen, applyTransformOp, pick, pickHit,
  TransformGizmo, ViewGizmo, OrbitCamera, ToolManager,
} from "../trid/index.js";

/** Just what the tools read from a Scene (nothing is rendered). */
function fakeScene(objects, camera = { x: 0, y: 0, z: -3 }) {
  const canvas = { width: 400, height: 400, clientWidth: 400, style: {}, addEventListener() {}, removeEventListener() {} };
  const scene = { canvas, camera, objects };
  scene.tools = new ToolManager(scene);
  return scene;
}
const obj = (z, x = 0, mesh = makeShape("cube", { size: 1 })) =>
  ({ mesh, pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
/** A canvas context that draws nothing */
const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
const ev = (x, y, button = 0) => ({ x, y, dx: 0, dy: 0, button, shiftKey: false, ctrlKey: false, altKey: false, original: {} });
const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// --- Picking -------------------------------------------------------------------

test("exact pick returns the nearest object under the pixel, and null on empty space", () => {
  const back = obj(2), front = obj(0);
  const scene = fakeScene([back, front]);
  assert.equal(pick(scene, 200, 200, { exact: true }), front);
  assert.equal(pickHit(scene, 200, 200, { objects: [back] }).object, back);
  assert.equal(pick(scene, 5, 5, { exact: true }), null);
  const hit = pickHit(scene, 200, 200);
  near(hit.depth, 2.5, 1e-9); // the front cube's near face is at z = -0.5, 2.5 from the camera
  assert.ok(hit.face >= 0);
});

test("exact pick sees through a ring's hole, where the box pick can't", () => {
  // A ring facing the camera, in front of a cube: clicking the middle of the hole hits the cube
  const ring = obj(-1, 0, makeShape("torus", { R: 0.5, tube: 0.1 }));
  ring.rot.x = Math.PI / 2;
  const cube = obj(1, 0, makeShape("cube", { size: 0.5 }));
  const scene = fakeScene([cube, ring]);
  const hole = worldToScreen({ x: 0, y: 0, z: -1 }, scene.camera, 400, 400);
  assert.equal(pick(scene, hole.x, hole.y), ring); // inside the ring's box, and the ring is nearer
  assert.equal(pick(scene, hole.x, hole.y, { exact: true }), cube);
  const onRing = worldToScreen({ x: 0.5, y: 0, z: -1 }, scene.camera, 400, 400);
  assert.equal(pick(scene, onRing.x, onRing.y, { exact: true }), ring);
});

test("exact pick on a wireframe (no faces) hits near its lines only", () => {
  const line = { mesh: { vertices: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], edges: [[0, 1]] },
    pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const scene = fakeScene([line]);
  const c = worldToScreen({ x: 0.3, y: 0, z: 0 }, scene.camera, 400, 400);
  assert.equal(pickHit(scene, c.x, c.y + 2).face, -1);
  assert.equal(pickHit(scene, c.x, c.y + 20), null);
});

// --- TransformGizmo ----------------------------------------------------------------

/** Grabs at (gx, gy), drags to (mx, my), releases; returns the dropped op. */
function dragGizmo(g, scene, gx, gy, mx, my) {
  let dropped = null;
  g.onDrop = (op) => (dropped = op);
  g.draw(ctx, scene);
  if (!g.pointerDown(ev(gx, gy), scene)) return null;
  g.pointerMove(ev(mx, my), scene);
  g.pointerUp();
  return dropped;
}

test("TransformGizmo moves along the grabbed arrow only, and ignores empty space", () => {
  const target = obj(0);
  const scene = fakeScene([target]);
  const g = new TransformGizmo({ targets: [target] });
  const c = worldToScreen({ x: 0, y: 0, z: 0 }, scene.camera, 400, 400);
  const op = dragGizmo(g, scene, c.x + 40, c.y, c.x + 90, c.y);
  assert.equal(op.mode, "move");
  assert.ok(target.pos.x > 0);
  near(target.pos.y, 0, 1e-9);
  near(target.pos.z, 0, 1e-9);
  assert.equal(g.pointerDown(ev(5, 5), scene), false);
});

for (const camera of [{ x: 0, y: 0, z: -3 }, { x: 0, y: 0, z: 3, yaw: Math.PI }]) {
  test(`TransformGizmo rotate: the grabbed point follows the mouse (camera at z=${camera.z})`, () => {
    const target = obj(0);
    const scene = fakeScene([target], camera);
    const g = new TransformGizmo({ mode: "rotate", targets: [target] });
    g.draw(ctx, scene);
    // The Z ring faces the camera: grab it up-right (-45° on screen), where no other ring passes
    const ring = g._handles.find((h) => h.id === 2).path;
    const c = worldToScreen({ x: 0, y: 0, z: 0 }, camera, 400, 400);
    const ang = (p) => Math.atan2(p.y - c.y, p.x - c.x);
    const grab = ring.reduce((a, b) => (Math.abs(ang(b) + Math.PI / 4) < Math.abs(ang(a) + Math.PI / 4) ? b : a));
    const r = Math.hypot(grab.x - c.x, grab.y - c.y);
    // Drag a quarter turn on screen: to down-right (+45°)
    const op = dragGizmo(g, scene, grab.x, grab.y, c.x + r * Math.SQRT1_2, c.y + r * Math.SQRT1_2);
    assert.equal(op.mode, "rotate");
    assert.deepEqual(op.axis, { x: 0, y: 0, z: 1 });
    // The world point (in the ring's plane) shown at -45° must end up shown at +45°
    const diag = { x: Math.cos(-Math.PI / 4), y: Math.sin(-Math.PI / 4) };
    const ex = worldToScreen({ x: 1, y: 0, z: 0 }, camera, 400, 400), ey = worldToScreen({ x: 0, y: 1, z: 0 }, camera, 400, 400);
    const sx = { x: ex.x - c.x, y: ex.y - c.y }, sy = { x: ey.x - c.x, y: ey.y - c.y };
    const det = sx.x * sy.y - sx.y * sy.x;
    const world = { x: (diag.x * sy.y - diag.y * sy.x) / det, y: (sx.x * diag.y - sx.y * diag.x) / det, z: 0 };
    const moved = applyTransformOp({ pos: world, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, op).pos;
    near(ang(worldToScreen(moved, camera, 400, 400)), Math.PI / 4, 0.05);
  });
}

test("TransformGizmo scales along an axis, and uniformly from the center square", () => {
  const target = obj(0);
  const scene = fakeScene([target]);
  const g = new TransformGizmo({ mode: "scale", targets: [target] });
  const c = worldToScreen({ x: 0, y: 0, z: 0 }, scene.camera, 400, 400);
  const axisOp = dragGizmo(g, scene, c.x + 60, c.y, c.x + 120, c.y);
  assert.equal(axisOp.mode, "scale");
  assert.deepEqual(axisOp.axis, { x: 1, y: 0, z: 0 });
  assert.ok(target.scale.x > 1.5);
  assert.equal(target.scale.y, 1);
  const uniform = dragGizmo(g, scene, c.x, c.y, c.x + 100, c.y);
  assert.equal(uniform.axis, null);
  near(uniform.factor, 2, 1e-9);
});

test("TransformGizmo only reports operations with apply: false, and hides with visible: false", () => {
  const target = obj(0);
  const scene = fakeScene([target]);
  const g = new TransformGizmo({ apply: false, targets: [target] });
  const c = worldToScreen({ x: 0, y: 0, z: 0 }, scene.camera, 400, 400);
  assert.equal(dragGizmo(g, scene, c.x + 40, c.y, c.x + 90, c.y).mode, "move");
  assert.equal(target.pos.x, 0);
  g.visible = false;
  assert.equal(dragGizmo(g, scene, c.x + 40, c.y, c.x + 90, c.y), null);
});

test("TransformGizmo only clears the cursor it set", () => {
  const target = obj(0);
  const scene = fakeScene([target]);
  const g = new TransformGizmo({ targets: [target] });
  g.draw(ctx, scene);
  scene.canvas.style.cursor = "grab"; // set by another tool
  g.pointerMove(ev(5, 5), scene);
  assert.equal(scene.canvas.style.cursor, "grab");
  const c = worldToScreen({ x: 0, y: 0, z: 0 }, scene.camera, 400, 400);
  g.pointerMove(ev(c.x + 40, c.y), scene);
  assert.equal(scene.canvas.style.cursor, "pointer");
  g.pointerMove(ev(5, 5), scene);
  assert.equal(scene.canvas.style.cursor, "");
});

// --- ViewGizmo -------------------------------------------------------------------

test("ViewGizmo finds the scene's OrbitCamera and turns it to a clicked axis", () => {
  const scene = fakeScene([]);
  const orbit = new OrbitCamera({ autoRotate: true, autoRotateDelay: 1 });
  scene.tools.add(orbit);
  const gizmo = new ViewGizmo({ corner: "top-left", size: 40, margin: 10 });
  scene.tools.add(gizmo);
  gizmo.draw(ctx, scene);
  // Default camera looks down +Z: the -Z end faces us at the gizmo's center; the +X end is to the right
  const center = { x: 10 + 40, y: 10 + 40 };
  assert.ok(gizmo.contains(center.x, center.y));
  assert.equal(gizmo.pointerDown(ev(center.x + 40 * 0.68, center.y)), true);
  for (let i = 0; i < 4; i++) scene.tools.update(0.1); // the turn takes 0.35 s
  // Looking from +X toward the target: forward is -X
  near(orbit.yaw, -Math.PI / 2, 1e-6);
  near(orbit.pitch, 0, 1e-6);
  near(scene.camera.x, orbit.distance, 1e-6);
  // Auto-rotate was held during the turn, and waits its delay (1 s) after it
  scene.tools.update(0.5);
  near(orbit.yaw, -Math.PI / 2, 1e-6);
  scene.tools.update(0.6);
  assert.ok(orbit.yaw > -Math.PI / 2);
});

test("ViewGizmo.lookAlong from above, and clicks off the axes fall through", () => {
  const scene = fakeScene([]);
  const orbit = new OrbitCamera();
  scene.tools.add(orbit);
  const gizmo = new ViewGizmo({ orbit, duration: 0 });
  scene.tools.add(gizmo);
  gizmo.lookAlong({ x: 0, y: 2, z: 0 });
  scene.tools.update(0.016);
  assert.ok(orbit.pitch < -1.5); // looking down
  gizmo.draw(ctx, scene);
  assert.equal(gizmo.pointerDown(ev(5, 395)), false);
  gizmo.visible = false;
  gizmo.draw(ctx, scene);
  assert.equal(gizmo.contains(400 - 14 - 42, 14 + 42), false);
});
