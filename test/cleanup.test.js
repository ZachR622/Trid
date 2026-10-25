import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, cloneMesh, weldVertices, cleanMesh, validateMesh, fixWinding, rng } from "../trid/index.js";

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

/** A cube made of 6 separate faces (24 vertices, none shared), like many OBJ exports. */
function looseCube() {
  const cube = makeShape("cube");
  const vertices = [], faces = [];
  for (const f of cube.faces) faces.push(f.map((i) => vertices.push({ ...cube.vertices[i] }) - 1));
  return { vertices, faces, uvs: cube.uvs, faceUVs: cube.faceUVs.map((f) => [...f]), faceMaterials: [0, 1, 2, 3, 4, 5] };
}

const kinds = (mesh) => validateMesh(mesh).map((p) => p.kind);

test("weldVertices merges vertices at the same place, keeping uvs and materials", () => {
  const m = weldVertices(looseCube());
  assert.equal(m.vertices.length, 8);
  assert.equal(m.faces.length, 6);
  assert.deepEqual(m.faceMaterials, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(m.faceUVs, makeShape("cube").faceUVs);
  assert.ok(Math.abs(volume(m) - 0.125) < 1e-12);
  assert.equal(m.dirty, true);
});

test("weldVertices finds close vertices across grid cell borders", () => {
  // Two points 1e-9 apart on either side of a multiple of the distance
  const m = weldVertices({ vertices: [{ x: 0.3 - 4e-10, y: 0, z: 0 }, { x: 0.3 + 4e-10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }, 1e-9);
  assert.equal(m.vertices.length, 2);
});

test("weldVertices drops corners that meet and keeps edges in step", () => {
  const m = weldVertices({
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }],
    faces: [[0, 1, 2, 3], [1, 2, 4]],
    faceUVs: [[0, 1, 2, 3], [4, 5, 6]],
    uvs: Array.from({ length: 7 }, () => ({ u: 0, v: 0 })),
    edges: [[0, 1], [1, 2], [2, 4]],
  });
  assert.deepEqual(m.faces, [[0, 1, 2]]);
  assert.deepEqual(m.faceUVs, [[0, 1, 3]]);
  assert.deepEqual(m.edges, [[0, 1], [1, 3]]);
});

test("cleanMesh removes broken faces and what nothing uses", () => {
  const m = cleanMesh({
    vertices: [
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: NaN, y: 0, z: 0 }, { x: 5, y: 5, z: 5 },
    ],
    faces: [
      [0, 1, 2],     // fine
      [0, 1, 9],     // missing vertex
      [0, 1, 4],     // NaN vertex
      [0, 1, 3],     // no area (all on the x axis)
      [1, 2, 0],     // the first face again, started elsewhere
      [0, 0, 1, 2],  // a repeated corner: kept as [0, 1, 2]... but it's the same face again
      [0, 1.5, 2],   // not a whole number
      [0, 1, 0, 2],  // goes through 0 twice
    ],
    faceUVs: [[0, 1, 9], null, null, null, null, null, null, null],
    uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }],
    faceMaterials: [3, 0, 0, 0, 0, 0, 0, 0],
    edges: [[0, 5], [0, 7]],
  });
  assert.deepEqual(m.faces, [[0, 1, 2]]);
  assert.deepEqual(m.faceUVs, [null]);   // pointed to a missing uv
  assert.deepEqual(m.faceMaterials, [3]);
  // Vertex 5 is kept: an edge uses it. 3 and 4 are gone
  assert.equal(m.vertices.length, 4);
  assert.deepEqual(m.edges, [[0, 3]]);
  assert.deepEqual(m.uvs, []);
  assert.deepEqual(validateMesh(m).filter((p) => p.level !== "info"), []);
});

test("cleanMesh with weld merges first", () => {
  const m = cleanMesh(looseCube(), { weld: true });
  assert.equal(m.vertices.length, 8);
  assert.deepEqual(kinds(m), []);
});

test("built-in shapes pass validateMesh", () => {
  for (const k of ["cube", "box", "sphere", "cylinder", "torus"]) assert.deepEqual(kinds(makeShape(k)), [], k);
  // Open borders are only info
  assert.deepEqual(validateMesh(makeShape("plane")).map((p) => p.level), ["info"]);
});

