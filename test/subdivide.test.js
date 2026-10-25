import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, cloneMesh, subdivideMesh, validateMesh } from "../trid/index.js";

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

const problems = (m) => validateMesh(m).filter((p) => p.level !== "info").map((p) => p.kind);

test("a cube rounds toward a ball, 4 times the faces per level, outward and clean", () => {
  const cube = makeShape("cube");
  let last = volume(cube);
  for (let l = 1; l <= 3; l++) {
    const m = subdivideMesh(cube, { levels: l });
    assert.equal(m.faces.length, 6 * 4 ** l);
    assert.ok(m.faces.every((f) => f.length === 4));
    const v = volume(m);
    assert.ok(v > 0 && v < last, `level ${l}: ${v}`);
    last = v;
    assert.deepEqual(problems(m), []);
  }
  // Close to round after 4 levels
  const d = subdivideMesh(cube, { levels: 4 }).vertices.map((v) => Math.hypot(v.x, v.y, v.z));
  assert.ok(Math.max(...d) / Math.min(...d) < 1.05);
  // The original isn't changed
  assert.deepEqual(cube, makeShape("cube"));
});

test("creaseAngle keeps hard edges hard", () => {
  const m = subdivideMesh(makeShape("cube"), { levels: 2, creaseAngle: 30 });
  near(volume(m), 0.125);
  // A softer angle than the cube's edges smooths everything
  assert.ok(volume(subdivideMesh(makeShape("cube"), { levels: 2, creaseAngle: 120 })) < 0.1);
});

test("creases keeps the listed edges sharp (pairs or polylines)", () => {
  const cube = makeShape("cube");
  // The four edges around the top face, as one closed polyline
  const top = cube.faces.find((f) => f.every((i) => cube.vertices[i].y > 0));
  const m = subdivideMesh(cube, { levels: 3, creases: [[...top, top[0]]] });
  // The top stays a flat square at the cube's height
  const topY = Math.max(...m.vertices.map((v) => v.y));
  near(topY, 0.25);
  const flat = m.vertices.filter((v) => Math.abs(v.y - 0.25) < 1e-9);
  assert.ok(flat.length >= 81, `${flat.length} points on the flat top`);
  // A loop's corners round a little (2 sharp edges each); 3 sharp edges make a hard corner
  assert.ok(Math.max(...flat.map((v) => v.x)) < 0.25);
  assert.ok(volume(m) > volume(subdivideMesh(cube, { levels: 3 })));
});

test("smooth: false only splits faces", () => {
  const m = subdivideMesh(makeShape("cube"), { levels: 2, smooth: false });
  near(volume(m), 0.125);
  assert.equal(m.faces.length, 96);
});

test("triangles and mixed faces become quads", () => {
  const tetra = {
    vertices: [{ x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }],
    faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
  };
  if (volume(tetra) < 0) tetra.faces = tetra.faces.map((f) => [...f].reverse());
  const m = subdivideMesh(tetra, { levels: 2 });
  assert.equal(m.faces.length, 4 * 3 * 4);
  assert.ok(volume(m) > 0);
  assert.deepEqual(problems(m), []);
});

test("an unwelded mesh is smoothed as one surface", () => {
  const cube = makeShape("cube");
  const vertices = [], faces = [];
  for (const f of cube.faces) faces.push(f.map((i) => vertices.push({ ...cube.vertices[i] }) - 1));
  const loose = subdivideMesh({ vertices, faces }, { levels: 2 });
  const welded = subdivideMesh(cube, { levels: 2 });
  near(volume(loose), volume(welded));
  assert.equal(loose.vertices.length, welded.vertices.length);
});

test("an open sheet keeps its corners and its border straight", () => {
  const plane = makeShape("plane", { size: 1, div: 2 });
  const m = subdivideMesh(plane, { levels: 2 });
  for (const c of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    assert.ok(m.vertices.some((v) => Math.abs(v.x - c[0]) < 1e-12 && Math.abs(v.z - c[1]) < 1e-12), `corner ${c}`);
  }
  for (const v of m.vertices) near(v.y, 0);
  assert.ok(Math.max(...m.vertices.map((v) => v.x)) <= 0.5 + 1e-12);
});

test("texture coordinates follow, smooth inside, seams and corners kept", () => {
  const cube = makeShape("cube");
  const m = subdivideMesh(cube, { levels: 2 });
  assert.equal(m.faceUVs.length, m.faces.length);
  m.faceUVs.forEach((f, i) => assert.equal(f.length, m.faces[i].length));
  // Each side keeps its 0..1 square
  const us = m.uvs.map((t) => t.u), vs = m.uvs.map((t) => t.v);
  const lo = Math.min(...cube.uvs.map((t) => t.u)), hi = Math.max(...cube.uvs.map((t) => t.u));
  near(Math.min(...us), lo); near(Math.max(...us), hi);
  near(Math.min(...vs), Math.min(...cube.uvs.map((t) => t.v)));
  // Linear only splits: the middle of a face is the average of its corners
  const lin = subdivideMesh(cube, { levels: 1, uvs: "linear" });
  const corners = cube.faceUVs[0].map((i) => cube.uvs[i]);
  const mid = { u: corners.reduce((a, t) => a + t.u, 0) / 4, v: corners.reduce((a, t) => a + t.v, 0) / 4 };
  const centerUV = lin.uvs[lin.faceUVs[0][2]];
  near(centerUV.u, mid.u); near(centerUV.v, mid.v);
});

test("materials follow their faces; normals are dropped", () => {
  const box = { ...makeShape("box"), normals: [{ x: 0, y: 1, z: 0 }], faceNormals: [] };
  const m = subdivideMesh(box, { levels: 1 });
  assert.deepEqual(m.faceMaterials, box.faceMaterials.flatMap((k) => [k, k, k, k]));
  assert.equal(m.normals, undefined);
});

test("bad input", () => {
  assert.deepEqual(subdivideMesh({ vertices: [] }), { vertices: [], faces: [] });
  const cube = cloneMesh(makeShape("cube"));
  cube.faces.push([0, 1, 99]);
  cube.faceUVs.push(null);
  const m = subdivideMesh(cube, { levels: 1, creases: [[0, 999], "x"] });
  assert.equal(m.faces.length, 24);
  // Levels 0: the same shape, welded
  near(volume(subdivideMesh(makeShape("cube"), { levels: 0 })), 0.125);
});
