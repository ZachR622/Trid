// How surfaces look: corner normals for smooth shading, texture coordinates
// made from shapes (and moved, repeated, turned), material effects' canvas
// versions and how their GLSL is joined, and the mesh resizing helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cornerNormals, creaseOf, DEFAULT_CREASE, MAPPINGS, computeUVs, mapUVs, mappingOf, mappingKey, uvsFor, uvTransform, applyUVTransform,
  rim, unlit, fog, gradient, edgeGlow, toon, uniformType, buildEffects, effectsKey, SURFACE_GLSL,
  scaleMesh, fitMesh, makeShape, newell,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const unit = (p) => {
  const l = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};

// --- Normals ---

test("creaseOf: true is the default angle, a number is its own, anything else is flat", () => {
  assert.equal(creaseOf(true), DEFAULT_CREASE);
  assert.equal(DEFAULT_CREASE, 60);
  assert.equal(creaseOf(30), 30);
  for (const x of [false, undefined, 0, -5]) assert.equal(creaseOf(x), null);
});

test("cornerNormals: a cube keeps its sharp sides; past 90° they blend; a sphere's point outward", () => {
  const cube = makeShape("cube");
  const sharp = cornerNormals(cube, 60);
  cube.faces.forEach((f, fi) => {
    const n = unit(newell(f.map((i) => cube.vertices[i])));
    for (const c of sharp[fi]) {
      near(c.x, n.x);
      near(c.y, n.y);
      near(c.z, n.z);
    }
  });
  // Above 90°: every corner of a cube averages its three sides, pointing diagonally out
  const soft = cornerNormals(cube, 100);
  cube.faces.forEach((f, fi) => f.forEach((vi, k) => {
    const c = soft[fi][k], p = unit(cube.vertices[vi]);
    near(c.x * p.x + c.y * p.y + c.z * p.z, 1, 1e-6);
  }));
  const sphere = makeShape("sphere", { r: 2 });
  const ns = cornerNormals(sphere);
  sphere.faces.forEach((f, fi) => f.forEach((vi, k) => {
    const p = unit(sphere.vertices[vi]), n = ns[fi][k];
    assert.ok(n.x * p.x + n.y * p.y + n.z * p.z > 0.97); // about radial
  }));
});

test("cornerNormals is cached per mesh and angle, and worked out again after a change", () => {
  const m = makeShape("sphere");
  assert.equal(cornerNormals(m, 60), cornerNormals(m, 60));
  assert.notEqual(cornerNormals(m, 60), cornerNormals(m, 30));
  const before = cornerNormals(m, 60);
  m.dirty = true;
  assert.notEqual(cornerNormals(m, 60), before);
});

test("cornerNormals uses a mesh's own normals (from an OBJ file) where it has them", () => {
  const up = { x: 0, y: 1, z: 0 };
  const tri = {
    vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }],
    faces: [[0, 1, 2]], normals: [up], faceNormals: [[0, 0, 0]],
  };
  assert.deepEqual(cornerNormals(tri)[0], [up, up, up]);
});

// --- Texture mapping ---

test("mappingOf and mappingKey: names or objects, checked; plain uv is no key", () => {
  assert.deepEqual(MAPPINGS, ["uv", "planar", "box", "sphere", "cylinder"]);
  assert.deepEqual(mappingOf("box"), { type: "box" });
  assert.deepEqual(mappingOf(undefined), { type: "uv" });
  assert.deepEqual(mappingOf({ type: "cylinder", axis: "x" }), { type: "cylinder", axis: "x" });
  assert.throws(() => mappingOf("tube"), /Unknown texture mapping/);
  assert.throws(() => mappingOf({ type: "box", axis: "w" }), /Unknown mapping axis/);
  assert.equal(mappingKey(undefined), "");
  assert.equal(mappingKey("uv"), "");
  assert.equal(mappingKey("planar"), "planar");
  assert.equal(mappingKey({ type: "cylinder", axis: "x" }), "cylinder:x");
});

