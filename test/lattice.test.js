import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLattice, latticePoints, latticeMesh, latticeCage, makeShape, cloneMesh, meshBounds } from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };
const MODES = ["bspline", "cardinal", "linear"];
/** A dense ball, 1 wide. */
const ball = () => makeShape("sphere", { r: 0.5, rings: 24, segments: 48 });

test("makeLattice: points evenly spread over the box, by index", () => {
  const l = makeLattice(makeShape("cube", { size: 1 }), { div: { x: 2, y: 3, z: 4 } });
  assert.deepEqual(l.div, { x: 2, y: 3, z: 4 });
  assert.equal(l.points.length, 24);
  nearVec(l.points[0], { x: -0.5, y: -0.5, z: -0.5 });
  nearVec(l.points.at(-1), { x: 0.5, y: 0.5, z: 0.5 });
  // i + div.x * (j + div.y * k)
  nearVec(l.points[1 + 2 * (1 + 3 * 2)], { x: 0.5, y: 0, z: -0.5 + 2 / 3 });
  const padded = makeLattice({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 2, z: 3 } }, { padding: 0.1, div: 2 });
  nearVec(padded.points[0], { x: -0.1, y: -0.1, z: -0.1 });
  // A flat side has one layer of points
  assert.equal(makeLattice(makeShape("plane"), { div: 3 }).div.y, 1);
  assert.throws(() => makeLattice({}), /give a mesh/);
});

test("latticePoints: layers, rows, single points, counted from the end with negatives", () => {
  const l = makeLattice(makeShape("cube", { size: 1 }), { div: 3 });
  const top = latticePoints(l, { y: -1 });
  assert.equal(top.length, 9);
  for (const p of top) near(p.y, 0.5);
  assert.equal(latticePoints(l, { x: 0, z: 2 }).length, 3);
  const one = latticePoints(l, { x: 1, y: 1, z: 1 });
  assert.equal(one.length, 1);
  nearVec(one[0], { x: 0, y: 0, z: 0 });
  // The lattice's own points
  one[0].x = 0.3;
  near(l.points[13].x, 0.3);
  assert.throws(() => latticePoints(l, { y: 3 }), /no y index/);
});

test("an untouched lattice changes nothing, in every mode", () => {
  for (const interpolation of MODES) {
    const src = ball();
    const m = latticeMesh(cloneMesh(src), makeLattice(src, { div: 4 }), { interpolation });
    m.vertices.forEach((v, i) => nearVec(v, src.vertices[i], 1e-12));
  }
});

test("moving every point by the same amount moves the mesh by it; scaling them scales it", () => {
  for (const interpolation of MODES) {
    const src = ball();
    const l = makeLattice(src, { div: 3 });
    for (const p of l.points) p.y += 0.25;
    latticeMesh(cloneMesh(src), l, { interpolation }).vertices.forEach((v, i) => nearVec(v, { ...src.vertices[i], y: src.vertices[i].y + 0.25 }, 1e-12));
    // Every point twice as far from the middle: the mesh twice as big (blends reproduce straight lines)
    const l2 = makeLattice(src, { div: 4 });
    for (const p of l2.points) { p.x *= 2; p.y *= 2; p.z *= 2; }
    const big = latticeMesh(cloneMesh(src), l2, { interpolation });
    big.vertices.forEach((v, i) => nearVec(v, { x: src.vertices[i].x * 2, y: src.vertices[i].y * 2, z: src.vertices[i].z * 2 }, 1e-9));
  }
});

