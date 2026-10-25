/**
 * Bevel: rounds (or cuts) the sharp edges and corners of any mesh, like a
 * bevel modifier. Manufactured things are rarely sharp-edged: furniture,
 * devices, robots, panels.
 */
import { newell } from "../render/normals.js";
import { samePlace, defaultEps, distinctCorners, weldVertices, cleanMesh } from "./cleanup.js";
import { add, sub, mul, dot, cross, len, norm } from "./vec.js";

const keyOf = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / pts.length);

/**
 * The mesh as one surface: vertices at the same place merged, faces with
 * their outward normals, edges with the faces along them, and the faces
 * around each vertex in order (null where the vertex is on an open border).
 */
function surface(mesh) {
  const vs = mesh?.vertices ?? [];
  const rep = samePlace(vs, defaultEps(vs));
  const index = new Map(), P = [];
  const at = (i) => {
    const r = rep[i];
    if (!index.has(r)) index.set(r, P.push({ x: vs[r].x, y: vs[r].y, z: vs[r].z }) - 1);
    return index.get(r);
  };
  const okVertex = (i) => Number.isInteger(i) && i >= 0 && i < vs.length && Number.isFinite(vs[i].x + vs[i].y + vs[i].z);
  const F = [], src = [];
  (mesh?.faces ?? []).forEach((f, n) => {
    if (!Array.isArray(f) || !f.every(okVertex)) return;
    const keep = distinctCorners(f.map(at));
    if (keep.length < 3 || new Set(keep.map(([v]) => v)).size !== keep.length) return;
    F.push(keep.map(([v]) => v));
    src.push({ n, corners: keep.map(([, c]) => c) });
  });
  if (!F.length) return null;
  const N = F.map((f) => norm(newell(f.map((i) => P[i])), { x: 0, y: 1, z: 0 }));

  // Edges: the faces along each, with the corner where each one starts it (f[c] → f[c + 1])
  const E = new Map();
  F.forEach((f, fi) => f.forEach((a, c) => {
    const b = f[(c + 1) % f.length];
    const k = keyOf(a, b);
    (E.get(k) ?? E.set(k, []).get(k)).push({ f: fi, c, a, b });
  }));
  /** The other face on the edge leaving corner (fi, c), going the other way along it (null on an open or odd edge). */
  const twin = (fi, c) => {
    const f = F[fi], a = f[c], b = f[(c + 1) % f.length];
    const list = E.get(keyOf(a, b));
    if (list?.length !== 2) return null;
    const o = list[0].f === fi && list[0].c === c ? list[1] : list[0];
    return o.a === b && o.b === a ? o : null;
  };

  // The corners around each vertex, in order: the next one is across the current one's outgoing edge
  const cornersAt = P.map(() => []);
  F.forEach((f, fi) => f.forEach((v, c) => cornersAt[v].push([fi, c])));
  const fans = cornersAt.map((list) => {
    if (!list.length) return null;
    const order = [];
    let [fi, c] = list[0];
    for (let guard = 0; guard <= list.length; guard++) {
      order.push([fi, c]);
      const t = twin(fi, c);
      if (!t) return null;
      fi = t.f;
      c = (t.c + 1) % F[fi].length;
      if (fi === list[0][0] && c === list[0][1]) return order.length === list.length ? order : null;
    }
    return null;
  });

  let lo = Infinity, hi = -Infinity;
  for (const p of P) { lo = Math.min(lo, p.x, p.y, p.z); hi = Math.max(hi, p.x, p.y, p.z); }

  // Texture coordinates: a flat (affine) map per face, so new points on it get matching ones
  let uvMaps = null;
  if (Array.isArray(mesh.uvs) && Array.isArray(mesh.faceUVs)) {
    uvMaps = src.map(({ n, corners }, fi) => {
      const c = mesh.faceUVs[n];
      if (!Array.isArray(c) || c.length !== mesh.faces[n].length) return null;
      const uv = corners.map((k) => mesh.uvs[c[k]]);
      if (uv.some((t) => !t || !Number.isFinite(t.u + t.v))) return null;
      return affineUV(F[fi].map((i) => P[i]), uv, N[fi]);
    });
    if (uvMaps.some((m) => !m)) uvMaps = null;
  }
  return { P, F, src, N, E, twin, fans, size: hi - lo || 1, at, uvMaps };
}

