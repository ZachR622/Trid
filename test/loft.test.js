import { test } from "node:test";
import assert from "node:assert/strict";
import { loft, spline } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

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

/** Every edge is shared by exactly two faces, going opposite ways: a closed, consistent surface. */
function closedAndConsistent(mesh) {
  const seen = new Map();
  for (const f of mesh.faces) {
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const k = `${a},${b}`;
      assert.ok(!seen.has(k), `edge ${k} used twice the same way`);
      seen.set(k, true);
    });
  }
  for (const k of seen.keys()) {
    const [a, b] = k.split(",");
    assert.ok(seen.has(`${b},${a}`), `edge ${k} has no other side`);
  }
}

function wellFormed(mesh) {
  assert.equal(mesh.faces.length, mesh.faceUVs.length);
  mesh.faces.forEach((f, i) => {
    assert.equal(f.length, mesh.faceUVs[i].length);
    for (const v of f) assert.ok(v >= 0 && v < mesh.vertices.length);
    for (const u of mesh.faceUVs[i]) assert.ok(u >= 0 && u < mesh.uvs.length);
  });
  for (const v of mesh.vertices) assert.ok(Number.isFinite(v.x + v.y + v.z));
}

const square = (r) => [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
const circle = (r, n = 32) => Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) }));
const radiusAround = (mesh, axis) => Math.max(...mesh.vertices.map((v) => Math.hypot(...["x", "y", "z"].filter((a) => a !== axis).map((a) => v[a]))));

test("two equal squares make a closed, outward box, on every axis", () => {
  for (const axis of ["x", "y", "z"]) {
    const m = loft([{ at: 0, outline: square(0.5) }, { at: 1, outline: square(0.5) }], { axis });
    wellFormed(m);
    closedAndConsistent(m);
    near(volume(m), 1);
    // Along the axis from 0 to 1
    const vs = m.vertices.map((v) => v[axis]);
    near(Math.min(...vs), 0); near(Math.max(...vs), 1);
  }
  // Outlines walked clockwise: still outward
  near(volume(loft([{ at: 0, outline: [...square(0.5)].reverse() }, { at: 1, outline: square(0.5) }])), 1);
});

test("the shape never bulges past its sections", () => {
  const m = loft([
    { at: 0, outline: circle(0.2) }, { at: 1, outline: circle(0.5) }, { at: 2, outline: circle(0.5) }, { at: 3, outline: circle(0.2) },
  ], { segments: 10 });
  assert.ok(radiusAround(m, "z") <= 0.5 + 1e-9, `${radiusAround(m, "z")}`);
  // But it's smooth: rows between sections aren't on straight lines
  const mid = m.vertices.filter((v) => v.z > 0.4 && v.z < 0.6);
  assert.ok(mid.length > 0);
  assert.ok(Math.max(...mid.map((v) => Math.hypot(v.x, v.y))) > 0.2 + 0.3 * 0.5 + 0.01);
  // smooth: false joins them with straight lines
  const flat = loft([{ at: 0, outline: circle(0.2) }, { at: 1, outline: circle(0.5) }], { smooth: false, segments: 2 });
  const half = flat.vertices.filter((v) => Math.abs(v.z - 0.5) < 1e-9);
  near(Math.max(...half.map((v) => Math.hypot(v.x, v.y))), 0.35);
});

test("different point counts: resampled, corners kept, and lined up", () => {
  const m = loft([{ at: 0, outline: square(0.5) }, { at: 1, outline: circle(0.5, 40) }]);
  wellFormed(m);
  closedAndConsistent(m);
  // 40 points around; the square's 4 corners are still there
  const start = m.vertices.filter((v) => Math.abs(v.z) < 1e-9);
  assert.equal(start.length, 40);
  for (const c of square(0.5)) assert.ok(start.some((v) => Math.abs(v.x - c.x) < 1e-9 && Math.abs(v.y - c.y) < 1e-9));
});

test("sections with another start point are lined up (no twist)", () => {
  const ring = circle(0.5, 16);
  const turned = ring.slice(5).concat(ring.slice(0, 5));
  const m = loft([{ at: 0, outline: ring }, { at: 1, outline: turned }], { segments: 1, caps: false });
  // Each line along the surface is straight along z: point k at the start matches point k at the end
  for (let k = 0; k < 16; k++) {
    near(m.vertices[k].x, m.vertices[16 + k].x);
    near(m.vertices[k].y, m.vertices[16 + k].y);
  }
  // align: false keeps them as given (twisted)
  const twisted = loft([{ at: 0, outline: ring }, { at: 1, outline: turned }], { segments: 1, caps: false, align: false });
  assert.ok(Math.abs(twisted.vertices[0].x - twisted.vertices[16].x) > 0.1);
});

