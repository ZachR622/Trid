import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyModifiers, MODIFIERS, makeShape, cloneMesh, meshBounds, isClosed, transformMesh,
  mirrorMesh, taperMesh, subdivideMesh, makeLattice, latticePoints, latticeMesh,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
/** A 1-unit box from x = 0 to 1. */
const halfBox = () => transformMesh(makeShape("cube", { size: 1 }), { pos: { x: 0.5, y: 0, z: 0 } });

test("steps run in order on a copy, the same as calling the functions", () => {
  const src = halfBox();
  const before = JSON.stringify(src);
  const out = applyModifiers(src, [
    { type: "mirror", axis: "x" },
    { type: "subdivide", levels: 1, smooth: false },
    { type: "taper", axis: "y", amount: 0.5 },
  ]);
  assert.equal(JSON.stringify(src), before, "the original is untouched");
  const byHand = taperMesh(subdivideMesh(mirrorMesh(halfBox(), { axis: "x" }), { levels: 1, smooth: false }), { axis: "y", amount: 0.5 });
  assert.deepEqual(out.vertices, byHand.vertices);
  assert.deepEqual(out.faces, byHand.faces);
  // Order matters: tapered around the whole box's middle, or around the half's (then mirrored)
  const topWidth = (m) => Math.max(...m.vertices.filter((v) => Math.abs(v.y - 0.5) < 1e-9).map((v) => v.x));
  const mirrorFirst = applyModifiers(halfBox(), [{ type: "mirror", axis: "x" }, { type: "taper", axis: "y", amount: 0.5 }]);
  const taperFirst = applyModifiers(halfBox(), [{ type: "taper", axis: "y", amount: 0.5 }, { type: "mirror", axis: "x" }]);
  near(topWidth(mirrorFirst), 0.5);
  near(topWidth(taperFirst), 0.75);
});

test("enabled: false skips a step; an empty list gives a copy", () => {
  const src = halfBox();
  const out = applyModifiers(src, [{ type: "mirror", enabled: false }, { type: "transform", pos: { x: 1, y: 0, z: 0 } }]);
  near(meshBounds(out).min.x, 1);
  const copy = applyModifiers(src, []);
  assert.notEqual(copy, src);
  assert.deepEqual(copy.vertices, src.vertices);
});

test("every built-in type runs, and a stack can build a closed solid", () => {
  const ball = () => makeShape("sphere", { r: 0.5, rings: 16, segments: 32 });
  const cutter = transformMesh(makeShape("cube", { size: 0.4 }), { pos: { x: 0, y: 0.5, z: 0 } });
  const steps = {
    mirror: { axis: "x" }, symmetrize: { axis: "x" }, bisect: { axis: "y" }, array: { count: 2 }, radialArray: { count: 3 },
    subdivide: { levels: 1 }, bevel: { radius: 0.02 }, boolean: { op: "subtract", with: cutter },
    taper: { amount: 0.5 }, twist: { angle: 1 }, bend: { angle: 1 }, bulge: { center: { x: 0, y: 0, z: 0.5 }, radius: 0.3 },
    sculpt: { brush: "inflate", center: { x: 0, y: 0.5, z: 0 }, radius: 0.3 }, noise: { amount: 0.02, seed: 1 },
    lattice: { div: 3, edits: [{ select: { y: -1 }, scale: 1.5 }] }, remesh: { resolution: 12 },
    weld: {}, clean: {}, fixWinding: {}, transform: { scale: { x: 2, y: 2, z: 2 } },
  };
  assert.deepEqual(Object.keys(steps).sort(), Object.keys(MODIFIERS).sort(), "a test for every type");
  for (const [type, opts] of Object.entries(steps)) {
    const out = applyModifiers(type === "bevel" ? makeShape("cube") : ball(), [{ type, ...opts }]);
    assert.ok(out.vertices.length > 0 && out.faces.length > 0, type);
  }
  const solid = applyModifiers(ball(), [
    { type: "boolean", op: "subtract", with: cutter },
    { type: "remesh", resolution: 24 },
    { type: "noise", amount: 0.01, seed: 2 },
    { type: "symmetrize", axis: "x" },
  ]);
  assert.ok(isClosed(solid));
});

test("lattice steps as data: edits pick points, then move, scale and rotate them around their middle", () => {
  const ball = makeShape("sphere", { r: 0.5, rings: 16, segments: 32 });
  const out = applyModifiers(ball, [{
    type: "lattice", div: 3, interpolation: "cardinal",
    edits: [{ select: { y: -1 }, scale: { x: 2, z: 2 }, move: { y: 0.1 } }],
  }]);
  // The same by hand
  const m = cloneMesh(ball);
  const l = makeLattice(m, { div: 3 });
  for (const p of latticePoints(l, { y: -1 })) { p.x *= 2; p.z *= 2; p.y += 0.1; }
  latticeMesh(m, l, { interpolation: "cardinal" });
  out.vertices.forEach((v, i) => { near(v.x, m.vertices[i].x); near(v.y, m.vertices[i].y); near(v.z, m.vertices[i].z); });
  near(meshBounds(out).max.y, 0.6);
  // Rotate: a quarter turn of the top layer around y
  const turned = applyModifiers(ball, [{ type: "lattice", div: 3, interpolation: "linear", edits: [{ select: { y: -1 }, rotate: { y: Math.PI / 2 } }] }]);
  near(meshBounds(turned).size.x, meshBounds(ball).size.x, 1e-6);
  // A lattice made in code works too
  const made = makeLattice(ball, { div: 2 });
  for (const p of made.points) p.x += 1;
  near(meshBounds(applyModifiers(ball, [{ type: "lattice", lattice: made }])).center.x, 1);
});

test("errors name the step; custom types can be added", () => {
  assert.throws(() => applyModifiers(halfBox(), [{ type: "mirror" }, { type: "explode" }]), /Modifier 2 \("explode"\): unknown type; use one of mirror,/);
  assert.throws(() => applyModifiers(halfBox(), [{ type: "boolean" }]), /Modifier 1 \("boolean"\): needs `with`/);
  assert.throws(() => applyModifiers(halfBox(), [{ type: "mirror", axis: "w" }]), (e) => /Modifier 1 \("mirror"\): Unknown axis "w"/.test(e.message) && e.cause instanceof Error);
  assert.throws(() => applyModifiers(halfBox(), [{ type: "lattice", edits: [{ select: { y: 9 } }] }]), /Modifier 1 \("lattice"\): latticePoints: no y index 9/);
  assert.throws(() => applyModifiers({}, []), /give a mesh/);

  MODIFIERS.lift = (mesh, { by = 1 }) => { for (const v of mesh.vertices) v.y += by; };
  MODIFIERS.broken = () => 42;
  try {
    near(meshBounds(applyModifiers(halfBox(), [{ type: "lift", by: 2 }])).min.y, 1.5);
    assert.throws(() => applyModifiers(halfBox(), [{ type: "broken" }]), /didn't give a mesh/);
  } finally {
    delete MODIFIERS.lift;
    delete MODIFIERS.broken;
  }
});

test("a stack is plain data: it survives JSON and gives the same mesh", () => {
  const stack = [
    { type: "mirror", axis: "x" },
    { type: "lattice", div: 3, edits: [{ select: { y: 0 }, scale: 0.6 }] },
    { type: "noise", amount: 0.01, seed: 5 },
  ];
  const a = applyModifiers(makeShape("sphere"), stack);
  const b = applyModifiers(makeShape("sphere"), JSON.parse(JSON.stringify(stack)));
  assert.deepEqual(a.vertices, b.vertices);
});
