import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasRenderer, vignette, bloom, grade, grain, postPasses, activePost, runCanvasPost, makeShape } from "../trid/index.js";

const ctx = () => new Proxy({ filter: undefined }, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: () => true });

test("built-in post effects have GLSL; bloom is several passes, ending at full size", () => {
  for (const e of [vignette(), grade(), grain()]) {
    assert.deepEqual(postPasses(e).map((p) => p.scale), [1]);
    assert.match(e.glsl, /vec4 post\(vec4 color, Frame f\)/);
    assert.equal(typeof e.canvas, "function");
  }
  const b = postPasses(bloom());
  assert.equal(b.length, 4);
  assert.equal(b.at(-1).scale, 1);
  assert.ok(b[0].scale < 1);
  assert.deepEqual(postPasses({ canvas() {} }), []);
});

test("activePost skips effects turned off and empty entries", () => {
  const a = vignette(), b = grade();
  b.enabled = false;
  assert.deepEqual(activePost([a, null, b]), [a]);
  assert.deepEqual(activePost(undefined), []);
});

test("runCanvasPost runs canvas versions in order, with the frame's size and the uniforms", () => {
  const calls = [];
  const fx = (name) => ({ name, uniforms: { uK: name }, canvas: (c, f, u) => calls.push([u.uK, f.width, f.height]) });
  const off = { ...fx("off"), enabled: false };
  const scene = { ctx: ctx(), canvas: { width: 30, height: 20 }, background: "#000" };
  runCanvasPost(scene, [fx("a"), off, { glsl: "x" }, fx("b")], performance.now());
  assert.deepEqual(calls, [["a", 30, 20], ["b", 30, 20]]);
});

test("CanvasRenderer runs post effects after drawing (also for wireframe-only scenes)", () => {
  let n = 0;
  const post = [{ canvas: () => n++ }];
  const obj = (material) => ({ mesh: makeShape("cube"), pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, material });
  const base = { ctx: ctx(), canvas: { width: 50, height: 50 }, camera: { z: -3 }, color: "#fff", lineWidth: 1, background: "#000", post };
  new CanvasRenderer().render({ ...base, objects: [obj()] });
  new CanvasRenderer().render({ ...base, objects: [obj({ fill: "#f00" })] });
  assert.equal(n, 2);
});
