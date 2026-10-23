import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Scene, makeShape, localToWorld, worldToScreen, rng,
  worldObjects, worldMatrix, worldPosition, ancestors,
  mat4FromTransform, mulMat4, invertMat4, transformPoint, determinantMat4,
  applyTransformOp, transformOpToLocal, matFromAxisAngle, mulVec,
  pickHit, pick, meshBounds, mergeMeshes, exportOBJ, parseOBJ, newell,
  DragObject, TransformGizmo, CanvasRenderer, ToolManager,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };
const v3 = (x, y, z) => ({ x, y, z });

/** A scene without a real canvas (nothing is rendered unless a test asks). */
function fakeScene(objects = []) {
  const canvas = { width: 400, height: 400, clientWidth: 400, style: {}, addEventListener() {}, removeEventListener() {} };
  const scene = { canvas, camera: { x: 0, y: 0, z: -4 }, objects: [] };
  scene.tools = new ToolManager(scene);
  scene.add = Scene.prototype.add;
  scene.remove = Scene.prototype.remove;
  for (const o of objects) scene.add(o);
  return scene;
}

function sword() {
  const blade = { mesh: makeShape("box", { w: 0.1, h: 0.8, d: 0.02 }), pos: v3(0, 0.45, 0), name: "blade" };
  const guard = { mesh: makeShape("box", { w: 0.3, h: 0.05, d: 0.06 }), name: "guard" };
  const grip = { mesh: makeShape("cylinder", { r: 0.02, h: 0.15, segments: 8 }), pos: v3(0, -0.1, 0), name: "grip" };
  const hilt = { name: "hilt", rot: v3(0, 0, 0.3), children: [guard, grip] };
  const root = { name: "sword", pos: v3(1, 0.5, 0), rot: v3(0.2, 0.8, 0), children: [blade, hilt] };
  return { root, blade, hilt, guard, grip };
}

// --- The tree -------------------------------------------------------------------

test("children are placed by their parents' transforms, exactly like nested localToWorld", () => {
  const { root, hilt, grip } = sword();
  const scene = fakeScene([root]);
  const list = worldObjects(scene);
  assert.deepEqual(list.map((o) => o.name), ["sword", "blade", "hilt", "guard", "grip"]);
  const p = v3(0.01, 0.07, -0.02);
  nearVec(transformPoint(grip.world, p), localToWorld(localToWorld(localToWorld(p, grip), hilt), root));
  assert.equal(grip.parent, hilt);
  assert.equal(hilt.parent, root);
  assert.equal(root.parent, null);
  assert.deepEqual(ancestors(grip).map((o) => o.name), ["grip", "hilt", "sword"]);
});

test("an unevenly scaled parent skews a rotated child, which pos / rot / scale couldn't do", () => {
  const child = { mesh: makeShape("cube"), rot: v3(0, 0, Math.PI / 4) };
  const group = { scale: v3(3, 1, 1), children: [child] };
  fakeScene([group]);
  const p = v3(0.25, 0.25, 0.25);
  nearVec(worldPosition(child), v3(0, 0, 0));
  nearVec(transformPoint(worldMatrix(child), p), localToWorld(localToWorld(p, child), group));
});

test("parent and world aren't enumerable: objects stay clean for JSON and spreads", () => {
  const { root } = sword();
  const scene = fakeScene([root]);
  worldObjects(scene);
  assert.ok(!Object.keys(root.children[0]).includes("parent"));
  assert.ok(!Object.keys(root.children[0]).includes("world"));
  assert.doesNotThrow(() => JSON.stringify(root)); // no parent ↔ child cycle
});

test("scene.add links the tree right away and fills transforms; children pushed later are found", () => {
  const { root, grip } = sword();
  fakeScene([root]);
  assert.equal(grip.parent.name, "hilt"); // before any frame
  assert.deepEqual(grip.scale, v3(1, 1, 1));
  const gem = { mesh: makeShape("sphere", { r: 0.02 }) };
  root.children.push(gem);
  const list = worldObjects(root.parent ? root : [root]);
  assert.ok(list.includes(gem));
  assert.equal(gem.parent, root);
});

test("visible: false hides an object and its subtree", () => {
  const { root, hilt } = sword();
  const scene = fakeScene([root]);
  hilt.visible = false;
  assert.deepEqual(worldObjects(scene).map((o) => o.name), ["sword", "blade"]);
});

test("scene.remove takes a child out of its group", () => {
  const { root, hilt, guard } = sword();
  const scene = fakeScene([root]);
  scene.remove(guard);
  assert.deepEqual(hilt.children.map((o) => o.name), ["grip"]);
  assert.equal(guard.parent, null);
  scene.remove(root);
  assert.equal(scene.objects.length, 0);
});

