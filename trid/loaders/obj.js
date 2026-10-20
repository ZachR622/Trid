/**
 * Wavefront OBJ loading.
 *
 * Reads vertex positions (`v`), faces (`f`) and polylines (`l`).
 * Everything else (normals, texture coordinates, materials, groups)
 * is ignored for now**.
 *
 * OBJ files are right-handed with +Z toward the viewer. Trid is
 * left-handed with the camera looking down +Z, so Z is flipped on
 * load: a model that faces you in Blender faces you in Trid too.
 */

/**
 * @typedef {Object} ObjMesh
 * @property {{x:number,y:number,z:number}[]} vertices
 * @property {number[][]} edges - Unique edges as [a, b] pairs, ready to draw
 * @property {number[][]} faces - Polygons as vertex index lists (kept for filled rendering later)
 *
 * @typedef {Object} ObjOptions
 * @property {number} [fit] - If set, center the model on the origin and scale it
 *   so its largest side is this long. Handy because OBJ files come in any size.
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

  const src = text.split(/\r?\n/);

  for (let n = 0; n < src.length; n++) {
    const line = src[n].trim();

    if (line === "" || line[0] === "#") continue;

    const parts = line.split(/\s+/);
    const kind = parts[0];

    if (kind === "v") {
      vertices.push({ x: +(parts[1] ?? 0), y: +(parts[2] ?? 0), z: -(parts[3] ?? 0) });
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
      if (kind === "f" && ids.length >= 3) faces.push(ids.reverse());
      else if (kind === "l" && ids.length >= 2) lines.push(ids);
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
export async function loadOBJ(url, opts) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return parseOBJ(await res.text(), opts);
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
