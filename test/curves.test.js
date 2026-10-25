import { test } from "node:test";
import assert from "node:assert/strict";
import { spline, resamplePath } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test("spline passes through every control point", () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 3, y: 2, z: 1 }, { x: 4, y: 0, z: -1 }];
  const out = spline(pts, { segments: 5 });
  assert.equal(out.length, 3 * 5 + 1);
  pts.forEach((p, i) => {
    const q = out[i * 5];
    near(q.x, p.x); near(q.y, p.y); near(q.z, p.z);
  });
});

test("spline keeps the point's fields: 2D, 3D and lathe { r, y }", () => {
  assert.deepEqual(Object.keys(spline(square)[3]), ["x", "y"]);
  assert.deepEqual(Object.keys(spline([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }])[1]), ["x", "y", "z"]);
  const profile = spline([{ r: 0.2, y: 0 }, { r: 0.4, y: 0.5 }, { r: 0.1, y: 1 }], { segments: 4 });
  assert.deepEqual(Object.keys(profile[0]), ["r", "y"]);
  near(profile[4].r, 0.4);
});

test("closed spline loops without repeating the first point", () => {
  const out = spline(square, { closed: true, segments: 4 });
  assert.equal(out.length, 16);
  near(out[0].x, 0); near(out[0].y, 0);
  // Last point is just before the first, not on it
  assert.ok(gap(out[15], out[0]) > 1e-3);
  // A loop given with its first point repeated at the end is the same loop
  assert.equal(spline([...square, square[0]], { closed: true, segments: 4 }).length, 16);
});

test("centripetal spline doesn't overshoot at a sharp turn", () => {
  // A spike: uniform Catmull-Rom loops past it, centripetal stays close
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1.05, y: 3 }, { x: 1.1, y: 0 }, { x: 2, y: 0 }];
  const top = (alpha) => Math.max(...spline(pts, { alpha, segments: 32 }).map((p) => p.y));
  assert.ok(top(0.5) < 3.05, `centripetal top ${top(0.5)}`);
});

test("tension 1 gives straight lines", () => {
  const out = spline([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], { tension: 1, segments: 4 });
  for (const p of out.slice(0, 5)) near(p.y, p.x);
});

test("count and spacing give evenly spaced points", () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 0.1, y: 1, z: 0 }, { x: 2, y: 1.2, z: 0.5 }, { x: 2.2, y: 3, z: 1 }];
  const out = spline(pts, { count: 30 });
  assert.equal(out.length, 30);
  near(out[0].x, 0); near(out[29].x, 2.2); near(out[29].z, 1);
  const gaps = out.slice(1).map((p, i) => gap(p, out[i]));
  const mean = gaps.reduce((a, b) => a + b) / gaps.length;
  for (const g of gaps) assert.ok(Math.abs(g - mean) / mean < 0.03, `gap ${g} vs ${mean}`);

  const bySpacing = spline(pts, { spacing: 0.25 });
  const g2 = bySpacing.slice(1).map((p, i) => gap(p, bySpacing[i]));
  for (const g of g2) assert.ok(Math.abs(g - 0.25) < 0.03, `gap ${g}`);
});

test("spline handles repeats, few points and bad numbers", () => {
  assert.deepEqual(spline([]), []);
  assert.deepEqual(spline([{ x: 1, y: 2 }]), [{ x: 1, y: 2 }]);
  const two = spline([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: NaN, y: 1 }], { segments: 4 });
  assert.equal(two.length, 5);
  two.forEach((p, i) => { near(p.x, i / 2); near(p.y, 0); });
});

test("resamplePath spaces points evenly and keeps the ends", () => {
  const line = resamplePath([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 3, y: 0 }], { count: 4 });
  assert.deepEqual(line.map((p) => p.x), [0, 1, 2, 3]);
  const loop = resamplePath(square, { closed: true, count: 8 });
  assert.equal(loop.length, 8);
  near(loop[1].x, 0.5); near(loop[1].y, 0);
  near(loop[7].x, 0); near(loop[7].y, 0.5);
  assert.equal(resamplePath(square, { spacing: 0.5 }).length, 7);
  // No options: same points
  assert.deepEqual(resamplePath(square), square);
});
