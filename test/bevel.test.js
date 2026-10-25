import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, extrude, lathe, sweep, loft, mergeMeshes, cloneMesh, bevelMesh, validateMesh, newell } from "../trid/index.js";

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
/** Volume of a box of size a × b × c with every edge rounded by r. */
const roundedVolume = (a, b, c, r) => {
  const [x, y, z] = [a - 2 * r, b - 2 * r, c - 2 * r];
  return x * y * z + 2 * r * (x * y + y * z + z * x) + Math.PI * r * r * (x + y + z) + (4 / 3) * Math.PI * r ** 3;
};
const star = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.2 : 0.5;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

test("a rounded cube approaches the exact rounded shape, closed and outward", () => {
  const cube = makeShape("cube", { size: 1 });
  let last = 0;
  for (const segments of [2, 4, 8]) {
    const m = bevelMesh(cube, { radius: 0.1, segments });
    assert.deepEqual(problems(m), [], `segments ${segments}`);
    const v = volume(m);
    assert.ok(v > last && v < roundedVolume(1, 1, 1, 0.1) + 1e-9);
    last = v;
  }
  near(last, roundedVolume(1, 1, 1, 0.1), 0.001);
  // Corners are pieces of a sphere around the inner corner
  const m = bevelMesh(cube, { radius: 0.1, segments: 6 });
  const corner = m.vertices.filter((v) => v.x > 0.4 && v.y > 0.4 && v.z > 0.4);
  for (const v of corner) near(Math.hypot(v.x - 0.4, v.y - 0.4, v.z - 0.4), 0.1, 1e-9);
  // The original isn't changed
  assert.deepEqual(cube, makeShape("cube", { size: 1 }));
});

test("segments: 1 cuts a flat chamfer", () => {
  const m = bevelMesh(makeShape("cube", { size: 1 }), { radius: 0.1, segments: 1 });
  assert.deepEqual(problems(m), []);
  // 6 sides, 12 edge strips, 8 corner triangles
  assert.equal(m.faces.length, 26);
  // Each edge loses a triangular prism (r² / 2 by its length), each corner 5/6 of an r³ cube
  near(volume(m), 1 - 12 * (0.01 / 2) * 0.8 - 8 * (5 / 6) * 0.001);
});

test("only the listed edges: one rounded edge ends on the flat sides", () => {
  const cube = makeShape("cube", { size: 1 });
  const [a, b] = cube.faces[0];
  const one = bevelMesh(cube, { radius: 0.1, segments: 1, edges: [[a, b]] });
  assert.deepEqual(problems(one), []);
  near(volume(one), 1 - 0.01 / 2);
  const round = bevelMesh(cube, { radius: 0.1, segments: 16, edges: [[a, b]] });
  near(volume(round), 1 - 0.01 * (1 - Math.PI / 4), 2e-5);
  // A polyline: the 4 edges around the top
  const top = cube.faces[2];
  const loop = bevelMesh(cube, { radius: 0.1, segments: 3, edges: [[...top, top[0]]] });
  assert.deepEqual(problems(loop), []);
  assert.ok(Math.max(...loop.vertices.map((v) => v.y)) <= 0.5 + 1e-9);
});

test("angle picks which edges", () => {
  const cyl = makeShape("cylinder", { r: 0.3, h: 0.8, segments: 24 });
  const m = bevelMesh(cyl, { radius: 0.05, segments: 3 });
  assert.deepEqual(problems(m), []);
  // Only the rims are rounded: the sides keep their height in the middle, the caps shrink
  const capTop = m.vertices.filter((v) => Math.abs(v.y - 0.4) < 1e-9);
  assert.ok(Math.max(...capTop.map((v) => Math.hypot(v.x, v.z))) < 0.3 - 0.04);
  assert.ok(m.vertices.some((v) => Math.abs(Math.hypot(v.x, v.z) - 0.3) < 1e-3 && Math.abs(v.y) <= 0.35 + 1e-9));
  // A sphere has nothing sharper than 30°: unchanged
  near(volume(bevelMesh(makeShape("sphere"), { radius: 0.05 })), volume(makeShape("sphere")));
  // With angle 90, the cube's edges (exactly 90°) aren't sharper: unchanged
  near(volume(bevelMesh(makeShape("cube", { size: 1 }), { radius: 0.1, angle: 90 })), 1);
});