test("a section of one point closes into a tip", () => {
  const m = loft([{ at: 0, outline: circle(0.5) }, { at: 1, outline: circle(0.5) }, { at: 1.5, outline: [{ x: 0, y: 0 }] }]);
  wellFormed(m);
  closedAndConsistent(m);
  assert.equal(m.vertices.filter((v) => Math.abs(v.z - 1.5) < 1e-9).length, 1);
  // scale: 0 does the same
  const m2 = loft([{ at: 0, outline: circle(0.5) }, { at: 1, outline: circle(0.5) }, { at: 1.5, outline: circle(0.5), scale: 0 }]);
  near(volume(m2), volume(m), 1e-6);
});

test("scale, rotate and offset change a section in place", () => {
  const m = loft([{ at: 0, outline: square(0.5) }, { at: 1, outline: square(0.5), scale: { x: 2, y: 1 }, rotate: Math.PI / 2, offset: { x: 0, y: 1 } }], { segments: 1 });
  const end = m.vertices.filter((v) => Math.abs(v.z - 1) < 1e-9);
  // 2 wide then a quarter turn: 1 wide in x, 2 tall in y, around y = 1
  near(Math.max(...end.map((v) => v.x)), 0.5);
  near(Math.max(...end.map((v) => v.y)), 2);
  near(Math.min(...end.map((v) => v.y)), 0);
});

test("sections along a curved path sit on it, across it", () => {
  const path = spline([{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0.5 }, { x: 1, y: 1.5, z: 1 }], { count: 40 });
  const m = loft([{ at: 0, outline: circle(0.1, 12) }, { at: 0.5, outline: square(0.15) }, { at: 1, outline: circle(0.05, 12) }], { path });
  wellFormed(m);
  closedAndConsistent(m);
  assert.ok(volume(m) > 0);
  // The start section is centered on the path's start, the end one on its end
  const center = (vs) => vs.reduce((a, v) => ({ x: a.x + v.x / vs.length, y: a.y + v.y / vs.length, z: a.z + v.z / vs.length }), { x: 0, y: 0, z: 0 });
  // 24 points around: the most any outline has, at least 24
  const c0 = center(m.vertices.slice(0, 24));
  near(c0.x, 0, 1e-6); near(c0.y, 0, 1e-6); near(c0.z, 0, 1e-6);
  const last = path[path.length - 1];
  const nearEnd = m.vertices.filter((v) => Math.hypot(v.x - last.x, v.y - last.y, v.z - last.z) < 0.0500001);
  assert.ok(nearEnd.length >= 12);
});

test("a closed path makes a ring with no caps", () => {
  const path = Array.from({ length: 48 }, (_, i) => ({ x: Math.cos((i / 48) * 2 * Math.PI), y: 0, z: Math.sin((i / 48) * 2 * Math.PI) }));
  const m = loft([{ at: 0, outline: circle(0.2, 12) }, { at: 0.5, outline: circle(0.1, 12) }], { path, closed: true });
  wellFormed(m);
  closedAndConsistent(m);
  assert.ok(volume(m) > 0);
  assert.ok(m.faces.every((f) => f.length === 4));
});

test("3D rings are used where they are, in either direction", () => {
  const rings = [0, 1, 2].map((i) => Array.from({ length: 12 }, (_, k) => ({
    x: Math.cos((k / 12) * 2 * Math.PI) * (1 - i * 0.3), y: i, z: Math.sin((k / 12) * 2 * Math.PI) * (1 - i * 0.3),
  })));
  const m = loft(rings.map((points) => ({ points })));
  wellFormed(m);
  closedAndConsistent(m);
  assert.ok(volume(m) > 0);
  // One ring walked the other way is turned to match
  const m2 = loft([{ points: rings[0] }, { points: [...rings[1]].reverse() }, { points: rings[2] }]);
  closedAndConsistent(m2);
  near(volume(m2), volume(m), 1e-9);
  // Points of the first ring are kept
  for (const p of rings[0]) assert.ok(m.vertices.some((v) => Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) < 1e-9));
});

test("caps: false leaves the ends open but still faces outward", () => {
  const m = loft([{ at: 0, outline: circle(0.5, 8) }, { at: 1, outline: circle(0.5, 8) }], { caps: false, segments: 1 });
  wellFormed(m);
  assert.equal(m.faces.length, 8);
  const capped = loft([{ at: 0, outline: circle(0.5, 8) }, { at: 1, outline: circle(0.5, 8) }], { segments: 1 });
  assert.deepEqual(m.faces, capped.faces.slice(0, 8));
});

test("bad input", () => {
  assert.deepEqual(loft([]).faces, []);
  assert.deepEqual(loft([{ at: 0, outline: square(1) }]).faces, []);
  assert.deepEqual(loft(null).faces, []);
  assert.throws(() => loft([{ outline: square(1) }, { points: [{ x: 0, y: 0, z: 0 }] }]), /not both/);
  // NaN points are skipped; sections at the same place keep the first
  const m = loft([{ at: 0, outline: [...square(0.5), { x: NaN, y: 0 }] }, { at: 0, outline: square(2) }, { at: 1, outline: square(0.5) }]);
  near(volume(m), 1);
});
