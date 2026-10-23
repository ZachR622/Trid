import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasRenderer, makeShape } from "../trid/index.js";

/** A 2D context that counts lineTo calls and ignores everything else. */
function fakeScene(objects) {
  const calls = { lineTo: 0 };
  const ctx = new Proxy({}, {
    get: (_, k) => (k === "lineTo" ? () => calls.lineTo++ : () => ({ addColorStop() {} })),
    set: () => true,
  });
  const scene = {
    ctx, canvas: { width: 200, height: 200 }, camera: { x: 0, y: 0, z: -2 },
    objects, color: "#fff", lineWidth: 1, background: "#000",
  };
  return { scene, calls };
}

const obj = (mesh, extra = {}) => ({ mesh, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, ...extra });
// #11: a face-only mesh (no edges) with no material
const tri = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 0, y: 0.5, z: 0 }], faces: [[0, 2, 1]] };

test("a face-only mesh without a material draws its face outlines (wireframe-only scene)", () => {
  const { scene, calls } = fakeScene([obj(tri)]);
  new CanvasRenderer().render(scene);
  assert.equal(calls.lineTo, 3);
});

test("a face-only mesh without a material draws its face outlines (next to a filled object)", () => {
  const { scene } = fakeScene([obj(tri), obj(makeShape("cube"), { material: { fill: "#f00" } })]);
  assert.doesNotThrow(() => new CanvasRenderer().render(scene));
});