test("validateMesh names each kind of problem", () => {
  const cube = makeShape("cube");
  const bad = cloneMesh(cube);
  bad.vertices.push({ x: NaN, y: 0, z: 0 }, { x: 9, y: 9, z: 9 });
  bad.faces.push([0, 1, 99], [0, 1, 1], [0, 1, 0, 2], [...cube.faces[0]]);
  bad.faceUVs.push(null, null, null, [0]);
  bad.faces[2] = [...bad.faces[2]].reverse();
  const problems = validateMesh(bad);
  const by = Object.fromEntries(problems.map((p) => [p.kind, p]));
  assert.equal(by["bad-vertex"].level, "error");
  assert.deepEqual(by["bad-index"].faces, [6]);
  assert.deepEqual(by["few-corners"].faces, [7]);
  assert.deepEqual(by["crossed-face"].faces, [8]);
  assert.deepEqual(by["repeated-face"].faces, [9]);
  assert.deepEqual(by["bad-faceUVs"].faces, [9]);
  assert.ok(by["turned-face"].faces.includes(2));
  assert.ok(by["unused-vertex"].vertices.includes(9));
  assert.match(by["bad-index"].message, /1 face pointing to vertices that don't exist \(faces 6\)/);
  assert.deepEqual(validateMesh({}), [{ kind: "no-vertices", level: "error", message: "The mesh has no vertices list" }]);
});

test("validateMesh finds inside-out solids and unwelded vertices", () => {
  const inside = makeShape("sphere");
  inside.faces = inside.faces.map((f) => [...f].reverse());
  assert.deepEqual(kinds(inside), ["inside-out"]);
  assert.deepEqual(kinds(looseCube()), ["same-place"]);
});

test("fixWinding turns scrambled faces so all point outward", () => {
  const random = rng(7);
  for (const kind of ["sphere", "torus", "cube"]) {
    const good = makeShape(kind);
    const m = cloneMesh(good);
    m.faces.forEach((f, i) => {
      if (random() < 0.5) {
        m.faces[i] = [...f].reverse();
        m.faceUVs[i] = [...m.faceUVs[i]].reverse();
      }
    });
    fixWinding(m);
    assert.deepEqual(m.faces.map((f) => f.join()), good.faces.map((f) => f.join()), kind);
    // Texture corners turned with their faces
    m.faces.forEach((f, i) => assert.deepEqual(m.faceUVs[i], good.faceUVs[i]));
  }
});

test("fixWinding turns an inside-out mesh, and works without welding", () => {
  const m = makeShape("sphere");
  m.faces = m.faces.map((f) => [...f].reverse());
  assert.ok(volume(fixWinding(m)) > 0);
  // Loose faces: joined by position, not by index
  const loose = looseCube();
  loose.faces[1].reverse();
  loose.faces[4].reverse();
  fixWinding(loose);
  assert.ok(Math.abs(volume(loose) - 0.125) < 1e-12);
  assert.deepEqual(kinds(loose), ["same-place"]);
  // Each piece on its own: two spheres, one inside out
  const a = makeShape("sphere"), b = makeShape("sphere");
  b.faces = b.faces.map((f) => [...f].reverse());
  const n = a.vertices.length;
  const two = { vertices: [...a.vertices, ...b.vertices.map((v) => ({ x: v.x + 2, y: v.y, z: v.z }))], faces: [...a.faces, ...b.faces.map((f) => f.map((i) => i + n))] };
  fixWinding(two);
  assert.ok(volume({ ...two, faces: two.faces.slice(a.faces.length) }) > 0);
  assert.ok(volume({ ...two, faces: two.faces.slice(0, a.faces.length) }) > 0);
});

test("fixWinding on a flat sheet keeps the way most faces point", () => {
  const plane = makeShape("plane", { div: 4 });
  const m = cloneMesh(plane);
  m.faces[3] = [...m.faces[3]].reverse();
  fixWinding(m);
  assert.deepEqual(m.faces, plane.faces);
});
