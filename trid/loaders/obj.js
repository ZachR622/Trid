import { parseMTL } from "./mtl.js";
import { loadTexture } from "./texture.js";

/**
 * Wavefront OBJ loading.
 *
 * Reads vertex positions (`v`), texture coordinates (`vt`), normals
 * (`vn`), faces (`f`), polylines (`l`), material names (`usemtl`) and the
 * material file's name (`mtllib`). `loadOBJ(url, { materials: true })` also
 * reads that .mtl file and its textures. Groups (`g`, `o`) are ignored.
 *
 * OBJ files are right-handed with +Z toward the viewer. Trid is
 * left-handed with the camera looking down +Z, so Z is flipped on
 * load: a model that faces you in Blender faces you in Trid too.
 */

/**
 * @typedef {Object} ObjMesh
 * @property {{x:number,y:number,z:number}[]} vertices
 * @property {number[][]} edges - Unique edges as [a, b] pairs, ready to draw
 * @property {number[][]} faces - Polygons as vertex index lists
 * @property {{x:number,y:number,z:number}[]} [normals] - Normals from the file (`vn`), if any
 * @property {(number[]|null)[]} [faceNormals] - For each face, the normal index of each corner
 *   (null when the file gives none for that face). Used by smooth shading.
 * @property {{u:number,v:number}[]} [uvs] - Texture coordinates from the file (`vt`), if any
 * @property {(number[]|null)[]} [faceUVs] - For each face, the texture coordinate index of
 *   each corner (null when the file gives none for that face). Used by textures.
 * @property {string[]} [materialNames] - Material names from `usemtl` lines, in the order they first appear
 * @property {number[]} [faceMaterials] - For each face, its index in `materialNames`. Give the
 *   object a list of materials in the same order to color or texture each part.
 * @property {string} [mtllib] - The .mtl file the OBJ names (`mtllib`), if any
 * @property {Object[]} [materials] - With `loadOBJ(url, { materials: true })`: one Trid material per
 *   entry of `materialNames`, from the .mtl file (fill, texture). Use it as the object's `material`
 *
 * @typedef {Object} ObjOptions
 * @property {number} [fit] - If set, center the model on the origin and scale it
 *   so its largest side is this long. Handy because OBJ files come in any size.
 * @property {boolean} [materials=false] - `loadOBJ` only: also load the .mtl file and its
 *   textures, into `mesh.materials`
 */

/**
 * Parses the text of an OBJ file into a mesh.
 *
 * @param {string} text - Contents of a .obj file
 * @param {ObjOptions} [opts]
 * @returns {ObjMesh}
 * @throws {Error} If a face or line points at a vertex that doesn't exist
 */
export function parseOBJ(text, { fit } = {}) {
  const vertices = [];
  const faces = [];
  const lines = [];
  const normals = [];
  const faceNormals = []; // per face: normal index of each corner, or null
  const uvs = [];
  const faceUVs = []; // per face: texture coordinate index of each corner, or null
  const materialNames = [];
  const faceMaterials = []; // per face: index in materialNames
  let material = 0;
  let mtllib;

  const src = text.split(/\r?\n/);

  for (let n = 0; n < src.length; n++) {
    const line = src[n].trim();

    if (line === "" || line[0] === "#") continue;

    const parts = line.split(/\s+/);
    const kind = parts[0];

    if (kind === "v") {
      vertices.push({ x: +(parts[1] ?? 0), y: +(parts[2] ?? 0), z: -(parts[3] ?? 0) });
    } else if (kind === "vt") {
      uvs.push({ u: +(parts[1] ?? 0), v: +(parts[2] ?? 0) });
    } else if (kind === "vn") {
      normals.push({ x: +(parts[1] ?? 0), y: +(parts[2] ?? 0), z: -(parts[3] ?? 0) });
    } else if (kind === "mtllib") {
      mtllib ??= parts.slice(1).join(" ");
    } else if (kind === "usemtl") {
      const name = parts.slice(1).join(" ");
      material = materialNames.indexOf(name);
      if (material < 0) material = materialNames.push(name) - 1;
    } else if (kind === "f" || kind === "l") {
      // "7", "7/1", "7//3", "7/1/3" all point at vertex 7. Negative = counted from the end.
      const ids = parts.slice(1).map((p) => {
        const i = parseInt(p, 10);
        const idx = i < 0 ? vertices.length + i : i - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= vertices.length) {
          throw new Error(`OBJ line ${n + 1}: bad vertex index "${p}"`);
        }
        return idx;
      });
      if (kind === "f" && ids.length >= 3) {
        faces.push(ids.reverse()); // flipping Z flips the winding
        faceMaterials.push(material);
        // "7//3" and "7/1/3": the third number is the corner's normal
        const ns = parts.slice(1).map((p) => {
          const s = p.split("/")[2];
          if (!s) return -1;
          const i = parseInt(s, 10);
          const idx = i < 0 ? normals.length + i : i - 1;
          return idx >= 0 && idx < normals.length ? idx : -1;
        });
        faceNormals.push(ns.includes(-1) ? null : ns.reverse());
        // "7/1" and "7/1/3": the second number is the corner's texture coordinate
        const ts = parts.slice(1).map((p) => {
          const s = p.split("/")[1];
          if (!s) return -1;
          const i = parseInt(s, 10);
          const idx = i < 0 ? uvs.length + i : i - 1;
          return idx >= 0 && idx < uvs.length ? idx : -1;
        });
        faceUVs.push(ts.includes(-1) ? null : ts.reverse());
      } else if (kind === "l" && ids.length >= 2) lines.push(ids);
    }
  }

  const seen = new Set();
  const edges = [];
  const addEdge = (a, b) => {
    if (a === b) return;

    // (2 to the power of 32) = 4294967296
    // The parser uses it to turn an edge into a single number
    const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;

    if (seen.has(key)) return;

    seen.add(key);
    edges.push([a, b]);
  };

  for (const f of faces) {
    for (let i = 0; i < f.length; i++) addEdge(f[i], f[(i + 1) % f.length]);
  }
  for (const l of lines) {
    for (let i = 0; i < l.length - 1; i++) addEdge(l[i], l[i + 1]);
  }

  const mesh = { vertices, edges, faces };
  // Normals from the file, used by smooth shading
  if (faceNormals.some((n) => n)) {
    mesh.normals = normals;
    mesh.faceNormals = faceNormals;
  }
  // Texture coordinates from the file
  if (faceUVs.some((t) => t)) {
    mesh.uvs = uvs;
    mesh.faceUVs = faceUVs;
  }
  // Material names (a list of materials on the object then colors each part)
  if (materialNames.length > 0) {
    mesh.materialNames = materialNames;
    mesh.faceMaterials = faceMaterials;
  }
  if (mtllib) mesh.mtllib = mtllib;
  if (fit != null) fitMesh(mesh, fit);
  return mesh;
}

