/**
 * Creates a cube centered at origin.
 * @param {number} size - full width/height/depth
 * @returns {{ vertices: {x:number,y:number,z:number}[], edges: number[][] }}
 */
function cubeWire(size = 0.5) {
  return rectPrismWire(size, size, size);
}

/**
 * Creates a rectangular prism (box) centered at origin.
 * @param {number} w - width (x)
 * @param {number} h - height (y)
 * @param {number} d - depth (z)
 */
function rectPrismWire(w = 0.6, h = 0.3, d = 0.4) {
  const x = w / 2, y = h / 2, z = d / 2;

  const mesh = {
    vertices: [
      { x:  x, y:  y, z:  z },
      { x: -x, y:  y, z:  z },
      { x: -x, y: -y, z:  z },
      { x:  x, y: -y, z:  z },

      { x:  x, y:  y, z: -z },
      { x: -x, y:  y, z: -z },
      { x: -x, y: -y, z: -z },
      { x:  x, y: -y, z: -z },
    ],
    edges: [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ],
    // Clockwise as seen from outside
    faces: [
      [4, 7, 6, 5], // front (-z)
      [0, 1, 2, 3], // back (+z)
      [0, 4, 5, 1], // top
      [3, 2, 6, 7], // bottom
      [0, 3, 7, 4], // right
      [1, 5, 6, 2], // left
    ],
    // Which material each face uses when `material` is a list: one per side, in the order above
    faceMaterials: [0, 1, 2, 3, 4, 5],
  };
  return withFaceUVs(mesh);
}

/**
 * Gives every face the whole texture, upright as seen from outside:
 * side faces have +Y up, the top face has +Z up, the bottom face -Z.
 */
function withFaceUVs(mesh) {
  const uvs = [], faceUVs = [];
  for (const f of mesh.faces) {
    const p = f.map((i) => mesh.vertices[i]);
    // Outward normal (faces are clockwise from outside)
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    const up = Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz))
      ? { x: 0, y: 0, z: ny > 0 ? 1 : -1 }
      : { x: 0, y: 1, z: 0 };
    // Right, as seen from outside: normal × up
    const right = { x: ny * up.z - nz * up.y, y: nz * up.x - nx * up.z, z: nx * up.y - ny * up.x };
    const us = p.map((q) => q.x * right.x + q.y * right.y + q.z * right.z);
    const vs = p.map((q) => q.x * up.x + q.y * up.y + q.z * up.z);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    faceUVs.push(p.map((_, k) => {
      uvs.push({ u: (us[k] - u0) / (u1 - u0 || 1), v: (vs[k] - v0) / (v1 - v0 || 1) });
      return uvs.length - 1;
    }));
  }
  mesh.uvs = uvs;
  mesh.faceUVs = faceUVs;
  return mesh;
}

/**
 * Wireframe sphere made of latitude/longitude lines.
 * (Not triangles yet, just lines.)
 *
 * Each pole is a single vertex, so `rings` latitude bands produce
 * `rings - 1` drawn circles between the poles.
 *
 * @param {number} radius
 * @param {number} rings - latitude bands from pole to pole (min 2)
 * @param {number} segments - points per circle
 */
function sphereWire(radius = 0.35, rings = 10, segments = 16) {
  rings = Math.max(2, rings);

  const bottom = 0;
  const vertices = [{ x: 0, y: -radius, z: 0 }];
  const edges = [];

  for (let r = 1; r < rings; r++) {
    const v = r / rings;
    const phi = (v * Math.PI) - Math.PI/2;

    const y = Math.sin(phi) * radius;
    const ringRadius = Math.cos(phi) * radius;

    const startIndex = vertices.length;

    for (let s = 0; s < segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;

      const x = Math.cos(theta) * ringRadius;
      const z = Math.sin(theta) * ringRadius;

      vertices.push({ x, y, z });
    }

    edges.push(Array.from({ length: segments }, (_, i) => startIndex + i));
  }

  const top = vertices.length;
  vertices.push({ x: 0, y: radius, z: 0 });

  // Meridians: bottom pole -> each ring -> top pole
  const lastRing = 1 + (rings - 2) * segments;
  for (let s = 0; s < segments; s++) {
    edges.push([bottom, 1 + s]);
    for (let r = 0; r < rings - 2; r++) {
      const ringA = 1 + r * segments;
      const ringB = ringA + segments;
      edges.push([ringA + s, ringB + s]);
    }
    edges.push([lastRing + s, top]);
  }

  // Faces, clockwise as seen from outside: triangles at the poles, quads between rings.
  // Texture coordinates wrap around like a world map: u around, v from bottom to top.
  // The seam gets its own u = 1 coordinates, so the image doesn't smear across it.
  const faces = [];
  const uvs = [];
  const faceUVs = [];
  const uv = (s, r) => uvs.push({ u: s / segments, v: r / rings }) - 1;
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    faces.push([bottom, 1 + s, 1 + s1]);
    faceUVs.push([uv(s + 0.5, 0), uv(s, 1), uv(s + 1, 1)]);
    for (let r = 0; r < rings - 2; r++) {
      const a = 1 + r * segments, b = a + segments;
      faces.push([a + s, b + s, b + s1, a + s1]);
      faceUVs.push([uv(s, r + 1), uv(s, r + 2), uv(s + 1, r + 2), uv(s + 1, r + 1)]);
    }
    faces.push([top, lastRing + s1, lastRing + s]);
    faceUVs.push([uv(s + 0.5, rings), uv(s + 1, rings - 1), uv(s, rings - 1)]);
  }

  return { vertices, edges, faces, uvs, faceUVs };
}

