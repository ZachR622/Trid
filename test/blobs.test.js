import { test } from "node:test";
import assert from "node:assert/strict";
import { blobMesh, blobField, sdfMesh, validateMesh } from "../trid/index.js";

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

/** V - E + F: 2 for a closed ball-like surface, 0 for a ring. */
function euler(mesh) {
  const edges = new Set();
  for (const f of mesh.faces) f.forEach((a, i) => {
    const b = f[(i + 1) % f.length];
    edges.add(a < b ? `${a},${b}` : `${b},${a}`);
  });
  return mesh.vertices.length - edges.size + mesh.faces.length;
}

const problems = (m) => validateMesh(m).filter((p) => p.level !== "info").map((p) => p.kind);
const ball = (x, y, z, radius) => ({ kind: "sphere", center: { x, y, z }, radius });
const SPHERE = (4 / 3) * Math.PI;

for (const method of ["nets", "cubes"]) {
  test(`${method}: a sphere is closed, outward, and exactly on the surface`, () => {
    const m = blobMesh([ball(0, 0, 0, 0.5)], { method, resolution: 32 });
    near(volume(m), SPHERE * 0.125, 0.003);
    for (const v of m.vertices) near(Math.hypot(v.x, v.y, v.z), 0.5, 1e-6);
    assert.deepEqual(problems(m), []);
    assert.equal(euler(m), 2);
    // Normals from the field point straight out; uvs from box mapping
    m.faceNormals.forEach((f, i) => f.forEach((n, c) => {
      const p = m.vertices[m.faces[i][c]], q = m.normals[n];
      near(q.x * p.x + q.y * p.y + q.z * p.z, 0.5, 1e-4);
    }));
    assert.equal(m.faceUVs.length, m.faces.length);
  });

  test(`${method}: a torus keeps its hole`, () => {
    const m = blobMesh([{ kind: "torus", center: { x: 0, y: 0, z: 0 }, R: 0.4, tube: 0.12 }], { method, resolution: 48 });
    assert.equal(euler(m), 0);
    near(volume(m), 2 * Math.PI ** 2 * 0.4 * 0.12 ** 2, 0.003);
    assert.deepEqual(problems(m), []);
  });
}

test("nets: two thin layers in one cell aren't stitched together", () => {
  // Two balls a hair apart (much less than a grid cell), no blend
  for (const gap of [0.001, 0.004, 0.009]) {
    const m = blobMesh([ball(-0.3 - gap / 2, 0, 0, 0.3), ball(0.3 + gap / 2, 0, 0, 0.3)], { blend: 0, resolution: 40 });
    assert.deepEqual(problems(m), [], `gap ${gap}`);
    assert.equal(euler(m), 4, `gap ${gap}: two closed balls`);
  }
  // Many shapes crossing each other
  const many = Array.from({ length: 20 }, (_, i) => ({
    kind: i % 3 ? "sphere" : "capsule", center: { x: Math.cos(i) * 0.5, y: Math.sin(i * 1.3) * 0.5, z: Math.sin(i) * 0.3 }, radius: 0.12,
    a: { x: 0, y: 0, z: 0 }, b: { x: Math.cos(i) * 0.6, y: Math.sin(i) * 0.6, z: 0 }, ra: 0.06, rb: 0.03,
  }));
  assert.deepEqual(problems(blobMesh(many)), []);
});

test("shapes melt together: a smooth join adds matter between them", () => {
  const two = [ball(-0.3, 0, 0, 0.3), ball(0.3, 0, 0, 0.3)];
  const hard = blobMesh(two, { blend: 0, resolution: 40, method: "cubes" });
  const soft = blobMesh(two, { blend: 0.2, resolution: 40, method: "cubes" });
  near(volume(hard), 2 * SPHERE * 0.027, 0.004);
  assert.ok(volume(soft) > volume(hard) + 0.005);
  assert.equal(euler(soft), 2);
});

test("subtract carves, intersect keeps the overlap", () => {
  const carved = blobMesh([ball(0, 0, 0, 0.5), { ...ball(0, 0, 0.5, 0.3), op: "subtract" }], { blend: 0, method: "cubes", resolution: 48 });
  assert.ok(volume(carved) < SPHERE * 0.125 - 0.02);
  // The old `subtract: true` works too
  const same = blobMesh([ball(0, 0, 0, 0.5), { ...ball(0, 0, 0.5, 0.3), subtract: true }], { blend: 0, method: "cubes", resolution: 48 });
  near(volume(same), volume(carved));
  // A box cut by a ball: a rounded cube
  const both = blobMesh([{ kind: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }, { ...ball(0, 0, 0, 0.65), op: "intersect" }], { blend: 0, method: "cubes", resolution: 48 });
  assert.ok(volume(both) < 1 && volume(both) > SPHERE * 0.125);
  assert.ok(Math.max(...both.vertices.map((v) => Math.abs(v.x))) <= 0.5 + 1e-6);
});

