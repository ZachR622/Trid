import { test } from "node:test";
import assert from "node:assert/strict";
import { makeShape, exportOBJ, exportMTL, objMaterials, parseMTL, parseOBJ } from "../trid/index.js";

const fakeImage = { width: 4, height: 4 }; // any texture source with a size

function scene() {
  const steel = { fill: "#ccccdd" };
  const wood = { name: "Old Wood", texture: fakeImage };
  const glass = { fill: "rgba(200, 230, 255, 0.4)" };
  const objects = [
    { name: "blade", mesh: makeShape("box"), material: steel },
    { name: "grip", mesh: makeShape("cylinder"), material: wood },
    { name: "box", mesh: makeShape("cube"), material: [steel, glass, steel, steel, steel, steel] },
  ];
  return { objects, steel, wood, glass };
}

test("exportOBJ with mtllib names every material the way exportMTL does", () => {
  const { objects } = scene();
  const obj = exportOBJ({ objects }, { mtllib: "sword.mtl" });
  assert.match(obj, /^mtllib sword\.mtl$/m);
  const used = new Set([...obj.matchAll(/^usemtl (.+)$/gm)].map((m) => m[1]));
  const mtl = parseMTL(exportMTL({ objects }));
  assert.deepEqual([...used].sort(), Object.keys(mtl).sort());
  // A shared material is written once, named after the first object using it; spaces become _
  assert.deepEqual(Object.keys(mtl).sort(), ["Old_Wood", "blade", "box_1"]);
});

test("exportMTL writes colors, see-through and texture files; parseMTL reads them back", () => {
  const { objects } = scene();
  const text = exportMTL({ objects }, { textureFile: (name) => `tex/${name}.png` });
  const mtl = parseMTL(text);
  assert.equal(mtl.blade.fill, "#ccccdd");
  assert.equal(mtl.Old_Wood.textureFile, "tex/Old_Wood.png");
  assert.equal(mtl.Old_Wood.fill, "#ffffff");
  assert.equal(mtl.box_1.opacity, 0.4);
  assert.equal(mtl.box_1.fill, "rgba(200, 230, 255, 0.4)");
  assert.deepEqual(objMaterials({ objects }).map((m) => m.file), [null, "Old_Wood.png", null]);
});

test("exportMTL takes plain material descriptions too", () => {
  const mtl = parseMTL(exportMTL([{ name: "red", fill: "#ff0000" }, { name: "skin", texture: "skin.png" }]));
  assert.equal(mtl.red.fill, "#ff0000");
  assert.equal(mtl.skin.textureFile, "skin.png");
});

test("parseMTL skips map options, reads Tr, and ignores what it doesn't know", () => {
  const mtl = parseMTL(`
# comment
newmtl a
Ka 0 0 0
Kd 1 0.5 0
Tr 0.25
map_Kd -s 2 2 1 -bm 0.5 textures/my file.png
newmtl b
Kd 0.2 0.2 0.2
`);
  assert.equal(mtl.a.textureFile, "textures/my file.png");
  assert.equal(mtl.a.opacity, 0.75);
  assert.equal(mtl.a.fill, "rgba(255, 128, 0, 0.75)");
  assert.equal(mtl.b.fill, "#333333");
});

test("parseOBJ keeps the mtllib name and a single material's name; round trip keeps names", () => {
  const mesh = parseOBJ("mtllib m.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl only\nf 1 2 3\n");
  assert.equal(mesh.mtllib, "m.mtl");
  assert.deepEqual(mesh.materialNames, ["only"]);
  const back = parseOBJ(exportOBJ(mesh, { mtllib: "m.mtl" }));
  assert.deepEqual(back.materialNames, ["only"]);
  assert.equal(back.mtllib, "m.mtl");
});

test("loadMaterials reads the .mtl next to the OBJ and loads its textures (and survives missing files)", async () => {
  const files = {
    "https://example.com/models/model.mtl": "newmtl crate\nKd 0.5 0.5 0.5\nmap_Kd tex\\crate.png\nnewmtl ball\nKd 1 0 0\nnewmtl broken\nmap_Kd missing.png\n",
  };
  const loaded = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const text = files[String(url)];
    return { ok: text !== undefined, status: text === undefined ? 404 : 200, text: async () => text };
  };
  globalThis.Image = class {
    set src(url) {
      loaded.push(url);
      this.complete = true;
      this.naturalWidth = 2;
      setTimeout(() => (url.includes("missing") ? this.onerror() : this.onload()));
    }
  };
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    const mesh = parseOBJ("mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl crate\nf 1 2 3\nusemtl ball\nf 1 3 2\nusemtl broken\nf 2 1 3\nusemtl unknown\nf 3 2 1\n");
    const { loadMaterials } = await import("../trid/index.js");
    const mats = await loadMaterials(mesh, "https://example.com/models/model.obj");
    assert.deepEqual(mats.map((m) => m.name), ["crate", "ball", "broken", "unknown"]);
    assert.ok(mats[0].texture);
    assert.equal(mats[0].fill, "#ffffff");
    assert.deepEqual(loaded, ["https://example.com/models/tex/crate.png", "https://example.com/models/missing.png"]);
    assert.equal(mats[1].fill, "#ff0000");
    assert.equal(mats[2].texture, undefined); // missing file: plain fill, and a warning
    assert.equal(mats[3].fill, "#cccccc");
    assert.equal(warnings.length, 1);

    // No .mtl file at all: a warning, and plain fills
    files["https://example.com/models/model.mtl"] = undefined;
    const plain = await loadMaterials(mesh, "https://example.com/models/model.obj");
    assert.ok(plain.every((m) => m.fill === "#cccccc" && !m.texture));
  } finally {
    console.warn = warn;
    globalThis.fetch = realFetch;
    delete globalThis.Image;
  }
});