test("concave edges and caps made of triangles (an extruded star)", () => {
  for (const segments of [1, 3]) {
    const m = bevelMesh(extrude(star, 0.2), { radius: 0.03, segments });
    assert.deepEqual(problems(m), [], `segments ${segments}`);
    assert.ok(volume(m) > 0 && volume(m) < volume(extrude(star, 0.2)));
  }
});

test("closed and outward on many shapes, radii and segment counts", () => {
  const ring = (n) => Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * 0.3, y: 0, z: Math.sin((i / n) * Math.PI * 2) * 0.3 }));
  const sq = [{ x: -0.08, y: -0.05 }, { x: 0.08, y: -0.05 }, { x: 0.08, y: 0.05 }, { x: -0.08, y: 0.05 }];
  const L = [{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.6, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.6 }, { x: 0, y: 0.6 }];
  const shapes = {
    // a concave edge
    L: extrude(L, 0.2),
    // rounded rings meeting straight sides (2 rounded edges at a point, turning)
    bottle: lathe([{ r: 0.2, y: -0.4 }, { r: 0.2, y: 0.1 }, { r: 0.08, y: 0.25 }, { r: 0.08, y: 0.4 }], { segments: 16, capBottom: true, capTop: true }),
    // a hole, and concave corners where rounded edges start the same way
    nut: sweep(ring(6), { profile: sq, closed: true }),
    triangle: sweep(ring(3), { profile: sq, closed: true }),
    // long edges split by rows (2 rounded edges at a point, going on)
    hull: loft([{ at: -0.4, outline: sq }, { at: 0.4, outline: sq }], { segments: 2 }),
    // separate pieces
    pieces: mergeMeshes([makeShape("box"), { mesh: makeShape("cube"), pos: { x: 1, y: 0, z: 0 } }]),
    cone: makeShape("cone"),
  };
  for (const [name, mesh] of Object.entries(shapes)) {
    for (const segments of [1, 2, 3, 6]) {
      for (const radius of [0.01, 0.04]) {
        const m = bevelMesh(mesh, { radius, segments });
        assert.deepEqual(problems(m), [], `${name}, ${segments} segments, radius ${radius}`);
        assert.ok(volume(m) > 0, name);
      }
    }
    assert.deepEqual(problems(bevelMesh(mesh, { radius: 0.02, segments: 3, mode: "vertices" })), [], `${name}, vertices`);
  }
});

test("faces cut into triangles bevel like whole faces", () => {
  const box = makeShape("box");
  const tri = cloneMesh(box);
  tri.faces = box.faces.flatMap((f) => [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]);
  tri.faceUVs = box.faceUVs.flatMap((f) => [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]);
  tri.faceMaterials = box.faceMaterials.flatMap((k) => [k, k]);
  // Same points; corner patches may split a few cells along the other diagonal
  near(volume(bevelMesh(tri, { radius: 0.05 })), volume(bevelMesh(box, { radius: 0.05 })), 1e-4);
  const key = (v) => [v.x, v.y, v.z].map((n) => n.toFixed(9)).join();
  assert.deepEqual(new Set(bevelMesh(tri, { radius: 0.05 }).vertices.map(key)), new Set(bevelMesh(box, { radius: 0.05 }).vertices.map(key)));
  assert.deepEqual(problems(bevelMesh(tri, { radius: 0.05 })), []);
});

test("the radius shrinks so bevels don't overlap", () => {
  const m = bevelMesh(makeShape("box", { w: 1, h: 0.1, d: 1 }), { radius: 5, segments: 3 });
  assert.deepEqual(problems(m), []);
  // Never wider than the box
  assert.ok(Math.max(...m.vertices.map((v) => Math.abs(v.y))) <= 0.05 + 1e-9);
  assert.ok(volume(m) > 0);
});

