// Bugs #6 (canvas textures uploaded every frame) and #7 (GPU memory never freed),
// with the real WebGLRenderer on a fake WebGL context that counts what it's asked to do.
import { test } from "node:test";
import assert from "node:assert/strict";

/** A fake WebGL context: every call works; uploads and frees are counted. */
function fakeGL() {
  const count = { texImage2D: 0, createBuffer: 0, deleteBuffer: 0, createTexture: 0, deleteTexture: 0, generateMipmap: 0, drawArrays: 0 };
  const calls = { models: [], frontFace: [] };
  const special = {
    uniformMatrix4fv: (loc, transpose, m) => calls.models.push([...m]),
    frontFace: (mode) => calls.frontFace.push(mode),
    getParameter: () => 4096,
    getAttribLocation: () => 0,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    isContextLost: () => false,
    getExtension: () => null,
  };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in special) return special[k];
      if (k in count) return () => (count[k]++, {});
      if (typeof k === "string" && /^[A-Z_0-9]+$/.test(k)) return k; // constants
      return () => ({});
    },
  });
  return { gl, count, calls };
}

/** A 2D context that keeps fillStyle (parseColor reads it back) and ignores drawing. */
function fakeCtx() {
  const store = { fillStyle: "#000000" };
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

class FakeCanvas {
  constructor(w = 0, h = 0) { this.width = w; this.height = h; this.style = {}; }
  addEventListener() {}
  getContext(kind) { return kind === "2d" ? fakeCtx() : current.gl; }
}
class FakeVideo { constructor() { this.videoWidth = 64; this.videoHeight = 64; this.readyState = 4; } }
globalThis.HTMLCanvasElement = FakeCanvas;
globalThis.HTMLVideoElement = FakeVideo;
globalThis.document = { createElement: () => new FakeCanvas() };

let current = fakeGL();
const { WebGLRenderer, makeShape, updateTexture, worldMatrix, outline } = await import("../trid/index.js");

function setup(opts) {
  current = fakeGL();
  const renderer = new WebGLRenderer(opts);
  const scene = {
    ctx: fakeCtx(), canvas: new FakeCanvas(200, 100), camera: { x: 0, y: 0, z: -3 },
    objects: [], color: "#ffffff", lineWidth: 1, background: "#000000",
  };
  const add = (o) => (scene.objects.push({ pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, ...o }), scene.objects.at(-1));
  const frames = (n) => { for (let i = 0; i < n; i++) renderer.render(scene); };
  return { renderer, scene, add, frames, count: current.count, calls: current.calls };
}

// --- #6 ----------------------------------------------------------------------

test("#6: a canvas painted once is uploaded once, with mipmaps", () => {
  const { add, frames, count } = setup();
  add({ mesh: makeShape("cube"), material: { texture: new FakeCanvas(256, 256) } });
  frames(60);
  assert.equal(count.texImage2D, 1);
  assert.equal(count.generateMipmap, 1);
});

test("#6: updateTexture uploads it once more, on the next frame", () => {
  const { add, frames, count } = setup();
  const canvas = new FakeCanvas(64, 64);
  add({ mesh: makeShape("cube"), material: { texture: canvas } });
  add({ mesh: makeShape("sphere"), material: { texture: canvas } }); // shared: still one upload
  frames(10);
  updateTexture(canvas);
  frames(10);
  assert.equal(count.texImage2D, 2);
});

test("#6: liveTexture: true uploads every frame; videos are live unless liveTexture: false", () => {
  const live = setup();
  live.add({ mesh: makeShape("cube"), material: { texture: new FakeCanvas(64, 64), liveTexture: true } });
  live.frames(10);
  assert.equal(live.count.texImage2D, 10);
  assert.equal(live.count.generateMipmap, 0); // no mipmaps for live textures

  const video = setup();
  video.add({ mesh: makeShape("cube"), material: { texture: new FakeVideo() } });
  video.frames(10);
  assert.equal(video.count.texImage2D, 10);

  const frozen = setup();
  frozen.add({ mesh: makeShape("cube"), material: { texture: new FakeVideo(), liveTexture: false } });
  frozen.frames(10);
  assert.equal(frozen.count.texImage2D, 1);
});

// --- #7 ----------------------------------------------------------------------

test("#7: replacing a mesh every frame doesn't grow GPU memory", () => {
  const { renderer, add, frames, count } = setup({ releaseAfter: 30 });
  const obj = add({ mesh: makeShape("sphere"), material: { fill: "#f00" } });
  for (let i = 0; i < 600; i++) {
    obj.mesh = makeShape("sphere");
    frames(1);
  }
  // Only the meshes drawn in the last ~30-90 frames are kept
  assert.ok(renderer.memory.meshes <= 91, `${renderer.memory.meshes} meshes kept`);
  assert.ok(renderer.memory.buffers <= 91);
  assert.ok(count.deleteBuffer >= 500);
});

test("#7: replacing a texture every frame doesn't grow GPU memory", () => {
  const { renderer, add, frames, count } = setup({ releaseAfter: 30 });
  const obj = add({ mesh: makeShape("cube"), material: { texture: new FakeCanvas(64, 64) } });
  for (let i = 0; i < 600; i++) {
    obj.material.texture = new FakeCanvas(64, 64);
    frames(1);
  }
  assert.ok(renderer.memory.textures <= 91, `${renderer.memory.textures} textures kept`);
  assert.ok(count.deleteTexture >= 500);
});

test("#7: what's still drawn is never freed; Infinity keeps everything", () => {
  const kept = setup({ releaseAfter: 30 });
  kept.add({ mesh: makeShape("cube"), material: { texture: new FakeCanvas(64, 64) } });
  kept.frames(600);
  assert.equal(kept.count.deleteBuffer, 0);
  assert.equal(kept.count.deleteTexture, 0);
  assert.equal(kept.count.texImage2D, 1);

  const never = setup({ releaseAfter: Infinity });
  const obj = never.add({ mesh: makeShape("cube"), material: { fill: "#f00" } });
  for (let i = 0; i < 200; i++) { obj.mesh = makeShape("cube"); never.frames(1); }
  assert.equal(never.count.deleteBuffer, 0);
  assert.equal(never.renderer.memory.meshes, 200);
});

test("#7: release() frees a mesh or texture now; it's sent again if drawn again", () => {
  const { renderer, add, frames, count } = setup();
  const tex = new FakeCanvas(64, 64);
  const obj = add({ mesh: makeShape("cube"), material: { texture: tex } });
  frames(1);
  assert.deepEqual(renderer.memory, { meshes: 1, buffers: 1, textures: 1 });
  renderer.release(obj.mesh);
  renderer.release(tex);
  assert.deepEqual(renderer.memory, { meshes: 0, buffers: 0, textures: 0 });
  frames(1);
  assert.deepEqual(renderer.memory, { meshes: 1, buffers: 1, textures: 1 });
  assert.equal(count.texImage2D, 2);
});

// --- Groups -------------------------------------------------------------------

test("groups: each child is drawn with its world matrix; mirrored ones flip the face winding", () => {
  const { add, frames, calls } = setup();
  const child = { mesh: makeShape("cube"), pos: { x: 0.5, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0.4 }, scale: { x: 1, y: 1, z: 1 } };
  const mirrored = { mesh: makeShape("cube"), pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: -1, y: 1, z: 1 }, material: { fill: "#0f0" } };
  child.material = { fill: "#f00" };
  add({ scale: { x: 2, y: 1, z: 1 }, rot: { x: 0, y: 0.7, z: 0 }, children: [child, mirrored] });
  frames(1);
  const sent = calls.models.map((m) => m.map((x) => x.toFixed(9)).join());
  assert.ok(sent.includes(worldMatrix(child).map((x) => x.toFixed(9)).join()));
  assert.ok(sent.includes(worldMatrix(mirrored).map((x) => x.toFixed(9)).join()));
  assert.deepEqual([...new Set(calls.frontFace)].sort(), ["CCW", "CW"]);
});

