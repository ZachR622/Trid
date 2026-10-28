// The transform pipeline piece by piece: rotations, the camera, projection,
// near-plane clipping, matrices for points, directions and normals, and the
// helpers built on them.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotateX, rotateY, rotateZ, rotateXYZ, translate, scale, localToWorld,
  worldToCamera, cameraToScreen, worldToScreen, cameraForward, cameraRight, cameraUp, clipNear,
  identityMat4, mat4FromTransform, mulMat4, invertMat4, transformPoint, transformDirection, normalMatrix, transformNormal,
  forEachPlaced, worldPerPixel, screenBounds, makeShape, DEFAULT_FOV, DEFAULT_NEAR,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearV = (a, b, eps = 1e-9) => ["x", "y", "z"].forEach((k) => near(a[k] ?? 0, b[k] ?? 0, eps));
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const v = (x, y, z) => ({ x, y, z });

// A few fixed "random" numbers, so failures repeat
let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("rotateX / rotateY / rotateZ: quarter turns move the axes, and lengths stay the same", () => {
  const q = Math.PI / 2;
  nearV(rotateX(v(0, 1, 0), q), v(0, 0, 1));
  nearV(rotateY(v(1, 0, 0), q), v(0, 0, 1));
  nearV(rotateZ(v(1, 0, 0), q), v(0, 1, 0));
  for (let i = 0; i < 20; i++) {
    const p = v(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), a = rnd() * 7;
    for (const rot of [rotateX, rotateY, rotateZ]) {
      near(len(rot(p, a)), len(p));
      nearV(rot(rot(p, a), -a), p); // turning back undoes it
    }
  }
});

test("rotateXYZ turns X, then Y, then Z, like the object matrices", () => {
  for (let i = 0; i < 20; i++) {
    const p = v(rnd(), rnd(), rnd()), rot = v(rnd() * 6, rnd() * 6, rnd() * 6);
    nearV(rotateXYZ(p, rot), rotateZ(rotateY(rotateX(p, rot.x), rot.y), rot.z));
    nearV(rotateXYZ(p, rot), transformPoint(mat4FromTransform({ rot }), p));
  }
});

test("translate, scale and localToWorld: scale, then turn, then move (the same as transformPoint)", () => {
  nearV(translate(v(1, 2, 3), 1, -2, 0.5), v(2, 0, 3.5));
  nearV(scale(v(1, 2, 3), 2, -1, 0), v(2, -2, 0));
  for (let i = 0; i < 10; i++) {
    const inst = { pos: v(rnd(), rnd(), rnd()), rot: v(rnd() * 6, rnd() * 6, rnd() * 6), scale: v(rnd() + 0.5, rnd() + 0.5, rnd() + 0.5) };
    const p = v(rnd(), rnd(), rnd());
    nearV(localToWorld(p, inst), transformPoint(mat4FromTransform(inst), p));
  }
});

test("worldToCamera: the camera's position goes to the origin, and its forward / right / up to z / x / y", () => {
  nearV(worldToCamera(v(0, 0, 0), { z: -3 }), v(0, 0, 3)); // straight ahead, 3 away
  for (let i = 0; i < 20; i++) {
    const cam = { x: rnd() * 4 - 2, y: rnd() * 4 - 2, z: rnd() * 4 - 2, yaw: rnd() * 6 - 3, pitch: rnd() * 3 - 1.5 };
    const at = (d) => worldToCamera(v(cam.x + d.x, cam.y + d.y, cam.z + d.z), cam);
    nearV(worldToCamera(v(cam.x, cam.y, cam.z), cam), v(0, 0, 0));
    nearV(at(cameraForward(cam)), v(0, 0, 1));
    nearV(at(cameraRight(cam)), v(1, 0, 0));
    nearV(at(cameraUp(cam)), v(0, 1, 0));
    // Forward, right and up are unit length and at right angles
    const f = cameraForward(cam), r = cameraRight(cam), u = cameraUp(cam);
    for (const [a, b] of [[f, r], [r, u], [u, f]]) near(dot(a, b), 0);
    for (const x of [f, r, u]) near(len(x), 1);
  }
});

test("cameraToScreen: straight ahead is the middle; the edge of the view is the canvas edge; up is up", () => {
  const cam = { fov: 0.9 }, w = 400, h = 200;
  nearV(cameraToScreen(v(0, 0, 5), cam, w, h), v(200, 100));
  const t = Math.tan(cam.fov / 2);
  // fov is the vertical view: a point at the top edge of the view lands on the top edge
  near(cameraToScreen(v(0, 5 * t, 5), cam, w, h).y, 0);
  // across, the view is wider by the aspect ratio
  near(cameraToScreen(v(5 * t * (w / h), 0, 5), cam, w, h).x, w);
  assert.ok(cameraToScreen(v(0, 1, 5), cam, w, h).y < 100); // up in the world is up on screen
  assert.ok(cameraToScreen(v(1, 0, 5), cam, w, h).x > 200); // and right is right
  // Twice as far looks half as far from the middle
  near(cameraToScreen(v(1, 0, 10), cam, w, h).x - 200, (cameraToScreen(v(1, 0, 5), cam, w, h).x - 200) / 2);
  // Without fov: the default
  nearV(cameraToScreen(v(1, 1, 4), {}, w, h), cameraToScreen(v(1, 1, 4), { fov: DEFAULT_FOV }, w, h));
});

test("worldToScreen is worldToCamera then cameraToScreen", () => {
  const cam = { x: 1, y: 0.5, z: -4, yaw: 0.3, pitch: -0.2, fov: 0.8 };
  const p = v(0.2, -0.3, 1);
  nearV(worldToScreen(p, cam, 300, 200), cameraToScreen(worldToCamera(p, cam), cam, 300, 200));
});

