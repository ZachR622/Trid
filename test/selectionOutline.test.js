import { test } from "node:test";
import assert from "node:assert/strict";

/** A 2D context that records drawImage calls (with globalAlpha) and ignores the rest. */
function recorder() {
  const log = [];
  const state = { globalAlpha: 1, globalCompositeOperation: "source-over" };
  const stack = [];
  const fns = {
    drawImage: (img, x, y) => log.push({ x, y, alpha: state.globalAlpha }),
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { ctx, log };
}
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder().ctx }) };

const { SelectionOutline, TransformGizmo, makeShape } = await import("../trid/index.js");

function scene(objects) {
  return { canvas: { width: 200, height: 100 }, camera: { z: -3 }, objects, lineWidth: 1 };
}
const cube = (z = 0) => ({ mesh: makeShape("cube", { size: 0.5 }), pos: { x: 0, y: 0, z }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, material: { fill: "#888" } });

test("SelectionOutline draws nothing without targets, or when they're behind the camera", () => {
  const box = cube(), behind = cube(-10);
  const s = scene([box, behind]);
  const { ctx, log } = recorder();
  new SelectionOutline().draw(ctx, s);
  new SelectionOutline({ targets: [behind] }).draw(ctx, s);
  const hidden = new SelectionOutline({ targets: [box] });
  hidden.visible = false;
  hidden.draw(ctx, s);
  assert.equal(log.length, 0);
});

test("SelectionOutline: the faint outline of the whole selection, then the solid one of its visible part", () => {
  const box = cube();
  const { ctx, log } = recorder();
  new SelectionOutline({ targets: [box] }).draw(ctx, scene([box]));
  assert.deepEqual(log.map((d) => d.alpha), [0.35, 1]);
  // Drawn only around the object, not over the whole canvas
  assert.ok(log[0].x > 0 && log[0].y > 0);

  const solid = recorder();
  new SelectionOutline({ targets: [box], hidden: 0 }).draw(solid.ctx, scene([box]));
  assert.deepEqual(solid.log.map((d) => d.alpha), [1]);
});

test("SelectionOutline targets can be a function; TransformGizmo({ outline }) follows its targets", () => {
  const a = cube(), b = cube(1);
  let list = [a];
  const sel = new SelectionOutline({ targets: () => list });
  assert.deepEqual(sel.current(), [a]);
  list = [b, null];
  assert.deepEqual(sel.current(), [b]);

  assert.equal(new TransformGizmo().outline, null);
  const gizmo = new TransformGizmo({ targets: [a], outline: { color: "#ff0000", width: 3 } });
  assert.equal(gizmo.outline.color, "#ff0000");
  assert.equal(gizmo.outline.width, 3);
  gizmo.targets = [b];
  assert.deepEqual(gizmo.outline.current(), [b]);
});
