import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SculptTool, ToolManager, screenRay, worldToScreen, worldPerPixel, makeShape, displaceMesh, fbm3, cloneMesh,
  worldMatrix, transformPoint,
} from "../trid/index.js";

/** Just what the tools read from a Scene (nothing is rendered). */
function fakeScene(objects, camera = { x: 0, y: 0, z: -3 }) {
  const canvas = { width: 400, height: 400, clientWidth: 400, style: {}, addEventListener() {}, removeEventListener() {} };
  const scene = { canvas, camera, objects };
  scene.tools = new ToolManager(scene);
  return scene;
}
const ev = (x, y, more = {}) => ({ x, y, dx: 0, dy: 0, button: 0, shiftKey: false, ctrlKey: false, altKey: false, original: {}, ...more });
const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const ball = () => ({ mesh: makeShape("sphere", { r: 1, rings: 32, segments: 64 }), pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
/** The vertex nearest to a point. */
const nearest = (mesh, p) => mesh.vertices.reduce((b, v, i) => (Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) < Math.hypot(mesh.vertices[b].x - p.x, mesh.vertices[b].y - p.y, mesh.vertices[b].z - p.z) ? i : b), 0);
/** Drags from (x0, y0) to (x1, y1) in small moves. */
function drag(tool, scene, x0, y0, x1, y1, mods = {}, steps = 20) {
  const down = tool.pointerDown(ev(x0, y0, mods), scene);
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
    tool.pointerMove(ev(x, y, { ...mods, dx: x - px, dy: y - py }), scene);
    px = x; py = y;
  }
  if (down) tool.pointerUp(ev(x1, y1, mods), scene);
  return down;
}

test("screenRay is the exact inverse of drawing a point", () => {
  const scene = fakeScene([], { x: 0.3, y: -0.2, z: -2, yaw: 0.4, pitch: -0.3, fov: 0.7 });
  scene.canvas.width = 800; scene.canvas.height = 300;
  for (const [x, y] of [[0, 0], [400, 150], [799, 299], [123, 45]]) {
    const { origin, direction } = screenRay(scene, x, y);
    near(Math.hypot(direction.x, direction.y, direction.z), 1, 1e-12);
    for (const k of [0.5, 3, 10]) {
      const s = worldToScreen({ x: origin.x + direction.x * k, y: origin.y + direction.y * k, z: origin.z + direction.z * k }, scene.camera, 800, 300);
      near(s.x, x, 1e-6); near(s.y, y, 1e-6);
    }
  }
});

test("a drag on a mesh inflates the surface under the cursor, with stroke callbacks", () => {
  const b = ball();
  const scene = fakeScene([b]);
  const calls = [];
  const tool = new SculptTool({ radius: 60, onStrokeStart: (o) => calls.push(["start", o]), onStroke: () => calls.push(["stroke"]), onStrokeEnd: (o) => calls.push(["end", o]) });
  const front = nearest(b.mesh, { x: 0, y: 0, z: -1 });
  const back = nearest(b.mesh, { x: 0, y: 0, z: 1 });
  assert.equal(drag(tool, scene, 200, 200, 210, 200), true);
  assert.ok(b.mesh.vertices[front].z < -1.01, `${b.mesh.vertices[front].z}`);
  near(b.mesh.vertices[back].z, 1, 1e-12);
  assert.equal(calls[0][0], "start"); assert.equal(calls[0][1], b);
  assert.equal(calls.at(-1)[0], "end");
  assert.ok(calls.filter((c) => c[0] === "stroke").length >= 2);
  assert.equal(tool.sculpting, null);
});

test("Ctrl pushes in, Shift smooths; empty space is left to other tools", () => {
  const b = ball();
  const scene = fakeScene([b]);
  const tool = new SculptTool({ radius: 60 });
  const front = nearest(b.mesh, { x: 0, y: 0, z: -1 });
  drag(tool, scene, 200, 200, 205, 200, { ctrlKey: true });
  assert.ok(b.mesh.vertices[front].z > -0.99);
  // Shift: smooth a lumpy ball where the cursor is
  const lumpy = { ...ball(), mesh: displaceMesh(makeShape("sphere", { r: 1, rings: 32, segments: 64 }), (v) => {
    const k = 1 + 0.2 * (fbm3(v.x * 8, v.y * 8, v.z * 8) - 0.5);
    return { x: v.x * k, y: v.y * k, z: v.z * k };
  }) };
  // Lumps under the brush (60 pixels at the front of the ball: about 0.28 across)
  const rough = (m) => {
    let s = 0;
    for (const v of m.vertices) if (v.z < 0 && Math.abs(v.x) < 0.15 && Math.abs(v.y) < 0.15) s += (Math.hypot(v.x, v.y, v.z) - 1) ** 2;
    return s;
  };
  const before = rough(lumpy.mesh);
  const s2 = fakeScene([lumpy]);
  for (let i = 0; i < 5; i++) drag(tool, s2, 195, 200, 205, 200, { shiftKey: true });
  assert.ok(rough(lumpy.mesh) < before * 0.3, `${rough(lumpy.mesh)} vs ${before}`);
  // Off the mesh: not taken, nothing changes
  const copy = cloneMesh(b.mesh);
  assert.equal(drag(tool, scene, 5, 5, 50, 5), false);
  assert.deepEqual(b.mesh.vertices, copy.vertices);
});