test("clipNear keeps segments in front, cuts those crossing the near plane, drops those behind", () => {
  const a = v(0, 0, 2), b = v(2, 4, 0);
  assert.deepEqual(clipNear(a, v(1, 1, 3), 1), [a, v(1, 1, 3)]);
  assert.equal(clipNear(v(0, 0, -1), v(1, 1, 0.5), 1), null);
  const [p, q] = clipNear(a, b, 1);
  assert.equal(p, a); // the end in front is kept as it is, in order
  nearV(q, v(1, 2, 1)); // halfway: where z reaches 1
  const [r, s] = clipNear(b, a, 1);
  nearV(r, v(1, 2, 1));
  assert.equal(s, a);
  assert.ok(DEFAULT_NEAR > 0 && DEFAULT_NEAR < 0.1);
});

test("identityMat4 changes nothing; transformDirection turns and scales but doesn't move", () => {
  const p = v(1, -2, 3);
  nearV(transformPoint(identityMat4(), p), p);
  const m = mat4FromTransform({ pos: v(5, 6, 7), rot: v(0, Math.PI / 2, 0), scale: v(2, 2, 2) });
  nearV(transformDirection(m, v(1, 0, 0)), v(0, 0, 2));
  nearV(transformPoint(m, v(1, 0, 0)), v(5, 6, 9));
  // A direction is the difference of two points
  const a = v(rnd(), rnd(), rnd()), b = v(rnd(), rnd(), rnd());
  const d = transformDirection(m, v(b.x - a.x, b.y - a.y, b.z - a.z));
  const pa = transformPoint(m, a), pb = transformPoint(m, b);
  nearV(d, v(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z));
});

test("normalMatrix keeps normals perpendicular to stretched surfaces, and flips them when mirrored", () => {
  // A surface through the origin, normal (1, 1, 0); stretched 3× along x
  const m = mat4FromTransform({ scale: v(3, 1, 1) });
  const n = transformNormal(normalMatrix(m), v(Math.SQRT1_2, Math.SQRT1_2, 0));
  near(len(n), 1);
  const along = transformDirection(m, v(1, -1, 0)); // a direction lying in the surface, stretched
  near(dot(n, along), 0);
  // Mirrored on x: the normal follows the mirror
  nearV(transformNormal(normalMatrix(mat4FromTransform({ scale: v(-1, 1, 1) })), v(1, 0, 0)), v(-1, 0, 0));
  // Turned and moved only: the same as turning the direction
  for (let i = 0; i < 10; i++) {
    const t = mat4FromTransform({ pos: v(rnd(), rnd(), rnd()), rot: v(rnd() * 6, rnd() * 6, rnd() * 6) });
    const dir = v(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    const want = transformDirection(t, dir), l = len(want);
    nearV(transformNormal(normalMatrix(t), dir), v(want.x / l, want.y / l, want.z / l));
  }
  // invertMat4 undoes it
  const inv = mulMat4(m, invertMat4(m));
  identityMat4().forEach((x, i) => near(inv[i], x));
});

test("forEachPlaced: parents before children, transforms joined, hidden branches skipped", () => {
  const leaf = { pos: v(0, 1, 0) };
  const hiddenLeaf = { pos: v(9, 9, 9) };
  const root = { pos: v(1, 0, 0), scale: v(2, 2, 2), children: [leaf, { visible: false, children: [hiddenLeaf] }] };
  const seen = [];
  forEachPlaced([root], () => null, (obj, world, parent) => seen.push({ obj, world, parent }));
  assert.deepEqual(seen.map((s) => s.obj), [root, leaf]);
  assert.equal(seen[1].parent, root);
  nearV(transformPoint(seen[1].world, v(0, 0, 0)), v(1, 2, 0)); // 1 up, scaled by 2, moved by 1
  // A base matrix goes under the roots' own transforms
  const out = [];
  forEachPlaced([leaf], () => mat4FromTransform({ pos: v(0, 0, 5) }), (obj, world) => out.push(world));
  nearV(transformPoint(out[0], v(0, 0, 0)), v(0, 1, 5));
});

test("worldPerPixel: moving that much at that distance moves one pixel on screen", () => {
  const canvas = { width: 640, height: 360 };
  for (const fov of [0.6, 1.2, undefined]) {
    const scene = { camera: { fov }, canvas };
    for (const z of [1, 3.5, 20]) {
      const k = worldPerPixel(scene, z);
      const a = cameraToScreen(v(0, 0, z), scene.camera, canvas.width, canvas.height);
      const b = cameraToScreen(v(k, k, z), scene.camera, canvas.width, canvas.height);
      near(b.x - a.x, 1);
      near(a.y - b.y, 1);
    }
  }
});

test("screenBounds: the box around an object on screen; null when it's all behind the camera", () => {
  const scene = { camera: { z: -3 }, canvas: { width: 200, height: 200 }, objects: [] };
  const cube = { mesh: makeShape("cube", { size: 1 }), pos: v(0, 0, 0), rot: v(0, 0, 0), scale: v(1, 1, 1) };
  const box = screenBounds(scene, cube);
  near((box.minX + box.maxX) / 2, 100); // centered
  near((box.minY + box.maxY) / 2, 100);
  assert.ok(box.maxX - box.minX > 20 && box.maxX - box.minX < 200);
  // Moved right: the box moves right
  const moved = screenBounds(scene, { ...cube, pos: v(0.5, 0, 0) });
  assert.ok(moved.minX > box.minX);
  assert.equal(screenBounds(scene, { ...cube, pos: v(0, 0, -10) }), null);
});
