// Tools not covered elsewhere (fly camera, FPS meter, hover highlight), the
// texture source helpers, and loading and saving files, with small stand-ins
// for the browser (window, fetch, document).
import { test } from "node:test";
import assert from "node:assert/strict";

const listeners = new Map();
globalThis.window ??= {
  addEventListener: (k, f) => listeners.set(k, f),
  removeEventListener: (k) => listeners.delete(k),
};
globalThis.location ??= { href: "http://example.test/models/" };

const T = await import("../trid/index.js");
const {
  FlyCamera, FpsMeter, HoverHighlight, cameraForward, makeShape, textureReady, textureSize, textureIsLive,
  textureVersion, updateTexture, readOBJFile, loadOBJ, exportModel, download, DEFAULT_FAR, MAX_LIGHTS,
} = T;

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const key = (code, target = {}) => ({ code, target, preventDefault() {} });

test("FlyCamera: WASD moves along the view (Shift faster), dragging looks around, pitch stops short of straight up", () => {
  const fly = new FlyCamera({ speed: 2, fastMultiplier: 3, lookSpeed: 0.01 });
  fly.attach();
  assert.ok(listeners.has("keydown") && listeners.has("keyup"));
  const scene = { camera: { x: 0, y: 0, z: 0, yaw: 0.4, pitch: 0.2 } };
  const f = cameraForward(scene.camera);

  fly._onKeyDown(key("KeyW"));
  fly.update(0.5, scene); // 2 units/s for half a second
  near(scene.camera.x, f.x);
  near(scene.camera.y, f.y);
  near(scene.camera.z, f.z);

  fly._onKeyDown(key("ShiftLeft"));
  const before = { ...scene.camera };
  fly.update(0.5, scene);
  near(Math.hypot(scene.camera.x - before.x, scene.camera.y - before.y, scene.camera.z - before.z), 3);
  fly._onKeyUp(key("KeyW"));
  fly._onKeyUp(key("ShiftLeft"));

  // Typing in a text field doesn't fly
  fly._onKeyDown(key("KeyD", { tagName: "INPUT" }));
  const still = { ...scene.camera };
  fly.update(1, scene);
  assert.deepEqual(scene.camera, still);

  // Dragging: right turns right, down looks down; never past straight up
  assert.equal(fly.pointerDown({ button: 0 }), true);
  assert.equal(fly.pointerDown({ button: 2 }), false);
  fly.pointerMove({ dx: 10, dy: 5 }, scene);
  near(scene.camera.yaw, 0.5);
  near(scene.camera.pitch, 0.15);
  fly.pointerMove({ dx: 0, dy: -10000 }, scene);
  assert.ok(scene.camera.pitch < Math.PI / 2 && scene.camera.pitch > 1.5);

  fly._onKeyDown(key("KeyW"));
  fly.detach();
  assert.ok(!listeners.has("keydown"));
  const parked = { ...scene.camera };
  fly.update(1, scene); // keys were let go on detach
  assert.deepEqual(scene.camera, parked);
});

test("FpsMeter counts frames over its interval (not the loop's first, 0-long one) and draws in its corner", () => {
  const fps = new FpsMeter({ interval: 0.5, corner: "bottom-right" });
  fps.update(0);
  for (let i = 0; i < 31; i++) fps.update(1 / 60); // just past the half second
  assert.equal(fps.fps, 60);
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k === "fillText" ? (...a) => calls.push([...a, t.textAlign, t.textBaseline]) : t[k]), set: (t, k, v) => ((t[k] = v), true) });
  fps.draw(ctx, { canvas: { width: 300, height: 100 } });
  assert.deepEqual(calls, [["60 FPS", 292, 92, "right", "bottom"]]);
});

test("HoverHighlight colors what's under the pointer, without touching shared materials, and puts it back", () => {
  const shared = { fill: "#123456" };
  const box = { mesh: makeShape("cube", { size: 1 }), pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: "#aaaaaa", material: shared };
  const other = { ...box, pos: { x: 5, y: 0, z: 0 }, material: shared };
  const scene = { camera: { z: -3 }, canvas: { width: 200, height: 200 }, objects: [box, other] };
  const changes = [];
  const hover = new HoverHighlight({ color: "#ff0000", onChange: (o) => changes.push(o) });
  hover.pointerMove({ x: 100, y: 100 }, scene);
  assert.equal(hover.hovered, box);
  assert.equal(box.color, "#ff0000");
  assert.equal(box.material.fill, "#ff0000");
  assert.equal(shared.fill, "#123456"); // a copy was swapped in
  assert.equal(other.material, shared);
  hover.pointerLeave();
  assert.equal(box.color, "#aaaaaa");
  assert.equal(box.material, shared);
  assert.deepEqual(changes, [box, null]);
  // hoverable: false is ignored
  box.hoverable = false;
  hover.pointerMove({ x: 100, y: 100 }, scene);
  assert.equal(hover.hovered, null);
});

test("texture sources: ready when they have a size; images when loaded; versions count updates", () => {
  assert.equal(textureReady(null), false);
  assert.equal(textureReady({ width: 0, height: 4 }), false);
  assert.equal(textureReady({ width: 4, height: 4 }), true);
  globalThis.HTMLImageElement ??= class {};
  const img = Object.assign(new HTMLImageElement(), { complete: false, naturalWidth: 8, naturalHeight: 2 });
  assert.equal(textureReady(img), false);
  img.complete = true;
  assert.equal(textureReady(img), true);
  assert.deepEqual(textureSize(img), { w: 8, h: 2 });
  assert.deepEqual(textureSize({ videoWidth: 640, videoHeight: 360 }), { w: 640, h: 360 });
  assert.deepEqual(textureSize({ width: 3, height: 5 }), { w: 3, h: 5 });

  const canvas = { width: 4, height: 4 };
  assert.equal(textureIsLive(canvas), false);
  assert.equal(textureIsLive(canvas, { liveTexture: true }), true);
  assert.equal(textureVersion(canvas), 0);
  updateTexture(canvas);
  updateTexture(canvas);
  assert.equal(textureVersion(canvas), 2);
});

