/**
 * Floor grids: lines on a plane, drawn as line-only meshes (no faces, so
 * they're drawn with the object's `color` and `lineWidth`).
 *
 *   scene.add(gridHelper({ size: 4, divisions: 40 }));         // a floor with axes, fading out
 *   scene.add({ mesh: gridMesh({ size: 2 }), color: "#444" });  // just the lines
 */

/** Which world axes each plane uses: [first, second], and the one it faces. */
const PLANES = {
  xz: ["x", "z", "y"],
  xy: ["x", "y", "z"],
  yz: ["y", "z", "x"],
};

/** Axis colors, the same as `TransformGizmo` and `ViewGizmo`. */
const AXIS_COLORS = { x: "#e8605a", y: "#7cc46b", z: "#5f9be8" };

/** A point on a plane at (a, b) along its two axes. */
function onPlane(plane, a, b) {
  const [p, q] = PLANES[plane];
  const v = { x: 0, y: 0, z: 0 };
  v[p] = a;
  v[q] = b;
  return v;
}

function planeOf(plane) {
  if (!PLANES[plane]) throw new Error(`Trid: unknown grid plane "${plane}" (use "xz", "xy" or "yz")`);
  return plane;
}

/**
 * A square grid of lines, centered on the origin: `divisions + 1` lines
 * each way. A line-only mesh (`vertices` + `edges`).
 *
 * @param {Object} [opts]
 * @param {number} [opts.size=4] - Width of the whole grid
 * @param {number} [opts.divisions=40] - Cells along each side
 * @param {"xz"|"xy"|"yz"} [opts.plane="xz"] - The plane it lies in ("xz" = a floor)
 * @returns {{ vertices:{x,y,z}[], edges:number[][] }}
 */
export function gridMesh({ size = 4, divisions = 40, plane = "xz" } = {}) {
  planeOf(plane);
  const half = size / 2;
  const n = Math.max(1, Math.round(divisions));
  const vertices = [];
  const edges = [];
  for (let i = 0; i <= n; i++) {
    const t = -half + (size * i) / n;
    vertices.push(onPlane(plane, t, -half), onPlane(plane, t, half), onPlane(plane, -half, t), onPlane(plane, half, t));
    const k = vertices.length;
    edges.push([k - 4, k - 3], [k - 2, k - 1]);
  }
  return { vertices, edges };
}

/**
 * A floor grid like 3D editors have, as one object to `scene.add`: thin
 * minor lines, brighter major lines every `major` cells, the two axes
 * through the origin in their colors (X red, Y green, Z blue), fading out
 * toward the edge. It can't be picked (`pickable: false`).
 *
 * It's a group whose children are line-only meshes (one per color and
 * fade step), so move, turn or hide it like any object.
 *
 * @param {Object} [opts]
 * @param {number} [opts.size=4] - Width of the whole grid
 * @param {number} [opts.divisions=40] - Cells along each side
 * @param {number} [opts.major=10] - A major line every this many cells (0: none)
 * @param {"xz"|"xy"|"yz"} [opts.plane="xz"] - The plane it lies in ("xz" = a floor)
 * @param {string} [opts.color="rgba(255, 255, 255, 0.12)"] - Minor lines
 * @param {string} [opts.majorColor="rgba(255, 255, 255, 0.25)"] - Major lines
 * @param {boolean|{[axis:string]:string}} [opts.axes=true] - Draw the axes; or their colors, like `{ x: "#f00" }`
 * @param {boolean|number} [opts.fade=true] - Fade toward the edge; a number is where the fade starts
 *   (0 = center, 1 = edge; `true` = 0.5). Needs colors written as hex, `rgb()` or `rgba()`
 * @param {number} [opts.lineWidth=1] - Line width in pixels
 * @returns {Object} A scene object (a group)
 */
export function gridHelper({
  size = 4,
  divisions = 40,
  major = 10,
  plane = "xz",
  color = "rgba(255, 255, 255, 0.12)",
  majorColor = "rgba(255, 255, 255, 0.25)",
  axes = true,
  fade = true,
  lineWidth = 1,
} = {}) {
  planeOf(plane);
  const [p, q] = PLANES[plane];
  const half = size / 2;
  const n = Math.max(1, Math.round(divisions));
  const cell = size / n;
  const axisColors = axes ? { ...AXIS_COLORS, ...(typeof axes === "object" ? axes : {}) } : null;
  const fadeFrom = fade === false ? null : typeof fade === "number" ? Math.min(0.99, Math.max(0, fade)) : 0.5;

  // Lines, sorted by color; with a fade each line is cut at every cell so its
  // pieces can get fainter with distance (one object per color and step)
  const STEPS = fadeFrom === null ? 1 : 8;
  const groups = new Map(); // "color|step" → { color, step, vertices, edges }
  const add = (css, a0, b0, a1, b1) => {
    const pieces = fadeFrom === null ? 1 : n;
    for (let k = 0; k < pieces; k++) {
      const s = k / pieces, e = (k + 1) / pieces;
      const pa = a0 + (a1 - a0) * s, pb = b0 + (b1 - b0) * s;
      const qa = a0 + (a1 - a0) * e, qb = b0 + (b1 - b0) * e;
      let step = 0;
      if (fadeFrom !== null) {
        // Distance of the piece's middle from the center: 0 → 1 at the edge (circle)
        const r = Math.hypot((pa + qa) / 2, (pb + qb) / 2) / half;
        if (r >= 1) continue;
        step = r <= fadeFrom ? 0 : Math.min(STEPS - 1, 1 + Math.floor(((r - fadeFrom) / (1 - fadeFrom)) * (STEPS - 1)));
      }
      const key = css + "|" + step;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { css, step, vertices: [], edges: [] }));
      g.vertices.push(onPlane(plane, pa, pb), onPlane(plane, qa, qb));
      g.edges.push([g.vertices.length - 2, g.vertices.length - 1]);
    }
  };

  const center = n / 2; // the line through the origin, when divisions is even
  for (let i = 0; i <= n; i++) {
    const t = -half + i * cell;
    if (axisColors && i === center) continue; // the axes go there
    // Major lines count from the origin (or from the edge when no line goes through it)
    const from = Number.isInteger(center) ? i - center : i;
    const css = major > 0 && from % major === 0 ? majorColor : color;
    add(css, t, -half, t, half); // along the second axis
    add(css, -half, t, half, t); // along the first axis
  }
  if (axisColors) {
    add(axisColors[p], -half, 0, half, 0);
    add(axisColors[q], 0, -half, 0, half);
  }

  const children = [];
  for (const g of groups.values()) {
    children.push({
      name: "grid lines",
      mesh: { vertices: g.vertices, edges: g.edges },
      color: g.step === 0 ? g.css : fadeColor(g.css, 1 - g.step / STEPS),
      lineWidth,
    });
  }
  return { name: "grid", pickable: false, children };
}

/**
 * A CSS color with its alpha multiplied by `k`, for hex, `rgb()` and
 * `rgba()` colors; other colors come back unchanged.
 */
function fadeColor(css, k) {
  const c = parseSimpleColor(css);
  if (!c) return css;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+(c[3] * k).toFixed(4)})`;
}

function parseSimpleColor(css) {
  const s = String(css).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return v.concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  return null;
}
