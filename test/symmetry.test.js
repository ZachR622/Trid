import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mirrorMesh, symmetrizeMesh, bisectMesh, arrayMesh, radialArrayMesh, mirrorObject, arrayObject, radialArrayObject,
  makeShape, transformMesh, displaceMesh, cloneMesh, meshBounds, isClosed, validateMesh, rotateY,
  worldMatrix, transformPoint, determinantMat4, fbm3,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };

/** A mesh's signed volume: the same sign as Trid's own closed shapes when its faces point outward. */
function volume(m) {
  let v = 0;
  for (const f of m.faces) {
    const a = m.vertices[f[0]];
    for (let i = 1; i < f.length - 1; i++) {
      const b = m.vertices[f[i]], c = m.vertices[f[i + 1]];
      v += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
    }
  }
  return v;
}
const OUTWARD = Math.sign(volume(makeShape("cube")));
const errors = (m) => validateMesh(m).filter((p) => p.level === "error");

/** A 1-unit cube from x = 0 to 1 (centered on y and z). */
const halfBox = () => transformMesh(makeShape("cube", { size: 1 }), { pos: { x: 0.5, y: 0, z: 0 } });

/** True when every vertex has a mirror image across x = 0. */
function symmetricInX(m, eps = 1e-6) {
  return m.vertices.every((v) => m.vertices.some((w) => Math.abs(w.x + v.x) < eps && Math.abs(w.y - v.y) < eps && Math.abs(w.z - v.z) < eps));
}

test("mirrorMesh: a box touching the plane becomes one closed box twice as wide, faces outward", () => {
  const src = halfBox();
  const before = JSON.stringify(src);
  const m = mirrorMesh(src, { axis: "x" });
  assert.equal(JSON.stringify(src), before, "the input is untouched");
  const b = meshBounds(m);
  near(b.min.x, -1); near(b.max.x, 1);
  // The two faces on the plane are inside now: removed, and the seam shared
  assert.equal(m.faces.length, 10);
  assert.equal(m.vertices.length, 12);
  assert.ok(isClosed(m));
  assert.deepEqual(errors(m), []);
  near(volume(m), 2 * OUTWARD);
  // Texture coordinates and materials follow the faces
  assert.equal(m.faceUVs.length, m.faces.length);
  m.faces.forEach((f, i) => assert.equal(m.faceUVs[i].length, f.length));
});

test("mirrorMesh: without weld, two separate copies", () => {
  const src = halfBox();
  const m = mirrorMesh(src, { weld: false });
  assert.equal(m.vertices.length, 16);
  assert.equal(m.faces.length, 12);
  near(volume(m), 2 * OUTWARD);
});

test("mirrorMesh: points near the plane are welded onto it; center moves the plane", () => {
  const src = transformMesh(makeShape("cube", { size: 1 }), { pos: { x: 0.5 + 1e-7, y: 0, z: 0 } });
  const m = mirrorMesh(src);
  assert.equal(m.vertices.length, 12);
  assert.ok(isClosed(m));
  const off = mirrorMesh(halfBox(), { center: { x: 2 } });
  const b = meshBounds(off);
  near(b.min.x, 0); near(b.max.x, 4);
});

test("mirrorMesh: several axes mirror in turn", () => {
  const corner = transformMesh(makeShape("cube", { size: 1 }), { pos: { x: 0.5, y: 0, z: 0.5 } });
  const m = mirrorMesh(corner, { axis: ["x", "z"] });
  const b = meshBounds(m);
  near(b.min.x, -1); near(b.max.z, 1); near(b.min.z, -1);
  assert.ok(isClosed(m));
  near(volume(m), 4 * OUTWARD);
});

test("mirrorMesh: any plane by its normal", () => {
  const m = mirrorMesh({ vertices: [{ x: 1, y: 0, z: 0 }], faces: [] }, { normal: { x: 1, y: 1, z: 0 }, weld: false });
  nearVec(m.vertices[1], { x: 0, y: -1, z: 0 });
});

test("mirrorMesh: a flat mesh on the plane stays as it is", () => {
  const flat = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], faces: [[0, 1, 2]] };
  const m = mirrorMesh(flat);
  assert.equal(m.faces.length, 1);
  assert.equal(m.vertices.length, 3);
});

test("mirrorMesh: own normals are mirrored", () => {
  const src = halfBox();
  src.normals = [{ x: 1, y: 0, z: 0 }];
  src.faceNormals = src.faces.map((f) => f.map(() => 0));
  const m = mirrorMesh(src, { weld: false });
  nearVec(m.normals[1], { x: -1, y: 0, z: 0 });
  assert.deepEqual(m.faceNormals[m.faces.length - 1], [1, 1, 1, 1]);
});

