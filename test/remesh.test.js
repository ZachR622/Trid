import { test } from "node:test";
import assert from "node:assert/strict";
import {
  remeshMesh, sculptMesh, makeShape, transformMesh, cloneMesh, meshBounds, isClosed, validateMesh, pointInMesh,
} from "../trid/index.js";

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

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

/** Longest side of a mesh's faces. */
function longestEdge(m) {
  let l = 0;
  for (const f of m.faces) for (let k = 0; k < f.length; k++) {
    const a = m.vertices[f[k]], b = m.vertices[f[(k + 1) % f.length]];
    l = Math.max(l, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  return l;
}

test("a box becomes many small, even faces, closed, the same size and volume", () => {
  const box = makeShape("cube", { size: 1 });
  const m = remeshMesh(box, { resolution: 32 });
  assert.ok(m.faces.length > 1000);
  assert.ok(isClosed(m));
  assert.deepEqual(errors(m), []);
  near(volume(m), OUTWARD * 1, 0.01);
  const b = meshBounds(m);
  for (const k of ["x", "y", "z"]) near(b.size[k], 1, 0.01);
  // Faces about a cell across (1/32), none much bigger
  assert.ok(longestEdge(m) < (1 / 32) * 2.5, `${longestEdge(m)}`);
  // Comes with smooth normals and texture coordinates
  assert.equal(m.normals.length, m.vertices.length);
  assert.equal(m.faceUVs.length, m.faces.length);
  // The input is untouched
  assert.equal(box.vertices.length, 8);
});

/** Holes and edges shared by more than two faces (isClosed matches edges by position, so it doesn't see these). */
const defects = (m) => validateMesh(m).filter((p) => p.kind === "open-edge" || p.kind === "many-faces-edge");

test("no holes and no edges shared by 3 faces: flat sides on grid points, sharp rims, parts sharing a side", () => {
  // Each of these broke at some resolutions before: a box's sides land on grid points at 12, 24 and 48,
  // a cone's rim is sharper than a right angle, and these two boxes share two sides
  const shapes = {
    cube: () => makeShape("cube", { size: 1 }),
    cone: () => makeShape("cone", { r: 0.3, h: 0.8 }),
    cylinder: () => makeShape("cylinder", { r: 0.3, h: 1 }),
    shared: () => [makeShape("box", { w: 1, h: 0.2, d: 0.5 }), transformMesh(makeShape("box", { w: 0.2, h: 1, d: 0.2 }), { pos: { x: 0.4, y: 0.4, z: 0 } })],
  };
  for (const [name, make] of Object.entries(shapes)) {
    for (const resolution of [12, 24, 48]) {
      const m = remeshMesh(make(), { resolution });
      assert.deepEqual(defects(m).map((p) => p.message), [], `${name} at ${resolution}`);
    }
  }
});

test("size sets the cell size; resolution is capped", () => {
  const m = remeshMesh(makeShape("cube", { size: 1 }), { size: 0.1 });
  assert.ok(longestEdge(m) < 0.25);
  assert.ok(longestEdge(m) > 0.05);
  const coarse = remeshMesh(makeShape("cube", { size: 1 }), { resolution: 8 });
  assert.ok(coarse.faces.length < remeshMesh(makeShape("cube", { size: 1 }), { resolution: 16 }).faces.length);
});

test("overlapping pieces melt into one solid with nothing inside", () => {
  const a = makeShape("cube", { size: 1 });
  const b = transformMesh(makeShape("cube", { size: 1 }), { pos: { x: 0.5, y: 0, z: 0 } });
  const m = remeshMesh([a, b], { resolution: 48 });
  assert.ok(isClosed(m));
  near(volume(m), OUTWARD * 1.5, 0.01);
  // No wall left where the first box's side was (x = 0.5): a ray along x inside crosses the surface only at the ends
  const crossings = m.faces.filter((f) => {
    const xs = f.map((i) => m.vertices[i].x);
    return Math.min(...xs) < 0.5 && Math.max(...xs) > 0.5 && f.every((i) => Math.abs(m.vertices[i].y) < 0.45 && Math.abs(m.vertices[i].z) < 0.45);
  });
  assert.equal(crossings.length, 0);
  // Also from one merged mesh (pieces found by themselves), and from scene objects placed by their transform
  const merged = remeshMesh({ mesh: a, children: [] }, { resolution: 24 });
  assert.ok(isClosed(merged));
  const placed = remeshMesh([{ mesh: makeShape("cube", { size: 1 }), pos: { x: 3, y: 0, z: 0 } }], { resolution: 24 });
  near(meshBounds(placed).center.x, 3, 0.01);
});

test("a piece turned inside out is fixed first; an open sheet becomes a thin slab", () => {
  const inside = makeShape("cube", { size: 1 });
  inside.faces = inside.faces.map((f) => [...f].reverse());
  delete inside.faceUVs;
  const m = remeshMesh(inside, { resolution: 24 });
  near(volume(m), OUTWARD * 1, 0.02);
  const sheet = remeshMesh(makeShape("plane", { size: 1, div: 4 }), { resolution: 32 });
  assert.ok(isClosed(sheet));
  const b = meshBounds(sheet);
  near(b.size.x, 1 + 2 / 32, 0.02);
  near(b.size.y, 2 / 32, 0.01);
});

test("round shapes and holes are kept; points inside stay inside", () => {
  const torus = makeShape("torus", { R: 0.3, tube: 0.1 });
  const m = remeshMesh(torus, { resolution: 48 });
  assert.ok(isClosed(m));
  assert.ok(!pointInMesh(m, { x: 0, y: 0, z: 0 }), "the hole stays open");
  assert.ok(pointInMesh(m, { x: 0.3, y: 0, z: 0 }));
  near(volume(m), volume(torus), Math.abs(volume(torus)) * 0.05);
});

test("a remeshed box can be sculpted anywhere", () => {
  const box = makeShape("cube", { size: 1 });
  const before = cloneMesh(box);
  sculptMesh(box, "inflate", { center: { x: 0, y: 0.5, z: 0 }, radius: 0.3, strength: 0.1 });
  // The plain box has no point in the middle of its top: nothing moves there
  assert.deepEqual(box.vertices, before.vertices);
  const clay = remeshMesh(box, { resolution: 32 });
  sculptMesh(clay, "inflate", { center: { x: 0, y: 0.5, z: 0 }, radius: 0.3, strength: 0.1 });
  near(meshBounds(clay).max.y, 0.6, 0.01);
});

test("nothing in, nothing out", () => {
  assert.deepEqual(remeshMesh([]), { vertices: [], faces: [] });
  assert.deepEqual(remeshMesh({ vertices: [{ x: 0, y: 0, z: 0 }], faces: [] }), { vertices: [], faces: [] });
});
