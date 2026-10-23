import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeShape, cloneMesh, transformMesh, displaceMesh, mergeMeshes, meshBounds,
  localToWorld, newell, parseOBJ,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-9) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };

/** Share of faces pointing away from the origin (trid faces are clockwise from outside). */
function outward(mesh) {
  const cube = makeShape("cube");
  const OUT = Math.sign(newell(cube.faces[0].map((i) => cube.vertices[i])).z) * -1;
  let out = 0;
  for (const f of mesh.faces) {
    const pts = f.map((i) => mesh.vertices[i]);
    const n = newell(pts);
    const c = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 });
    if (OUT * (n.x * c.x + n.y * c.y + n.z * c.z) > 0) out++;
  }
  return out / mesh.faces.length;
}

test("cloneMesh copies deeply and drops dirty", () => {
  const a = { ...makeShape("cube"), normals: [{ x: 0, y: 1, z: 0 }], materialNames: ["m"], dirty: true };
  const b = cloneMesh(a);
  assert.deepEqual({ ...b }, (({ dirty, ...rest }) => rest)(a));
  b.vertices[0].x = 99; b.faces[0][0] = 99; b.faceUVs[0][0] = 99; b.normals[0].y = 0;
  assert.notEqual(a.vertices[0].x, 99);
  assert.notEqual(a.faces[0][0], 99);
  assert.notEqual(a.faceUVs[0][0], 99);
  assert.equal(a.normals[0].y, 1);
  assert.equal(b.dirty, undefined);
});

test("transformMesh matches how objects are drawn (localToWorld)", () => {
  const t = { pos: { x: 1, y: -2, z: 0.5 }, rot: { x: 0.3, y: -1.1, z: 2 }, scale: { x: 2, y: 0.5, z: 1.5 } };
  const src = makeShape("sphere");
  const baked = transformMesh(cloneMesh(src), t);
  src.vertices.forEach((v, i) => nearVec(baked.vertices[i], localToWorld(v, t)));
  assert.equal(baked.dirty, true);
  // Parts left out change nothing
  const same = transformMesh(cloneMesh(src), { pos: { y: 1 } });
  src.vertices.forEach((v, i) => nearVec(same.vertices[i], { x: v.x, y: v.y + 1, z: v.z }));
});

test("transformMesh keeps faces outward when mirroring, and turns normals", () => {
  const m = transformMesh(makeShape("sphere"), { scale: { x: -1, y: 1, z: 1 } });
  assert.equal(outward(m), 1);
  const n = transformMesh({ vertices: [], normals: [{ x: 1, y: 0, z: 0 }] }, { rot: { x: 0, y: 0, z: Math.PI / 2 } });
  nearVec(n.normals[0], { x: 0, y: 1, z: 0 });
});

test("transformMesh keeps OBJ normals perpendicular under a non-uniform scale", () => {
  // A slanted face and its normal: after squashing, the normal must stay perpendicular to the face
  const mesh = parseOBJ("v 0 0 0\nv 1 1 0\nv 0 1 1\nvn 0 0 1\nf 1//1 2//1 3//1");
  const f = mesh.faces[0].map((i) => mesh.vertices[i]);
  const n0 = newell(f), len = Math.hypot(n0.x, n0.y, n0.z);
  mesh.normals = [{ x: n0.x / len, y: n0.y / len, z: n0.z / len }];
  transformMesh(mesh, { scale: { x: 3, y: 0.5, z: 1 } });
  const [a, b, c] = mesh.faces[0].map((i) => mesh.vertices[i]);
  const n = mesh.normals[0];
  for (const e of [{ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }]) {
    near(n.x * e.x + n.y * e.y + n.z * e.z, 0);
  }
});

