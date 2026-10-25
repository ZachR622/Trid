import { test } from "node:test";
import assert from "node:assert/strict";
import { sweep, spline } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Volume of a closed mesh: positive when its faces point outward (trid's clockwise). */
function volume(mesh) {
  let v = 0;
  const p = mesh.vertices;
  for (const f of mesh.faces) {
    const a = p[f[0]];
    for (let i = 1; i + 1 < f.length; i++) {
      const b = p[f[i]], c = p[f[i + 1]];
      v += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    }
  }
  return v / 6;
}

/** Every face index and texture index points somewhere. */
function wellFormed(mesh) {
  assert.equal(mesh.faces.length, mesh.faceUVs.length);
  mesh.faces.forEach((f, i) => {
    assert.ok(f.length >= 3);
    assert.equal(f.length, mesh.faceUVs[i].length);
    for (const v of f) assert.ok(v >= 0 && v < mesh.vertices.length);
    for (const u of mesh.faceUVs[i]) assert.ok(u >= 0 && u < mesh.uvs.length);
  });
  for (const v of mesh.vertices) assert.ok(Number.isFinite(v.x + v.y + v.z));
}

const line = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }];
const square = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];

test("sweep of a circle along a line is a closed, outward cylinder", () => {
  const m = sweep(line, { radius: 0.5, segments: 64 });
  wellFormed(m);
  near(volume(m), (64 / 2) * Math.sin((2 * Math.PI) / 64) * 0.25, 1e-9);
  // Same either way along the path, and with the profile walked either way
  near(volume(sweep([...line].reverse(), { radius: 0.5, segments: 64 })), volume(m));
  near(volume(sweep(line, { profile: [...square].reverse() })), 1);
});

test("the section's x goes to the side and y up, like extrude", () => {
  const m = sweep(line, { profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] });
  // Along +Z with Y up: the outline keeps its x and y
  assert.ok(m.vertices.some((v) => Math.abs(v.x - 2) < 1e-9 && Math.abs(v.y) < 1e-9));
  assert.ok(m.vertices.some((v) => Math.abs(v.y - 1) < 1e-9 && Math.abs(v.x) < 1e-9));
});

test("miter keeps the thickness at a sharp corner", () => {
  const L = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }];
  near(volume(sweep(L, { profile: square })), 2);
  assert.ok(volume(sweep(L, { profile: square, miter: false })) < 1.9);
});

test("an end of size 0 closes into a point", () => {
  const cone = sweep(line, { radius: (t) => 0.5 * (1 - t), segments: 16 });
  wellFormed(cone);
  const tip = cone.vertices.filter((v) => Math.abs(v.z - 1) < 1e-9);
  assert.equal(tip.length, 1);
  assert.ok(volume(cone) > 0);
  // A list of sizes spreads from start to end: [0.5, 0] is the same cone
  near(volume(sweep(line, { radius: [0.5, 0], segments: 16 })), volume(cone));
});

test("a closed loop has no seam, even on a twisted 3D path", () => {
  // A trefoil knot: the carried frame comes back turned, which must be spread out
  const knot = Array.from({ length: 120 }, (_, i) => {
    const t = (i / 120) * Math.PI * 2;
    return { x: Math.sin(t) + 2 * Math.sin(2 * t), y: Math.cos(t) - 2 * Math.cos(2 * t), z: -Math.sin(3 * t) };
  });
  const m = sweep(knot, { radius: 0.3, segments: 12, closed: true });
  wellFormed(m);
  // Lines along the path: the step across the seam is like every other step
  const step = (i) => dist(m.vertices[i * 12], m.vertices[((i + 1) % 120) * 12]);
  const steps = Array.from({ length: 120 }, (_, i) => step(i));
  const mean = steps.slice(0, 119).reduce((a, b) => a + b) / 119;
  assert.ok(steps[119] < mean * 1.6, `seam step ${steps[119]} vs ${mean}`);
  assert.ok(volume(m) > 0);
  // No caps on a loop
  assert.ok(m.faces.every((f) => f.length === 4));
});

test("up keeps the section upright", () => {
  // A flat road along a winding path in XZ: an open profile stays level
  const path = spline([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 1, y: 0, z: 3 }], { count: 30 });
  const road = sweep(path, { profile: [{ x: -0.3, y: 0 }, { x: 0.3, y: 0 }], profileClosed: false, up: { x: 0, y: 1, z: 0 } });
  wellFormed(road);
  for (const v of road.vertices) near(v.y, 0);
  assert.equal(road.faces.length, 29);
  // Without up, a 3D path tilts it
  const helix = Array.from({ length: 40 }, (_, i) => ({ x: Math.cos(i / 6), y: i / 20, z: Math.sin(i / 6) }));
  const tilted = sweep(helix, { profile: [{ x: -0.3, y: 0 }, { x: 0.3, y: 0 }], profileClosed: false });
  const upright = sweep(helix, { profile: [{ x: -0.3, y: 0 }, { x: 0.3, y: 0 }], profileClosed: false, up: { x: 0, y: 1, z: 0 } });
  const tilt = (m) => Math.max(...helix.map((p, i) => Math.abs(m.vertices[2 * i].y - m.vertices[2 * i + 1].y)));
  near(tilt(upright), 0);
  assert.ok(tilt(tilted) > 0.01);
});

test("twist turns the section along the path", () => {
  const m = sweep(line, { profile: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }], twist: Math.PI / 2, caps: false });
  // First point of the section: at the start along +x, at the end turned a quarter
  near(Math.abs(m.vertices[4].y), 1);
  near(m.vertices[4].x, 0);
});

test("uvs: u around the section, v along the path", () => {
  const m = sweep(line, { profile: square, caps: false });
  const vs = m.uvs.map((u) => u.v);
  near(Math.min(...vs), 0); near(Math.max(...vs), 1);
  const us = m.uvs.map((u) => u.u);
  assert.deepEqual([...new Set(us)].sort(), [0, 0.25, 0.5, 0.75, 1]);
});

test("bad input gives an empty mesh or skips bad points", () => {
  assert.deepEqual(sweep([]).faces, []);
  assert.deepEqual(sweep([{ x: 0, y: 0, z: 0 }]).faces, []);
  assert.deepEqual(sweep(line, { profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }).faces, []);
  const m = sweep([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 0.5 }, { x: 0, y: 0, z: 1 }], { segments: 8 });
  wellFormed(m);
  assert.equal(m.vertices.length, 16);
});
