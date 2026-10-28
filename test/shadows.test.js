import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shadowOptions, shadowFlag, shadowFrame, pointShadowFar, findGround, flattenOnGround, flattenFromPoint,
  DEFAULT_SHADOWS, POINT_SHADOW_SIZE, MAX_SHADOWS, sceneLights, makeShape, worldObjects, CanvasRenderer,
} from "../trid/index.js";

const rgba = () => [1, 1, 1, 1];
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("shadowOptions fills in defaults and keeps settings in range", () => {
  assert.deepEqual(shadowOptions(true), { ...DEFAULT_SHADOWS });
  const o = shadowOptions({ size: 99999, softness: -1, bias: 2, ground: 0.5 });
  assert.equal(o.size, 8192);
  assert.equal(o.softness, 0);
  assert.equal(o.bias, 2);
  assert.equal(o.ground, 0.5);
});

test("sceneLights: lights with shadows cast them, directional ones first; `shadow` is the first directional", () => {
  const L = sceneLights({
    lights: [
      { type: "ambient", intensity: 0.3 },
      { type: "point", position: { x: 0, y: 1, z: 0 }, shadows: true },
      { type: "directional", direction: { x: 0, y: 2, z: 0 } },
      { type: "directional", direction: { x: 1, y: 1, z: 0 }, shadows: { softness: 3 } },
      { type: "directional", direction: { x: -1, y: 1, z: 0 }, shadows: true },
    ],
  }, rgba);
  assert.equal(L.shadow.index, 2); // in `lights`, which skips the ambient one
  assert.deepEqual(L.shadows.map((sh) => [sh.index, sh.point]), [[2, false], [3, false], [0, true]]);
  assert.equal(L.shadows[2].size, POINT_SHADOW_SIZE);
  assert.deepEqual(L.shadows[2].pos, { x: 0, y: 1, z: 0 });
  assert.equal(L.shadow.softness, 3);
  close(L.shadow.dir.x, Math.SQRT1_2);
  assert.equal(sceneLights({ lights: [{ type: "directional", direction: { x: 0, y: 1, z: 0 } }] }, rgba).shadow, null);
});

test("shadowFlag: false on the object or any group above it", () => {
  const child = { mesh: makeShape("cube") };
  const group = { children: [child] };
  worldObjects([group]);
  assert.equal(shadowFlag(child, "castShadow"), true);
  group.castShadow = false;
  assert.equal(shadowFlag(child, "castShadow"), false);
  assert.equal(shadowFlag(child, "receiveShadow"), true);
});

test("shadowFrame fits the casters in the -1..1 box, depth growing away from the light", () => {
  const a = { mesh: makeShape("cube", { size: 1 }), pos: { x: 2, y: 0, z: 0 } };
  const b = { mesh: makeShape("cube", { size: 1 }), pos: { x: -2, y: 1, z: 3 } };
  const objs = worldObjects([a, b]);
  const dir = { x: 0, y: 1, z: 0 };
  const { matrix: m, radius } = shadowFrame(objs, dir);
  assert.ok(radius > 0);
  const apply = (p) => [0, 1, 2].map((r) => m[r] * p.x + m[4 + r] * p.y + m[8 + r] * p.z + m[12 + r]);
  for (const o of objs) {
    for (const v of o.mesh.vertices) {
      const q = apply({ x: v.x + o.pos.x, y: v.y + o.pos.y, z: v.z + o.pos.z });
      assert.ok(q.every((x) => x >= -1 - 1e-9 && x <= 1 + 1e-9), q.join(", "));
    }
  }
  // Lower (farther from a light above) means deeper
  assert.ok(apply({ x: 0, y: -0.5, z: 1 })[2] > apply({ x: 0, y: 1, z: 1 })[2]);
  assert.equal(shadowFrame([], dir), null);
});

test("findGround picks the level with the most upward flat area", () => {
  const floor = { mesh: makeShape("plane", { size: 4 }), pos: { x: 0, y: -0.3, z: 0 } };
  const box = { mesh: makeShape("cube", { size: 0.5 }), pos: { x: 0, y: 0, z: 0 } };
  close(findGround(worldObjects([box, floor])), -0.3);
  close(findGround(worldObjects([box])), 0.25); // the cube's top
  assert.equal(findGround([]), null);
});