const OBJ = `mtllib box.mtl
v 0 0 0
v 1 0 0
v 0 1 0
usemtl red
f 1 2 3
`;

test("readOBJFile reads a picked or dropped file", async () => {
  const mesh = await readOBJFile(new Blob([OBJ]), { fit: 2 });
  assert.equal(mesh.vertices.length, 3);
  assert.equal(mesh.faces.length, 1);
  assert.deepEqual(mesh.materialNames, ["red"]);
  const xs = mesh.vertices.map((v) => v.x);
  near(Math.max(...xs) - Math.min(...xs), 2); // fitted
});

test("loadOBJ downloads a file, and its .mtl next to it with { materials: true }", async () => {
  const asked = [];
  const files = { "http://example.test/models/box.obj": OBJ, "http://example.test/models/box.mtl": "newmtl red\nKd 1 0 0\n" };
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const full = new URL(url, location.href).href; // like a browser: relative to the page
    asked.push(full);
    const body = files[full];
    return { ok: body != null, status: body != null ? 200 : 404, text: async () => body };
  };
  try {
    const mesh = await loadOBJ("box.obj", { materials: true });
    assert.deepEqual(asked, ["http://example.test/models/box.obj", "http://example.test/models/box.mtl"]);
    assert.deepEqual(mesh.materials, [{ name: "red", fill: "#ff0000" }]);
    await assert.rejects(loadOBJ("missing.obj"), /Could not load missing\.obj \(404\)/);
  } finally {
    globalThis.fetch = saved;
  }
});

test("exportModel gives the .obj and .mtl files, linked by name", async () => {
  const files = await exportModel({ name: "box", mesh: makeShape("cube"), material: { name: "paint", fill: "#336699" } }, { name: "crate" });
  assert.deepEqual(files.map((f) => f.name), ["crate.obj", "crate.mtl"]);
  assert.match(files[0].data, /^mtllib crate\.mtl$/m);
  assert.match(files[0].data, /^usemtl paint$/m);
  assert.match(files[1].data, /^newmtl paint$/m);
  assert.match(files[1].data, /^Kd 0\.2 0\.4 0\.6/m);
});

test("download saves text or a file through a hidden link, named as asked", async () => {
  const clicked = [];
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => ({ style: {}, click() { clicked.push({ href: this.href, name: this.download }); }, remove() {} }),
    body: { append() {} },
  };
  try {
    await download("v 0 0 0\n", "point.obj");
    await download(Promise.resolve(new Blob(["png"])), "shot.png");
    assert.deepEqual(clicked.map((c) => c.name), ["point.obj", "shot.png"]);
    assert.ok(clicked.every((c) => c.href.startsWith("blob:")));
  } finally {
    globalThis.document = saved;
  }
});

test("renderer limits: how far WebGL draws by default, and how many lights count", () => {
  assert.equal(DEFAULT_FAR, 1000);
  assert.equal(MAX_LIGHTS, 8);
});

test("makeTexture paints texturePixels' pixels onto a canvas (yours is marked as changed)", () => {
  const put = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img, x, y) => put.push({ img, x, y }),
    }),
  };
  const before = textureVersion(canvas);
  assert.equal(T.makeTexture("wood", { size: 16, seed: 2, canvas }), canvas);
  assert.equal(canvas.width, 16);
  assert.equal(canvas.height, 16);
  assert.deepEqual([...put[0].img.data], [...T.texturePixels("wood", { size: 16, seed: 2 }).data]);
  assert.equal(textureVersion(canvas), before + 1);
});

test("screenshot draws the scene again at the asked size, and always gives the scene its canvas back", async () => {
  const made = [];
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => ({ canvas: c }), toBlob: (done, type, q) => done(new Blob([`${c.width}x${c.height} ${type} ${q}`])) };
      made.push(c);
      return c;
    },
  };
  try {
    const sizes = [];
    let toolsDrawn = 0;
    const own = { width: 100, height: 50 }, ownCtx = {};
    const scene = {
      canvas: own, ctx: ownCtx,
      renderer: { render: (s) => sizes.push([s.canvas.width, s.canvas.height]) },
      tools: { draw: () => toolsDrawn++ },
    };
    const blob = await T.screenshot(scene, { width: 400, height: 200.4, type: "image/jpeg", quality: 0.5, tools: false });
    assert.equal(await blob.text(), "400x200 image/jpeg 0.5");
    assert.deepEqual(sizes, [[400, 200]]);
    assert.equal(toolsDrawn, 0);
    assert.equal(scene.canvas, own);
    assert.equal(scene.ctx, ownCtx);
    // Same size by default, tools included; the canvas comes back even when drawing fails
    await T.screenshot(scene);
    assert.deepEqual(sizes.at(-1), [100, 50]);
    assert.equal(toolsDrawn, 1);
    scene.renderer.render = () => {
      throw new Error("lost context");
    };
    assert.throws(() => T.screenshot(scene), /lost context/);
    assert.equal(scene.canvas, own);
    assert.equal(scene.ctx, ownCtx);
  } finally {
    globalThis.document = saved;
  }
});
