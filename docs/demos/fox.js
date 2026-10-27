import { blobMesh, sweep, loft, spline, makeShape, scaleMesh, bevelMesh, meshQuery, fixWinding, makeTexture } from "./trid/index.js";

// A little sitting fox, made in code, and a round platform for it.
// makeFox() and makePlatform() return groups, ready for scene.add.

const p = (x, y, z) => ({ x, y, z });
const orange = { fill: "#f0843a", smooth: true };
const white = { fill: "#fbf8f4", smooth: true };
const dark = { fill: "#2e1f1a", smooth: true };

// Body: sitting on a full, round seat, with long thin arms set a little out in front of
// the body, and the hind legs stretched forward past them (blobs that melt together)
const ARMS = [-1, 1].map((side) => ({ shoulder: p(side * 0.075, 0.27, 0.1), paw: p(side * 0.055, 0.03, 0.18) })); // paws toward the middle
const LEGS = [-1, 1].map((side) => ({ hip: p(side * 0.11, 0.09, -0.03), heel: p(side * 0.16, 0.05, 0.23) }));
const body = blobMesh([
  { kind: "ellipsoid", center: p(0, 0.21, -0.02), radii: p(0.14, 0.19, 0.13) },
  { kind: "ellipsoid", center: p(0, 0.09, -0.05), radii: p(0.17, 0.1, 0.15) }, // the seat
  ...LEGS.map(({ hip, heel }) => ({ kind: "capsule", a: hip, b: heel, ra: 0.085, rb: 0.045 })), // thighs to heels
  ...ARMS.map(({ shoulder, paw }) => ({ kind: "capsule", a: shoulder, b: paw, radius: 0.032, blend: 0.015 })),
  { kind: "sphere", center: p(0, 0.4, 0.01), radius: 0.11 }, // neck
], { blend: 0.05, resolution: 60 });

// Dark paws: small tips on the arms, and the hind feet pointing up in the air
const paws = blobMesh([
  ...ARMS.map(({ paw }) => ({ kind: "capsule", a: p(paw.x, 0.05, paw.z - 0.004), b: p(paw.x, 0.03, paw.z + 0.004), radius: 0.033 })),
  ...LEGS.map(({ heel }) => ({ kind: "capsule", a: p(heel.x, heel.y, heel.z + 0.02), b: p(heel.x, heel.y + 0.09, heel.z + 0.035), radius: 0.045 })),
], { blend: 0, resolution: 40 });

// A white ruff on the chest
const ruff = blobMesh([
  { kind: "ellipsoid", center: p(0, 0.37, 0.08), radii: p(0.16, 0.12, 0.1) },
  { kind: "sphere", center: p(0, 0.31, 0.11), radius: 0.085 },
], { resolution: 32 });

// Head: big and wide, orange on top...
const HEAD = p(0, 0.6, 0.02);
const head = blobMesh([
  { kind: "ellipsoid", center: p(0, 0, 0), radii: p(0.25, 0.2, 0.2) },
  { kind: "sphere", center: p(0, 0.05, -0.04), radius: 0.17 },
], { blend: 0.05, resolution: 52 });
// ...and white below the eyes, with fluffy cheeks pointing out and a small snout
const face = blobMesh([
  { kind: "ellipsoid", center: p(0, -0.1, 0.07), radii: p(0.24, 0.125, 0.17) },
  { kind: "capsule", a: p(-0.17, -0.09, 0.04), b: p(-0.28, -0.12, 0.01), ra: 0.06, rb: 0.012 },
  { kind: "capsule", a: p(0.17, -0.09, 0.04), b: p(0.28, -0.12, 0.01), ra: 0.06, rb: 0.012 },
  { kind: "sphere", center: p(0, -0.07, 0.18), radius: 0.06 },
], { blend: 0.04, resolution: 52 });

/** A sharp up-and-down wave: 0 at whole numbers, 1 halfway between. For spiky painted edges. */
const zigzag = (u) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1);

/**
 * Paints a mesh: for each face, 1 where `test(center, halfWidth)` is true, else 0, to use
 * as `faceMaterials` with two materials. `halfWidth` is how wide the mesh is at that height.
 */
function paint(mesh, test) {
  const v = mesh.vertices;
  return mesh.faces.map((f) => {
    const c = f.reduce((a, i) => p(a.x + v[i].x / f.length, a.y + v[i].y / f.length, a.z + v[i].z / f.length), p(0, 0, 0));
    let halfWidth = 0;
    for (const q of v) if (Math.abs(q.y - c.y) < 0.012) halfWidth = Math.max(halfWidth, Math.abs(q.x));
    return test(c, halfWidth) ? 1 : 0;
  });
}

// Ears: lofted from a flat oval to a point. The pale inside is painted on: the faces on
// the front, away from the edges and the tip, use the second material
const oval = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { x: Math.cos(a) * 0.035, y: Math.sin(a) * 0.12 };
});
const earPath = spline([p(0, 0, 0), p(0, 0.13, -0.01), p(0, 0.25, -0.03)], { count: 14 });
const ear = loft([
  { at: 0, outline: oval }, { at: 0.5, outline: oval, scale: 0.7 }, { at: 1, outline: [{ x: 0, y: 0 }] },
], { path: earPath, segments: 30, points: 72 });
// Smooth sides, and spiky points at the top, reaching toward the tip like tufts of fur
ear.faceMaterials = paint(ear, (c, halfWidth) => c.z > 0 && c.y > 0.06 && Math.abs(c.x) < halfWidth * 0.62
  && c.y < 0.15 + 0.07 * zigzag(c.x * 18 + 0.5) ** 2);