test("bisectMesh: keeps one side, cuts faces on the plane, carries texture coordinates", () => {
  const sphere = makeShape("sphere");
  const top = bisectMesh(sphere, { axis: "y" });
  assert.ok(top.vertices.every((v) => v.y >= -1e-12));
  near(meshBounds(top).min.y, 0);
  assert.ok(!isClosed(top), "the cut is left open");
  assert.deepEqual(errors(top), []);
  top.faces.forEach((f, i) => assert.equal(top.faceUVs[i].length, f.length));
  for (const t of top.uvs) assert.ok(t.u >= -1e-9 && t.u <= 1 + 1e-9 && t.v >= -1e-9 && t.v <= 1 + 1e-9);
  const bottom = bisectMesh(sphere, { axis: "y", keep: "-" });
  assert.ok(bottom.vertices.every((v) => v.y <= 1e-12));
  // A plane off the middle cuts through faces: the new points are on it
  const cap = bisectMesh(sphere, { axis: "y", center: { y: 0.13 } });
  near(meshBounds(cap).min.y, 0.13);
});

test("bisectMesh: edges are cut too", () => {
  const box = makeShape("cube", { size: 1 });
  const half = bisectMesh(box, { axis: "x" });
  assert.ok(half.edges.length > 0);
  for (const e of half.edges) for (const i of e) assert.ok(half.vertices[i].x >= -1e-12);
  // The cube's two square loops are cut open (3 segments each), and of the 4 edges along z only the +x ones stay
  assert.equal(half.edges.length, 8);
  assert.ok(half.edges.every((e) => e.length === 2));
  // A loop all on the kept side stays one loop
  const kept = bisectMesh(box, { axis: "z", center: { z: -1 } });
  assert.deepEqual(kept.edges, box.edges);
});

test("symmetrizeMesh: a lumpy shape becomes exactly symmetric and stays closed", () => {
  const lumpy = displaceMesh(makeShape("sphere"), (v) => {
    const k = 1 + 0.3 * (fbm3(v.x * 3 + 1.7, v.y * 3, v.z * 3) - 0.5);
    return { x: v.x * k + 0.03, y: v.y * k, z: v.z * k };
  });
  assert.ok(!symmetricInX(lumpy));
  const m = symmetrizeMesh(lumpy, { axis: "x" });
  assert.ok(symmetricInX(m));
  assert.ok(isClosed(m));
  assert.deepEqual(errors(m), []);
  assert.ok(Math.sign(volume(m)) === OUTWARD);
  // keep "-" copies the other side: a different shape, still symmetric
  const other = symmetrizeMesh(lumpy, { axis: "x", keep: "-" });
  assert.ok(symmetricInX(other));
  assert.notEqual(meshBounds(other).max.x.toFixed(6), meshBounds(m).max.x.toFixed(6));
});

test("arrayMesh: by default copies touch side by side; weld joins them into one closed solid", () => {
  const cube = makeShape("cube", { size: 1 });
  const row = arrayMesh(cube, { count: 3 });
  const b = meshBounds(row);
  near(b.min.x, -0.5); near(b.max.x, 2.5);
  assert.equal(row.faces.length, 18);
  const joined = arrayMesh(cube, { count: 3, weld: true });
  assert.equal(joined.faces.length, 14);
  assert.equal(joined.vertices.length, 16);
  assert.ok(isClosed(joined));
  near(volume(joined), 3 * OUTWARD);
  assert.deepEqual(errors(joined), []);
});

test("arrayMesh: offset, relative, rotate and scale make each copy a step further", () => {
  const dot = { vertices: [{ x: 1, y: 0, z: 0 }], faces: [] };
  const line = arrayMesh(dot, { count: 3, offset: { y: 2 } });
  nearVec(line.vertices[2], { x: 1, y: 4, z: 0 });
  const cube = makeShape("cube", { size: 1 });
  const spaced = arrayMesh(cube, { count: 2, relative: { x: 1.5 } });
  near(meshBounds(spaced).max.x, 2);
  // A spiral: each copy turned a quarter and 1 higher, like rotateY
  const spiral = arrayMesh(dot, { count: 4, offset: { y: 1 }, rotate: { y: Math.PI / 2 } });
  spiral.vertices.forEach((v, k) => nearVec(v, { ...rotateY({ x: 1, y: 0, z: 0 }, (k * Math.PI) / 2), y: k }));
  // Shrinking around center
  const shrink = arrayMesh(dot, { count: 3, scale: 0.5, center: { x: 0, y: 0, z: 0 } });
  near(shrink.vertices[2].x, 0.25);
  // count 1 is a copy
  assert.equal(arrayMesh(cube, { count: 1 }).faces.length, 6);
});

