import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeShape, cloneMesh, transformMesh, displaceMesh, blobMesh, rng, noise3,
  meshQuery, raycastMesh, pointInMesh, distanceToMesh, closestPointOnMesh, isClosed, raycastScene, clearQueryCache,
} from "../trid/index.js";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearPoint = (p, q, eps = 1e-9) => near(p.x, q.x, eps) && near(p.y, q.y, eps) && near(p.z, q.z, eps);
const unit = (p) => {
  const l = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};

/** A bumpy closed body with a few thousand faces. */
function lumpy() {
  const m = makeShape("sphere", { r: 1, rings: 40, segments: 60 });
  return displaceMesh(m, (v) => {
    const k = 1 + 0.25 * noise3(v.x * 2, v.y * 2, v.z * 2);
    return { x: v.x * k, y: v.y * k, z: v.z * k };
  });
}

/** Every triangle of a mesh, the slow way (fans from each face's first corner). */
function triangles(mesh) {
  const out = [];
  mesh.faces.forEach((f, face) => {
    for (let i = 1; i + 1 < f.length; i++) out.push({ face, a: mesh.vertices[f[0]], b: mesh.vertices[f[i]], c: mesh.vertices[f[i + 1]] });
  });
  return out;
}

/** Distances of every hit along a ray, testing every triangle (Möller–Trumbore), for comparison. */
function bruteHits(tris, o, d) {
  const out = [];
  for (const { a, b, c } of tris) {
    const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, e2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const p = { x: d.y * e2.z - d.z * e2.y, y: d.z * e2.x - d.x * e2.z, z: d.x * e2.y - d.y * e2.x };
    const det = e1.x * p.x + e1.y * p.y + e1.z * p.z;
    if (Math.abs(det) < 1e-14) continue;
    const s = { x: o.x - a.x, y: o.y - a.y, z: o.z - a.z };
    const u = (s.x * p.x + s.y * p.y + s.z * p.z) / det;
    if (u < 0 || u > 1) continue;
    const q = { x: s.y * e1.z - s.z * e1.y, y: s.z * e1.x - s.x * e1.z, z: s.x * e1.y - s.y * e1.x };
    const w = (d.x * q.x + d.y * q.y + d.z * q.z) / det;
    if (w < 0 || u + w > 1) continue;
    const t = (e2.x * q.x + e2.y * q.y + e2.z * q.z) / det;
    if (t > 1e-9) out.push(t);
  }
  return out;
}

const bruteRay = (mesh, o, d) => Math.min(Infinity, ...bruteHits(triangles(mesh), o, d));

/** Distance to the surface, the slow way: the nearest of every triangle on its own. */
function bruteDistance(singles, p) {
  let best = Infinity;
  for (const one of singles) best = Math.min(best, one.distance(p));
  return best;
}

test("raycast finds where a ray meets a cube, with the outward normal", () => {
  const cube = makeShape("cube", { size: 1 });
  const q = meshQuery(cube);
  const hit = q.raycast({ x: -3, y: 0.1, z: 0.2 }, { x: 2, y: 0, z: 0 });
  assert.ok(nearPoint(hit.point, { x: -0.5, y: 0.1, z: 0.2 }));
  assert.ok(nearPoint(hit.normal, { x: -1, y: 0, z: 0 }));
  assert.ok(near(hit.distance, 2.5));
  assert.equal(hit.front, true);
  assert.equal(cube.faces[hit.face].length, 4);
  // The triangle and weights give the point back
  const [i, j, k] = hit.triangle, [wa, wb, wc] = hit.barycentric, v = cube.vertices;
  assert.ok(nearPoint({
    x: wa * v[i].x + wb * v[j].x + wc * v[k].x,
    y: wa * v[i].y + wb * v[j].y + wc * v[k].y,
    z: wa * v[i].z + wb * v[j].z + wc * v[k].z,
  }, hit.point));
});

test("raycast from inside hits the back of a face; side picks which faces count", () => {
  const q = meshQuery(makeShape("cube", { size: 1 }));
  const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 1, z: 0 };
  const inside = q.raycast(o, d);
  assert.equal(inside.front, false);
  assert.ok(nearPoint(inside.normal, { x: 0, y: 1, z: 0 }), "the normal still points out");
  assert.equal(q.raycast(o, d, { side: "front" }), null);
  assert.ok(q.raycast(o, d, { side: "back" }));
  // From outside, "back" goes through the near face to the far one
  const far = q.raycast({ x: 0, y: -3, z: 0 }, d, { side: "back" });
  assert.ok(near(far.point.y, 0.5));
});