// Eyes and nose stuck on the head: a ray from the front finds where its surface is
const headQuery = meshQuery(head), faceQuery = meshQuery(face);
const onFront = (q, x, y) => q.raycast(p(x, y, 1), p(0, 0, -1)).point;
const eye = scaleMesh(makeShape("sphere", { r: 1, rings: 12, segments: 16 }), 0.026, 0.036, 0.016);
const nose = scaleMesh(makeShape("sphere", { r: 1, rings: 10, segments: 14 }), 0.03, 0.019, 0.02);

// Tail: thick and fluffy, out from the back (it starts inside the seat, so it grows out of
// it), then curving forward along one side and up to the middle of the body
const tailPath = spline([p(0.02, 0.1, -0.12), p(0.2, 0.07, -0.22), p(0.36, 0.08, -0.06), p(0.33, 0.16, 0.1), p(0.24, 0.26, 0.17)], { count: 120 });
const SEGMENTS = 40;
const tail = sweep(tailPath, {
  radius: (t) => (0.06 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (1 - (0.8 * Math.max(0, t - 0.85)) / 0.15),
  segments: SEGMENTS,
});

// Its white tip: a thin shell over the end of the tail, made from the tail's own rings
// (sweep makes SEGMENTS vertices per ring, ring after ring), pushed out a little. Its lower
// edge is cut in a zigzag, so it ends in short, sharp points
function makeTailTip({ points = 6, from = 0.82, depth = 0.13, rows = 70 } = {}) {
  const last = tailPath.length - 1, S = SEGMENTS, v = tail.vertices;
  const lerp = (a, b, f) => p(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
  // A point on ring k (k can be between two rings), corner a, 8% further from the middle
  const at = (k, a) => {
    const k0 = Math.min(Math.floor(k), last - 1), f = k - k0;
    const c = lerp(tailPath[k0], tailPath[k0 + 1], f), q = lerp(v[k0 * S + a], v[(k0 + 1) * S + a], f);
    return lerp(c, q, 1.08);
  };
  const vertices = [], faces = [];
  for (let j = 0; j <= rows; j++) {
    for (let a = 0; a < S; a++) {
      const start = (from - depth * zigzag((a / S) * points) ** 1.8) * last; // lower where the points are; ** 1.8 sharpens them
      vertices.push(at(start + (j / rows) * (last - start), a));
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let a = 0; a < S; a++) faces.push([j * S + a, j * S + ((a + 1) % S), (j + 1) * S + ((a + 1) % S), (j + 1) * S + a]);
  }
  // Close the end with a fan around one point just past the tail's end
  const end = vertices.push(lerp(tailPath[last - 1], tailPath[last], 1.6)) - 1;
  for (let a = 0; a < S; a++) faces.push([rows * S + ((a + 1) % S), rows * S + a, end]);
  return fixWinding({ vertices, faces }); // turn every face outward
}
const tailTip = makeTailTip();

// The platform: a low round stand with soft edges, its top at y = 0
const stand = bevelMesh(makeShape("cylinder", { r: 0.5, h: 0.08, segments: 64 }), { radius: 0.03, segments: 3 });

/** A new fox: a group of parts, sitting with its paws at y = 0, facing +z. */
export function makeFox() {
  const eyes = [-0.095, 0.095].map((x) => ({ mesh: eye, pos: onFront(headQuery, x, 0.01), rot: p(0, x * 2.5, 0), material: dark }));
  return {
    name: "fox",
    children: [
      { mesh: body, material: orange },
      { mesh: paws, material: dark },
      { mesh: ruff, material: white },
      {
        name: "head",
        pos: HEAD,
        children: [
          { mesh: head, material: orange },
          { mesh: face, material: white },
          ...eyes,
          { mesh: nose, pos: onFront(faceQuery, 0, -0.05), material: dark },
          // Ears sunk well into the head, so their base doesn't show
          ...[-1, 1].map((side) => ({ mesh: ear, pos: p(side * 0.12, 0.08, -0.03), rot: p(0, 0, -side * 0.35), material: [orange, white] })),
        ],
      },
      { name: "tail", children: [{ mesh: tail, material: orange }, { mesh: tailTip, material: white }] },
    ],
  };
}

/**
 * A round platform with its top at y = 0: brown, another color, or "wood" for a wood texture
 * (seen from above with planar mapping along Y, so its grain runs across the top).
 */
export function makePlatform(fill = "#7a4a2a") {
  const material = fill === "wood"
    ? { texture: makeTexture("wood", { size: 512, scale: 2, seed: 3 }), mapping: { type: "planar", axis: "y" }, smooth: true }
    : { fill, smooth: true };
  return { name: "platform", mesh: stand, pos: p(0, -0.04, 0), material };
}
