// What the canvas renderer actually draws: order, culling, clipping, light,
// smooth gradients, outlines, see-through faces, split faces and textures,
// checked on a 2D context that records every path it fills or strokes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasRenderer, makeShape, worldToScreen, drawWireframe, drawInstance, materialsOf } from "../trid/index.js";

globalThis.DOMMatrix ??= class {
  constructor([a, b, c, d, e, f]) {
    Object.assign(this, { a, b, c, d, e, f });
  }
};

/** A 2D context that records fills (with their paths and styles), strokes, gradients and patterns. */
function recorder() {
  const log = { fills: [], strokes: [], gradients: 0, patterns: [] };
  let path = [], sub = null;
  const state = { fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, globalAlpha: 1, globalCompositeOperation: "source-over", filter: "none" };
  const stack = [];
  const fns = {
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
    beginPath: () => {
      path = [];
      sub = null;
    },
    moveTo: (x, y) => path.push((sub = [{ x, y }])),
    lineTo: (x, y) => (sub ? sub.push({ x, y }) : path.push((sub = [{ x, y }]))),
    closePath: () => {},
    fill: () => log.fills.push({ style: state.fillStyle, op: state.globalCompositeOperation, path: path.map((s) => s.slice()) }),
    stroke: () => log.strokes.push({ style: state.strokeStyle, width: state.lineWidth, path: path.map((s) => s.slice()) }),
    createLinearGradient: () => {
      log.gradients++;
      return { gradient: true, addColorStop() {} };
    },
    createPattern: (src) => {
      const p = { src, setTransform: (m) => log.patterns.push(m) };
      return p;
    },
  };
  const ctx = new Proxy(state, {
    get: (t, k) => (k in fns ? fns[k] : k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { ctx, log };
}

const v = (x, y, z) => ({ x, y, z });
const place = (mesh, extra = {}) => ({ mesh, pos: v(0, 0, 0), rot: v(0, 0, 0), scale: v(1, 1, 1), ...extra });

/** Renders objects with the canvas renderer and returns what was drawn. */
function draw(objects, { camera = { z: -3 }, lights, renderer = new CanvasRenderer(), size = 200 } = {}) {
  const { ctx, log } = recorder();
  renderer.render({ ctx, canvas: { width: size, height: size }, camera, color: "#ffffff", lineWidth: 1, background: "#000000", objects, ...(lights ? { lights } : {}) });
  return log;
}

/** A triangle whose front faces `n` (its corners turn the right way), centered at `c`. */
function facing(n, c = v(0, 0, 0), size = 0.5) {
  const l = Math.hypot(n.x, n.y, n.z);
  const u = { x: n.x / l, y: n.y / l, z: n.z / l };
  const a = Math.abs(u.x) < 0.9 ? v(1, 0, 0) : v(0, 1, 0);
  const cross = (p, q) => v(p.y * q.z - p.z * q.y, p.z * q.x - p.x * q.z, p.x * q.y - p.y * q.x);
  const t1 = cross(a, u), t2 = cross(u, t1);
  const at = (s, t) => v(c.x + (t1.x * s + t2.x * t) * size, c.y + (t1.y * s + t2.y * t) * size, c.z + (t1.z * s + t2.z * t) * size);
  // Counter-clockwise around n: Newell's normal is n, the side Trid draws
  return { vertices: [at(-0.5, -0.5), at(0.5, -0.5), at(0, 0.6)], faces: [[0, 1, 2]], uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 1 }], faceUVs: [[0, 1, 2]] };
}

const solid = (fill) => ({ fill, shade: false });
const filledWith = (log, css) => log.fills.filter((f) => f.style === css);

test("faces are drawn back to front: a far cube before a near one", () => {
  const far = place(makeShape("cube", { size: 1 }), { pos: v(0.3, 0, 3), material: solid("#ff0000") });
  const nearCube = place(makeShape("cube", { size: 1 }), { pos: v(0, 0, 0), material: solid("#0000ff") });
  const log = draw([nearCube, far], { camera: { x: 0.5, y: 0.8, z: -3, pitch: -0.2 } });
  const red = log.fills.map((f, i) => (f.style === "rgba(255, 0, 0, 1)" ? i : -1)).filter((i) => i >= 0);
  const blue = log.fills.map((f, i) => (f.style === "rgba(0, 0, 255, 1)" ? i : -1)).filter((i) => i >= 0);
  assert.ok(red.length && blue.length);
  assert.ok(Math.max(...red) < Math.min(...blue));
});

test("faces turned away are skipped, unless the material is doubleSided; mirrored objects too", () => {
  const cube = makeShape("cube", { size: 1 });
  // Straight on: only the front side shows (the others are edge-on or behind)
  assert.equal(filledWith(draw([place(cube, { material: solid("#ff0000") })]), "rgba(255, 0, 0, 1)").length, 1);
  // From a corner: three sides
  const corner = { x: -2, y: 2, z: -2, yaw: Math.PI / 4, pitch: -0.6 };
  assert.equal(filledWith(draw([place(cube, { material: solid("#ff0000") })], { camera: corner }), "rgba(255, 0, 0, 1)").length, 3);
  assert.equal(filledWith(draw([place(cube, { material: { ...solid("#ff0000"), doubleSided: true } })], { camera: corner }), "rgba(255, 0, 0, 1)").length, 6);
  // Mirrored: its faces are reversed, so it still shows its outside
  assert.equal(filledWith(draw([place(cube, { scale: v(-1, 1, 1), material: solid("#ff0000") })], { camera: corner }), "rgba(255, 0, 0, 1)").length, 3);
});

test("faces crossing the near plane are cut there; faces behind the camera aren't drawn", () => {
  // A big floor the camera stands right above: it reaches behind the camera
  const floor = place({ vertices: [v(-5, 0, -5), v(-5, 0, 5), v(5, 0, 5), v(5, 0, -5)], faces: [[0, 1, 2, 3]] }, { material: solid("#00ff00") });
  const log = draw([floor], { camera: { y: 1, z: 0, pitch: -0.5 } });
  const fills = filledWith(log, "rgba(0, 255, 0, 1)");
  assert.equal(fills.length, 1);
  const pts = fills[0].path[0];
  assert.ok(pts.length >= 3 && pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  // All behind: nothing
  const behind = place(makeShape("cube", { size: 0.5 }), { pos: v(0, 0, -6), material: solid("#00ff00") });
  assert.equal(filledWith(draw([behind]), "rgba(0, 255, 0, 1)").length, 0);
});

test("flat light: a face turned to the light gets its full color, one turned away only the ambient", () => {
  const light = v(-0.5, 1, -0.8); // the default light comes from here
  const toLight = draw([place(facing(light), { material: { fill: "#c86432" } })]);
  assert.equal(toLight.fills[0].style, "rgba(200, 100, 50, 1)"); // 0.25 ambient + 0.75 light = 1
  const away = facing(v(1, -0.6, -0.2)); // still faces the camera, but not the light
  assert.equal(draw([place(away, { material: { fill: "#c86432" } })]).fills[0].style, "rgba(50, 25, 13, 1)"); // × 0.25
  // shade: false keeps the fill as it is
  assert.equal(draw([place(away, { material: solid("#c86432") })]).fills[0].style, "rgba(200, 100, 50, 1)");
  // Colored light tints it
  const red = draw([place(facing(light), { material: { fill: "#ffffff" } })], { lights: [{ type: "directional", direction: light, color: "#ff0000" }] });
  assert.equal(red.fills[0].style, "rgba(255, 0, 0, 1)");
});

test("smooth shading fills triangles with gradients; flat shading doesn't", () => {
  const sphere = makeShape("sphere", { r: 0.5 });
  assert.ok(draw([place(sphere, { material: { fill: "#8ab4f8", smooth: true } })]).gradients > 10);
  assert.equal(draw([place(sphere, { material: { fill: "#8ab4f8" } })]).gradients, 0);
});

test("wireframe materials stroke the faces' outlines in the object's color; plain faces get a hairline in their own", () => {
  const cube = makeShape("cube", { size: 1 });
  const lines = draw([place(cube, { color: "#123456", lineWidth: 3, material: { ...solid("#ff0000"), wireframe: true } })]);
  const outline = lines.strokes.filter((s) => s.style === "#123456");
  assert.equal(outline.length, 1);
  assert.equal(outline[0].width, 3);
  // Without wireframe: a 1-pixel stroke in the fill color hides gaps between faces
  const plain = draw([place(cube, { material: solid("#ff0000") })]);
  assert.deepEqual(plain.strokes.map((s) => [s.style, s.width]), [["rgba(255, 0, 0, 1)", 1]]);
  // See-through fills don't get it (it would show as a darker line)
  const glass = draw([place(cube, { material: solid("rgba(255, 0, 0, 0.5)") })]);
  assert.equal(glass.fills.length, 1);
  assert.equal(glass.strokes.length, 0);
});

test("maxFaceSize splits big faces so they sort better, keeping only the real outline", () => {
  const quad = { vertices: [v(-1, -1, 0), v(-1, 1, 0), v(1, 1, 0), v(1, -1, 0)], faces: [[0, 1, 2, 3]] };
  const once = draw([place(quad, { material: { ...solid("#ff0000"), doubleSided: true } })]);
  const split = draw([place(quad, { material: { ...solid("#ff0000"), doubleSided: true, wireframe: true } })], { renderer: new CanvasRenderer({ maxFaceSize: 0.2 }) });
  assert.equal(once.fills.length, 1);
  assert.ok(split.fills.length > 20, `${split.fills.length} pieces`);
  // The outline strokes are only the quad's own edges: 4 of them in all
  const edges = split.strokes.filter((s) => s.style === "#ffffff").flatMap((s) => s.path).length;
  assert.ok(edges >= 4 && edges < split.fills.length, `${edges} outline segments`);
});

test("textures: each corner's texture coordinate lands exactly on its corner on screen", () => {
  const image = { width: 64, height: 32 }; // anything with a size is a texture source
  const tri = facing(v(0, 0, -1), v(0.1, 0.05, 0));
  const camera = { z: -3 }, size = 200;
  const log = draw([place(tri, { material: { texture: image, shade: false } })], { camera, size });
  assert.equal(log.patterns.length, 1);
  const m = log.patterns[0];
  tri.vertices.forEach((p, k) => {
    const s = worldToScreen(p, camera, size, size);
    const t = tri.uvs[k];
    const U = t.u * image.width, V = (1 - t.v) * image.height; // image rows go down
    assert.ok(Math.abs(m.a * U + m.c * V + m.e - s.x) < 1e-6);
    assert.ok(Math.abs(m.b * U + m.d * V + m.f - s.y) < 1e-6);
  });
  // A tint multiplies the image; white leaves it
  const tinted = draw([place(tri, { material: { texture: image, fill: "#ff8000", shade: false } })]);
  assert.ok(tinted.fills.some((f) => f.op === "multiply" && f.style === "#ff8000"));
  assert.ok(!log.fills.some((f) => f.op === "multiply"));
});

test("drawWireframe and drawInstance connect the projected points edge by edge", () => {
  const { ctx, log } = recorder();
  const pts = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)];
  drawWireframe(ctx, pts, [[0, 1], [1, 2, 3]], "#abcdef", 2);
  // [0, 1] is one segment; [1, 2, 3] a closed loop of three
  const segments = log.strokes.flatMap((s) => s.path).reduce((n, sub) => n + sub.length - 1, 0);
  assert.equal(segments, 4);
  assert.ok(log.strokes.every((s) => s.style === "#abcdef" && s.width === 2));

  const cube = place(makeShape("cube", { size: 1 }));
  const r = recorder();
  drawInstance(r.ctx, cube, { z: -3 }, 200, 200, "#00ff00", 1);
  const drawn = r.log.strokes.flatMap((s) => s.path).reduce((n, sub) => n + sub.length - 1, 0);
  assert.equal(drawn, 12); // a cube's edges
});

test("materialsOf: one material, a list, or none (a wireframe)", () => {
  const m = { fill: "#fff" };
  assert.deepEqual(materialsOf({ material: m }), [m]);
  assert.deepEqual(materialsOf({ material: [m, m] }), [m, m]);
  assert.equal(materialsOf({}), null);
  assert.equal(materialsOf({ material: [] }), null);
});