/**
 * Spins a profile around the Y axis: vases, bottles, cups, columns, chess
 * pieces. Cylinders, cones and tori are built with it.
 *
 * Walk the profile so the outside is on its right in the (r, y) plane:
 * bottom to top for a vase. Faces are clockwise as seen from outside.
 *
 * Texture coordinates: u goes around, v follows the profile's length.
 * Caps map the texture as a disc. Edges are the profile's rings plus one
 * line along the profile per segment.
 *
 * @example
 * // A vase
 * const vase = lathe(
 *   [{ r: 0.2, y: -0.5 }, { r: 0.35, y: -0.2 }, { r: 0.15, y: 0.3 }, { r: 0.2, y: 0.5 }],
 *   { capBottom: true },
 * );
 *
 * @param {{r:number, y:number}[]} profile - Points: distance from the Y axis and height
 * @param {Object} [opts]
 * @param {number} [opts.segments=32] - Points around the axis
 * @param {boolean} [opts.capBottom=false] - Close the bottom with a flat cap
 * @param {boolean} [opts.capTop=false] - Close the top with a flat cap
 * @param {boolean} [opts.closed=false] - The last point joins the first (torus-like shapes)
 * @returns {import("../index.d.ts").Mesh}
 */
export function lathe(profile, { segments = 32, capBottom = false, capTop = false, closed = false } = {}) {
  segments = Math.max(3, Math.floor(segments));
  const vertices = [];
  const edges = [];
  const faces = [];
  const uvs = [];
  const faceUVs = [];
  const uv = (u, v) => uvs.push({ u, v }) - 1;

  // v along the profile, by length
  const pts = closed ? [...profile, profile[0]] : profile;
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y));
  }
  const total = lengths[lengths.length - 1] || 1;

  for (const p of profile) {
    for (let s = 0; s < segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      vertices.push({ x: Math.cos(t) * p.r, y: p.y, z: Math.sin(t) * p.r });
    }
  }

  const rows = pts.length - 1;
  for (let r = 0; r < rows; r++) {
    const a = r * segments;
    const b = ((r + 1) % profile.length) * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      faces.push([a + s, b + s, b + s1, a + s1]);
      const u0 = s / segments, u1 = (s + 1) / segments;
      const v0 = lengths[r] / total, v1 = lengths[r + 1] / total;
      faceUVs.push([uv(u0, v0), uv(u0, v1), uv(u1, v1), uv(u1, v0)]);
    }
  }

  // Rings (skipped where the profile touches the axis) and lines along the profile
  profile.forEach((p, r) => {
    if (p.r > 1e-5) edges.push(Array.from({ length: segments }, (_, s) => r * segments + s));
  });
  for (let s = 0; s < segments; s++) {
    if (closed && profile.length > 2) edges.push(profile.map((_, r) => r * segments + s));
    else for (let r = 0; r < profile.length - 1; r++) edges.push([r * segments + s, (r + 1) * segments + s]);
  }

  const disc = (s) => {
    const t = (s / segments) * Math.PI * 2;
    return uv(0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5);
  };
  if (capBottom && !closed && profile[0].r > 0) {
    const c = vertices.push({ x: 0, y: profile[0].y, z: 0 }) - 1;
    for (let s = 0; s < segments; s++) {
      faces.push([c, s, (s + 1) % segments]);
      faceUVs.push([uv(0.5, 0.5), disc(s), disc(s + 1)]);
    }
  }
  const last = profile.length - 1;
  if (capTop && !closed && profile[last].r > 0) {
    const c = vertices.push({ x: 0, y: profile[last].y, z: 0 }) - 1;
    const a = last * segments;
    for (let s = 0; s < segments; s++) {
      faces.push([c, a + (s + 1) % segments, a + s]);
      faceUVs.push([uv(0.5, 0.5), disc(s + 1), disc(s)]);
    }
  }

  return { vertices, edges, faces, uvs, faceUVs };
}