/** A map from points (on or near a face's plane) to texture coordinates, fitted to the face's corners. */
function affineUV(pts, uvs, n) {
  const o = pts[0];
  const e1 = norm(sub(pts[1], o), { x: 1, y: 0, z: 0 });
  const e2 = cross(n, e1);
  // Least squares for u = a s + b t + c (and v), from the corners' plane coordinates
  let ss = 0, st = 0, tt = 0, s1 = 0, t1 = 0, n1 = 0;
  const ru = [0, 0, 0], rv = [0, 0, 0];
  pts.forEach((p, i) => {
    const d = sub(p, o), s = dot(d, e1), t = dot(d, e2);
    ss += s * s; st += s * t; tt += t * t; s1 += s; t1 += t; n1 += 1;
    ru[0] += s * uvs[i].u; ru[1] += t * uvs[i].u; ru[2] += uvs[i].u;
    rv[0] += s * uvs[i].v; rv[1] += t * uvs[i].v; rv[2] += uvs[i].v;
  });
  const solve = (r) => {
    const m = [[ss, st, s1], [st, tt, t1], [s1, t1, n1]];
    const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const D = det(m);
    if (Math.abs(D) < 1e-18) return [0, 0, r[2] / n1];
    return [0, 1, 2].map((col) => det(m.map((row, i) => row.map((x, j) => (j === col ? r[i] : x)))) / D);
  };
  const [ua, ub, uc] = solve(ru), [va, vb, vc] = solve(rv);
  return (p) => {
    const d = sub(p, o), s = dot(d, e1), t = dot(d, e2);
    return { u: ua * s + ub * t + uc, v: va * s + vb * t + vc };
  };
}

/**
 * A hole's outline, untangled: points at the same place in a row count once,
 * and where the outline comes back to a point it already passed (two rounded
 * edges starting the same way at a concave corner), the little loop between
 * is split off. Returns the main outline and the little loops (each filled
 * with its own flat face, so the surface stays closed).
 */
function untangle(ring, vertices, eps) {
  const same = (a, b) => len(sub(vertices[a], vertices[b])) <= eps;
  let list = ring.filter((v, i) => !same(v, ring[(i + ring.length - 1) % ring.length]));
  const extra = [];
  for (let changed = true; changed;) {
    changed = false;
    search: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!same(list[i], list[j])) continue;
        const inner = list.slice(i, j), rest = [...list.slice(0, i), ...list.slice(j)];
        const [small, big] = inner.length <= rest.length ? [inner, rest] : [rest, inner];
        if (small.length >= 3) extra.push(small);
        list = big;
        changed = true;
        break search;
      }
    }
  }
  return { main: list, extra };
}

/** Collects the new mesh: vertices, faces, and for each face the original face it takes its material and texture from. */
function builder() {
  const vertices = [], faces = [], from = [];
  return {
    vertices, faces, from,
    vertex: (p) => vertices.push({ x: p.x, y: p.y, z: p.z }) - 1,
    face(ids, fi) {
      const keep = distinctCorners(ids).map(([v]) => v);
      if (keep.length >= 3) {
        faces.push(keep);
        from.push(fi);
      }
    },
  };
}

/**
 * Turns the patch faces made since `start` so they go from `a` to `b` where
 * they touch that ring edge: the way that fits the faces around them.
 */
function orientByRing(out, start, a, b) {
  for (let i = start; i < out.faces.length; i++) {
    const f = out.faces[i];
    for (let c = 0; c < f.length; c++) {
      const p = f[c], q = f[(c + 1) % f.length];
      if (p === a && q === b) return;
      if (p === b && q === a) {
        for (let j = start; j < out.faces.length; j++) out.faces[j].reverse();
        return;
      }
    }
  }
}

/** The original face (among `faces`) whose normal is closest to the polygon's: its material and texture for a patch face. */
function nearestFace(B, faces, pts) {
  const n = norm(newell(pts), null);
  if (!n) return faces[0];
  let best = faces[0], bd = -Infinity;
  for (const f of faces) {
    const d = Math.abs(dot(B.N[f], n));
    if (d > bd) { bd = d; best = f; }
  }
  return best;
}