test("dabs are spaced along the stroke; the radius is in pixels", () => {
  const b = ball();
  const scene = fakeScene([b]);
  let dabs = 0;
  const tool = new SculptTool({ radius: 20, spacing: 0.25, onStroke: () => dabs++ });
  drag(tool, scene, 170, 200, 230, 200, {}, 60);
  // 60 pixels at one dab per 5 pixels, plus the first
  assert.ok(dabs >= 12 && dabs <= 13, `${dabs}`);
  // Nothing moved farther than the radius from the stroke, in the world
  const wpp = worldPerPixel(scene, 2);
  const src = ball().mesh;
  b.mesh.vertices.forEach((v, i) => {
    const p = src.vertices[i];
    if (p.z > -0.5 || Math.abs(p.y) > 20 * wpp * 1.3 || Math.abs(p.x) > 30 * wpp + 20 * wpp * 1.3) {
      near(v.x, p.x, 1e-12); near(v.y, p.y, 1e-12); near(v.z, p.z, 1e-12);
    }
  });
});

test("grab pulls the caught area along with the cursor", () => {
  const b = ball();
  const scene = fakeScene([b]);
  const tool = new SculptTool({ brush: "grab", radius: 50 });
  const front = nearest(b.mesh, { x: 0, y: 0, z: -1 });
  const start = { ...b.mesh.vertices[front] };
  drag(tool, scene, 200, 200, 240, 180, {}, 20);
  // 40 pixels right and 20 up, at depth 2 (the front of the ball)
  const k = worldPerPixel(scene, 2);
  const v = b.mesh.vertices[front];
  near(v.x - start.x, 40 * k, 0.01);
  near(v.y - start.y, 20 * k, 0.01);
});

test("inside groups, turned and scaled: the stroke lands under the cursor", () => {
  const b = ball();
  b.scale = { x: 0.5, y: 0.5, z: 0.5 };
  b.rot = { x: 0, y: Math.PI / 2, z: 0 };
  const group = { pos: { x: 0.4, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, children: [b] };
  const scene = fakeScene([group]);
  const tool = new SculptTool({ radius: 30, strength: 1 });
  // The point of the ball facing the camera, in the world
  const facing = { x: 0.4, y: 0, z: -0.5 };
  const s = worldToScreen(facing, scene.camera, 400, 400);
  const before = b.mesh.vertices.map((v) => ({ ...v }));
  drag(tool, scene, s.x, s.y, s.x + 2, s.y);
  // The vertex that moved most is the one facing the camera
  let most = 0, idx = -1;
  b.mesh.vertices.forEach((v, i) => {
    const d = Math.hypot(v.x - before[i].x, v.y - before[i].y, v.z - before[i].z);
    if (d > most) { most = d; idx = i; }
  });
  const w = transformPoint(worldMatrix(b), before[idx]);
  near(w.x, facing.x, 0.05); near(w.y, facing.y, 0.05); near(w.z, facing.z, 0.05);
});

test("symmetry, filter, enabled, and the brush circle", () => {
  const b = ball();
  const scene = fakeScene([b]);
  const tool = new SculptTool({ radius: 25, symmetry: "x" });
  // A stroke on the right side: the left side grows the same
  const right = worldToScreen({ x: 0.5, y: 0, z: -0.87 }, scene.camera, 400, 400);
  const before = b.mesh.vertices.map((v) => Math.hypot(v.x, v.y, v.z));
  drag(tool, scene, right.x, right.y, right.x + 3, right.y);
  const grew = b.mesh.vertices.map((v, i) => Math.hypot(v.x, v.y, v.z) - before[i]);
  // The right side's most grown point (the left one grew exactly as much)
  let most = -1;
  grew.forEach((g, i) => { if (b.mesh.vertices[i].x > 0 && (most < 0 || g > grew[most])) most = i; });
  const p = b.mesh.vertices[most];
  assert.ok(grew[most] > 0.001);
  const twin = b.mesh.vertices.findIndex((v) => Math.abs(v.x + p.x) < 1e-3 && Math.abs(v.y - p.y) < 1e-3 && Math.abs(v.z - p.z) < 1e-3);
  assert.ok(twin >= 0, "the mirrored point");
  near(grew[twin], grew[most], 1e-9);

  const locked = { ...ball(), sculptable: false };
  assert.equal(new SculptTool().pointerDown(ev(200, 200), fakeScene([locked])), false);
  const off = new SculptTool();
  off.enabled = false;
  assert.equal(off.pointerDown(ev(200, 200), fakeScene([ball()])), false);

  // The circle: drawn over a mesh, not over empty space
  const arcs = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === "arc" ? (...a) => arcs.push(a) : () => {}), set: () => true });
  const t = new SculptTool({ radius: 30 });
  const s2 = fakeScene([ball()]);
  t.pointerMove(ev(200, 200), s2);
  t.draw(ctx, s2);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0][2], 30);
  t.pointerMove(ev(5, 5), s2);
  t.draw(ctx, s2);
  assert.equal(arcs.length, 1);
});

test("one dab moves the surface a small, set amount: strength × 0.08 radius for inflate", () => {
  for (const [brush, mods] of [["inflate", {}], ["crease", {}], ["noise", {}], ["inflate", { ctrlKey: true }]]) {
    const b = ball();
    const scene = fakeScene([b]);
    const before = b.mesh.vertices.map((v) => ({ ...v }));
    const tool = new SculptTool({ brush, radius: 40, strength: 1 });
    assert.equal(tool.pointerDown(ev(200, 200, mods), scene), true);
    tool.pointerUp(ev(200, 200), scene);
    let most = 0;
    b.mesh.vertices.forEach((v, i) => { most = Math.max(most, Math.hypot(v.x - before[i].x, v.y - before[i].y, v.z - before[i].z)); });
    // 40 pixels at the front of the ball (2 from the camera), in the mesh's units
    const radius = 40 * worldPerPixel(scene, 2);
    assert.ok(most <= 0.08 * radius * 1.01, `${brush}: ${most} > ${0.08 * radius}`);
    assert.ok(most > 0.01 * radius, `${brush}: ${most} barely moved`);
  }
});
