import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasRenderer, vignette, bloom, grade, grain, outline, postPasses, activePost, runCanvasPost, wantsGeometry, maskedObjects, meshEdges, makeShape, GEOMETRY_GLSL, FRAME_GLSL, DEFAULT_OUTLINE_CREASE } from "../trid/index.js";

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

test("outline() reads the scene's geometry and also draws on the canvas renderer", () => {
  const o = outline({ color: "#ff0000", width: 3 });
  assert.equal(o.geometry, true);
  assert.equal(o.contour, true);
  assert.ok(wantsGeometry(o));
  assert.ok(!wantsGeometry(vignette()));
  assert.ok(!wantsGeometry({ geometry: true, canvas() {} })); // no GLSL: nothing to read it
  const passes = postPasses(o);
  assert.equal(passes.length, 3); // find the lines, then widen them across and down
  assert.match(passes[0].glsl, /depthAt\(/);
  assert.match(passes[0].glsl, /normalAt\(/);
  assert.match(passes[2].glsl, /source\(f\.uv\)/);
  assert.deepEqual(o.uniforms, { uColor: "#ff0000", uWidth: 3, uCreaseAngle: DEFAULT_OUTLINE_CREASE, uDepth: 1 });
  assert.equal(outline({ creases: false }).uniforms.uCreaseAngle, 180);
  assert.match(GEOMETRY_GLSL, /float depthAt\(vec2 uv\)/);
  assert.match(FRAME_GLSL, /float far;/);
});

test("maskedObjects covers the listed objects and their children; null without a list", () => {
  const child = {}, group = { children: [child, { children: [] }] }, other = {};
  const set = maskedObjects({ objects: [group] });
  assert.ok(set.has(group) && set.has(child) && !set.has(other));
  assert.equal(set.size, 3);
  assert.equal(maskedObjects(outline()), null);
});

test("meshEdges: a cube has 12 edges, each between two faces, even with vertices repeated per side", () => {
  const edges = meshEdges(makeShape("cube"));
  assert.equal(edges.length, 12);
  assert.ok(edges.every((e) => e.f1 >= 0 && e.f2 >= 0 && e.f1 !== e.f2));
  // A lone square: four open borders
  const quad = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 1, 2, 3]] };
  assert.deepEqual(meshEdges(quad).map((e) => e.f2), [-1, -1, -1, -1]);
});

/** A 2D context that counts the segments stroked in one color. */
function strokeCounter(color) {
  let path = 0, count = 0;
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 1, filter: undefined };
  const fns = {
    beginPath: () => (path = 0),
    moveTo: () => path++,
    stroke: () => { if (state.strokeStyle === color) count += path; },
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { ctx, count: () => count };
}

test("CanvasRenderer draws outline() as silhouette and crease lines", () => {
  const draw = (rot, opts, objects) => {
    const { ctx, count } = strokeCounter("#ff0000");
    const cube = { mesh: makeShape("cube"), pos: { x: 0, y: 0, z: 0 }, rot, scale: { x: 1, y: 1, z: 1 }, material: { fill: "#888888" } };
    const fx = outline({ color: "#ff0000", ...opts, objects: objects?.(cube) });
    new CanvasRenderer().render({ ctx, canvas: { width: 100, height: 100 }, camera: { z: -4 }, color: "#fff", lineWidth: 1, background: "#000", objects: [cube], post: [fx] });
    return count();
  };
  const facing = { x: 0, y: 0, z: 0 };
  assert.equal(draw(facing, {}), 4); // one side seen: its border
  const corner = { x: 0.5, y: 0.7, z: 0 }; // three sides seen
  assert.equal(draw(corner, {}), 9); // 6 around + 3 creases between the sides
  assert.equal(draw(corner, { creases: false }), 6);
  assert.equal(draw(corner, {}, () => [{}]), 0); // not in `objects`
  assert.equal(draw(corner, {}, (cube) => [cube]), 9);
});
