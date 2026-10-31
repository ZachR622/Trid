import { test } from "node:test";
import assert from "node:assert/strict";
import { sculptMesh, SCULPT_BRUSHES, makeShape, cloneMesh, mergeMeshes, transformMesh, meshBounds } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A flat square on y = 0 facing up, 1 wide, 40 × 40 cells. */
const sheet = () => makeShape("plane", { size: 1, div: 40 });
const at = (m, x, z) => m.vertices.findIndex((v) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.z - z) < 1e-9);
const O = { x: 0, y: 0, z: 0 };

/** The largest distance (in y) from points to the best plane y = a x + b z + c through them (least squares). */
function planeMiss(pts) {
  // Normal equations for [a, b, c]
  let sxx = 0, sxz = 0, sx = 0, szz = 0, sz = 0, n = 0, sxy = 0, szy = 0, sy = 0;
  for (const p of pts) {
    sxx += p.x * p.x; sxz += p.x * p.z; sx += p.x; szz += p.z * p.z; sz += p.z; n++;
    sxy += p.x * p.y; szy += p.z * p.y; sy += p.y;
  }
  const A = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, n]], B = [sxy, szy, sy];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  const col = (k) => det(A.map((row, r) => row.map((v, c) => (c === k ? B[r] : v))));
  const [a, b, c] = [col(0) / D, col(1) / D, col(2) / D];
  return Math.max(...pts.map((p) => Math.abs(p.y - (a * p.x + b * p.z + c))));
}

/** True when every vertex has a mirror image across x = 0. */
function symmetricInX(m, eps = 1e-9) {
  return m.vertices.every((v) => m.vertices.some((w) => Math.abs(w.x + v.x) < eps && Math.abs(w.y - v.y) < eps && Math.abs(w.z - v.z) < eps));
}

test("inflate pushes out along the surface, fading with the falloff", () => {
  const m = sculptMesh(sheet(), "inflate", { center: O, radius: 0.5, strength: 0.1 });
  near(m.vertices[at(m, 0, 0)].y, 0.1);
  near(m.vertices[at(m, 0.25, 0)].y, 0.1 * (1 - 0.25) ** 2); // smooth: (1 - t²)², t = 0.5
  near(m.vertices[at(m, 0.5, 0)].y, 0);
  assert.equal(m.dirty, true);
  // Only up: x and z don't move on a flat sheet
  near(m.vertices[at(m, 0.25, 0)].x, 0.25);
  // Negative dents; other falloffs
  near(sculptMesh(sheet(), "inflate", { center: O, radius: 0.5, strength: -0.1 }).vertices[at(m, 0, 0)].y, -0.1);
  const f = (name) => sculptMesh(sheet(), "inflate", { center: O, radius: 0.5, strength: 1, falloff: name }).vertices[at(m, 0.25, 0)].y;
  near(f("linear"), 0.5);
  near(f("sharp"), 0.25);
  near(f("constant"), 1);
  near(f((t) => 1 - t * t * t), 1 - 0.125);
  assert.throws(() => f("bumpy"), /Unknown falloff/);
});

test("inflate on a sphere: the top moves straight up, the bottom not at all", () => {
  const m = makeShape("sphere", { r: 1, rings: 24, segments: 48 });
  const top = m.vertices.findIndex((v) => Math.abs(v.y - 1) < 1e-9);
  sculptMesh(m, "inflate", { center: { x: 0, y: 1, z: 0 }, radius: 0.5, strength: 0.2 });
  near(m.vertices[top].y, 1.2);
  near(m.vertices[top].x, 0);
  near(meshBounds(m).min.y, -1);
});

test("grab moves the middle by delta, nothing outside the radius", () => {
  const src = sheet();
  const m = sculptMesh(cloneMesh(src), "grab", { center: O, radius: 0.3, delta: { x: 0.05, y: 0.2 } });
  const c = m.vertices[at(src, 0, 0)];
  near(c.x, 0.05); near(c.y, 0.2);
  src.vertices.forEach((v, i) => { if (dist(v, O) >= 0.3) assert.deepEqual(m.vertices[i], v); });
  // strength scales it
  near(sculptMesh(sheet(), "grab", { center: O, radius: 0.3, delta: { y: 0.2 }, strength: 0.5 }).vertices[at(src, 0, 0)].y, 0.1);
});

test("smooth evens out bumps; flatten presses them onto one plane", () => {
  const bumpy = () => {
    const m = sheet();
    m.vertices.forEach((v, i) => { v.y = 0.02 * Math.sin(i * 1.7) + 0.3 * v.x; });
    return m;
  };
  const rough = (m) => {
    // How far points are from the slope y = 0.3 x, near the middle
    let s = 0;
    for (const v of m.vertices) if (Math.hypot(v.x, v.z) < 0.15) s += (v.y - 0.3 * v.x) ** 2;
    return s;
  };
  const before = rough(bumpy());
  const smoothed = sculptMesh(bumpy(), "smooth", { center: O, radius: 0.3, strength: 1, iterations: 4 });
  assert.ok(rough(smoothed) < before / 10, `${rough(smoothed)} vs ${before}`);
  // Outside the radius: untouched
  const ref = bumpy();
  smoothed.vertices.forEach((v, i) => { if (Math.hypot(v.x, v.z) >= 0.3) near(v.y, ref.vertices[i].y); });

  const flat = sculptMesh(bumpy(), "flatten", { center: O, radius: 0.2, strength: 1, falloff: "constant" });
  const ref2 = bumpy();
  const pts = flat.vertices.filter((_, i) => dist(ref2.vertices[i], O) < 0.2);
  // All on one plane: the best plane y = a x + b z + c through them leaves nothing over
  near(planeMiss(pts), 0, 1e-9);
  // And it still slopes about like the sheet did
  const raw = ref2.vertices.filter((v) => dist(v, O) < 0.2);
  assert.ok(planeMiss(raw) > 0.01);
});