test("outline(): one extra draw per face group for depth and normals; its picture is made once and freed when off", () => {
  const { renderer, scene, add, frames, count, calls } = setup({ releaseAfter: 30 });
  add({ mesh: makeShape("cube"), material: { fill: "#f00" } });
  frames(1);
  const plain = calls.models.length;
  const fx = outline();
  scene.post = [fx];
  frames(1);
  assert.equal(calls.models.length - plain, 2 * plain); // each side of the cube, then again for depth and normals
  const made = count.createTexture;
  frames(20);
  assert.equal(count.createTexture, made); // nothing new per frame
  // Two outlines with different `objects` lists: one picture each
  scene.post = [fx, outline({ objects: [scene.objects[0]] })];
  frames(1);
  assert.equal(renderer._post.geometry.size, 2);
  const both = count.createTexture;
  frames(20);
  assert.equal(count.createTexture, both);
  // Off for a while: everything for post effects is freed
  const freed = count.deleteTexture;
  scene.post = [];
  frames(130);
  assert.ok(count.deleteTexture - freed >= 3, `${count.deleteTexture - freed} textures freed`);
});

test("shadows: casters drawn once more from the light; the map is made once, remade for a new size, freed when off", () => {
  const { renderer, scene, add, frames, count } = setup({ releaseAfter: 30 });
  add({ mesh: makeShape("sphere"), material: { fill: "#f00" } });
  const ghost = add({ mesh: makeShape("sphere"), material: { fill: "#0f0" }, castShadow: false });
  frames(1);
  const plain = count.drawArrays; // two spheres
  const sun = { type: "directional", direction: { x: 0, y: 1, z: 0 }, shadows: true };
  scene.lights = [{ type: "ambient", intensity: 0.3 }, sun];
  frames(1);
  assert.equal(count.drawArrays - plain, plain + 1); // both drawn, plus the one casting shadows
  const made = count.createTexture;
  frames(20);
  assert.equal(count.createTexture, made);
  sun.shadows = { size: 512 };
  frames(1);
  assert.equal(count.createTexture, made + 1);
  assert.equal(renderer._shadow.maps.get(0).size, 512);
  ghost.castShadow = true;
  sun.shadows = false;
  frames(130); // unused GPU memory is looked at every 60 frames
  assert.equal(renderer._shadow, null);
});

