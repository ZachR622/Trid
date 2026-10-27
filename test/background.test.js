import { test } from "node:test";
import assert from "node:assert/strict";
import { clear, CanvasRenderer, makeShape } from "../trid/index.js";

/** A 2D context that records clears and fills, and reads colors back like a canvas does. */
function recordingCtx() {
  const calls = [];
  let fillStyle = "#000000";
  const named = { transparent: "rgba(0, 0, 0, 0)" };
  const ctx = new Proxy({}, {
    get: (_, k) => {
      if (k === "fillStyle") return fillStyle;
      if (k === "calls") return calls;
      if (k === "clearRect" || k === "fillRect") return (...args) => calls.push([k, fillStyle, ...args]);
      return () => ({ addColorStop() {} });
    },
    set: (_, k, v) => {
      if (k === "fillStyle" && typeof v === "string") fillStyle = named[v] ?? v;
      return true;
    },
  });
  return ctx;
}

const kinds = (ctx) => ctx.calls.map(([k, style]) => (k === "fillRect" ? `fill ${style}` : "clear"));

test("clear() empties the canvas, then fills it with a visible color", () => {
  const ctx = recordingCtx();
  clear(ctx, 100, 50, "#141414");
  assert.deepEqual(kinds(ctx), ["clear", "fill #141414"]);
  assert.deepEqual(ctx.calls[0].slice(2), [0, 0, 100, 50]);
});

test("clear() leaves the canvas see-through for transparent, null or no color", () => {
  for (const color of ["transparent", " Transparent ", null, undefined, ""]) {
    const ctx = recordingCtx();
    clear(ctx, 100, 50, color);
    assert.deepEqual(kinds(ctx), ["clear"], String(color));
  }
});

test("a half see-through color is painted over the emptied canvas", () => {
  const ctx = recordingCtx();
  clear(ctx, 100, 50, "rgba(0, 0, 0, 0.5)");
  assert.deepEqual(kinds(ctx), ["clear", "fill rgba(0, 0, 0, 0.5)"]);
});

const scene = (ctx, background, objects) => ({
  ctx, canvas: { width: 120, height: 80 }, camera: { x: 0, y: 0, z: -2 }, objects,
  color: "#ffffff", lineWidth: 1, background, lights: [{ type: "ambient", intensity: 1 }], post: [],
});
const at = (mesh, extra = {}) => ({ mesh, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, ...extra });

test("the canvas renderer clears a see-through scene each frame instead of painting it", () => {
  for (const background of ["transparent", null]) {
    const ctx = recordingCtx();
    const s = scene(ctx, background, [at(makeShape("cube"))]);
    const r = new CanvasRenderer();
    r.render(s);
    r.render(s);
    assert.deepEqual(kinds(ctx).filter((k) => k === "clear"), ["clear", "clear"], String(background));
    assert.ok(!kinds(ctx).some((k) => k.startsWith("fill")), "no background fill");
  }
});

test("effects see a null background as transparent, not black", () => {
  const ctx = recordingCtx();
  let seen = null;
  // An effect that only looks at what the surface tells it
  const probe = { name: "probe", glsl: "", uniforms: {}, canvas: (color, surface) => ((seen = surface.background), color) };
  const s = scene(ctx, null, [at(makeShape("cube"), { material: { fill: "#ff0000", effects: [probe] } })]);
  new CanvasRenderer().render(s);
  assert.deepEqual(seen, [0, 0, 0, 0]);
});