test("pinch pulls toward the brush along the surface", () => {
  const m = sculptMesh(sheet(), "pinch", { center: O, radius: 0.4, strength: 0.5 });
  const v = m.vertices[at(sheet(), 0.2, 0)];
  near(v.y, 0);
  near(v.x, 0.2 - 0.2 * 0.5 * (1 - 0.25) ** 2);
});

test("crease along a path: a groove at the given depth, points pulled toward it", () => {
  const along = [{ x: -0.3, y: 0, z: 0 }, { x: 0.3, y: 0, z: 0 }];
  const src = sheet();
  const m = sculptMesh(cloneMesh(src), "crease", { along, radius: 0.1, strength: 0.03 });
  for (const x of [-0.2, 0, 0.15, 0.3]) near(m.vertices[at(src, x, 0)].y, -0.03);
  // Beside the line: less deep, and closer to it
  const i = at(src, 0, 0.05);
  assert.ok(m.vertices[i].y < 0 && m.vertices[i].y > -0.03);
  assert.ok(m.vertices[i].z < 0.05);
  // Past the end of the path, outside the radius: untouched
  near(m.vertices[at(src, 0.45, 0)].y, 0);
});

test("noise: lumps within the radius, the same for the same seed", () => {
  const a = sculptMesh(sheet(), "noise", { center: O, radius: 0.3, strength: 0.05, seed: 3 });
  const b = sculptMesh(sheet(), "noise", { center: O, radius: 0.3, strength: 0.05, seed: 3 });
  const c = sculptMesh(sheet(), "noise", { center: O, radius: 0.3, strength: 0.05, seed: 4 });
  assert.deepEqual(a.vertices, b.vertices);
  assert.notDeepEqual(a.vertices, c.vertices);
  assert.ok(a.vertices.some((v) => Math.abs(v.y) > 0.005));
  for (const v of a.vertices) if (Math.hypot(v.x, v.z) >= 0.3) near(v.y, 0);
});

test("symmetry: a symmetric mesh stays exactly symmetric, the seam stays on the plane", () => {
  const sphere = () => makeShape("sphere", { r: 1, rings: 24, segments: 48 });
  assert.ok(symmetricInX(sphere()));
  const p = { x: 0.4, y: 0.3, z: -0.85 };
  for (const [brush, extra] of [["inflate", {}], ["grab", { delta: { x: 0.2, y: 0.1, z: -0.1 } }], ["pinch", {}], ["crease", {}], ["noise", {}], ["smooth", {}], ["flatten", {}]]) {
    const m = sculptMesh(sphere(), brush, { center: p, radius: 0.6, strength: brush === "smooth" || brush === "flatten" || brush === "pinch" ? 0.8 : 0.1, symmetry: "x", ...extra });
    assert.ok(symmetricInX(m, 1e-9), `${brush} isn't symmetric`);
  }
  // A brush right on the plane: points on it stay on it, nothing doubles up
  const src = sphere();
  const m = sculptMesh(cloneMesh(src), "grab", { center: { x: 0, y: 0, z: -1 }, radius: 0.5, delta: { x: 0.3, z: -0.2 }, symmetry: "x" });
  src.vertices.forEach((v, i) => { if (Math.abs(v.x) < 1e-12) near(m.vertices[i].x, v.x); });
  const front = m.vertices.reduce((a, v) => (v.z < a.z ? v : a));
  near(front.z, -1.2);
  // Two axes: 4 brushes
  const four = sculptMesh(sphere(), "inflate", { center: { x: 0.5, y: 0, z: 0.85 }, radius: 0.3, strength: 0.1, symmetry: ["x", "z"] });
  const out = four.vertices.filter((v) => Math.hypot(v.x, v.y, v.z) > 1.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) assert.ok(out.some((v) => Math.sign(v.x) === sx && Math.sign(v.z) === sz));
});

test("points at the same place move together, so the surface doesn't tear", () => {
  // Two halves of a sheet, not welded: their shared side has its points twice
  const left = transformMesh(makeShape("plane", { size: 0.5, div: 10 }), { pos: { x: -0.25, y: 0, z: 0 } });
  const right = transformMesh(makeShape("plane", { size: 0.5, div: 10 }), { pos: { x: 0.25, y: 0, z: 0 } });
  const m = mergeMeshes([left, right]);
  sculptMesh(m, "inflate", { center: { x: 0.01, y: 0, z: 0.02 }, radius: 0.2, strength: 0.05 });
  const seam = m.vertices.filter((v) => Math.abs(v.x) < 1e-9);
  for (const v of seam) {
    const twins = m.vertices.filter((w) => Math.abs(w.x) < 1e-9 && Math.abs(w.z - v.z) < 1e-9);
    assert.equal(twins.length, 2);
    near(twins[0].y, twins[1].y);
  }
  assert.ok(seam.some((v) => v.y > 0.01));
});

test("brushes: names, bad input", () => {
  assert.deepEqual(SCULPT_BRUSHES, ["inflate", "grab", "smooth", "flatten", "pinch", "crease", "noise"]);
  assert.throws(() => sculptMesh(sheet(), "carve", { center: O, radius: 1 }), /Unknown brush/);
  const src = sheet();
  const m = sculptMesh(cloneMesh(src), "inflate", { radius: 0.3 });
  assert.deepEqual(m.vertices, src.vertices);
  assert.deepEqual(sculptMesh(cloneMesh(src), "inflate", { center: O, radius: 0 }).vertices, src.vertices);
  assert.throws(() => sculptMesh(sheet(), "inflate", { center: O, radius: 0.3, symmetry: "w" }), /Unknown symmetry/);
});
