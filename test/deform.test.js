import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, meshBounds, taperMesh, twistMesh, bendMesh, bulgeMesh, rotateY, cloneMesh } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };

/** A column along Y from 0 to 2, 0.2 wide, with many rings so it can bend. */
function column() {
  const m = makeShape("cylinder", { r: 0.1, h: 2, segments: 8 });
  // The built-in cylinder has 2 rings: add rings by rebuilding it as a lathe-like stack
  const rings = 21, seg = 8, vertices = [], faces = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      vertices.push({ x: Math.cos(a) * 0.1, y: (r / (rings - 1)) * 2, z: Math.sin(a) * 0.1 });
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < seg; s++) {
    const s1 = (s + 1) % seg;
    faces.push([r * seg + s, (r + 1) * seg + s, (r + 1) * seg + s1, r * seg + s1]);
  }
  return { ...m, vertices, faces, edges: undefined, uvs: undefined, faceUVs: undefined };
}

test("taperMesh: the start keeps its size, the end is `amount` as wide", () => {
  const m = taperMesh(column(), { axis: "y", amount: 0.5 });
  const top = m.vertices.filter((v) => Math.abs(v.y - 2) < 1e-9);
  const bottom = m.vertices.filter((v) => Math.abs(v.y) < 1e-9);
  near(Math.max(...top.map((v) => Math.hypot(v.x, v.z))), 0.05);
  near(Math.max(...bottom.map((v) => Math.hypot(v.x, v.z))), 0.1);
  assert.equal(m.dirty, true);
});

test("taperMesh: from / to limit it; a function gives the size", () => {
  const m = taperMesh(column(), { amount: 0, from: 0.5, to: 1 });
  // Bottom half untouched, top a point
  for (const v of m.vertices.filter((v) => v.y <= 1)) near(Math.hypot(v.x, v.z), 0.1);
  for (const v of m.vertices.filter((v) => Math.abs(v.y - 2) < 1e-9)) near(Math.hypot(v.x, v.z), 0);
  const f = taperMesh(column(), { amount: (w) => 1 + w });
  for (const v of f.vertices.filter((v) => Math.abs(v.y - 1) < 1e-9)) near(Math.hypot(v.x, v.z), 0.15);
});

test("twistMesh turns around the axis line, the same way as rotateY", () => {
  const src = column();
  const m = twistMesh(cloneMesh(src), { axis: "y", angle: Math.PI / 2 });
  src.vertices.forEach((v, i) => {
    const w = v.y / 2;
    nearVec(m.vertices[i], rotateY(v, (Math.PI / 2) * w));
  });
  // Around `center`, not the origin
  const off = twistMesh(column(), { axis: "y", angle: Math.PI, center: { x: 1, z: 0 } });
  const top = off.vertices.filter((v) => Math.abs(v.y - 2) < 1e-9);
  near(top.reduce((a, v) => a + v.x, 0) / top.length, 2);
});

test("bendMesh: a quarter turn keeps the length and curves toward +x", () => {
  const m = bendMesh(column(), { axis: "y", angle: Math.PI / 2, toward: "x" });
  const b = meshBounds(m);
  // Arc of length 2: radius 4/π, the top ends up sideways at (R, R)
  const R = 2 / (Math.PI / 2);
  const top = m.vertices.slice(20 * 8);
  const c = top.reduce((a, v) => ({ x: a.x + v.x / 8, y: a.y + v.y / 8, z: a.z + v.z / 8 }), { x: 0, y: 0, z: 0 });
  near(c.x, R, 1e-6); near(c.y, R, 1e-6); near(c.z, 0, 1e-6);
  assert.ok(b.max.x > 1);
  // Negative angle curves to -x
  const neg = bendMesh(column(), { axis: "y", angle: -Math.PI / 2, toward: "x" });
  assert.ok(meshBounds(neg).min.x < -1);
});

test("bendMesh: before the range nothing moves, after it the mesh goes on straight", () => {
  const src = column();
  const m = bendMesh(cloneMesh(src), { axis: "y", angle: Math.PI / 2, toward: "x", from: 0.25, to: 0.5 });
  // Below y = 0.5: unchanged
  src.vertices.forEach((v, i) => { if (v.y <= 0.5) nearVec(m.vertices[i], v); });
  // Above y = 1: the column points along +x, its rings stay round and the same size
  const ring = (r) => m.vertices.slice(r * 8, r * 8 + 8);
  const center = (pts) => pts.reduce((a, v) => ({ x: a.x + v.x / 8, y: a.y + v.y / 8, z: a.z + v.z / 8 }), { x: 0, y: 0, z: 0 });
  const c15 = center(ring(15)), c20 = center(ring(20));
  near(c20.y, c15.y, 1e-9);
  near(c20.x - c15.x, 0.5, 1e-9);
  for (const v of ring(20)) near(Math.hypot(v.y - c20.y, v.z - c20.z), 0.1, 1e-9);
});

test("bulgeMesh pushes along the surface, even on a flat side", () => {
  const box = makeShape("plane", { size: 2, div: 20 });
  const m = bulgeMesh(box, { center: { x: 0, y: 0, z: 0 }, radius: 0.5, amount: 0.2 });
  // The plane faces +Y: the middle rises by `amount`, x and z don't slide
  const mid = m.vertices.find((v) => Math.abs(v.x) < 1e-9 && Math.abs(v.z) < 1e-9);
  near(mid.y, 0.2);
  const plane = makeShape("plane", { size: 2, div: 20 });
  m.vertices.forEach((v, i) => { near(v.x, plane.vertices[i].x); near(v.z, plane.vertices[i].z); });
  // Nothing moves past the radius
  for (const v of m.vertices) if (Math.hypot(v.x, v.z) >= 0.5) near(v.y, 0);
  // Negative amount dents
  assert.ok(bulgeMesh(makeShape("plane", { size: 2, div: 20 }), { center: { x: 0, y: 0, z: 0 }, radius: 0.5, amount: -0.2 }).vertices.some((v) => v.y < -0.1));
});

test("bulgeMesh radial mode moves away from the center", () => {
  const s = makeShape("sphere", { r: 0.5 });
  // Radial: the center goes inside the part that swells
  const m = bulgeMesh(cloneMesh(s), { center: { x: 0, y: 0, z: 0.3 }, radius: 0.4, amount: 0.1, mode: "radial" });
  const tip = m.vertices.reduce((a, v) => (v.z > a.z ? v : a));
  assert.ok(tip.z > 0.5);
  // On a sphere, the normal mode looks about the same
  const n = bulgeMesh(cloneMesh(s), { center: { x: 0, y: 0, z: 0.5 }, radius: 0.4, amount: 0.1 });
  assert.ok(n.vertices.reduce((a, v) => Math.max(a, v.z), 0) > 0.55);
});

test("deformers leave bad input alone and remove stale normals", () => {
  const empty = { vertices: [] };
  assert.equal(taperMesh(empty), empty);
  assert.equal(bendMesh(column(), { angle: 0 }).dirty, undefined);
  assert.throws(() => twistMesh(column(), { axis: "w" }), /axis/);
  const withNormals = { ...column(), normals: [{ x: 0, y: 1, z: 0 }], faceNormals: [] };
  const out = twistMesh(withNormals, { angle: 1 });
  assert.equal(out.normals, undefined);
  assert.equal(bulgeMesh(column(), { center: { x: 0, y: 0, z: 0 }, radius: 0 }).dirty, undefined);
});