/** The new mesh, with texture coordinates and materials from the original faces, welded and cleaned. */
function finish(out, B, mesh) {
  const m = { vertices: out.vertices, faces: out.faces };
  if (B.uvMaps) {
    const uvs = [];
    m.faceUVs = out.faces.map((f, i) => f.map((v) => uvs.push(B.uvMaps[out.from[i]](out.vertices[v])) - 1));
    m.uvs = uvs;
  }
  if (Array.isArray(mesh.faceMaterials)) m.faceMaterials = out.from.map((fi) => mesh.faceMaterials[B.src[fi].n] ?? 0);
  if (mesh.materialNames) m.materialNames = [...mesh.materialNames];
  weldVertices(m, B.size * 1e-9);
  cleanMesh(m);
  delete m.dirty;
  return m;
}

/** A rounded patch over a ring of points around `c` (a fan of rings toward a middle point), or one flat face. */
function patch(out, ring, c, segs, fi) {
  if (segs < 2 || !c) return out.face(ring, fi);
  const dirs = ring.map((v) => sub(out.vertices[v], c));
  const lens = dirs.map(len);
  const mdir = norm(dirs.reduce((s, d, i) => add(s, mul(d, 1 / (lens[i] || 1))), { x: 0, y: 0, z: 0 }), null);
  if (!mdir) return out.face(ring, fi);
  const mlen = lens.reduce((a, b) => a + b, 0) / lens.length;
  const middle = out.vertex(add(c, mul(mdir, mlen)));
  const level = (j, l) => {
    if (l === segs) return ring[j];
    const t = l / segs;
    const d = norm(add(mul(mdir, 1 - t), mul(norm(dirs[j], mdir), t)), mdir);
    return out.vertex(add(c, mul(d, mlen + (lens[j] - mlen) * t)));
  };
  const rows = ring.map((_, j) => Array.from({ length: segs + 1 }, (_, l) => (l === 0 ? middle : level(j, l))));
  for (let j = 0; j < ring.length; j++) {
    const a = rows[j], b = rows[(j + 1) % ring.length];
    out.face([middle, a[1], b[1]], fi);
    for (let l = 1; l < segs; l++) out.face([a[l], a[l + 1], b[l + 1], b[l]], fi);
  }
}

/** A rounded corner where 3 rounded edges meet: a triangle of points on the ball around `c`. */
function cornerPatch(out, ring, c, segs, fi) {
  const s = segs;
  const V = [ring[0], ring[s], ring[2 * s]].map((v) => out.vertices[v]);
  const d = V.map((p) => norm(sub(p, c), { x: 0, y: 1, z: 0 }));
  const l = V.map((p) => len(sub(p, c)));
  const inner = new Map();
  const pt = (a, b, k) => {
    if (k === 0) return ring[b];
    if (a === 0) return ring[s + k];
    if (b === 0) return ring[(2 * s + a) % (3 * s)];
    const key = `${a},${b}`;
    if (!inner.has(key)) {
      const dir = norm(add(add(mul(d[0], a), mul(d[1], b)), mul(d[2], k)), d[0]);
      inner.set(key, out.vertex(add(c, mul(dir, (a * l[0] + b * l[1] + k * l[2]) / s))));
    }
    return inner.get(key);
  };
  for (let a = 0; a < s; a++) {
    for (let b = 0; b < s - a; b++) {
      const k = s - a - b;
      out.face([pt(a, b, k), pt(a + 1, b, k - 1), pt(a, b + 1, k - 1)], fi);
      if (b < s - a - 1) out.face([pt(a + 1, b, k - 1), pt(a + 1, b + 1, k - 2), pt(a, b + 1, k - 1)], fi);
    }
  }
}

/**
 * How far a face's corner at `x` moves, for a radius of 1: to where the
 * lines of its two edges cross, each pushed into the face by its offset
 * (0 for an edge that isn't beveled).
 */
function cornerMove(n, u, x, w, kin, kout) {
  if (!kin && !kout) return { x: 0, y: 0, z: 0 };
  const dIn = norm(sub(x, u), null), dOut = norm(sub(w, x), null);
  if (!dIn || !dOut) return { x: 0, y: 0, z: 0 };
  const mIn = norm(cross(n, dIn), dIn), mOut = norm(cross(n, dOut), dOut);
  const den = dot(dOut, mIn);
  // Edges in a straight line: just push in
  if (Math.abs(den) < 1e-9) return mul(mIn, Math.max(kin, kout));
  const a = (kin - kout * dot(mOut, mIn)) / den;
  return add(mul(dOut, a), mul(mOut, kout));
}