test("radialArrayMesh: copies spread over a full turn or an angle, turning like rot", () => {
  const dot = { vertices: [{ x: 1, y: 0, z: 0 }], faces: [] };
  const ring = radialArrayMesh(dot, { count: 4 });
  assert.equal(ring.vertices.length, 4);
  ring.vertices.forEach((v, k) => nearVec(v, rotateY({ x: 1, y: 0, z: 0 }, (k * Math.PI) / 2)));
  const arc = radialArrayMesh(dot, { count: 3, angle: Math.PI });
  nearVec(arc.vertices[2], { x: -1, y: 0, z: 0 });
  const around = radialArrayMesh(dot, { count: 2, axis: "z", center: { x: 2, y: 0, z: 0 } });
  nearVec(around.vertices[1], { x: 3, y: 0, z: 0 });
  assert.throws(() => radialArrayMesh(dot, { axis: "w" }), /Unknown axis/);
});

test("mirrorObject: the mirrored object draws exactly the mirrored points", () => {
  const mesh = makeShape("cube", { size: 1 });
  const obj = { mesh, material: { fill: "#f00" }, pos: { x: 1, y: 0.5, z: -0.3 }, rot: { x: 0.4, y: -0.7, z: 1.1 }, scale: { x: 1, y: 2, z: 0.5 } };
  for (const opts of [{ axis: "x" }, { axis: "y", center: { y: 1 } }, { normal: { x: 1, y: 2, z: -0.5 } }]) {
    const m = mirrorObject(obj, opts);
    assert.equal(m.mesh, mesh, "the mesh is shared");
    assert.equal(m.material, obj.material);
    assert.ok(determinantMat4(worldMatrix(m)) < 0);
    const n = opts.normal ?? { x: 0, y: 0, z: 0, [opts.axis]: 1 };
    const l = Math.hypot(n.x, n.y, n.z);
    const u = { x: n.x / l, y: n.y / l, z: n.z / l };
    const c = { x: 0, y: 0, z: 0, ...opts.center };
    const reflect = (p) => {
      const d = (p.x - c.x) * u.x + (p.y - c.y) * u.y + (p.z - c.z) * u.z;
      return { x: p.x - 2 * d * u.x, y: p.y - 2 * d * u.y, z: p.z - 2 * d * u.z };
    };
    for (const v of mesh.vertices) nearVec(transformPoint(worldMatrix(m), v), reflect(transformPoint(worldMatrix(obj), v)), 1e-9);
  }
  // An unturned object mirrored in x gets a negative x scale
  const plain = mirrorObject({ mesh, pos: { x: 2, y: 0, z: 0 } }, { axis: "x" });
  near(plain.scale.x, -1); near(plain.pos.x, -2);
  near(plain.rot.x, 0); near(plain.rot.y, 0); near(plain.rot.z, 0);
});

test("mirrorObject: children come along as copies", () => {
  const child = { mesh: makeShape("cube"), pos: { x: 0.5, y: 0, z: 0 } };
  const group = { pos: { x: 1, y: 0, z: 0 }, children: [child] };
  const m = mirrorObject(group);
  assert.notEqual(m.children[0], child);
  assert.equal(m.children[0].mesh, child.mesh);
  child.pos.x = 9;
  near(m.children[0].pos.x, 0.5);
});

test("arrayObject and radialArrayObject: separate copies sharing the mesh, a step apart", () => {
  const mesh = makeShape("cube", { size: 1 });
  const post = { mesh, pos: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 2, z: 1 } };
  const row = arrayObject(post, { count: 3 });
  assert.equal(row.length, 3);
  assert.ok(row.every((o) => o.mesh === mesh && o !== post));
  near(row[2].pos.x, 2); // relative: one width
  const tall = arrayObject(post, { count: 2, relative: { y: 1 } });
  near(tall[1].pos.y, 2); // its height, with its scale
  // Each copy draws the step applied to the one before, turned and scaled
  const turned = { mesh, pos: { x: 1, y: 0, z: 0 }, rot: { x: 0.3, y: 0, z: 0 } };
  const spiral = arrayObject(turned, { count: 3, offset: { y: 1 }, rotate: { y: 0.5 }, scale: 0.8 });
  const mesh3 = arrayMesh(transformMesh(cloneMesh(mesh), turned), { count: 3, offset: { y: 1 }, rotate: { y: 0.5 }, scale: 0.8 });
  spiral.forEach((o, k) => mesh.vertices.forEach((v, i) => nearVec(transformPoint(worldMatrix(o), v), mesh3.vertices[k * mesh.vertices.length + i], 1e-9)));
  // Around an axis
  const legs = radialArrayObject({ mesh, pos: { x: 1, y: 0, z: 0 } }, { count: 4 });
  legs.forEach((o, k) => nearVec(o.pos, rotateY({ x: 1, y: 0, z: 0 }, (k * Math.PI) / 2)));
  near(legs[1].rot.y, Math.PI / 2);
});