test("flattenOnGround: along the light, cut at the ground", () => {
  const dir = { x: 0, y: 1, z: 0 };
  const flat = flattenOnGround([{ x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 2, z: 1 }], dir, 0);
  assert.deepEqual(flat.map((p) => [p.x, p.y, p.z]), [[0, 0, 0], [1, 0, 0], [0, 0, 1]]);
  const slanted = flattenOnGround([{ x: 0, y: 1, z: 0 }], { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 0);
  close(slanted[0].x, -1); // light from +x falls toward -x
  assert.deepEqual(flattenOnGround([{ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 1 }], dir, 0), []);
  // Half under the ground: only the part above is kept
  const cut = flattenOnGround([{ x: 0, y: -1, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], dir, 0);
  assert.ok(cut.every((p) => p.y === 0));
  assert.ok(cut.some((p) => Math.abs(p.x - 1) < 1e-9)); // where the edge crosses the ground
});

test("CanvasRenderer: ground shadows are drawn between the floor and the rest, only from above", () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
  const run = (camera, lights) => {
    const r = new CanvasRenderer();
    let call = null;
    r._groundShadow = (c, w, h, polys, floor, L, sun, ground) => (call = { polys: polys.length, floor: floor.length, ground });
    const obj = (mesh, y) => ({ mesh, pos: { x: 0, y, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, material: { fill: "#888" } });
    r.render({
      ctx, canvas: { width: 100, height: 100 }, camera, color: "#fff", lineWidth: 1, background: "#000",
      lights, objects: [obj(makeShape("plane", { size: 4 }), 0), obj(makeShape("cube", { size: 0.5 }), 0.5)],
    });
    return call;
  };
  const sun = [{ type: "ambient", intensity: 0.3 }, { type: "directional", direction: { x: -0.5, y: 1, z: -0.3 }, shadows: true }];
  const above = { y: 2, z: -3, pitch: -0.5 };
  const call = run(above, sun);
  assert.equal(call.ground, 0);
  assert.ok(call.polys > 0 && call.floor > 0);
  assert.equal(run({ y: -2, z: -3, pitch: 0.5 }, sun), null); // from under the floor
  assert.equal(run(above, [{ type: "directional", direction: { x: 0, y: 1, z: 0 } }]), null); // no shadows asked
});

test("sceneLights: at most two lights of each kind cast shadows", () => {
  const sun = { type: "directional", direction: { x: 0, y: 1, z: 0 }, shadows: true };
  const bulb = { type: "point", position: { x: 0, y: 1, z: 0 }, shadows: true };
  const L = sceneLights({ lights: [sun, sun, sun, bulb, bulb, bulb] }, rgba);
  assert.deepEqual(L.shadows.map((sh) => sh.index), [0, 1, 3, 4]);
  assert.deepEqual(MAX_SHADOWS, { directional: 2, point: 2 });
  assert.equal(L.lights.length, 6); // the others still light
});

test("pointShadowFar: the light's range, or the far side of the farthest caster", () => {
  const ball = worldObjects([{ mesh: makeShape("sphere", { r: 0.5 }), pos: { x: 3, y: 0, z: 0 } }]);
  assert.equal(pointShadowFar(ball, { x: 0, y: 0, z: 0 }, 2), 2);
  const far = pointShadowFar(ball, { x: 0, y: 0, z: 0 }, 0);
  assert.ok(far >= 3.5 && far < 3.6, String(far));
});

test("flattenFromPoint: shadows spread out from below the light; nothing from above it", () => {
  const bulb = { x: 0, y: 2, z: 0 };
  // A point halfway down lands twice as far out
  const [p] = flattenFromPoint([{ x: 1, y: 1, z: 0 }], bulb, 0);
  close(p.x, 2);
  close(p.y, 0);
  assert.deepEqual(flattenFromPoint([{ x: 1, y: 3, z: 0 }, { x: 2, y: 3, z: 0 }, { x: 1, y: 3, z: 1 }], bulb, 0), []);
  // Crossing the light's height: only the part below it is kept
  const cut = flattenFromPoint([{ x: 1, y: 1, z: 0 }, { x: 1, y: 3, z: 0 }, { x: 1, y: 1, z: 1 }], bulb, 0);
  assert.ok(cut.length >= 3);
  assert.ok(cut.every((q) => Number.isFinite(q.x) && q.y === 0));
});

test("CanvasRenderer: one shadow shape list per light, suns and bulbs", () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => ((t[k] = v), true) });
  const r = new CanvasRenderer();
  let polys = null;
  r._groundShadow = (c, w, h, p) => (polys = p);
  const obj = (mesh, y) => ({ mesh, pos: { x: 0, y, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, material: { fill: "#888" } });
  r.render({
    ctx, canvas: { width: 100, height: 100 }, camera: { y: 2, z: -3, pitch: -0.5 }, color: "#fff", lineWidth: 1, background: "#000",
    lights: [
      { type: "directional", direction: { x: -0.5, y: 1, z: -0.3 }, shadows: true },
      { type: "point", position: { x: 0.5, y: 1.5, z: 0 }, shadows: true },
      { type: "point", position: { x: 0, y: -1, z: 0 }, shadows: true }, // under the floor: no shadow on it
    ],
    objects: [obj(makeShape("plane", { size: 4 }), 0), obj(makeShape("cube", { size: 0.5 }), 0.5)],
  });
  assert.equal(polys.length, 2);
  assert.ok(polys.every((list) => list.length > 0));
});