// --- Matrices ------------------------------------------------------------------------

test("matrix inverse and determinant", () => {
  const random = rng(3);
  for (let i = 0; i < 50; i++) {
    const t = { pos: v3(random(), random(), random()), rot: v3(random() * 6, random() * 6, random() * 6), scale: v3(random() + 0.2, -random() - 0.2, random() + 0.2) };
    const m = mat4FromTransform(t);
    const id = mulMat4(invertMat4(m), m);
    id.forEach((x, k) => near(x, k % 5 === 0 ? 1 : 0, 1e-9));
    near(determinantMat4(m), t.scale.x * t.scale.y * t.scale.z, 1e-9);
  }
});

test("transformOpToLocal: a world rotation applied to a child inside a turned, scaled group", () => {
  const child = { mesh: makeShape("cube"), pos: v3(0.5, 0, 0), rot: v3(0.1, 0.2, 0.3) };
  const group = { pos: v3(1, 2, 3), rot: v3(0.4, -0.7, 1.1), scale: v3(2, 2, 2), children: [child] };
  fakeScene([group]);
  const op = { mode: "rotate", axis: v3(0, 1, 0), angle: 0.9, center: v3(1, 0, 0) };
  const before = worldMatrix(child);
  Object.assign(child, applyTransformOp(child, transformOpToLocal(op, worldMatrix(group))));
  // Expected: every world point of the child turned by the op around its center
  const r = matFromAxisAngle(op.axis, op.angle);
  for (const p of [v3(0, 0, 0), v3(0.3, -0.2, 0.1)]) {
    const w = transformPoint(before, p);
    const turned = mulVec(r, v3(w.x - 1, w.y, w.z));
    nearVec(transformPoint(worldMatrix(child), p), v3(turned.x + 1, turned.y, turned.z), 1e-9);
  }
});

// --- Picking, bounds, merge, export ----------------------------------------------------

test("pickHit finds a part inside a moved group, with its path", () => {
  const { root, guard } = sword();
  root.pos = v3(0, 0, 0);
  root.rot = v3(0, 0, 0);
  root.children[1].rot = v3(0, 0, 0);
  const scene = fakeScene([root]);
  const c = worldToScreen(worldPosition(guard), scene.camera, 400, 400);
  const hit = pickHit(scene, c.x + 4, c.y);
  assert.equal(hit.object, guard);
  assert.deepEqual(hit.path.map((o) => o.name), ["guard", "hilt", "sword"]);
  // Move the whole sword: the guard is found at its new place, and the box picker finds it too
  root.pos.x = 1;
  const c2 = worldToScreen(worldPosition(guard), scene.camera, 400, 400);
  assert.equal(pickHit(scene, c2.x + 4, c2.y).object, guard);
  assert.equal(pickHit(scene, c.x - 40, c.y), null);
  assert.ok(pick(scene, c2.x, c2.y));
});

test("meshBounds, mergeMeshes and exportOBJ see groups where they're drawn", () => {
  const { root, blade, guard, grip } = sword();
  fakeScene([root]);
  const parts = [blade, guard, grip];
  const all = parts.flatMap((o) => o.mesh.vertices.map((v) => transformPoint(worldMatrix(o), v)));
  const b = meshBounds(root);
  near(b.min.x, Math.min(...all.map((p) => p.x)));
  near(b.max.y, Math.max(...all.map((p) => p.y)));

  // Merged by the group's own transform: the same points
  const merged = mergeMeshes([root]);
  assert.equal(merged.vertices.length, all.length);
  merged.vertices.forEach((p, i) => nearVec(p, all[i]));

  // Export: one object per part, at its world position (OBJ flips Z)
  const text = exportOBJ(root);
  assert.equal((text.match(/^o /gm) ?? []).length, 3);
  const back = parseOBJ(text);
  back.vertices.forEach((p, i) => nearVec(p, all[i], 1e-5));
});

test("mirrored objects: baked and exported faces still point outward", () => {
  const ball = { mesh: makeShape("sphere"), scale: v3(-1, 1, 1) };
  const group = { pos: v3(2, 0, 0), children: [ball] };
  fakeScene([group]);
  const outward = (mesh, center) => {
    const cube = makeShape("cube");
    const OUT = Math.sign(newell(cube.faces[0].map((i) => cube.vertices[i])).z) * -1;
    return mesh.faces.every((f) => {
      const pts = f.map((i) => mesh.vertices[i]);
      const n = newell(pts);
      if (Math.hypot(n.x, n.y, n.z) < 1e-12) return true;
      const c = pts.reduce((a, p) => v3(a.x + p.x / pts.length, a.y + p.y / pts.length, a.z + p.z / pts.length), v3(0, 0, 0));
      return OUT * (n.x * (c.x - center.x) + n.y * (c.y - center.y) + n.z * (c.z - center.z)) > 0;
    });
  };
  assert.ok(outward(mergeMeshes([group]), v3(2, 0, 0)));
  assert.ok(outward(parseOBJ(exportOBJ(group)), v3(2, 0, 0)));
});

