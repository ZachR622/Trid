import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FOV, project, worldToScreen } from "../trid/index.js";

test("the default field of view is 50° and project() uses it", () => {
  assert.ok(Math.abs(DEFAULT_FOV - (50 * Math.PI) / 180) < 1e-12);
  const p = { x: 0, y: Math.tan(DEFAULT_FOV / 2), z: 1 }; // on the top edge of the view
  assert.ok(Math.abs(project(p).y - 1) < 1e-12);
  assert.deepEqual(project(p), project(p, DEFAULT_FOV));
});

test("a camera without fov uses the default; an explicit fov still wins", () => {
  const point = { x: 0, y: 0.5, z: 0 };
  const top = (camera) => worldToScreen(point, camera, 400, 400).y;
  assert.equal(top({ z: -2 }), top({ z: -2, fov: DEFAULT_FOV }));
  // The old 90° view: half as far from the middle, for a point at this distance
  const mid = 200, narrow = mid - top({ z: -2 }), wide = mid - top({ z: -2, fov: Math.PI / 2 });
  assert.ok(Math.abs(narrow / wide - 1 / Math.tan(DEFAULT_FOV / 2)) < 1e-9);
});