/**
 * Centers a mesh on the origin and scales it so its largest side is `size`.
 * Changes the mesh in place.
 *
 * @param {{ vertices:{x:number,y:number,z:number}[] }} mesh
 * @param {number} [size=1]
 * @returns The same mesh
 */
export function fitMesh(mesh, size = 1) {
  const vs = mesh.vertices;
  if (vs.length === 0) return mesh;

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of vs) {
    for (const k of ["x", "y", "z"]) {
      if (v[k] < min[k]) min[k] = v[k];
      if (v[k] > max[k]) max[k] = v[k];
    }
  }

  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
  const largest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const s = largest > 0 ? size / largest : 1;

  for (const v of vs) {
    v.x = (v.x - cx) * s;
    v.y = (v.y - cy) * s;
    v.z = (v.z - cz) * s;
  }
  return mesh;
}

/**
 * Downloads an OBJ file and parses it.
 *
 * @param {string} url
 * @param {ObjOptions} [opts]
 * @returns {Promise<ObjMesh>}
 */
export async function loadOBJ(url, opts = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const mesh = parseOBJ(await res.text(), opts);
  if (opts.materials) mesh.materials = await loadMaterials(mesh, new URL(url, location.href));
  return mesh;
}

/**
 * The materials of a loaded OBJ, from its .mtl file: one per name in
 * `mesh.materialNames`, with the texture images loaded. Missing files only
 * give a warning (the part keeps a plain fill).
 *
 * @param {ObjMesh} mesh - Parsed with `parseOBJ`
 * @param {URL|string} base - Where the OBJ file is (file names are relative to it)
 * @returns {Promise<Object[]>}
 */
export async function loadMaterials(mesh, base) {
  const names = mesh.materialNames ?? [];
  if (!mesh.mtllib) return names.map((name) => ({ name, fill: "#cccccc" }));
  let lib = {};
  const mtlURL = new URL(mesh.mtllib, base);
  try {
    const res = await fetch(mtlURL);
    if (!res.ok) throw new Error(`${res.status}`);
    lib = parseMTL(await res.text());
  } catch (err) {
    console.warn(`Trid: couldn't load the material file ${mtlURL} (${err.message})`);
  }
  return Promise.all(names.map(async (name) => {
    const m = lib[name] ?? {};
    const material = { name, fill: m.fill ?? (m.textureFile ? "#ffffff" : "#cccccc") };
    if (m.textureFile) {
      const file = new URL(m.textureFile.replace(/\\/g, "/"), mtlURL);
      try {
        material.texture = await loadTexture(file.href);
        material.fill = "#ffffff"; // MTL's Kd under a texture is usually a tint nobody meant
      } catch (err) {
        console.warn(`Trid: couldn't load the texture ${file} (${err.message})`);
      }
    }
    return material;
  }));
}

/**
 * Parses an OBJ file the user picked or dropped (a `File` or `Blob`).
 *
 * @param {Blob} file
 * @param {ObjOptions} [opts]
 * @returns {Promise<ObjMesh>}
 */
export async function readOBJFile(file, opts) {
  return parseOBJ(await file.text(), opts);
}

/**
 * Opens the browser's file dialog for .obj files.
 * Must be called from a user action, like a button click.
 *
 * @returns {Promise<File|null>} The chosen file, or null if the dialog was cancelled
 */
export function pickOBJFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".obj";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