// --- Tools ------------------------------------------------------------------------------

const ev = (x, y, dx = 0, dy = 0) => ({ x, y, dx, dy, button: 0, shiftKey: false, ctrlKey: false, altKey: false, original: {} });
const ctx = new Proxy({}, { get: () => () => {}, set: () => true });

test("DragObject moves a part inside a turned group so it follows the cursor", () => {
  const part = { mesh: makeShape("cube", { size: 0.4 }), pos: v3(0.5, 0, 0) };
  const group = { rot: v3(0, 0, Math.PI / 2), scale: v3(2, 2, 2), children: [part] };
  const scene = fakeScene([group]);
  const drag = new DragObject({ exact: true });
  const c = worldToScreen(worldPosition(part), scene.camera, 400, 400);
  assert.equal(drag.pointerDown(ev(c.x, c.y), scene), true);
  const before = worldPosition(part);
  drag.pointerMove(ev(c.x + 20, c.y, 20, 0), scene);
  const after = worldPosition(part);
  assert.ok(after.x > before.x + 0.05); // moved right on screen = +X in the world
  near(after.y, before.y, 1e-9);
  assert.equal(group.pos.x, 0); // the group didn't move

  // root: true moves the whole group instead
  const dragAll = new DragObject({ exact: true, root: true });
  const c2 = worldToScreen(worldPosition(part), scene.camera, 400, 400);
  dragAll.pointerDown(ev(c2.x, c2.y), scene);
  assert.equal(dragAll.dragging, group);
});

test("TransformGizmo moves a part inside a turned group along the world axis grabbed", () => {
  const part = { mesh: makeShape("cube", { size: 0.4 }), pos: v3(0.3, 0, 0) };
  const group = { rot: v3(0.5, 0.9, 0.2), scale: v3(1.5, 1.5, 1.5), children: [part] };
  const scene = fakeScene([group]);
  const g = new TransformGizmo({ targets: [part] });
  g.draw(ctx, scene);
  const c = worldToScreen(g.center(), scene.camera, 400, 400);
  const before = worldPosition(part);
  const xTip = g._handles.find((h) => h.id === 0).path[1];
  assert.equal(g.pointerDown(ev((c.x + xTip.x) / 2, (c.y + xTip.y) / 2), scene), true);
  g.pointerMove(ev(xTip.x + (xTip.x - c.x), xTip.y + (xTip.y - c.y)), scene);
  g.pointerUp();
  const after = worldPosition(part);
  assert.ok(after.x - before.x > 0.1);
  near(after.y, before.y, 1e-9);
  near(after.z, before.z, 1e-9);
});

test("TransformGizmo: a group and one of its parts selected together move once", () => {
  const part = { mesh: makeShape("cube", { size: 0.4 }) };
  const group = { children: [part] };
  const scene = fakeScene([group]);
  const g = new TransformGizmo({ targets: [group, part] });
  g.draw(ctx, scene);
  const c = worldToScreen(g.center(), scene.camera, 400, 400);
  g.pointerDown(ev(c.x + 40, c.y), scene);
  g.pointerMove(ev(c.x + 90, c.y), scene);
  g.pointerUp();
  assert.ok(group.pos.x > 0);
  assert.equal(part.pos.x, 0);
});

// --- Rendering ----------------------------------------------------------------------------

test("CanvasRenderer draws children (and skips groups without a mesh)", () => {
  let lines = 0;
  const drawCtx = new Proxy({ fillStyle: "#000000" }, {
    get: (t, k) => (k in t ? t[k] : k === "lineTo" ? () => lines++ : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const tri = { vertices: [v3(0, 0, 0), v3(0.5, 0, 0), v3(0, 0.5, 0)], faces: [[0, 2, 1]] };
  const scene = fakeScene([{ children: [{ mesh: tri }, { children: [{ mesh: tri, pos: v3(0.6, 0, 0) }] }] }]);
  Object.assign(scene, { ctx: drawCtx, color: "#fff", lineWidth: 1, background: "#000" });
  new CanvasRenderer().render(scene);
  assert.equal(lines, 6);
});