test("cardinal and linear pass through the points; bspline is softer", () => {
  // A vertex exactly at the middle point of a 3 × 3 × 3 lattice around a box
  const box = { vertices: [{ x: 0, y: 0, z: 0 }, { x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }], faces: [] };
  const run = (interpolation, move) => {
    const m = cloneMesh(box);
    const l = makeLattice(m, { div: 3 });
    move(l);
    return latticeMesh(m, l, { interpolation }).vertices[0];
  };
  const point = (l) => { latticePoints(l, { x: 1, y: 1, z: 1 })[0].y += 0.3; };
  const layer = (l) => { for (const p of latticePoints(l, { y: 1 })) p.y += 0.3; };
  near(run("cardinal", point).y, 0.3);
  near(run("linear", point).y, 0.3);
  near(run("bspline", point).y, 0.3 * (2 / 3) ** 3);
  near(run("bspline", layer).y, 0.3 * (2 / 3));
});

test("a classic: widen the top, pinch the middle; smooth in between, nothing past the lattice", () => {
  const src = makeShape("cylinder", { r: 0.3, h: 1, segments: 32 });
  // The built-in cylinder has rings only at its ends: give it rows to bend
  const tall = { vertices: [], faces: [] };
  for (let r = 0; r <= 20; r++) for (let s = 0; s < 16; s++) {
    const a = (s / 16) * Math.PI * 2;
    tall.vertices.push({ x: Math.cos(a) * 0.3, y: -0.5 + r / 20, z: Math.sin(a) * 0.3 });
  }
  const l = makeLattice(tall, { div: { x: 2, y: 3, z: 2 } });
  for (const p of latticePoints(l, { y: -1 })) { p.x *= 2; p.z *= 2; }
  for (const p of latticePoints(l, { y: 1 })) { p.x *= 0.5; p.z *= 0.5; }
  latticeMesh(tall, l, { interpolation: "cardinal" });
  const radiusAt = (y) => Math.max(...tall.vertices.filter((v) => Math.abs(v.y - y) < 1e-9).map((v) => Math.hypot(v.x, v.z)));
  near(radiusAt(0.5), 0.6, 1e-9);
  near(radiusAt(0), 0.15, 1e-9);
  near(radiusAt(-0.5), 0.3, 1e-9);
  // Narrowest at the middle, widening smoothly both ways
  assert.ok(radiusAt(-0.25) > radiusAt(0) && radiusAt(0.25) > radiusAt(0));
  assert.ok(radiusAt(0.25) < radiusAt(0.5));
  assert.equal(tall.dirty, true);
  assert.equal(src.vertices.length > 0, true);
});

test("vertices outside the lattice move like the nearest place on it", () => {
  const l = makeLattice({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, { div: 2 });
  for (const p of l.points) p.x += 0.5;
  const m = latticeMesh({ vertices: [{ x: 5, y: -3, z: 2 }], faces: [] }, l);
  nearVec(m.vertices[0], { x: 5.5, y: -3, z: 2 });
});

test("latticeCage: lines between neighbors, on the lattice's own points", () => {
  const l = makeLattice(makeShape("cube", { size: 1 }), { div: { x: 2, y: 3, z: 2 } });
  const cage = latticeCage(l);
  assert.equal(cage.vertices, l.points);
  // Along x: 1 × 3 × 2, along y: 2 × 2 × 2, along z: 2 × 3 × 1
  assert.equal(cage.edges.length, 6 + 8 + 6);
  assert.equal(cage.faces, undefined);
});

test("bad input", () => {
  const l = makeLattice(ball(), { div: 3 });
  assert.throws(() => latticeMesh(ball(), l, { interpolation: "cubic" }), /Unknown interpolation/);
  l.points.pop();
  assert.throws(() => latticeMesh(ball(), l), /expected 27/);
  const l2 = makeLattice(ball(), { div: 3 });
  l2.points[4].y = NaN;
  assert.throws(() => latticeMesh(ball(), l2), /finite/);
  // div is kept between 2 and 64
  assert.equal(makeLattice(ball(), { div: 1 }).div.x, 2);
  assert.equal(makeLattice(ball(), { div: 500 }).div.x, 64);
  near(meshBounds(latticeMesh(ball(), makeLattice(ball()))).size.x, 1, 1e-12);
});
