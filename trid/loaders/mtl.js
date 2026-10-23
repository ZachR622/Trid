/**
 * MTL loading: the material file an OBJ file names with `mtllib`.
 *
 * Reads each `newmtl` block's diffuse color (`Kd`), see-through (`d`, or
 * `Tr` = 1 - d) and diffuse texture (`map_Kd`, options like `-s 1 1 1`
 * skipped). Everything else is ignored.
 */

/**
 * @typedef {Object} MtlMaterial
 * @property {string} name
 * @property {string} [fill] - "#rrggbb" from `Kd` (or "rgba(...)" when see-through)
 * @property {number} [opacity] - From `d` / `Tr`, 0 to 1
 * @property {string} [textureFile] - The texture's file name (`map_Kd`), relative to the .mtl file
 */

/**
 * Parses the text of an MTL file.
 *
 * @param {string} text
 * @returns {Object<string, MtlMaterial>} Materials by name
 */
export function parseMTL(text) {
  const materials = {};
  let m = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line[0] === "#") continue;
    const [key, ...rest] = line.split(/\s+/);
    const k = key.toLowerCase();
    if (k === "newmtl") {
      const name = rest.join(" ");
      m = materials[name] = { name };
    } else if (!m) {
      continue;
    } else if (k === "kd") {
      const [r, g, b] = rest.map(Number);
      const hex = (x) => Math.round(Math.min(1, Math.max(0, x || 0)) * 255).toString(16).padStart(2, "0");
      m.fill = `#${hex(r)}${hex(g ?? r)}${hex(b ?? r)}`;
    } else if (k === "d") {
      m.opacity = Math.min(1, Math.max(0, Number(rest[0])));
    } else if (k === "tr") {
      m.opacity = Math.min(1, Math.max(0, 1 - Number(rest[0])));
    } else if (k === "map_kd") {
      // Skip options ("-s 1 1 1", "-bm 0.5", "-clamp on"...): the file name is what's left
      const words = [...rest];
      const takes = { "-s": 3, "-o": 3, "-t": 3, "-mm": 2, "-bm": 1, "-blendu": 1, "-blendv": 1, "-clamp": 1, "-texres": 1, "-imfchan": 1, "-boost": 1, "-cc": 1 };
      while (words.length && words[0][0] === "-") {
        const opt = words.shift().toLowerCase();
        words.splice(0, takes[opt] ?? 1);
      }
      if (words.length) m.textureFile = words.join(" ");
    }
  }
  // See-through fills as rgba, so materials can use them directly
  for (const mat of Object.values(materials)) {
    if (mat.fill && mat.opacity !== undefined && mat.opacity < 1) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(mat.fill.slice(i, i + 2), 16));
      mat.fill = `rgba(${r}, ${g}, ${b}, ${mat.opacity})`;
    }
  }
  return materials;
}