test("every kind of shape: box (rounded, turned), ellipsoid, capsule, cone, cylinder", () => {
  const box = blobMesh([{ kind: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 0.8, y: 0.4, z: 0.4 }, round: 0.05 }], { method: "cubes", resolution: 64 });
  // Rounded box: inner box, plus slabs, quarter cylinders along the edges, and a sphere's worth of corners
  const [a, b, c, r] = [0.7, 0.3, 0.3, 0.05];
  near(volume(box), a * b * c + 2 * r * (a * b + b * c + c * a) + Math.PI * r * r * (a + b + c) + SPHERE * r ** 3, 0.001);
  const turned = blobMesh([{ kind: "box", center: { x: 0, y: 0, z: 0 }, size: { x: 0.8, y: 0.1, z: 0.1 }, rot: { x: 0, y: 0, z: Math.PI / 2 } }], { method: "cubes", resolution: 64 });
  assert.ok(Math.max(...turned.vertices.map((v) => v.y)) > 0.39);
  const egg = blobMesh([{ kind: "ellipsoid", center: { x: 0, y: 0, z: 0 }, radii: { x: 0.2, y: 0.4, z: 0.2 } }], { method: "cubes", resolution: 48 });
  near(volume(egg), SPHERE * 0.2 * 0.4 * 0.2, 0.002);
  const cap = blobMesh([{ kind: "capsule", a: { x: 0, y: -0.3, z: 0 }, b: { x: 0, y: 0.3, z: 0 }, radius: 0.1 }], { method: "cubes", resolution: 48 });
  near(volume(cap), Math.PI * 0.01 * 0.6 + SPHERE * 0.001, 0.001);
  const cone = blobMesh([{ kind: "capsule", a: { x: 0, y: -0.3, z: 0 }, b: { x: 0, y: 0.3, z: 0 }, ra: 0.15, rb: 0.02 }], { method: "cubes", resolution: 48 });
  assert.ok(volume(cone) > 0 && volume(cone) < Math.PI * 0.15 ** 2 * 0.6);
  const cyl = blobMesh([{ kind: "cylinder", a: { x: 0, y: -0.3, z: 0 }, b: { x: 0, y: 0.3, z: 0 }, radius: 0.2 }], { method: "cubes", resolution: 64 });
  near(volume(cyl), Math.PI * 0.04 * 0.6, 0.002);
  for (const m of [box, turned, egg, cap, cone, cyl]) assert.deepEqual(problems(m), []);
});

test("blobField can be mixed with your own math and meshed with sdfMesh", () => {
  const body = blobField([ball(0, 0, 0, 0.4)]);
  // Ripples on the ball (not a true distance any more: no skipping)
  const field = (p) => body(p) + 0.02 * Math.sin(p.x * 30);
  const m = sdfMesh(field, { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } }, { resolution: 48, sparse: false, method: "cubes" });
  assert.ok(volume(m) > 0);
  assert.deepEqual(problems(m), []);
  // Skipping far blocks gives the same mesh for a true distance
  const plain = (p) => Math.hypot(p.x, p.y, p.z) - 0.4;
  const b = { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } };
  assert.deepEqual(sdfMesh(plain, b, { resolution: 32, sparse: true }).faces, sdfMesh(plain, b, { resolution: 32, sparse: false }).faces);
});

test("options: no normals, no uvs, another mapping, no projection", () => {
  const m = blobMesh([ball(0, 0, 0, 0.5)], { normals: false, uvs: false, project: false, resolution: 16 });
  assert.equal(m.normals, undefined);
  assert.equal(m.uvs, undefined);
  assert.ok(m.vertices.some((v) => Math.abs(Math.hypot(v.x, v.y, v.z) - 0.5) > 1e-4));
  const s = blobMesh([ball(0, 0, 0, 0.5)], { uvs: "sphere", resolution: 16 });
  // Sphere mapping: u around (past 1 at the seam, so it wraps without a stretched band)
  assert.equal(s.faceUVs.length, s.faces.length);
  assert.ok(s.uvs.every((t) => t.v >= -1e-9 && t.v <= 1 + 1e-9));
});

test("bad input", () => {
  assert.deepEqual(blobMesh([]), { vertices: [], faces: [] });
  assert.deepEqual(blobMesh([{ ...ball(0, 0, 0, 1), op: "subtract" }]), { vertices: [], faces: [] });
  assert.throws(() => blobMesh([{ kind: "pyramid" }]), /Unknown blob kind/);
  assert.throws(() => blobMesh([{ ...ball(0, 0, 0, 1), op: "melt" }]), /Unknown blob op/);
  assert.throws(() => blobMesh([ball(0, 0, 0, 1)], { method: "dual" }), /Unknown method/);
  assert.throws(() => sdfMesh(null, {}), /field must be a function/);
  assert.deepEqual(sdfMesh(() => 1, { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, { resolution: 8 }).faces, []);
});