/** Rounds (or cuts) the selected edges with a ball of `radius` rolling along them. */
function bevelEdges(B, mesh, radius, segs, angle, edgeList) {
  const { P, F, N, E, twin, fans } = B;

  // Which edges: the listed ones, or every edge where faces meet sharper than `angle`
  const sel = new Set();
  if (Array.isArray(edgeList)) {
    for (const line of edgeList) {
      if (!Array.isArray(line)) continue;
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1];
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= mesh.vertices.length || b >= mesh.vertices.length) continue;
        sel.add(keyOf(B.at(a), B.at(b)));
      }
    }
  } else {
    const minDot = Math.cos((angle * Math.PI) / 180);
    for (const [k, list] of E) if (list.length === 2 && dot(N[list[0].f], N[list[1].f]) < minDot - 1e-9) sel.add(k);
  }
  // Only edges between two faces going opposite ways, away from open borders
  const info = new Map();
  for (const k of sel) {
    const list = E.get(k);
    if (list?.length !== 2 || list[0].a !== list[1].b || !fans[list[0].a] || !fans[list[0].b]) continue;
    const [A, Bf] = list;
    const cosT = Math.max(-1, Math.min(1, dot(N[A.f], N[Bf.f])));
    const theta = Math.min(Math.acos(cosT), (170 * Math.PI) / 180);
    if (theta < 1e-6) continue;
    const cB = centroid(F[Bf.f].map((i) => P[i]));
    info.set(k, { A, B: Bf, off: Math.tan(theta / 2), convex: dot(N[A.f], sub(cB, P[A.a])) < 0 });
  }

  // How far each face's corner moves (for a radius of 1): its edges' lines, pushed into the face where beveled
  const offOf = (a, b) => info.get(keyOf(a, b))?.off ?? 0;
  const move = F.map((f, fi) => f.map((x, c) => {
    const k = f.length;
    return cornerMove(N[fi], P[f[(c + k - 1) % k]], P[x], P[f[(c + 1) % k]], offOf(f[(c + k - 1) % k], x), offOf(x, f[(c + 1) % k]));
  }));

  // Faces in one plane joined by edges that aren't beveled (a cap cut into triangles) act as one face:
  // they all take the corner between the beveled edges on either side of them.
  // A corner is rounded when every run of faces between its beveled edges is flat like that.
  const roundAt = new Map();
  fans.forEach((fan, x) => {
    if (!fan) return;
    const L = fan.length;
    const nextOf = ([fi, c]) => F[fi][(c + 1) % F[fi].length], prevOf = ([fi, c]) => F[fi][(c + F[fi].length - 1) % F[fi].length];
    const cut = fan.map((corner) => info.has(keyOf(x, nextOf(corner))));
    const first = cut.indexOf(true);
    if (first < 0) return;
    let flatRuns = true;
    for (let i = (first + 1) % L, n = 0; n < L;) {
      const run = [];
      do {
        run.push(fan[i]);
        const end = cut[i];
        i = (i + 1) % L;
        n++;
        if (end) break;
      } while (n < L);
      const n0 = N[run[0][0]];
      const flat = run.every(([fi]) => dot(N[fi], n0) > 1 - 1e-9);
      if (!flat) flatRuns = false;
      else if (run.length > 1) {
        const a = run[0], b = run[run.length - 1];
        const m = cornerMove(n0, P[prevOf(a)], P[x], P[nextOf(b)], offOf(prevOf(a), x), offOf(x, nextOf(b)));
        for (const [fi, c] of run) move[fi][c] = m;
      }
    }
    roundAt.set(x, flatRuns);
  });

  // Shrink the radius (everywhere) where bevels from both ends of an edge would meet
  let r = radius;
  F.forEach((f, fi) => f.forEach((x, c) => {
    const y = f[(c + 1) % f.length];
    const L = len(sub(P[y], P[x]));
    const d = norm(sub(P[y], P[x]), null);
    if (!d) return;
    const along = dot(move[fi][c], d) + dot(move[fi][(c + 1) % f.length], mul(d, -1));
    if (along > 1e-12) r = Math.min(r, (0.98 * L) / along);
  }));

  const out = builder();
  const q = F.map((f, fi) => f.map((x, c) => add(P[x], mul(move[fi][c], r))));
  const qId = q.map((list) => list.map((p) => out.vertex(p)));
  const eps = B.size * 1e-9;

  // Each rounded edge's profile at each end: from face A's side to face B's, around the rolling ball's center
  const prof = new Map(), centers = new Map();
  for (const [k, e] of info) {
    const { A, B: Bf, convex } = e;
    const s = convex ? 1 : -1;
    for (const x of [A.a, A.b]) {
      const ca = x === A.a ? A.c : (A.c + 1) % F[A.f].length;
      const cb = x === A.a ? (Bf.c + 1) % F[Bf.f].length : Bf.c;
      const qa = q[A.f][ca], qb = q[Bf.f][cb];
      const c = mul(add(sub(qa, mul(N[A.f], s * r)), sub(qb, mul(N[Bf.f], s * r))), 0.5);
      const ids = [qId[A.f][ca]];
      const da = sub(qa, c), db = sub(qb, c), la = len(da), lb = len(db);
      for (let j = 1; j < segs; j++) {
        const t = j / segs;
        const dir = norm(add(mul(norm(da, db), 1 - t), mul(norm(db, da), t)), da);
        ids.push(out.vertex(add(c, mul(dir, la + (lb - la) * t))));
      }
      ids.push(qId[Bf.f][cb]);
      prof.set(`${k}|${x}`, ids);
      (centers.get(x) ?? centers.set(x, []).get(x)).push(c);
    }
  }

  // Corners: the hole around each vertex with beveled edges. When exactly one face there is
  // untouched (both its edges at the vertex are sharp), the hole becomes part of that face
  // (a rounded edge ending on a flat side); otherwise it gets its own patch.
  const replace = new Map(), patches = [];
  fans.forEach((fan, x) => {
    if (!fan) return;
    const outKeys = fan.map(([fi, c]) => keyOf(x, F[fi][(c + 1) % F[fi].length]));
    const count = outKeys.filter((k) => info.has(k)).length;
    if (!count) return;
    const ring = [];
    fan.forEach(([fi, c], i) => {
      ring.push(qId[fi][c]);
      const k = outKeys[i];
      if (!info.has(k)) return;
      const inner = prof.get(`${k}|${x}`).slice(1, -1);
      ring.push(...(info.get(k).A.f === fi ? inner : inner.reverse()));
    });
    const untouched = fan.filter(([fi, c]) => len(move[fi][c]) === 0);
    if (untouched.length === 1) {
      const [fi, c] = untouched[0];
      const L = ring.length, at = ring.indexOf(qId[fi][c]);
      // The face goes round the hole the other way from the fan, from its incoming neighbor's point to its outgoing one's
      replace.set(`${fi}|${c}`, Array.from({ length: L - 1 }, (_, t) => ring[(at - 1 - t + 2 * L) % L]));
      return;
    }
    patches.push({ x, fan, ring, count, outKeys });
  });

  // Faces, with their corners moved; a corner next to an edge that isn't beveled also takes
  // the point its neighbor put on that edge, when it's farther along (so nothing is left open)
  const along = (fi, c, toward) => dot(sub(q[fi][c], P[F[fi][c]]), norm(sub(P[toward], P[F[fi][c]]), { x: 0, y: 0, z: 0 }));
  F.forEach((f, fi) => {
    const ids = [];
    const k = f.length;
    f.forEach((x, c) => {
      const merged = replace.get(`${fi}|${c}`);
      if (merged) return ids.push(...merged);
      const u = f[(c + k - 1) % k], w = f[(c + 1) % k];
      const mine = (toward) => along(fi, c, toward);
      if (!info.has(keyOf(u, x))) {
        const t = twin(fi, (c + k - 1) % k); // goes x → u
        if (t && along(t.f, t.c, u) > mine(u) + eps) ids.push(qId[t.f][t.c]);
      }
      ids.push(qId[fi][c]);
      if (!info.has(keyOf(x, w))) {
        const t = twin(fi, c); // goes w → x: its corner at x is the next one
        const cx = t ? (t.c + 1) % F[t.f].length : -1;
        if (t && along(t.f, cx, w) > mine(w) + eps) ids.push(qId[t.f][cx]);
      }
    });
    out.face(ids, fi);
  });

  // Strips along the rounded edges
  for (const [k, e] of info) {
    const px = prof.get(`${k}|${e.A.a}`), py = prof.get(`${k}|${e.A.b}`);
    for (let j = 0; j < segs; j++) out.face([py[j], px[j], px[j + 1], py[j + 1]], j < segs / 2 ? e.A.f : e.B.f);
  }

  for (const { x, fan, ring, count, outKeys } of patches) {
    const faces = fan.map(([fi]) => fi);
    if (count === 2) {
      // Two rounded edges meet here (going on, or turning): join their strips with a seam of quads
      const cuts = outKeys.map((k, i) => (info.has(k) ? i : -1)).filter((i) => i >= 0);
      const full = (i) => {
        const [fi] = fan[i];
        const ids = prof.get(`${outKeys[i]}|${x}`);
        return info.get(outKeys[i]).A.f === fi ? ids : [...ids].reverse();
      };
      const between = (from, to) => {
        const ids = [];
        for (let i = (from + 2) % fan.length; i !== (to + 1) % fan.length && i !== to; i = (i + 1) % fan.length) ids.push(qId[fan[i][0]][fan[i][1]]);
        return to === (from + 1) % fan.length ? [] : ids;
      };
      const [i1, i2] = cuts;
      const p1 = full(i1), p2 = full(i2);
      const start = out.faces.length;
      const fi = nearestFace(B, faces, ring.map((v) => out.vertices[v]));
      out.face([p1[segs], ...between(i1, i2), p2[0]], fi);
      out.face([p2[segs], ...between(i2, i1), p1[0]], fi);
      for (let j = 0; j < segs; j++) out.face([p1[j], p1[j + 1], p2[segs - j - 1], p2[segs - j]], fi);
      // Going round the faces in order runs the same way as the strips beside it: patches go the other way
      for (let j = start; j < out.faces.length; j++) out.faces[j].reverse();
      continue;
    }
    // Points at the same place count once
    const { main, extra } = untangle(ring, out.vertices, eps);
    const clean = main.reverse();
    const fi = nearestFace(B, faces, (clean.length >= 3 ? clean : ring).map((v) => out.vertices[v]));
    for (const loop of extra) out.face([...loop].reverse(), fi);
    if (clean.length < 3) continue;
    const start = out.faces.length;
    const cs = centers.get(x);
    const c = cs ? centroid(cs) : null;
    const round = roundAt.get(x);
    if (round && segs > 1 && count === 3 && clean.length === 3 * segs) cornerPatch(out, clean, c, segs, fi);
    else patch(out, clean, round ? c : null, segs, fi);
    orientByRing(out, start, clean[0], clean[1]);
  }
  return finish(out, B, mesh);
}

