import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Scene, CanvasRenderer, makeShape, sceneLights, lightAt, lightLevels, rangeFade, defaultLights,
  DEFAULT_LIGHT, DEFAULT_AMBIENT, toon, gradient,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
/** Parses hex colors only (enough for these tests) */
const rgba = (css) => [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16) / 255).concat(1);

/** A 2D context that understands hex / rgba fill colors and records every fill. */
function recordingCtx() {
  const fills = [];
  let style = "#000000";
  const ctx = new Proxy({}, {
    get: (_, k) => {
      if (k === "fillStyle") return style;
      if (k === "fill") return () => fills.push(style);
      return () => ({ addColorStop() {} });
    },
    set: (_, k, v) => {
      if (k === "fillStyle") style = v;
      return true;
    },
  });
  return { ctx, fills };
}

function sceneWith(objects, extra = {}) {
  const { ctx, fills } = recordingCtx();
  const scene = {
    ctx, canvas: { width: 200, height: 200 }, camera: { x: 0, y: 0, z: -3 },
    objects, color: "#ffffff", lineWidth: 1, background: "#000000", ...extra,
  };
  return { scene, fills };
}
const cube = (material) => ({ mesh: makeShape("cube"), pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, material });

test("the default lights give the same brightness as before (ambient + (1 - ambient) × diffuse)", () => {
  const L = sceneLights({ light: DEFAULT_LIGHT, ambient: DEFAULT_AMBIENT }, rgba);
  const len = Math.hypot(DEFAULT_LIGHT.x, DEFAULT_LIGHT.y, DEFAULT_LIGHT.z);
  for (const n of [{ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }]) {
    const d = Math.max(0, (n.x * DEFAULT_LIGHT.x + n.y * DEFAULT_LIGHT.y + n.z * DEFAULT_LIGHT.z) / len);
    const c = lightAt(L, n, { x: 0, y: 0, z: 0 });
    for (const x of c) near(x, DEFAULT_AMBIENT + (1 - DEFAULT_AMBIENT) * d);
    const { light, diffuse } = lightLevels(c, L.ambientLevel);
    near(light, DEFAULT_AMBIENT + (1 - DEFAULT_AMBIENT) * d);
    near(diffuse, d);
  }
});

test("lights add up, with their color and intensity; ambient ones light every side", () => {
  const L = sceneLights({ lights: [
    { type: "ambient", color: "#0000ff", intensity: 0.5 },
    { type: "directional", direction: { x: 0, y: 2, z: 0 }, color: "#ff0000", intensity: 2 },
    { type: "directional", direction: { x: 0, y: 1, z: 0 }, color: "#00ff00", enabled: false },
  ] }, rgba);
  assert.deepEqual(lightAt(L, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }), [2, 0, 0.5]);
  assert.deepEqual(lightAt(L, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }), [0, 0, 0.5]);
  assert.deepEqual(L.mainDir, { x: 0, y: 1, z: 0 });
});

test("point lights shine from their position and fade out at their range", () => {
  const L = sceneLights({ lights: [{ type: "point", position: { x: 0, y: 2, z: 0 }, range: 4 }] }, rgba);
  const up = { x: 0, y: 1, z: 0 };
  near(lightAt(L, up, { x: 0, y: 0, z: 0 })[0], rangeFade(2, 4)); // straight below: faces it fully
  near(rangeFade(2, 4), (1 - 4 / 16) ** 2);
  assert.equal(lightAt(L, up, { x: 0, y: -3, z: 0 })[0], 0); // 5 away: past the range
  assert.equal(lightAt(L, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 0 })[0], 0); // facing away
  assert.equal(rangeFade(100, 0), 1); // no range: no fading
});

test("Scene: lights by default, light / ambient as shortcuts to them", () => {
  const canvas = { getContext: () => ({}) };
  const s = new Scene(canvas, { ambient: 0.3 });
  assert.equal(s.lights.length, 2);
  near(s.lights[1].intensity, 0.7);
  assert.equal(s.ambient, 0.3);
  s.light.x = 5; // the direction object is the light's
  assert.equal(s.lights[1].direction.x, 5);
  assert.equal(DEFAULT_LIGHT.x, -0.5); // the default isn't changed
  s.light = { x: 0, y: 1, z: 0 };
  assert.deepEqual(s.lights[1].direction, { x: 0, y: 1, z: 0 });
  s.ambient = 0.1;
  assert.equal(s.lights[0].intensity, 0.1);

  const mine = { x: 1, y: 1, z: 1 };
  assert.equal(new Scene(canvas, { light: mine }).light, mine);

  const only = new Scene(canvas, { lights: [{ type: "point", position: { x: 0, y: 0, z: 0 } }] });
  assert.equal(only.light, null);
  assert.equal(only.ambient, 0);
  only.ambient = 0.2;
  assert.equal(only.lights[0].type, "ambient");
  assert.deepEqual(only.post, []);
  assert.equal(defaultLights().length, 2);
});

test("CanvasRenderer: the default light looks like before, a colored light tints faces", () => {
  // The front face (normal -z, toward the camera) with the default light
  const { scene, fills } = sceneWith([cube({ fill: "#ffffff" })]);
  new CanvasRenderer().render(scene);
  const len = Math.hypot(DEFAULT_LIGHT.x, DEFAULT_LIGHT.y, DEFAULT_LIGHT.z);
  const level = Math.round((DEFAULT_AMBIENT + (1 - DEFAULT_AMBIENT) * (0.8 / len)) * 255);
  assert.ok(fills.includes(`rgba(${level}, ${level}, ${level}, 1)`), fills.join(" "));

  // A red light from the camera's side, no ambient
  const red = sceneWith([cube({ fill: "#ffffff" })], {
    lights: [{ type: "directional", direction: { x: 0, y: 0, z: -1 }, color: "#ff0000" }],
  });
  new CanvasRenderer().render(red.scene);
  assert.ok(red.fills.includes("rgba(255, 0, 0, 1)"), red.fills.join(" "));
});

test("CanvasRenderer: effects get lightColor; toon and gradient keep the light's color", () => {
  const seen = [];
  const spy = { name: "spy", glsl: "", canvas: (c, s) => (seen.push(s.lightColor.slice()), c) };
  const { scene, fills } = sceneWith([cube({ fill: "#ffffff", effects: [toon({ steps: 2 }), spy] })], {
    lights: [{ type: "directional", direction: { x: 0, y: 0, z: -1 }, color: "#00ff00" }],
  });
  new CanvasRenderer().render(scene);
  assert.ok(seen.some((c) => c[0] === 0 && c[1] === 1 && c[2] === 0));
  assert.ok(fills.includes("rgba(0, 255, 0, 1)"), fills.join(" "));

  const g = gradient({ from: "#ffffff", to: "#ffffff" });
  const lit = sceneWith([cube({ fill: "#ffffff", effects: [g] })], {
    lights: [{ type: "directional", direction: { x: 0, y: 0, z: -1 }, color: "#0000ff" }],
  });
  new CanvasRenderer().render(lit.scene);
  assert.ok(lit.fills.includes("rgba(0, 0, 255, 1)"), lit.fills.join(" "));
});
