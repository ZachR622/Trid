import { test } from "node:test";
import assert from "node:assert/strict";
import { booleanMesh, unionMesh, subtractMesh, intersectMesh, makeShape, transformMesh, isClosed } from "../trid/index.js";

/** A closed mesh's volume (faces clockwise from outside, as Trid's). */
function volume(m) {
  let v = 0;
  for (const f of m.faces) {
    const a = m.vertices[f[0]];
    for (let i = 1; i < f.length - 1; i++) {
      const b = m.vertices[f[i]], c = m.vertices[f[i + 1]];
      v += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
    }
  }
  return Math.abs(v);
}
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const cube = (x = 0, y = 0, z = 0, size = 1) => transformMesh(makeShape("cube", { size }), { pos: { x, y, z } });

test("two overlapping cubes: union, subtract and intersect have the right volume and are closed", () => {
  const a = cube(), b = cube(0.5, 0.5, 0.5);
  const u = unionMesh(a, b), s = subtractMesh(a, b), i = intersectMesh(a, b);
  close(volume(u), 1.875);
  close(volume(s), 0.875);
  close(volume(i), 0.125);
  for (const m of [u, s, i]) assert.ok(isClosed(m));
  // Same thing through booleanMesh, with Blender's name too
  close(volume(booleanMesh(a, b, "difference")), 0.875);
  assert.throws(() => booleanMesh(a, b, "xor"), /unknown operation/);
});

test("faces lying on each other: touching, flush and identical boxes", () => {
  close(volume(unionMesh(cube(), cube(1))), 2); // side by side: one long box
  assert.equal(unionMesh(cube(), cube(1)).faces.length, 10); // the shared wall is gone, no extra faces
  close(volume(subtractMesh(cube(), cube(0.5))), 0.5); // a notch flush with three sides
  close(volume(unionMesh(cube(), cube())), 1);
  close(volume(intersectMesh(cube(), cube())), 1);
  assert.equal(subtractMesh(cube(), cube()).faces.length, 0);
  assert.equal(intersectMesh(cube(), cube(3)).faces.length, 0); // apart: nothing in common
});

test("a cube and a sphere: subtract + intersect add up to the cube; all closed", () => {
  const c = cube(), s = makeShape("sphere", { r: 0.6 });
  const minus = subtractMesh(c, s), both = intersectMesh(c, s);
  close(volume(minus) + volume(both), 1, 1e-6);
  assert.ok(isClosed(minus) && isClosed(both) && isClosed(unionMesh(c, s)));
});

test("a list of cutters is applied one after the other; objects are placed first", () => {
  const plate = makeShape("box", { w: 1, h: 0.1, d: 0.4 });
  const hole = makeShape("cylinder", { r: 0.06, h: 0.3 });
  const drilled = subtractMesh(plate, [-0.3, 0, 0.3].map((x) => ({ mesh: hole, pos: { x, y: 0, z: 0 } })));
  assert.ok(isClosed(drilled));
  const holeArea = volume(hole) / 0.3; // the cylinder's cross-section
  close(volume(drilled), 0.04 - 3 * holeArea * 0.1, 1e-6);
});

test("materials: the cutter's faces keep theirs, numbered after the first mesh's; objects get `materials`", () => {
  const a = { mesh: makeShape("sphere", { r: 0.5 }), material: { fill: "#f00" } };
  const b = { mesh: makeShape("sphere", { r: 0.3 }), pos: { x: 0.4, y: 0, z: 0 }, material: { fill: "#00f" } };
  const r = subtractMesh(a, b);
  assert.deepEqual([...new Set(r.faceMaterials)].sort(), [0, 1]);
  assert.deepEqual(r.materials.map((m) => m.fill), ["#f00", "#00f"]);
  const index = subtractMesh(a, b, { materials: "index" });
  assert.deepEqual([...new Set(index.faceMaterials)], [0]);
  assert.equal(index.materials, undefined);
  // A cube's six sides keep their numbers; the cutter's come after
  const box = subtractMesh(cube(), transformMesh(makeShape("sphere", { r: 0.3 }), { pos: { x: 0.5, y: 0.5, z: 0.5 } }));
  assert.ok(box.faceMaterials.every((k) => k >= 0 && k <= 6));
  assert.ok(box.faceMaterials.includes(6));
});

test("texture coordinates are kept, also on cut faces", () => {
  const r = subtractMesh(cube(), cube(0.5, 0.5, 0.5));
  assert.ok(r.uvs.length > 0);
  assert.equal(r.faceUVs.length, r.faces.length);
  assert.ok(r.faceUVs.every((t, f) => t && t.length === r.faces[f].length && t.every((k) => r.uvs[k] && Number.isFinite(r.uvs[k].u))));
});

test("random shapes at random places: closed results, and volumes that add up", () => {
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const kinds = [
    () => makeShape("cube", { size: 0.8 }), () => makeShape("sphere", { r: 0.5 }), () => makeShape("cylinder", { r: 0.3, h: 1 }),
    () => makeShape("torus", { R: 0.4, tube: 0.15 }), () => makeShape("box", { w: 0.9, h: 0.3, d: 0.5, radius: 0.05 }),
  ];
  for (let n = 0; n < 12; n++) {
    const a = kinds[Math.floor(rnd() * kinds.length)]();
    const b = transformMesh(kinds[Math.floor(rnd() * kinds.length)](), {
      pos: { x: rnd() - 0.5, y: rnd() - 0.5, z: rnd() - 0.5 }, rot: { x: rnd() * 6, y: rnd() * 6, z: rnd() * 6 },
    });
    const u = unionMesh(a, b), d = subtractMesh(a, b), i = intersectMesh(a, b);
    close(volume(u) + volume(i), volume(a) + volume(b), 1e-5);
    close(volume(d) + volume(i), volume(a), 1e-5);
    for (const m of [u, d, i]) assert.ok(!m.faces.length || isClosed(m), `case ${n} not closed`);
  }
});