test("texture coordinates and materials follow their faces", () => {
  const box = makeShape("box", { w: 1, h: 1, d: 1 });
  const m = bevelMesh(box, { radius: 0.1, segments: 2 });
  assert.equal(m.faceUVs.length, m.faces.length);
  assert.equal(m.faceMaterials.length, m.faces.length);
  assert.deepEqual([...new Set(m.faceMaterials)].sort(), [0, 1, 2, 3, 4, 5]);
  // On each side, a point keeps the coordinates the side's texture gives it
  const side = (k) => box.faces[k].map((i) => box.vertices[i]);
  m.faces.forEach((f, i) => {
    const k = m.faceMaterials[i];
    const n = newell(side(k));
    const flat = f.every((v) => Math.abs((m.vertices[v].x * n.x + m.vertices[v].y * n.y + m.vertices[v].z * n.z) / Math.hypot(n.x, n.y, n.z) - 0.5) < 1e-9);
    if (!flat) return;
    for (const t of m.faceUVs[i].map((j) => m.uvs[j])) assert.ok(t.u > -1e-9 && t.u < 1 + 1e-9 && t.v > -1e-9 && t.v < 1 + 1e-9);
  });
});

test("vertices mode cuts only the corners", () => {
  const cube = makeShape("cube", { size: 1 });
  const cut = bevelMesh(cube, { radius: 0.1, mode: "vertices", segments: 1 });
  assert.deepEqual(problems(cut), []);
  near(volume(cut), 1 - 8 * (0.001 / 6));
  assert.equal(cut.faces.length, 6 + 8);
  const dome = bevelMesh(cube, { radius: 0.1, mode: "vertices", segments: 4 });
  assert.deepEqual(problems(dome), []);
  assert.ok(volume(dome) > volume(cut) && volume(dome) < 1);
  // Only the listed vertices
  const one = bevelMesh(cube, { radius: 0.1, mode: "vertices", segments: 1, vertices: [0] });
  near(volume(one), 1 - 0.001 / 6);
});

test("makeShape box and cube with a radius: clean rounded boxes", () => {
  const m = makeShape("box", { w: 0.6, h: 0.4, d: 0.8, radius: 0.1, segments: 8 });
  assert.deepEqual(problems(m), []);
  near(volume(m), roundedVolume(0.6, 0.4, 0.8, 0.1), 2e-4);
  assert.deepEqual([...new Set(m.faceMaterials)], [0, 1, 2, 3, 4, 5]);
  // Shared vertices along the edges: one surface
  assert.ok(!validateMesh(m).some((p) => p.kind === "same-place"));
  // A cube rounded by half its size is a ball
  const ball = makeShape("cube", { size: 1, radius: 0.5, segments: 6 });
  for (const v of ball.vertices) near(Math.hypot(v.x, v.y, v.z), 0.5, 1e-9);
  assert.deepEqual(problems(ball), []);
  // Radius 0 is the plain box
  assert.deepEqual(makeShape("box", { radius: 0 }), makeShape("box"));
  // The texture is placed like on the plain box
  const plain = makeShape("box"), tiny = makeShape("box", { radius: 1e-6, segments: 1 });
  plain.faces.forEach((f, i) => f.forEach((v, c) => {
    const p = plain.vertices[v], uv = plain.uvs[plain.faceUVs[i][c]];
    tiny.faces.forEach((g, j) => {
      if (tiny.faceMaterials[j] !== i) return;
      g.forEach((w, d) => {
        const q = tiny.vertices[w];
        if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 2e-6) {
          const t = tiny.uvs[tiny.faceUVs[j][d]];
          near(t.u, uv.u, 1e-5); near(t.v, uv.v, 1e-5);
        }
      });
    });
  }));
});

test("bad input", () => {
  assert.deepEqual(bevelMesh({ vertices: [] }), { vertices: [], faces: [] });
  assert.throws(() => bevelMesh(makeShape("cube"), { mode: "faces" }), /Unknown bevel mode/);
  // Radius 0: a cleaned copy
  near(volume(bevelMesh(makeShape("cube"), { radius: 0 })), 0.125);
  // An open sheet: its border stays sharp, nothing breaks
  const plane = bevelMesh(makeShape("plane"), { radius: 0.05 });
  assert.deepEqual(problems(plane), []);
});