/** Cuts (or rounds) the selected corners: each edge from a corner is cut `radius` along. */
function bevelVertices(B, mesh, radius, segs, angle, list) {
  const { P, F, N, E, fans } = B;
  const sel = new Set();
  if (Array.isArray(list)) {
    for (const i of list) if (Number.isInteger(i) && i >= 0 && i < mesh.vertices.length) sel.add(B.at(i));
  } else {
    // Corners: where 3 sharp edges or more meet
    const minDot = Math.cos((angle * Math.PI) / 180);
    const sharp = P.map(() => 0);
    for (const l of E.values()) if (l.length === 2 && dot(N[l[0].f], N[l[1].f]) < minDot - 1e-9) { sharp[l[0].a]++; sharp[l[0].b]++; }
    sharp.forEach((n, v) => { if (n >= 3) sel.add(v); });
  }
  for (const v of sel) if (!fans[v]) sel.delete(v);

  // How far along each edge: the radius, but under half of the shortest edge there
  const cut = new Map();
  for (const v of sel) {
    let shortest = Infinity;
    for (const [fi, c] of fans[v]) {
      const w = F[fi][(c + 1) % F[fi].length];
      shortest = Math.min(shortest, len(sub(P[w], P[v])));
    }
    cut.set(v, Math.min(radius, 0.45 * shortest));
  }
  const out = builder();
  const ids = P.map((p) => out.vertex(p));
  const onEdge = new Map();
  const pointOn = (x, y) => {
    const key = `${x}>${y}`;
    if (!onEdge.has(key)) onEdge.set(key, out.vertex(add(P[x], mul(norm(sub(P[y], P[x]), { x: 0, y: 0, z: 0 }), cut.get(x)))));
    return onEdge.get(key);
  };
  F.forEach((f, fi) => {
    const k = f.length, face = [];
    f.forEach((x, c) => {
      if (!sel.has(x)) return face.push(ids[x]);
      face.push(pointOn(x, f[(c + k - 1) % k]), pointOn(x, f[(c + 1) % k]));
    });
    out.face(face, fi);
  });
  for (const x of sel) {
    const fan = fans[x];
    // The other way from the faces' order around the corner (see bevelEdges)
    const ring = fan.map(([fi, c]) => pointOn(x, F[fi][(c + 1) % F[fi].length])).reverse();
    const faces = fan.map(([fi]) => fi);
    const fi = nearestFace(B, faces, ring.map((v) => out.vertices[v]));
    const start = out.faces.length;
    if (segs < 2) out.face(ring, fi);
    else {
      // A dome: the flat cut pushed toward the old corner, most in the middle
      const C = centroid(ring.map((v) => out.vertices[v]));
      const h = sub(P[x], C);
      const middle = out.vertex(add(C, mul(h, 0.5)));
      const rows = ring.map((v) => Array.from({ length: segs + 1 }, (_, l) => {
        if (l === 0) return middle;
        if (l === segs) return v;
        const t = l / segs;
        return out.vertex(add(lerp(C, out.vertices[v], t), mul(h, 0.5 * (1 - t * t))));
      }));
      for (let j = 0; j < ring.length; j++) {
        const a = rows[j], b = rows[(j + 1) % ring.length];
        out.face([middle, a[1], b[1]], fi);
        for (let l = 1; l < segs; l++) out.face([a[l], a[l + 1], b[l + 1], b[l]], fi);
      }
    }
    orientByRing(out, start, ring[0], ring[1]);
  }
  return finish(out, B, mesh);
}

