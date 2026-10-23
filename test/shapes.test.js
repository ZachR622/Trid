import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, lathe, extrude, triangulate, newell, parseOBJ, exportOBJ, edgeSegments, wireEdges } from "../trid/index.js";

/** Every face, UV and edge index points at something. */
function assertValid(mesh) {
  assert.ok(mesh.faces.length > 0);
  assert.equal(mesh.faceUVs.length, mesh.faces.length);
  mesh.faces.forEach((f, i) => {
    for (const v of f) assert.ok(v < mesh.vertices.length);
    assert.equal(mesh.faceUVs[i].length, f.length);
    for (const t of mesh.faceUVs[i]) assert.ok(t < mesh.uvs.length);
  });
  for (const [a, b] of edgeSegments(mesh.edges)) assert.ok(a < mesh.vertices.length && b < mesh.vertices.length);
}

const centroid = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });

/** The sign newell() gives a face seen from outside, taken from trid's own cube. */
const cube = makeShape("cube");
const OUT = Math.sign(newell(cube.faces[0].map((i) => cube.vertices[i])).z) * -1; // faces[0] looks toward -z

/** Share of faces whose normal points away from `inside(centroid)`. */
function outwardShare(mesh, inside, faces = mesh.faces) {
  let out = 0, total = 0;
  for (const f of faces) {
    const pts = f.map((i) => mesh.vertices[i]);
    const n = newell(pts);
    if (Math.hypot(n.x, n.y, n.z) < 1e-9) continue;
    const c = centroid(pts), k = inside(c);
    total++;
    if (OUT * (n.x * (c.x - k.x) + n.y * (c.y - k.y) + n.z * (c.z - k.z)) > 0) out++;
  }
  return out / total;
}

const axis = (c) => ({ x: 0, y: c.y, z: 0 });
const square = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];
const star = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.2 : 0.5;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

test("new built-in shapes are valid", () => {
  for (const kind of ["cylinder", "cone", "torus", "plane"]) assertValid(makeShape(kind));
  assertValid(makeShape("CONE", { rTop: 0.1 }));
  assertValid(makeShape("plane", { div: 3, height: (x, z) => x * z }));
  assertValid(lathe([{ r: 0.2, y: 0 }, { r: 0.3, y: 1 }], { capBottom: true }));
  assertValid(extrude(star));
});

test("cylinder, cone and lathe sides face outward", () => {
  const cyl = makeShape("cylinder", { segments: 16 });
  assert.equal(outwardShare(cyl, axis, cyl.faces.slice(0, 16)), 1);
  const cone = makeShape("cone", { segments: 16 });
  assert.equal(outwardShare(cone, axis, cone.faces.slice(0, 16)), 1);
});

test("cylinder caps face outward", () => {
  const cyl = makeShape("cylinder", { h: 1 });
  const caps = cyl.faces.slice(32);
  // The center of the cylinder is inside both caps
  assert.equal(outwardShare(cyl, () => ({ x: 0, y: 0, z: 0 }), caps), 1);
});

test("torus faces point away from the middle of the tube", () => {
  const R = 0.35;
  const t = makeShape("torus", { R });
  assert.equal(outwardShare(t, (c) => {
    const d = Math.hypot(c.x, c.z);
    return { x: (c.x / d) * R, y: 0, z: (c.z / d) * R };
  }), 1);
});

test("plane faces +Y like the cube's top", () => {
  const p = makeShape("plane", { div: 2 });
  assert.equal(outwardShare(p, (c) => ({ x: c.x, y: c.y - 1, z: c.z })), 1);
});

test("extrude builds a closed solid with outward faces, whichever way the outline goes", () => {
  for (const outline of [square, [...square].reverse(), star]) {
    const m = extrude(outline, 0.4);
    assertValid(m);
    // The star is concave but every wall still faces away from its center
    assert.equal(outwardShare(m, () => ({ x: 0, y: 0, z: 0 })), 1);
  }
});