/** A capped cylinder along Y, centered on the origin. */
function cylinder(r = 0.3, h = 0.8, segments = 32) {
  return lathe([{ r, y: -h / 2 }, { r, y: h / 2 }], { segments, capBottom: true, capTop: true });
}

/** A cone along Y with its tip up, or a tapered cylinder when `rTop` > 0. */
function cone(r = 0.35, h = 0.8, segments = 32, rTop = 0) {
  // A tiny top ring keeps the tip's faces non-degenerate for UVs and normals
  const profile = [{ r, y: -h / 2 }, { r: rTop > 0 ? rTop : 1e-6, y: h / 2 }];
  return lathe(profile, { segments, capBottom: true, capTop: rTop > 0 });
}

/** A ring in the XZ plane: `R` from the center to the middle of the tube. */
function torus(R = 0.35, tube = 0.12, segments = 48, tubeSegments = 20) {
  tubeSegments = Math.max(3, Math.floor(tubeSegments));
  const profile = [];
  for (let i = 0; i < tubeSegments; i++) {
    const p = (i / tubeSegments) * Math.PI * 2;
    profile.push({ r: R + Math.cos(p) * tube, y: Math.sin(p) * tube });
  }
  return lathe(profile, { segments, closed: true });
}

/**
 * A flat grid in the XZ plane facing +Y, `size` wide, with `div` cells per
 * side. `height(x, z)` lifts each vertex (terrain). The texture covers the
 * whole grid once.
 */
function plane(size = 1, div = 8, height = null) {
  div = Math.max(1, Math.floor(div));
  const vertices = [];
  const uvs = [];
  const n = div + 1;
  const k = (i, j) => j * n + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / div - 0.5) * size, z = (j / div - 0.5) * size;
      vertices.push({ x, y: height ? height(x, z) : 0, z });
      uvs.push({ u: i / div, v: j / div });
    }
  }
  const faces = [];
  const edges = [];
  for (let j = 0; j < div; j++) {
    for (let i = 0; i < div; i++) faces.push([k(i + 1, j + 1), k(i + 1, j), k(i, j), k(i, j + 1)]);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < div; i++) {
      edges.push([k(i, j), k(i + 1, j)]);
      edges.push([k(j, i), k(j, i + 1)]);
    }
  }
  // Grid vertices and UVs share indices
  return { vertices, edges, faces, uvs, faceUVs: faces.map((f) => [...f]) };
}

/** Twice the signed area: > 0 when the points go counter-clockwise (x right, y up). */
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/**
 * Cuts a simple polygon (no holes, sides don't cross) into triangles, by
 * ear clipping. Works for concave outlines. Falls back to a fan if the
 * outline crosses itself.
 *
 * @param {{x:number, y:number}[]} pts - The outline, counter-clockwise (x right, y up)
 * @returns {number[][]} Index triples into `pts`, counter-clockwise too
 */
export function triangulate(pts) {
  const idx = pts.map((_, i) => i);
  const tris = [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;

  let guard = idx.length * idx.length;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or flat corner
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(pts[j], a, b, c))) continue;
      tris.push([i0, i1, i2]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  else for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
  return tris;
}

/**
 * Turns a flat outline in the XY plane into a solid `depth` thick along Z,
 * centered on the origin: blades, axes, keys, stars, letters, floor plans.
 * The outline may go either way round and may be concave (no holes).
 *
 * Texture coordinates: the front and back map the outline's bounding box,
 * the sides wrap u along the outline and v across the depth. Edges are the
 * front and back outlines plus a line at each corner.
 *
 * @example
 * const star = Array.from({ length: 10 }, (_, i) => {
 *   const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.2 : 0.5;
 *   return { x: Math.cos(a) * r, y: Math.sin(a) * r };
 * });
 * scene.add({ mesh: extrude(star, 0.15), material: { fill: "#fc5" } });
 *
 * @param {{x:number, y:number}[]} outline - The flat shape (3 points or more)
 * @param {number} [depth=0.2] - Thickness along Z
 * @returns {import("../index.d.ts").Mesh}
 */