test("displaceMesh moves vertices in place and drops stale normals", () => {
  const m = { ...makeShape("cube"), normals: [{ x: 0, y: 1, z: 0 }], faceNormals: [[0, 0, 0, 0]] };
  const first = m.vertices[0];
  displaceMesh(m, (v, i) => ({ x: v.x * 2, y: v.y + i, z: v.z }));
  assert.equal(m.vertices[0], first); // same objects
  assert.equal(m.vertices[1].y, makeShape("cube").vertices[1].y + 1);
  assert.equal(m.normals, undefined);
  assert.equal(m.faceNormals, undefined);
  assert.equal(m.dirty, true);
});

test("mergeMeshes shifts indices and keeps every part", () => {
  const a = makeShape("cube"), b = makeShape("cone", { segments: 8 });
  const m = mergeMeshes([a, b]);
  const n = a.vertices.length, u = a.uvs.length;
  assert.equal(m.vertices.length, n + b.vertices.length);
  assert.equal(m.faces.length, a.faces.length + b.faces.length);
  assert.deepEqual(m.faces.slice(a.faces.length), b.faces.map((f) => f.map((i) => i + n)));
  assert.deepEqual(m.faceUVs.slice(a.faces.length), b.faceUVs.map((f) => f.map((i) => i + u)));
  assert.deepEqual(m.edges.slice(a.edges.length), b.edges.map((e) => e.map((i) => i + n)));
  // Cube sides keep their 0-5 materials, the cone's faces use 0
  assert.deepEqual(m.faceMaterials, [...a.faceMaterials, ...b.faces.map(() => 0)]);
  // The inputs aren't changed
  assert.deepEqual(a, makeShape("cube"));
});

test("mergeMeshes bakes objects, and materialPerMesh numbers the parts", () => {
  const cube = makeShape("cube");
  const obj = { mesh: cube, pos: { x: 2, y: 0, z: 0 }, rot: { x: 0, y: 1, z: 0 } };
  const m = mergeMeshes([makeShape("sphere"), obj], { materialPerMesh: true });
  const off = makeShape("sphere").vertices.length;
  cube.vertices.forEach((v, i) => nearVec(m.vertices[off + i], localToWorld(v, { scale: { x: 1, y: 1, z: 1 }, ...obj })));
  assert.deepEqual(new Set(m.faceMaterials), new Set([0, 1]));
  assert.equal(m.faceMaterials.filter((k) => k === 1).length, cube.faces.length);
  assert.deepEqual(cube, makeShape("cube")); // the object's mesh isn't changed
});

test("mergeMeshes joins OBJ material names", () => {
  const a = parseOBJ("v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl wood\nf 1 2 3\nusemtl iron\nf 1 3 2");
  const b = parseOBJ("v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl gold\nf 1 2 3\nusemtl wood\nf 1 3 2");
  const m = mergeMeshes([a, b]);
  const names = m.faceMaterials.map((k) => m.materialNames[k]);
  assert.deepEqual(names, ["wood", "iron", "gold", "wood"]);
});

test("mergeMeshes: a mesh without edges keeps its face outlines next to one with edges", () => {
  const tri = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 2, 1]] };
  const m = mergeMeshes([makeShape("cube"), tri]);
  assert.deepEqual(m.edges.at(-1), [8, 10, 9]);
  assert.equal(mergeMeshes([tri, tri]).edges, undefined);
});

test("meshBounds measures meshes, placed objects and scenes", () => {
  const b = meshBounds(makeShape("box", { w: 2, h: 1, d: 4 }));
  nearVec(b.min, { x: -1, y: -0.5, z: -2 });
  nearVec(b.size, { x: 2, y: 1, z: 4 });
  nearVec(b.center, { x: 0, y: 0, z: 0 });
  const obj = { mesh: makeShape("cube", { size: 1 }), pos: { x: 3, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } };
  const s = meshBounds({ objects: [obj, { mesh: makeShape("cube", { size: 1 }) }] });
  nearVec(s.min, { x: -0.5, y: -1, z: -1 });
  nearVec(s.max, { x: 4, y: 1, z: 1 });
  assert.equal(meshBounds([]), null);
});
