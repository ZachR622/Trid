import { test } from "node:test";
import assert from "node:assert/strict";
import { gridMesh, gridHelper, pickHit, pick, isPickable, worldToScreen, ToolManager, makeShape } from "../trid/index.js";

test("gridMesh: divisions + 1 lines each way, on the chosen plane, centered", () => {
  const g = gridMesh({ size: 2, divisions: 4 });
  assert.equal(g.edges.length, 10);
  assert.ok(g.vertices.every((v) => v.y === 0 && Math.abs(v.x) <= 1 && Math.abs(v.z) <= 1));
  assert.equal(g.faces, undefined);
  const wall = gridMesh({ plane: "xy", size: 2, divisions: 2 });
  assert.ok(wall.vertices.every((v) => v.z === 0));
  assert.ok(wall.vertices.some((v) => v.y === 1));
  assert.throws(() => gridMesh({ plane: "xx" }));
});

test("gridHelper: minor, major and axis lines, fading out, never picked", () => {
  const g = gridHelper({ size: 4, divisions: 40, major: 10, fade: false });
  assert.equal(g.pickable, false);
  const colors = new Set(g.children.map((c) => c.color));
  assert.ok(colors.has("#e8605a") && colors.has("#5f9be8")); // X and Z axes
  assert.ok(colors.has("rgba(255, 255, 255, 0.12)") && colors.has("rgba(255, 255, 255, 0.25)"));
  // 41 lines each way: 40 grid lines + 1 axis, each way
  const lines = g.children.reduce((n, c) => n + c.mesh.edges.length, 0);
  assert.equal(lines, 82);
  const major = g.children.find((c) => c.color === "rgba(255, 255, 255, 0.25)");
  assert.equal(major.mesh.edges.length, 8); // at -20, -10, 10, 20 cells, each way

  const faded = gridHelper({ size: 4, divisions: 8 });
  assert.ok(faded.children.length > 4); // several fade steps
  assert.ok(faded.children.some((c) => /rgba\(255, 255, 255, 0\.0\d+\)/.test(c.color)));
  // Nothing past the circle that touches the edges
  for (const c of faded.children) for (const v of c.mesh.vertices) assert.ok(Math.hypot(v.x, v.z) <= 2 * Math.SQRT2);

  const custom = gridHelper({ plane: "xy", axes: { y: "#ffff00" }, fade: false });
  assert.ok(custom.children.some((c) => c.color === "#ffff00"));
  assert.ok(!gridHelper({ axes: false, fade: false }).children.some((c) => c.color === "#e8605a"));
});

test("objects with pickable: false (and their children) are skipped by pick and pickHit", () => {
  const canvas = { width: 400, height: 400, clientWidth: 400, style: {}, addEventListener() {}, removeEventListener() {} };
  const grid = gridHelper({ fade: false });
  const box = { mesh: makeShape("cube", { size: 0.2 }), pos: { x: 0, y: 0, z: 1 } };
  const scene = { canvas, camera: { x: 0, y: 1, z: -3, pitch: 0.3 }, objects: [grid, box] };
  scene.tools = new ToolManager(scene);
  const onGrid = worldToScreen({ x: 1, y: 0, z: 0 }, scene.camera, 400, 400);
  assert.equal(pickHit(scene, onGrid.x, onGrid.y), null);
  assert.equal(pick(scene, onGrid.x, onGrid.y), null);
  assert.equal(isPickable(grid.children[0]), false);
  assert.equal(isPickable(box), true);
});