export function extrude(outline, depth = 0.2) {
  const pts = signedArea(outline) < 0 ? [...outline].reverse() : outline;
  const n = pts.length;
  const vertices = [];
  const faces = [];
  const uvs = [];
  const faceUVs = [];
  const uv = (u, v) => uvs.push({ u, v }) - 1;

  // 0..n-1 at the front (-z), n..2n-1 at the back (+z)
  for (const p of pts) vertices.push({ x: p.x, y: p.y, z: -depth / 2 });
  for (const p of pts) vertices.push({ x: p.x, y: p.y, z: depth / 2 });

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
  const capUV = (i) => uv((pts[i].x - x0) / w, (pts[i].y - y0) / h);

  // Caps: counter-clockwise outlines look clockwise from the back (+z), so the
  // back cap keeps that order and the front cap (seen from -z) is reversed
  for (const [a, b, c] of triangulate(pts)) {
    faces.push([n + a, n + b, n + c]);
    faceUVs.push([capUV(a), capUV(b), capUV(c)]);
    faces.push([c, b, a]);
    faceUVs.push([capUV(c), capUV(b), capUV(a)]);
  }

  // Sides, u by length along the outline
  const len = [0];
  for (let i = 0; i < n; i++) len.push(len[i] + Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y));
  const total = len[n] || 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ua = len[i] / total, ub = len[i + 1] / total;
    faces.push([n + j, n + i, i, j]);
    faceUVs.push([uv(ub, 1), uv(ua, 1), uv(ua, 0), uv(ub, 0)]);
  }

  const edges = [
    pts.map((_, i) => i),
    pts.map((_, i) => n + i),
    ...pts.map((_, i) => [i, n + i]),
  ];
  return { vertices, edges, faces, uvs, faceUVs };
}

/**
 * Scales a mesh along the X, Y, and Z axes.
 *
 * This function modifies the mesh **in place** by multiplying
 * each vertex coordinate by the given scale factors.
 *
 * Common use cases:
 * - Change width / height / depth of a box
 * - Stretch a sphere into an ellipsoid
 * - Apply non-uniform scaling to any mesh
 *
 * NOTE:
 * - This affects only vertex positions
 * - Edge indices remain unchanged
 *
 * @param {{ vertices: {x:number,y:number,z:number}[] }} mesh - Mesh to scale
 * @param {number} sx - Scale factor along X axis (default: 1)
 * @param {number} sy - Scale factor along Y axis (default: 1)
 * @param {number} sz - Scale factor along Z axis (default: 1)
 * @returns The same mesh instance after scaling
 */
export function scaleMesh(mesh, sx = 1, sy = 1, sz = 1) {
  for (const v of mesh.vertices) {
    v.x *= sx;
    v.y *= sy;
    v.z *= sz;
  }
  mesh.dirty = true; // so the WebGL renderer uploads the new positions
  return mesh;
}

/**
 * Creates a built-in shape, centered on the origin.
 *
 * | Kind | Options (defaults) |
 * | --- | --- |
 * | `"cube"` | `size` (0.5) |
 * | `"box"` | `w`, `h`, `d` (0.6 each) |
 * | `"sphere"` | `r` (0.45), `rings` (12), `segments` (24) |
 * | `"cylinder"` | `r` (0.3), `h` (0.8), `segments` (32) |
 * | `"cone"` | `r` (0.35), `h` (0.8), `segments` (32), `rTop` (0: pointed; > 0: tapered cylinder) |
 * | `"torus"` | `R` (0.35, center to tube middle), `tube` (0.12), `segments` (48), `tubeSegments` (20) |
 * | `"plane"` | `size` (1), `div` (8 cells per side), `height` ((x, z) => y, optional) |
 *
 * Cylinders, cones and tori stand along Y; the plane lies in XZ facing +Y.
 * Every shape has edges (for wireframes), faces (clockwise from outside)
 * and texture coordinates. For other round or flat shapes, see `lathe`
 * and `extrude`.
 *
 * @param {string} kind - Shape name (case doesn't matter)
 * @param {Object} [opts] - Size options for that shape (see the table)
 * @returns {import("../index.d.ts").Mesh}
 * @throws {Error} If the shape type is not supported
 */
export function makeShape(kind, opts = {}) {
  switch (kind.toLowerCase()) {
    case "cube":  return cubeWire(opts.size ?? 0.5);
    case "box":   return rectPrismWire(opts.w ?? 0.6, opts.h ?? 0.6, opts.d ?? 0.6);
    case "sphere":return sphereWire(opts.r ?? 0.45, opts.rings ?? 12, opts.segments ?? 24);
    case "cylinder": return cylinder(opts.r, opts.h, opts.segments);
    case "cone":  return cone(opts.r, opts.h, opts.segments, opts.rTop);
    case "torus": return torus(opts.R, opts.tube, opts.segments, opts.tubeSegments);
    case "plane": return plane(opts.size, opts.div, opts.height);
    default: throw new Error("Unknown shape: " + kind);
  }
}