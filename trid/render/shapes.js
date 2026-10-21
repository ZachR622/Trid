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
  return mesh;
}

/**
 * Factory function that creates a predefined wireframe shape.
 *
 * This provides a unified API for constructing different meshes
 * (cube, box, sphere) while keeping the rendering pipeline generic.
 *
 * Supported shapes:
 * - "cube"   → wireframe cube
 * - "box"    → rectangular prism (box)
 * - "sphere" → wireframe sphere
 *
 * Each shape type accepts its own configuration options via `opts`.
 * Unspecified options fall back to sensible defaults.
 *
 * @param {string} kind - Shape type identifier
 * @param {Object} opts - Shape configuration options
 * @param {number} [opts.size] - Cube size
 * @param {number} [opts.w] - Box width
 * @param {number} [opts.h] - Box height
 * @param {number} [opts.d] - Box depth
 * @param {number} [opts.r] - Sphere radius
 * @param {number} [opts.rings] - Number of latitude rings (sphere)
 * @param {number} [opts.segments] - Segments per ring (sphere)
 *
 * @returns {{ vertices: {x:number,y:number,z:number}[], edges: number[][] }}
 *          A wireframe mesh object
 *
 * @throws {Error} If the shape type is not supported
 */
export function makeShape(kind, opts = {}) {
  switch (kind.toLowerCase()) {
    case "cube":  return cubeWire(opts.size ?? 0.5);
    case "box":   return rectPrismWire(opts.w ?? 0.6, opts.h ?? 0.6, opts.d ?? 0.6);
    case "sphere":return sphereWire(opts.r ?? 0.45, opts.rings ?? 12, opts.segments ?? 24);
    default: throw new Error("Unknown shape: " + kind);
  }
}