/**
 * Rounds the sharp edges of a mesh (or cuts them flat), like a bevel
 * modifier: furniture, devices, robots, panels. Returns a new mesh; the
 * original isn't changed.
 *
 * - `mode: "edges"` (default): every edge where faces meet sharper than
 *   `angle` (or each edge in `edges`) is rounded with a ball of `radius`
 *   rolling along it; where 3 rounded edges meet, the corner is a piece of
 *   a sphere. `segments: 1` cuts them flat (a chamfer).
 * - `mode: "vertices"`: only the corners (where 3 sharp edges or more meet,
 *   or each vertex in `vertices`) are cut, `radius` along each edge; with
 *   more segments the cut is a small dome.
 *
 * The radius shrinks everywhere when bevels would overlap on short edges.
 * Edges along an open border stay sharp. Texture coordinates follow each
 * face; materials follow their faces (bevels take a neighbor's).
 *
 * @example
 * const crate = bevelMesh(makeShape("box"), { radius: 0.04, segments: 3 });
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ radius?: number, segments?: number, angle?: number, mode?: "edges"|"vertices", edges?: number[][], vertices?: number[] }} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function bevelMesh(mesh, opts = {}) {
  const mode = opts.mode ?? "edges";
  if (mode !== "edges" && mode !== "vertices") throw new Error(`Unknown bevel mode "${mode}": use "edges" or "vertices"`);
  const B = surface(mesh);
  if (!B) return { vertices: [], faces: [] };
  const segs = Math.max(1, Math.min(16, Math.round(Number.isFinite(opts.segments) ? opts.segments : 3)));
  const angle = Number.isFinite(opts.angle) ? opts.angle : 30;
  const radius = opts.radius > 0 ? opts.radius : opts.radius === 0 ? 0 : B.size * 0.05;
  // Radius 0: nothing to bevel, a cleaned copy
  if (radius === 0) return bevelEdges(B, mesh, 0, 1, 181, []);
  return mode === "edges" ? bevelEdges(B, mesh, radius, segs, angle, opts.edges) : bevelVertices(B, mesh, radius, segs, angle, opts.vertices);
}
