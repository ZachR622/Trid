/**
 * Wavefront OBJ export: the reverse of `parseOBJ`.
 *
 * Writes vertex positions (`v`), texture coordinates (`vt`), normals
 * (`vn`), faces (`f`), lines (`l`) for edges that aren't part of a face,
 * material names (`usemtl`) and one object (`o`) per scene object.
 *
 * Z is flipped back and faces turned back to counter-clockwise, so
 * `parseOBJ(exportOBJ(mesh))` gives the same mesh, and the file opens
 * the right way round in Blender and other 3D programs.
 */

import { transformPoint, normalMatrix, transformNormal, determinantMat4 } from "../math/matrix.js";
import { forEachPlaced, worldMatrix } from "../sceneGraph.js";
import { edgeSegments } from "../render/draw.js";
import { materialsOf } from "../render/canvasRenderer.js";
import { uvsFor, uvTransform, applyUVTransform } from "../render/uvMapping.js";

/**
 * @typedef {Object} ExportOBJOptions
 * @property {boolean} [uvs=true] - Write texture coordinates. For an object whose
 *   material has a `mapping`, `textureRepeat`, `textureOffset` or `textureRotation`,
 *   the coordinates the renderer uses are written, so the texture lands the same way.
 * @property {boolean} [normals=true] - Write the mesh's normals (`mesh.normals`), when it has them
 * @property {boolean} [lines=true] - Write edges that aren't the side of a face as lines (`l`)
 * @property {number} [precision=6] - Decimals kept in numbers
 * @property {string} [header="Exported by Trid"] - Comment at the top of the file; "" for none
 */

/**
 * Writes meshes as the text of an OBJ file.
 *
 * `input` can be:
 * - a mesh (`{ vertices, edges, faces }`): written as it is
 * - a scene object (`{ mesh, pos, rot, scale }`): its position, rotation and
 *   scale are applied, so it's written where it is in the scene
 * - a group (an object with `children`): every mesh in it is written, each
 *   where it's drawn, as its own object
 * - a list of meshes or objects, or a `Scene`: each becomes its own object (`o`)
 *   in the file, named after its `name` field when it has one
 *
 * @param {Object|Object[]} input
 * @param {ExportOBJOptions} [opts]
 * @returns {string} The file's text
 *
 * @example
 * download(exportOBJ(scene), "scene.obj");
 */
export function exportOBJ(input, { uvs = true, normals = true, lines = true, precision = 6, header = "Exported by Trid" } = {}) {
  const items = Array.isArray(input) ? input : Array.isArray(input?.objects) ? input.objects : [input];
  const num = (x) => {
    const s = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(precision);
    return s.includes(".") ? s.replace(/\.?0+$/, "") : s; // 1.500000 → 1.5, 2.000000 → 2
  };

  const out = [];
  if (header) out.push(...header.split("\n").map((l) => "# " + l));
  let vBase = 0, tBase = 0, nBase = 0; // OBJ indices count across the whole file, from 1

  // Plain meshes as they are; objects and their children where they're drawn (world matrix)
  const entries = [];
  for (const item of items) {
    if (!item) continue;
    if (item.vertices) entries.push({ item, mesh: item, world: null });
    else if (item.mesh || item.children) {
      forEachPlaced([item], (root) => (root.parent ? worldMatrix(root.parent) : null), (obj, world) => {
        if (obj.mesh) entries.push({ item: obj, mesh: obj.mesh, world });
      });
    } else {
      throw new Error("exportOBJ: expected a mesh, a scene object, a list of them or a Scene");
    }
  }

  entries.forEach(({ item, mesh, world }, index) => {
    if (!mesh?.vertices) throw new Error("exportOBJ: expected a mesh, a scene object, a list of them or a Scene");
    const isObject = !!world;
    const faces = mesh.faces ?? [];
    // A mirrored object's faces are already turned around once
    const mirrored = world ? determinantMat4(world) < 0 : false;

    if (entries.length > 1 || item.name) out.push(`o ${item.name ?? `object${index + 1}`}`);

    // Positions, in the scene's place when it's an object; Z flipped back to OBJ's right-handed axes
    for (const v of mesh.vertices) {
      const p = world ? transformPoint(world, v) : v;
      out.push(`v ${num(p.x)} ${num(p.y)} ${num(-p.z)}`);
    }

    // Texture coordinates: the ones the first material draws with
    const mat = isObject ? materialsOf(item)?.[0] : null;
    const source = uvs ? uvsFor(mesh, mat?.mapping) : {};
    const xf = mat ? uvTransform(mat) : null;
    const faceUVs = source.faceUVs, meshUVs = source.uvs;
    const writeUVs = !!(faceUVs && meshUVs && faceUVs.some(Boolean));
    if (writeUVs) {
      for (const t of meshUVs) {
        const q = applyUVTransform(xf, t);
        out.push(`vt ${num(q.u)} ${num(q.v)}`);
      }
    }

    // Normals: turned like the object, and flipped back like the positions
    const writeNormals = !!(normals && mesh.normals && mesh.faceNormals?.some(Boolean));
    if (writeNormals) {
      const nm = world ? normalMatrix(world) : null;
      for (const n of mesh.normals) {
        const r = nm ? transformNormal(nm, n) : n;
        out.push(`vn ${num(r.x)} ${num(r.y)} ${num(-r.z)}`);
      }
    }

    // Faces, counter-clockwise again (the reverse of parseOBJ), with material names where they change
    const names = mesh.materialNames;
    const mats = isObject ? materialsOf(item) : null;
    // Only when the names mean something: from the file, or a list of materials on the object
    const named = !!(mesh.faceMaterials && (names || mats?.length > 1));
    let current = null;
    faces.forEach((f, fi) => {
      if (f.length < 3) return;
      if (named) {
        const k = mesh.faceMaterials[fi] ?? 0;
        const name = names?.[k] ?? mats?.[k]?.name ?? `material${k}`;
        if (name !== current) out.push(`usemtl ${(current = name)}`);
      }
      const ts = writeUVs ? faceUVs[fi] : null;
      const ns = writeNormals ? mesh.faceNormals[fi] : null;
      const corners = [];
      const order = mirrored ? f.map((_, k) => k) : f.map((_, k) => f.length - 1 - k);
      for (const k of order) {
        const v = vBase + f[k] + 1;
        const t = ts ? tBase + ts[k] + 1 : "";
        const n = ns ? nBase + ns[k] + 1 : "";
        corners.push(n !== "" ? `${v}/${t}/${n}` : t !== "" ? `${v}/${t}` : `${v}`);
      }
      out.push("f " + corners.join(" "));
    });

    // Edges that aren't the side of any face (wireframe-only meshes, or extra lines)
    if (lines && mesh.edges) {
      const onFace = new Set();
      const key = (a, b) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);
      for (const f of faces) for (let k = 0; k < f.length; k++) onFace.add(key(f[k], f[(k + 1) % f.length]));
      for (const [a, b] of edgeSegments(mesh.edges)) {
        if (!onFace.has(key(a, b))) out.push(`l ${vBase + a + 1} ${vBase + b + 1}`);
      }
    }

    vBase += mesh.vertices.length;
    if (writeUVs) tBase += meshUVs.length;
    if (writeNormals) nBase += mesh.normals.length;
  });

  return out.join("\n") + "\n";
}
