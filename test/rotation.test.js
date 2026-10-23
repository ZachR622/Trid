import { test } from "node:test";
import assert from "node:assert/strict";
import { rotateXYZ, rng, applyTransformOp, eulerFromMat, matFromAxisAngle, matFromEuler, mulMat, mulVec } from "../trid/index.js";

const close = (a, b, eps = 1e-6) => {
  for (const k of ["x", "y", "z"]) assert.ok(Math.abs(a[k] - b[k]) < eps, `${k}: ${a[k]} ≉ ${b[k]}`);
};

test("eulerFromMat gives angles that rotateXYZ draws the same way", () => {
  const p = { x: 0.3, y: -1.2, z: 0.7 };
  const random = rng(5);
  for (let i = 0; i < 200; i++) {
    const rot = { x: (random() - 0.5) * 6, y: (random() - 0.5) * 3, z: (random() - 0.5) * 6 };
    close(rotateXYZ(p, eulerFromMat(matFromEuler(rot))), rotateXYZ(p, rot));
  }
  // Straight along Y (gimbal lock) still works
  const locked = { x: 0.4, y: Math.PI / 2, z: 0.9 };
  close(rotateXYZ(p, eulerFromMat(matFromEuler(locked))), rotateXYZ(p, locked));
});

test("matFromAxisAngle is right-handed, and mulMat applies b first", () => {
  const z90 = matFromAxisAngle({ x: 0, y: 0, z: 1 }, Math.PI / 2);
  const x90 = matFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
  close(mulVec(z90, { x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  const v = { x: 0.2, y: 0.5, z: -0.3 };
  close(mulVec(mulMat(z90, x90), v), mulVec(z90, mulVec(x90, v)));
});

test("rotate: the position orbits the center and the orientation turns", () => {
  const t = { pos: { x: 2, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const r = applyTransformOp(t, { mode: "rotate", axis: { x: 0, y: 0, z: 1 }, angle: Math.PI / 2, center: { x: 1, y: 0, z: 0 } });
  close(r.pos, { x: 1, y: 1, z: 0 });
  close(rotateXYZ({ x: 1, y: 0, z: 0 }, r.rot), { x: 0, y: 1, z: 0 });
  assert.deepEqual(t.pos, { x: 2, y: 0, z: 0 }); // input unchanged
});

test("scale: uniform about a center, or along the most aligned local axis", () => {
  const t = { pos: { x: 1, y: 1, z: 0 }, rot: { x: 0, y: 0, z: Math.PI / 2 }, scale: { x: 1, y: 2, z: 3 } };
  const u = applyTransformOp(t, { mode: "scale", axis: null, factor: 2, center: { x: 0, y: 0, z: 0 } });
  close(u.pos, { x: 2, y: 2, z: 0 });
  close(u.scale, { x: 2, y: 4, z: 6 });
  // Turned 90° around Z, the local Y axis points along world X
  const a = applyTransformOp(t, { mode: "scale", axis: { x: 1, y: 0, z: 0 }, factor: 3, center: { x: 0, y: 0, z: 0 } });
  close(a.pos, { x: 3, y: 1, z: 0 });
  close(a.scale, { x: 1, y: 6, z: 3 });
});

test("move adds the delta; unknown modes throw", () => {
  const t = { pos: { x: 1, y: 2, z: 3 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  close(applyTransformOp(t, { mode: "move", delta: { x: 1, y: -2, z: 0.5 } }).pos, { x: 2, y: 0, z: 3.5 });
  assert.throws(() => applyTransformOp(t, { mode: "spin" }));
});