test("raycast misses, stops at maxDistance, and checks its input", () => {
  const q = meshQuery(makeShape("sphere", { r: 1 }));
  assert.equal(q.raycast({ x: 0, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }), null);
  assert.equal(q.raycast({ x: -5, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }), null, "pointing away");
  assert.equal(q.raycast({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { maxDistance: 3.9 }), null);
  assert.ok(q.raycast({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { maxDistance: 4.1 }));
  assert.throws(() => q.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), /direction/);
  assert.throws(() => q.raycast({ x: NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), /origin/);
  assert.throws(() => q.raycast({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { side: "out" }), /side/);
});

test("raycast with the BVH matches testing every triangle", () => {
  const m = lumpy();
  const q = meshQuery(m);
  const r = rng(7);
  let hits = 0;
  for (let n = 0; n < 300; n++) {
    const o = { x: (r() - 0.5) * 6, y: (r() - 0.5) * 6, z: (r() - 0.5) * 6 };
    // Aimed near the body, so most rays hit and some graze it
    const aim = { x: (r() - 0.5) * 3, y: (r() - 0.5) * 3, z: (r() - 0.5) * 3 };
    const d = unit({ x: aim.x - o.x, y: aim.y - o.y, z: aim.z - o.z });
    const expected = bruteRay(m, o, d);
    const hit = q.raycast(o, d);
    if (expected === Infinity) assert.equal(hit, null);
    else {
      hits++;
      assert.ok(near(hit.distance, expected, 1e-9), `ray ${n}: ${hit?.distance} vs ${expected}`);
    }
  }
  assert.ok(hits > 100, `${hits} hits`);
});

test("rays along axes (zero direction parts) and through shared edges still hit", () => {
  const q = meshQuery(makeShape("cube", { size: 1 }));
  for (const d of [{ x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
    const o = { x: -d.x * 4, y: -d.y * 4, z: -d.z * 4 };
    assert.ok(near(q.raycast(o, d).distance, 3.5));
  }
  // Exactly through an edge and a corner
  assert.ok(near(q.raycast({ x: -3, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }).distance, 2.5));
  assert.ok(near(q.raycast({ x: -3, y: -3, z: -3 }, { x: 1, y: 1, z: 1 }).distance, Math.sqrt(3) * 2.5));
});

test("contains tells inside from outside, including a torus's hole", () => {
  const sphere = meshQuery(makeShape("sphere", { r: 1, rings: 24, segments: 48 }));
  const r = rng(3);
  for (let n = 0; n < 300; n++) {
    const p = { x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 2.4, z: (r() - 0.5) * 2.4 };
    const d = Math.hypot(p.x, p.y, p.z);
    if (Math.abs(d - 1) < 0.02) continue; // too close to the faceted surface to say
    assert.equal(sphere.contains(p), d < 1, `point ${JSON.stringify(p)}`);
  }
  const torus = meshQuery(makeShape("torus", { R: 1, tube: 0.3 }));
  assert.equal(torus.contains({ x: 0, y: 0, z: 0 }), false, "the hole");
  assert.equal(torus.contains({ x: 1, y: 0, z: 0 }), true, "in the tube");
  assert.equal(torus.contains({ x: 0, y: 0.2, z: -1 }), true);
  assert.equal(torus.contains({ x: 0, y: 0.5, z: -1 }), false, "above the tube");
});

test("contains is right at points lined up with a cube's edges and corners", () => {
  const q = meshQuery(makeShape("cube", { size: 1 }));
  const grid = [-0.75, -0.5 + 1e-6, -0.25, 0, 0.25, 0.5 - 1e-6, 0.75];
  for (const x of grid) for (const y of grid) for (const z of grid) {
    const inside = Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(z) < 0.5;
    assert.equal(q.contains({ x, y, z }), inside, `${x}, ${y}, ${z}`);
  }
});

test("contains matches on a bumpy body (against counting crossings by hand)", () => {
  const m = lumpy();
  const q = meshQuery(m), tris = triangles(m);
  const r = rng(11);
  for (let n = 0; n < 150; n++) {
    const p = { x: (r() - 0.5) * 3, y: (r() - 0.5) * 3, z: (r() - 0.5) * 3 };
    if (q.distance(p) < 1e-3) continue;
    // Crossings along a slanted ray, the slow way
    const count = bruteHits(tris, p, unit({ x: 0.0123, y: 0.0311, z: 1 })).length;
    assert.equal(q.contains(p), count % 2 === 1, `point ${n}`);
  }
});

test("closest and distance find the nearest point of the surface", () => {
  const cube = meshQuery(makeShape("cube", { size: 1 }));
  const c = cube.closest({ x: 2, y: 0.1, z: 0.2 });
  assert.ok(nearPoint(c.point, { x: 0.5, y: 0.1, z: 0.2 }));
  assert.ok(nearPoint(c.normal, { x: 1, y: 0, z: 0 }));
  assert.ok(near(c.distance, 1.5));
  assert.ok(near(cube.distance({ x: 1.5, y: 1.5, z: 0 }), Math.SQRT2), "to an edge");
  assert.ok(near(cube.distance({ x: 0, y: 0, z: 0 }), 0.5), "from inside");
  assert.equal(cube.distance({ x: 3, y: 0, z: 0 }, 1), Infinity, "past maxDistance");
  assert.equal(cube.closest({ x: 3, y: 0, z: 0 }, { maxDistance: 1 }), null);

  const m = lumpy();
  const q = meshQuery(m);
  const singles = triangles(m).map(({ a, b, c }) => meshQuery({ vertices: [a, b, c], faces: [[0, 1, 2]] }));
  const r = rng(5);
  for (let n = 0; n < 40; n++) {
    const p = { x: (r() - 0.5) * 4, y: (r() - 0.5) * 4, z: (r() - 0.5) * 4 };
    assert.ok(near(q.distance(p), bruteDistance(singles, p), 1e-9), `point ${n}`);
  }
});

test("isClosed: shapes, unwelded meshes, sheets and holes", () => {
  for (const kind of ["cube", "sphere", "torus", "cylinder"]) assert.equal(isClosed(makeShape(kind)), true, kind);
  assert.equal(isClosed(makeShape("plane")), false);
  // A cube of 6 separate faces (24 vertices): matched by position
  const cube = makeShape("cube");
  const vertices = [], faces = [];
  for (const f of cube.faces) faces.push(f.map((i) => vertices.push({ ...cube.vertices[i] }) - 1));
  assert.equal(isClosed({ vertices, faces }), true);
  assert.equal(isClosed({ vertices, faces: faces.slice(1) }), false, "a face missing");
  assert.equal(isClosed({ vertices: [], faces: [] }), false);
  assert.equal(isClosed(blobMesh([{ kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 0.5 }], { resolution: 16 })), true);
});

test("the one-off functions give the same answers as a query", () => {
  const m = makeShape("sphere", { r: 1 });
  const q = meshQuery(m);
  const o = { x: -3, y: 0.2, z: 0.1 }, d = { x: 1, y: 0, z: 0 }, p = { x: 2, y: 0, z: 0 };
  assert.deepEqual(raycastMesh(m, o, d), q.raycast(o, d));
  assert.equal(pointInMesh(m, { x: 0.1, y: 0, z: 0 }), true);
  assert.equal(distanceToMesh(m, p), q.distance(p));
  assert.deepEqual(closestPointOnMesh(m, p), q.closest(p));
});

test("a query is a snapshot, and empty or broken meshes are handled", () => {
  const m = makeShape("cube", { size: 1 });
  const q = meshQuery(m);
  transformMesh(m, { pos: { x: 10, y: 0, z: 0 } });
  assert.ok(near(q.raycast({ x: -3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).distance, 2.5), "still the old place");

  const empty = meshQuery({ vertices: [], faces: [] });
  assert.equal(empty.triangleCount, 0);
  assert.equal(empty.raycast({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), null);
  assert.equal(empty.contains({ x: 0, y: 0, z: 0 }), false);
  assert.equal(empty.distance({ x: 0, y: 0, z: 0 }), Infinity);
  assert.equal(meshQuery({ vertices: [{ x: 0, y: 0, z: 0 }] }).triangleCount, 0, "no faces");

  // Faces to missing vertices are skipped
  const broken = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 1, 2], [0, 1, 7], null] };
  assert.equal(meshQuery(broken).triangleCount, 1);
});

test("queries stay fast on a big mesh", () => {
  const m = makeShape("sphere", { r: 1, rings: 100, segments: 160 }); // ~32K triangles
  const q = meshQuery(m);
  const r = rng(1);
  const start = performance.now();
  for (let n = 0; n < 2000; n++) {
    q.raycast({ x: (r() - 0.5) * 4, y: (r() - 0.5) * 4, z: -5 }, { x: 0, y: 0, z: 1 });
    q.contains({ x: (r() - 0.5) * 2, y: (r() - 0.5) * 2, z: (r() - 0.5) * 2 });
  }
  const ms = performance.now() - start;
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms for 2000 rays and 2000 inside tests`);
});

test("raycastScene works in world space with position, rotation, scale and groups", () => {
  const cube = makeShape("cube", { size: 1 });
  const a = { mesh: cube, pos: { x: 5, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 } };
  const group = { pos: { x: 0, y: 3, z: 0 }, rot: { x: 0, y: Math.PI / 4, z: 0 }, children: [{ mesh: cube }] };
  const objects = [a, group];

  const hit = raycastScene(objects, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  assert.equal(hit.object, a);
  assert.ok(nearPoint(hit.point, { x: 4, y: 0, z: 0 }));
  assert.ok(nearPoint(hit.local, { x: -0.5, y: 0, z: 0 }));
  assert.ok(near(hit.distance, 4));
  assert.ok(nearPoint(hit.normal, { x: -1, y: 0, z: 0 }));
  assert.deepEqual(hit.path, [a]);

  // The turned cube in the group: its corner points along x after 45°
  const g = raycastScene(objects, { x: -5, y: 3, z: 0 }, { x: 1, y: 0, z: 0 });
  assert.equal(g.object, group.children[0]);
  assert.deepEqual(g.path, [group.children[0], group]);
  assert.ok(near(g.point.x, -Math.SQRT1_2, 1e-9));
  assert.ok(near(Math.hypot(g.normal.x, g.normal.y, g.normal.z), 1));

  // maxDistance is in world units
  assert.equal(raycastScene(objects, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { maxDistance: 3.9 }), null);
});

test("raycastScene: the nearest object wins; hidden, unpickable and filtered ones are skipped", () => {
  const m = makeShape("sphere", { r: 0.5 });
  const near1 = { mesh: m, pos: { x: 0, y: 0, z: 2 } };
  const far1 = { mesh: m, pos: { x: 0, y: 0, z: 5 } };
  const objects = [far1, near1];
  const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: 1 };
  assert.equal(raycastScene(objects, o, d).object, near1);
  assert.equal(raycastScene(objects, o, d, { filter: (obj) => obj !== near1 }).object, far1);
  near1.visible = false;
  assert.equal(raycastScene(objects, o, d).object, far1);
  near1.visible = true;
  near1.pickable = false;
  assert.equal(raycastScene(objects, o, d).object, far1);
  assert.equal(raycastScene([{ mesh: { vertices: m.vertices, edges: [[0, 1]] } }], o, d), null, "lines only");
  assert.equal(raycastScene([{ mesh: m, scale: { x: 0, y: 0, z: 0 } }], o, d), null, "scaled to nothing");
});

test("raycastScene: stretched and mirrored objects keep outward normals", () => {
  const cube = makeShape("cube", { size: 1 });
  const stretched = { mesh: cube, rot: { x: 0, y: 0, z: 0.3 }, scale: { x: 4, y: 1, z: 1 } };
  const h = raycastScene([stretched], { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
  // The top face tilts by the stretch; the normal stays perpendicular to it in the world
  const n = h.normal, tilt = { x: Math.cos(0.3), y: Math.sin(0.3), z: 0 }; // the stretched side's direction
  assert.ok(near(n.x * tilt.x + n.y * tilt.y, 0, 1e-9));
  assert.ok(n.y > 0);

  const mirrored = { mesh: cube, scale: { x: -1, y: 1, z: 1 } };
  const m = raycastScene([mirrored], { x: -3, y: 0.1, z: 0.1 }, { x: 1, y: 0, z: 0 });
  assert.ok(nearPoint(m.normal, { x: -1, y: 0, z: 0 }));
  assert.equal(m.front, true);
});

test("raycastScene notices changed meshes, and clearQueryCache forgets one", () => {
  const m = makeShape("cube", { size: 1 });
  const obj = { mesh: m };
  const o = { x: -5, y: 0, z: 0 }, d = { x: 1, y: 0, z: 0 };
  assert.ok(near(raycastScene([obj], o, d).distance, 4.5));
  // In place with dirty set (like transformMesh does)
  transformMesh(m, { pos: { x: 1, y: 0, z: 0 } });
  assert.ok(near(raycastScene([obj], o, d).distance, 5.5));
  // In place after a renderer cleared dirty: clearQueryCache
  m.dirty = false;
  for (const v of m.vertices) v.x += 1;
  assert.ok(near(raycastScene([obj], o, d).distance, 5.5), "still cached");
  clearQueryCache(m);
  assert.ok(near(raycastScene([obj], o, d).distance, 6.5));
  // New arrays are noticed on their own
  obj.mesh = cloneMesh(makeShape("cube", { size: 1 }));
  assert.ok(near(raycastScene([obj], o, d).distance, 4.5));
});