test("computeUVs: planar and box fit the image to the mesh; sphere goes from bottom (0) to top (1)", () => {
  const box = makeShape("box", { w: 2, h: 1, d: 0.5 });
  for (const type of ["planar", "box"]) {
    const { uvs, faceUVs } = computeUVs(box, type);
    assert.equal(faceUVs.length, box.faces.length);
    assert.ok(uvs.every((t) => t.u >= -1e-9 && t.u <= 1 + 1e-9 && t.v >= -1e-9 && t.v <= 1 + 1e-9));
  }
  // Box: each side gets the whole image
  const { uvs, faceUVs } = computeUVs(box, "box");
  for (const f of faceUVs) {
    const us = f.map((i) => uvs[i].u), vs = f.map((i) => uvs[i].v);
    near(Math.max(...us) - Math.min(...us), 1);
    near(Math.max(...vs) - Math.min(...vs), 1);
  }
  const sphere = makeShape("sphere");
  const s = computeUVs(sphere, "sphere");
  sphere.faces.forEach((f, fi) => f.forEach((vi, k) => {
    const t = s.uvs[s.faceUVs[fi][k]], y = sphere.vertices[vi].y;
    if (y > 0.449) near(t.v, 1, 1e-6);
    if (y < -0.449) near(t.v, 0, 1e-6);
    if (Number.isFinite(t.u)) assert.ok(t.u >= 0 && t.u <= 1 + 1e-9);
  }));
  // No face jumps across the seam (from u ≈ 1 back to 0)
  for (const f of s.faceUVs) {
    const us = f.map((i) => s.uvs[i].u).filter(Number.isFinite);
    assert.ok(Math.max(...us) - Math.min(...us) < 0.5);
  }
  // "uv": the mesh's own
  assert.equal(computeUVs(box, "uv").uvs, box.uvs);
});

test("mapUVs writes them into the mesh; uvsFor caches them until the mesh changes", () => {
  const m = makeShape("cube");
  const own = m.uvs;
  assert.equal(uvsFor(m).uvs, own); // no mapping: the mesh's own
  const a = uvsFor(m, "planar");
  assert.equal(uvsFor(m, "planar"), a);
  m.dirty = true;
  assert.notEqual(uvsFor(m, "planar"), a);
  m.dirty = false;
  mapUVs(m, "sphere");
  assert.notEqual(m.uvs, own);
  assert.equal(m.faceUVs.length, m.faces.length);
  assert.equal(m.dirty, true);
});

test("uvTransform: repeat, offset and rotation (around the image's middle); nothing for the defaults", () => {
  assert.equal(uvTransform({}), null);
  assert.equal(applyUVTransform(null, { u: 0.3, v: 0.4 }).u, 0.3);
  assert.deepEqual(applyUVTransform(uvTransform({ textureRepeat: 2 }), { u: 0.3, v: 0.4 }), { u: 0.6, v: 0.8 });
  const r = applyUVTransform(uvTransform({ textureRepeat: { u: 3, v: 1 }, textureOffset: { u: 0.1, v: -0.2 } }), { u: 0.5, v: 0.5 });
  near(r.u, 1.6);
  near(r.v, 0.3);
  // A quarter turn: the middle stays, the right edge goes to the top
  const q = uvTransform({ textureRotation: Math.PI / 2 });
  const mid = applyUVTransform(q, { u: 0.5, v: 0.5 }), right = applyUVTransform(q, { u: 1, v: 0.5 });
  near(mid.u, 0.5);
  near(mid.v, 0.5);
  near(right.u, 0.5);
  near(right.v, 1);
});

// --- Effects ---

/** What effects get from the canvas renderer, for one face. */
function surface(extra = {}) {
  return {
    base: [0.5, 0.5, 0.5, 1], normal: { x: 0, y: 0, z: -1 }, view: { x: 0, y: 0, z: -1 }, position: { x: 0, y: 0, z: 0 },
    local: { x: 0, y: 0, z: 0 }, lightColor: [1, 1, 1], light: 1, diffuse: 1, ambient: 0.25, depth: 3, background: [0, 0, 0, 1],
    rgba: (c) => ({ "#ffffff": [1, 1, 1, 1], "#ff0000": [1, 0, 0, 1], "#0000ff": [0, 0, 1, 1], "#808080": [0.5, 0.5, 0.5, 1] })[c],
    ...extra,
  };
}

test("rim: nothing where the face looks at the camera, the full glow where it's edge-on", () => {
  const e = rim({ color: "#ff0000", power: 2, strength: 0.5 });
  const c = [0.2, 0.2, 0.2, 1];
  assert.deepEqual(e.canvas(c, surface(), e.uniforms), c);
  const side = e.canvas(c, surface({ normal: { x: 1, y: 0, z: 0 } }), e.uniforms);
  near(side[0], 0.7);
  near(side[1], 0.2);
});