test("point light shadows: six sides drawn per frame, two lights of each kind at most", () => {
  const { renderer, scene, add, frames, count } = setup({ releaseAfter: 30 });
  add({ mesh: makeShape("sphere"), material: { fill: "#f00" } });
  frames(1);
  const plain = count.drawArrays;
  const bulb = { type: "point", position: { x: 0, y: 2, z: 0 }, shadows: true };
  scene.lights = [{ type: "ambient", intensity: 0.3 }, bulb];
  frames(1);
  assert.equal(count.drawArrays - plain, plain + 6); // the sphere, plus once per side of the cube
  assert.equal(renderer._shadow.maps.get(2).cube, true);
  assert.equal(renderer._shadow.maps.get(2).size, 512);
  // Three of each kind: only two of each cast
  const sun = (x) => ({ type: "directional", direction: { x, y: 1, z: 0 }, shadows: true });
  const lamp = (x) => ({ type: "point", position: { x, y: 2, z: 0 }, shadows: true });
  scene.lights = [sun(0), sun(1), sun(-1), lamp(0), lamp(1), lamp(-1)];
  frames(1);
  assert.deepEqual([...renderer._shadow.maps.keys()].sort(), [0, 1, 2, 3]);
  scene.lights = [];
  frames(130);
  assert.equal(renderer._shadow, null);
});
