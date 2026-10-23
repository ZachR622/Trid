/**
 * MTL export: the material file that goes with an OBJ file (colors,
 * see-through and texture image names, one `newmtl` per material).
 *
 * The names match the `usemtl` lines `exportOBJ(input, { mtllib })` writes
 * for the same input. `exportModel` gives all the files at once.
 */

import { exportEntries, exportOBJ, materialSlots } from "./obj.js";
import { colorBytes } from "../render/proceduralTextures.js";
import { textureReady, textureSize } from "../loaders/texture.js";

/**
 * The materials an export will name, with the file name for each texture.
 *
 * @param {Object|Object[]} input - An object, a group, a list of them or a Scene
 * @param {Object} [opts]
 * @param {(name:string, texture:Object) => string} [opts.textureFile] - File name for a material's
 *   texture (default: the material's name + ".png")
 * @returns {{ name:string, material:Object|null, texture:Object|null, file:string|null }[]}
 */
export function objMaterials(input, { textureFile = (name) => `${name}.png` } = {}) {
  const { list } = materialSlots(exportEntries(input));
  const files = new Map(); // one file per texture image, even when materials share it
  return list.map(({ name, material }) => {
    const texture = material?.texture ?? null;
    if (texture && !files.has(texture)) files.set(texture, textureFile(name, texture));
    return { name, material, texture, file: texture ? files.get(texture) : null };
  });
}

/**
 * Writes the text of an MTL file.
 *
 * `input` can be what `exportOBJ` takes (an object, a group, a list or a
 * Scene: their materials are written, with the same names), or a list of
 * plain material descriptions `{ name, fill?, opacity?, texture? }` where
 * `texture` is the image's file name.
 *
 * Each material gets `Kd` (its fill color; white under a texture), `d` when
 * it's see-through, and `map_Kd` with the texture's file name.
 *
 * @example
 * download(exportOBJ(scene, { mtllib: "scene.mtl" }), "scene.obj");
 * download(exportMTL(scene), "scene.mtl");
 *
 * @param {Object|Object[]} input
 * @param {Object} [opts]
 * @param {(name:string, texture:Object) => string} [opts.textureFile] - See `objMaterials`
 * @param {string} [opts.header="Exported by Trid"] - Comment at the top; "" for none
 * @returns {string}
 */
export function exportMTL(input, { textureFile, header = "Exported by Trid" } = {}) {
  const items = Array.isArray(input) ? input : [input];
  const plain = items.length > 0 && items.every((m) => m && !m.mesh && !m.children && !m.vertices && !m.objects && "name" in m);
  const rows = plain
    ? items.map((m) => ({ name: m.name, material: { fill: m.fill, opacity: m.opacity }, file: typeof m.texture === "string" ? m.texture : null }))
    : objMaterials(input, { textureFile });

  const num = (x) => (Math.round(x * 1e4) / 1e4).toString();
  const out = header ? header.split("\n").map((l) => "# " + l) : [];
  for (const { name, material, file } of rows) {
    const fill = material?.fill ?? (file ? "#ffffff" : "#cccccc");
    const [r, g, b, a] = colorBytes(fill);
    const alpha = a * (material?.opacity ?? 1);
    out.push("", `newmtl ${name}`);
    out.push(`Kd ${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`);
    out.push("Ks 0 0 0", "illum 1");
    if (alpha < 1) out.push(`d ${num(alpha)}`);
    if (file) out.push(`map_Kd ${file}`);
  }
  return out.join("\n") + "\n";
}

/**
 * A texture image as a PNG (or JPEG / WebP) file, to save next to an MTL file.
 *
 * @param {CanvasImageSource} src - An image, canvas, ImageBitmap or video frame
 * @param {string} [type="image/png"]
 * @returns {Promise<Blob>}
 */
export async function textureToBlob(src, type = "image/png") {
  if (!textureReady(src)) throw new Error("textureToBlob: the texture isn't loaded yet");
  const { w, h } = textureSize(src);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  canvas.getContext("2d").drawImage(src, 0, 0, w, h);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Can't encode the texture"))), type));
}

/**
 * Every file of a model, ready to save: the OBJ, its MTL and one image per
 * texture. Save them in the same folder (or zip them) and the model opens
 * with its colors and textures in Blender and other 3D programs.
 *
 * @example
 * const files = await exportModel(scene, { name: "sword" });
 * for (const f of files) await download(f.data, f.name);
 *
 * @param {Object|Object[]} input - An object, a group, a list of them or a Scene
 * @param {Object} [opts]
 * @param {string} [opts.name="model"] - Base name: model.obj, model.mtl
 * @param {Object} [opts.obj] - More `exportOBJ` options
 * @returns {Promise<{ name:string, data:string|Blob }[]>}
 */
export async function exportModel(input, { name = "model", obj = {} } = {}) {
  const textureFile = (mat) => `${name}_${mat}.png`;
  const files = [
    { name: `${name}.obj`, data: exportOBJ(input, { ...obj, mtllib: `${name}.mtl` }) },
    { name: `${name}.mtl`, data: exportMTL(input, { textureFile }) },
  ];
  const saved = new Set();
  for (const { texture, file } of objMaterials(input, { textureFile })) {
    if (!texture || saved.has(file)) continue;
    saved.add(file);
    files.push({ name: file, data: await textureToBlob(texture) });
  }
  return files;
}