test("unlit shows the fill as it is; fog fades with distance; gradient follows an axis", () => {
  assert.deepEqual(unlit().canvas([0.1, 0.1, 0.1, 1], surface()), [0.5, 0.5, 0.5, 1]);

  const f = fog({ near: 2, far: 4, color: "#0000ff" });
  const c = [1, 0, 0, 1];
  assert.deepEqual(f.canvas(c, surface({ depth: 1 }), f.uniforms), c);
  assert.deepEqual(f.canvas(c, surface({ depth: 9 }), f.uniforms), [0, 0, 1, 1]);
  near(f.canvas(c, surface({ depth: 3 }), f.uniforms)[2], 0.5); // halfway (smoothstep)
  const toBackground = fog({ near: 0, far: 1 });
  assert.deepEqual(toBackground.canvas(c, surface({ depth: 5, background: [0, 1, 0, 1] }), toBackground.uniforms), [0, 1, 0, 1]);

  const g = gradient({ from: "#ff0000", to: "#0000ff", axis: "y", min: 0, max: 2, lit: false });
  const at = (y) => g.canvas([0, 0, 0, 1], surface({ local: { x: 0, y, z: 0 } }), g.uniforms);
  assert.deepEqual(at(-1), [1, 0, 0, 1]);
  assert.deepEqual(at(1), [0.5, 0, 0.5, 1]);
  assert.deepEqual(at(5), [0, 0, 1, 1]);
  // lit: times the light's color
  const lit = gradient({ from: "#ffffff", to: "#ffffff" });
  assert.deepEqual(lit.canvas([0, 0, 0, 1], surface({ lightColor: [0.5, 0.25, 1] }), lit.uniforms), [0.5, 0.25, 1, 1]);
  // edgeGlow has no canvas version (it needs every pixel)
  assert.equal(edgeGlow().canvas, undefined);
});

test("uniformType: numbers and booleans are floats, colors vec4, arrays by length, points vec3", () => {
  assert.equal(uniformType(1), "float");
  assert.equal(uniformType(true), "float");
  assert.equal(uniformType("#fff"), "vec4");
  assert.equal(uniformType([1, 2]), "vec2");
  assert.equal(uniformType([1, 2, 3, 4]), "vec4");
  assert.equal(uniformType({ x: 1, y: 2, z: 3 }), "vec3");
  for (const x of [null, [1], [1, 2, 3, 4, 5], {}]) assert.equal(uniformType(x), null);
});

test("buildEffects: each effect's names get its number, so the same effect works twice", () => {
  const { code, calls, uniforms } = buildEffects([toon({ steps: 3 }), toon({ steps: 5 }), rim()]);
  assert.match(code, /vec4 effect_0\(/);
  assert.match(code, /vec4 effect_1\(/);
  assert.match(code, /uniform float uSteps_0;/);
  assert.match(code, /uniform float uSteps_1;/);
  assert.match(code, /uniform vec4 uRimColor_2;/);
  assert.equal(calls.trim().split("\n").length, 3);
  assert.deepEqual(uniforms.filter((u) => u.name === "uSteps").map((u) => u.effect), [0, 1]);
  assert.match(SURFACE_GLSL, /struct Surface/);
  // Same code and uniform types: same key (one shader); other values don't matter
  assert.equal(effectsKey([toon({ steps: 2 })]), effectsKey([toon({ steps: 7 })]));
  assert.notEqual(effectsKey([toon()]), effectsKey([rim()]));
});

// --- Resizing meshes ---

test("scaleMesh stretches in place; fitMesh centers a mesh and makes its largest side `size`", () => {
  const m = makeShape("cube", { size: 1 });
  m.dirty = false;
  assert.equal(scaleMesh(m, 2, 1, 0.5), m);
  assert.equal(m.dirty, true);
  const xs = m.vertices.map((p) => p.x), zs = m.vertices.map((p) => p.z);
  near(Math.max(...xs) - Math.min(...xs), 2);
  near(Math.max(...zs) - Math.min(...zs), 0.5);

  const off = { vertices: [{ x: 10, y: 10, z: 10 }, { x: 14, y: 11, z: 12 }] };
  fitMesh(off, 2);
  assert.deepEqual(off.vertices, [{ x: -1, y: -0.25, z: -0.5 }, { x: 1, y: 0.25, z: 0.5 }]);
  assert.deepEqual(fitMesh({ vertices: [] }), { vertices: [] });
});