test("triangulate cuts a concave star without overlap", () => {
  const tris = triangulate(star);
  assert.equal(tris.length, 8);
  const area = (pts) => pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0) / 2;
  const sum = tris.reduce((s, t) => s + area(t.map((i) => star[i])), 0);
  assert.ok(Math.abs(sum - area(star)) < 1e-9);
  for (const t of tris) assert.ok(area(t.map((i) => star[i])) > 0);
});

test("new shapes round-trip through exportOBJ / parseOBJ", () => {
  for (const mesh of [makeShape("cylinder", { segments: 12 }), extrude(star)]) {
    const back = parseOBJ(exportOBJ(mesh));
    assert.equal(back.faces.length, mesh.faces.length);
    assert.equal(back.vertices.length, mesh.vertices.length);
    back.vertices.forEach((v, i) => {
      const w = mesh.vertices[i];
      assert.ok(Math.hypot(v.x - w.x, v.y - w.y, v.z - w.z) < 1e-5);
    });
    assert.deepEqual(back.faces, mesh.faces);
  }
});

test("wireEdges falls back to face outlines when a mesh has no edges", () => {
  const tri = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 2, 1]] };
  assert.deepEqual([...edgeSegments(wireEdges(tri))], [[0, 2], [2, 1], [1, 0]]);
  assert.deepEqual([...edgeSegments(undefined)], []);
  assert.deepEqual(wireEdges({ vertices: [], edges: [], faces: [[0, 1, 2]] }), []);
});

test("the outward check itself: trid's sphere passes, a flipped one fails", () => {
  const s = makeShape("sphere");
  assert.equal(outwardShare(s, () => ({ x: 0, y: 0, z: 0 })), 1);
  const flipped = { ...s, faces: s.faces.map((f) => [...f].reverse()) };
  assert.equal(outwardShare(flipped, () => ({ x: 0, y: 0, z: 0 })), 0);
});

test("extrude bevel: valid, closed and outward, chamfered or rounded, either direction", () => {
  for (const outline of [square, [...square].reverse(), star]) {
    for (const opts of [{ bevel: 0.05 }, { bevel: 0.05, bevelSegments: 4 }, { bevel: 1, bevelSegments: 3 }]) {
      const m = extrude(outline, 0.2, opts);
      assertValid(m);
      assert.equal(outwardShare(m, () => ({ x: 0, y: 0, z: 0 })), 1, JSON.stringify(opts));
      // Stays inside the plain extrusion's box
      const zs = m.vertices.map((v) => v.z);
      assert.ok(Math.max(...zs) <= 0.1 + 1e-12 && Math.min(...zs) >= -0.1 - 1e-12);
    }
  }
  // Rings: front, bevel steps, back. A chamfer adds one ring at each end
  assert.equal(extrude(square, 0.2, { bevel: 0.05 }).vertices.length, 4 * 4);
  assert.equal(extrude(square, 0.2, { bevel: 0.05, bevelSegments: 3 }).vertices.length, 4 * 8);
  // A bevel of half the depth or more meets in the middle (no doubled ring)
  assert.equal(extrude(square, 0.2, { bevel: 5 }).vertices.length, 4 * 3);
  // The front face is pulled in by the bevel
  const front = extrude(square, 0.2, { bevel: 0.05 }).vertices.slice(0, 4);
  for (const v of front) { assert.ok(Math.abs(Math.abs(v.x) - 0.45) < 1e-9); assert.ok(Math.abs(v.z + 0.1) < 1e-12); }
});

test("extrude taper shrinks the back around the outline's middle", () => {
  const m = extrude([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }], 0.2, { taper: 0.5 });
  assertValid(m);
  const back = m.vertices.filter((v) => v.z > 0);
  const xs = back.map((v) => v.x), ys = back.map((v) => v.y);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [1.5, 2.5, 1.25, 1.75]);
  assert.deepEqual(extrude(square, 0.2).vertices, extrude(square, 0.2, { taper: 1, bevel: 0 }).vertices);
});
