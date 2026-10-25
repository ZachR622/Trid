import { triangulate } from "../render/shapes.js";
import { newell } from "../render/normals.js";
import { vec, add, mul, dot, cross, norm, signedArea2 } from "./vec.js";
import { across, cleanPath, pathFrames, frameAt } from "./frames.js";

const EMPTY = () => ({ vertices: [], edges: [], faces: [], uvs: [], faceUVs: [] });

/** Fixed directions for a straight axis: where a section's x and y go, and the axis itself. */
const AXES = {
  z: { side: vec(1, 0, 0), up: vec(0, 1, 0), dir: vec(0, 0, 1) },
  y: { side: vec(1, 0, 0), up: vec(0, 0, 1), dir: vec(0, 1, 0) },
  x: { side: vec(0, 0, 1), up: vec(0, 1, 0), dir: vec(1, 0, 0) },
};

const gap = (a, b) => {
  let s = 0;
  for (let d = 0; d < a.length; d++) s += (a[d] - b[d]) ** 2;
  return Math.sqrt(s);
};

/** A ring's points as number arrays, without bad points, repeats in a row and the closing repeat. */
function cleanRing(points, keys) {
  const out = [];
  for (const p of points ?? []) {
    const a = keys.map((k) => p?.[k]);
    if (a.some((x) => !Number.isFinite(x))) continue;
    if (!out.length || gap(a, out[out.length - 1]) > 1e-12) out.push(a);
  }
  if (out.length > 1 && gap(out[0], out[out.length - 1]) <= 1e-12) out.pop();
  return out;
}

/**
 * `n` points around a closed ring. With more points than the ring has, its
 * own points are kept (so corners stay sharp) and the new ones are shared
 * out between its sides by length. With fewer, they're evenly spaced.
 */
function resampleRing(ring, n) {
  const m = ring.length;
  if (m === n) return ring.map((p) => p.slice());
  const lens = ring.map((p, i) => gap(p, ring[(i + 1) % m]));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out = [];
  if (n > m) {
    // Each side gets 1 piece, the rest by length (largest remainder)
    const extra = n - m;
    const share = lens.map((l) => (l / total) * extra);
    const pieces = share.map((x) => 1 + Math.floor(x));
    let left = n - pieces.reduce((a, b) => a + b, 0);
    share.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
      if (left-- > 0) pieces[i]++;
    });
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % m];
      for (let c = 0; c < pieces[i]; c++) out.push(p.map((x, d) => x + (q[d] - x) * (c / pieces[i])));
    });
    return out;
  }
  let side = 0, start = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (side < m - 1 && start + lens[side] < d) start += lens[side++];
    const p = ring[side], q = ring[(side + 1) % m];
    const t = lens[side] ? (d - start) / lens[side] : 0;
    out.push(p.map((x, j) => x + (q[j] - x) * t));
  }
  return out;
}

const centered = (ring) => {
  const c = ring[0].map((_, d) => ring.reduce((s, p) => s + p[d], 0) / ring.length);
  return ring.map((p) => p.map((x, d) => x - c[d]));
};

/**
 * `ring` turned (its start point moved), and reversed when allowed, so its
 * points line up best with `prev`'s: no twist between two sections.
 */
function align(ring, prev, allowReverse) {
  const n = ring.length;
  const a = centered(prev);
  let best = ring, bestCost = Infinity;
  for (const cand of allowReverse ? [ring, [...ring].reverse()] : [ring]) {
    const b = centered(cand);
    for (let k = 0; k < n; k++) {
      let cost = 0;
      for (let i = 0; i < n && cost < bestCost; i++) {
        const p = b[(i + k) % n], q = a[i];
        for (let d = 0; d < p.length; d++) cost += (p[d] - q[d]) ** 2;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = cand.slice(k).concat(cand.slice(0, k));
      }
    }
  }
  return best;
}

/**
 * Slopes for a smooth curve through values `v` at positions `s` that never
 * overshoots them (monotone cubic, Fritsch-Carlson): where the values turn,
 * the curve is flat, so a section's size is a true widest or narrowest point.
 */
function slopes(v, s, loop, period) {
  const N = v.length;
  return v.map((vi, i) => {
    const hasPrev = loop || i > 0, hasNext = loop || i < N - 1;
    const ip = (i + N - 1) % N, inx = (i + 1) % N;
    const h0 = hasPrev ? s[i] - s[ip] + (i === 0 ? period : 0) : 0;
    const h1 = hasNext ? s[inx] - s[i] + (i === N - 1 ? period : 0) : 0;
    const d0 = hasPrev && h0 > 0 ? (vi - v[ip]) / h0 : null;
    const d1 = hasNext && h1 > 0 ? (v[inx] - vi) / h1 : null;
    if (d0 === null) return d1 ?? 0;
    if (d1 === null) return d0;
    if (d0 * d1 <= 0) return 0;
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  });
}

/** Cubic Hermite between a (slope ma) and b (slope mb) over a length h, at u in [0, 1]. */
function hermite(a, b, ma, mb, h, u) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h * ma + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h * mb;
}

/** Triangles for a flat-ish polygon of 3D points, in the polygon's own order. */
function capTriangles(points) {
  const nrm = norm(newell(points), vec(0, 0, 1));
  const e1 = across(Math.abs(nrm.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0), nrm);
  const e2 = cross(nrm, e1);
  const flat = points.map((p) => ({ x: dot(p, e1), y: dot(p, e2) }));
  if (signedArea2(flat) >= 0) return { tris: triangulate(flat), flat };
  const L = flat.length;
  return { tris: triangulate([...flat].reverse()).map((t) => t.map((i) => L - 1 - i).reverse()), flat };
}

/** Volume of a closed mesh (> 0 when its faces point outward). */
function volume(vertices, faces) {
  let v = 0;
  for (const f of faces) {
    const a = vertices[f[0]];
    for (let i = 1; i + 1 < f.length; i++) {
      const b = vertices[f[i]], c = vertices[f[i + 1]];
      v += a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    }
  }
  return v;
}

/**
 * A surface through cross-sections: bodies, bottles, boat hulls, car
 * bodies, heads, fuselages. Each section is a closed outline; the surface
 * joins them in order, smoothly.
 *
 * Sections are either:
 * - `{ outline, at }`: a 2D outline placed along a straight `axis` (`at` is
 *   the position on it) or along a 3D `path` (`at` from 0 at its start to 1
 *   at its end). Optional `scale`, `rotate` and `offset` change it in place;
 * - `{ points }`: a ring of 3D points, used where it is.
 *
 * Outlines may have different point counts and start points: they're
 * resampled (keeping their corners) and lined up so the surface doesn't
 * twist. A section of one point (or `scale: 0`) closes the surface into a
 * point (a nose, a tip).
 *
 * Faces are clockwise from outside like the built-in shapes. Texture
 * coordinates: u goes around the sections, v along the surface. Caps map
 * their own box.
 *
 * @param {object[]} sections
 * @param {object} [opts]
 * @returns {import("../index.d.ts").Mesh}
 */
export function loft(sections, opts = {}) {
  const { axis = "z", path = null, up = null, closed = false, caps = true, segments = 6, smooth = true } = opts;
  const list = (Array.isArray(sections) ? sections : []).filter((s) => s && (s.points || s.outline));
  if (list.some((s) => s.points) && list.some((s) => !s.points)) {
    throw new Error("loft: give every section `points` (3D) or every section `outline` (2D), not both");
  }
  const in3D = list.length > 0 && !!list[0].points;
  const along = in3D ? null : path ? cleanPath(path, closed) : null;
  if (along && along.pts.length < 2) return EMPTY();
  const frames = along ? pathFrames(along.pts, along.loop, up) : null;
  const straight = AXES[axis] ?? AXES.z;

  // Each section: a ring of points (number arrays) and its position along the surface
  let secs = list.map((sec, i) => {
    if (in3D) return { ring: cleanRing(sec.points, ["x", "y", "z"]) };
    const k = sec.scale ?? 1;
    const kx = typeof k === "number" ? k : k?.x ?? 1, ky = typeof k === "number" ? k : k?.y ?? 1;
    const c = Math.cos(sec.rotate ?? 0), sn = Math.sin(sec.rotate ?? 0);
    const ox = sec.offset?.x ?? 0, oy = sec.offset?.y ?? 0;
    let ring = cleanRing(sec.outline, ["x", "y"]).map(([x, y]) => [(x * kx) * c - (y * ky) * sn + ox, (x * kx) * sn + (y * ky) * c + oy]);
    if (ring.length > 2 && signedArea2(ring.map(([x, y]) => ({ x, y }))) < 0) ring.reverse();
    const fallback = list.length > 1 ? i / (along?.loop ? list.length : list.length - 1) : 0;
    const at = Number.isFinite(sec.at) ? sec.at : fallback;
    return { ring, at };
  });
  // A section too small to be a ring is a point
  secs = secs.filter((s) => s.ring.length > 0).map((s) => {
    const size = Math.max(0, ...s.ring.map((p) => gap(p, s.ring[0])));
    return { ...s, tip: s.ring.length < 3 || size < 1e-9 };
  });
  if (!in3D) secs.sort((a, b) => a.at - b.at);
  const N = secs.length;
  const loop = in3D ? !!closed && N > 2 : !!along?.loop;
  if (N < 2 || secs.every((s) => s.tip)) return EMPTY();

  // Same point count everywhere: kept as they are, unless `points` asks otherwise
  const rings = secs.filter((s) => !s.tip).map((s) => s.ring.length);
  const n = Math.max(3, Math.round(opts.points ?? (rings.every((m) => m === rings[0]) ? rings[0] : Math.max(24, ...rings))));
  for (const s of secs) {
    if (s.tip) {
      const c = s.ring[0].map((_, d) => s.ring.reduce((t, p) => t + p[d], 0) / s.ring.length);
      s.ring = Array.from({ length: n }, () => c.slice());
    } else s.ring = resampleRing(s.ring, n);
  }
  if (opts.align !== false) {
    for (let i = 1; i < N; i++) if (!secs[i].tip && !secs[i - 1].tip) secs[i].ring = align(secs[i].ring, secs[i - 1].ring, in3D);
  }

  // Position of each section along the surface (s), and the length around for a loop
  let period = 0;
  if (in3D) {
    const step = (a, b) => Math.max(1e-6, a.ring.reduce((t, p, k) => t + gap(p, b.ring[k]), 0) / n);
    secs[0].s = 0;
    for (let i = 1; i < N; i++) secs[i].s = secs[i - 1].s + step(secs[i - 1], secs[i]);
    period = loop ? secs[N - 1].s + step(secs[N - 1], secs[0]) : 0;
  } else if (frames) {
    for (const s of secs) s.s = Math.min(1, Math.max(0, s.at)) * frames.total;
    period = loop ? frames.total : 0;
  } else {
    for (const s of secs) s.s = s.at;
  }
  // Sections at the same place can't be joined: keep the first
  secs = secs.filter((s, i) => i === 0 || s.s > secs[i - 1].s + 1e-9);
  if (secs.length < 2) return EMPTY();
  const M = secs.length;
  const S = secs.map((s) => s.s);
  if (loop) period = Math.max(period, S[M - 1] - S[0] + 1e-6);

  // Slopes of every coordinate of every point, across the sections
  const dims = secs[0].ring[0].length;
  const slope = Array.from({ length: n }, (_, k) => Array.from({ length: dims }, (_, d) => {
    const v = secs.map((s) => s.ring[k][d]);
    return smooth ? slopes(v, S, loop, period) : null;
  }));

  // Rows between sections: `segments` per span on average, shared out by length
  const spans = loop ? M : M - 1;
  const gaps = Array.from({ length: spans }, (_, i) => (i < M - 1 ? S[i + 1] - S[i] : period - (S[M - 1] - S[0])));
  const gapTotal = gaps.reduce((a, b) => a + b, 0) || 1;
  const perSpan = gaps.map((g) => Math.max(1, Math.round((g / gapTotal) * Math.max(1, Math.round(segments)) * spans)));

  const place = (p, s) => {
    if (in3D) return vec(p[0], p[1], p[2]);
    if (frames) {
      const f = frameAt(along.pts, along.loop, frames, s);
      return add(f.pos, add(mul(f.side, p[0]), mul(f.up, p[1])));
    }
    return add(mul(straight.dir, s), add(mul(straight.side, p[0]), mul(straight.up, p[1])));
  };

  // Every row: its points (as numbers) and its position s
  const rowsData = [];
  for (let i = 0; i < spans; i++) {
    const j = (i + 1) % M;
    for (let q = 0; q < perSpan[i]; q++) {
      const u = q / perSpan[i];
      const s = S[i] + gaps[i] * u;
      rowsData.push({
        s,
        pts: secs[i].ring.map((p, k) => p.map((a, d) => {
          const b = secs[j].ring[k][d];
          return smooth ? hermite(a, b, slope[k][d][i], slope[k][d][j], gaps[i], u) : a + (b - a) * u;
        })),
      });
    }
  }
  if (!loop) rowsData.push({ s: S[M - 1], pts: secs[M - 1].ring.map((p) => p.slice()) });

  // Vertices: a row whose points all meet is one point
  const vertices = [];
  let size = 0;
  const rowsWorld = rowsData.map((r) => r.pts.map((p) => place(p, r.s)));
  for (const r of rowsWorld) for (const p of r) size = Math.max(size, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  const eps = (size || 1) * 1e-9;
  const rows = rowsWorld.map((r) => {
    const tip = r.every((p) => Math.hypot(p.x - r[0].x, p.y - r[0].y, p.z - r[0].z) <= eps);
    if (tip) {
      const v = vertices.push(r[0]) - 1;
      return new Array(n).fill(v);
    }
    return r.map((p) => vertices.push(p) - 1);
  });
  const R = rows.length;
  const isTip = (r) => r[0] === r[1] && r[0] === r[n - 1];

  // Texture grid: an extra column for the seam around, an extra row for a loop
  const sStart = rowsData[0].s, sLen = (loop ? period : rowsData[R - 1].s - sStart) || 1;
  const uvs = [];
  const uvRows = loop ? R + 1 : R;
  for (let r = 0; r < uvRows; r++) {
    const v = r < R ? (rowsData[r].s - sStart) / sLen : 1;
    for (let k = 0; k <= n; k++) uvs.push({ u: k / n, v });
  }
  const uvAt = (r, k) => r * (n + 1) + k;

  const faces = [], faceUVs = [];
  const steps = loop ? R : R - 1;
  for (let r = 0; r < steps; r++) {
    const a = rows[r], b = rows[(r + 1) % R];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      const corners = [[a[k], uvAt(r, k)], [a[k1], uvAt(r, k + 1)], [b[k1], uvAt(r + 1, k + 1)], [b[k], uvAt(r + 1, k)]];
      const keep = corners.filter(([v], c) => v !== corners[(c + 3) % 4][0]);
      if (keep.length < 3) continue;
      faces.push(keep.map(([v]) => v));
      faceUVs.push(keep.map(([, u]) => u));
    }
  }

  // Caps: they go round each end the other way from the side faces next to them, so the whole is consistent
  const capFaces = [], capUVs = [];
  if (!loop) {
    for (const [r, order] of [[rows[0], (ring) => [...ring].reverse()], [rows[R - 1], (ring) => ring]]) {
      if (isTip(r)) continue;
      const ring = order(r);
      const { tris, flat } = capTriangles(ring.map((v) => vertices[v]));
      const xs = flat.map((p) => p.x), ys = flat.map((p) => p.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0 || 1, h = Math.max(...ys) - y0 || 1;
      const first = uvs.length;
      for (const p of flat) uvs.push({ u: (p.x - x0) / w, v: (p.y - y0) / h });
      for (const t of tris) {
        capFaces.push(t.map((i) => ring[i]));
        capUVs.push(t.map((i) => first + i));
      }
    }
  }

  // Outward: measured on the closed shape (with its caps, even when they're left out)
  if (volume(vertices, [...faces, ...capFaces]) < 0) {
    for (const list of [faces, faceUVs, capFaces, capUVs]) list.forEach((f, i) => (list[i] = f.reverse()));
  }
  if (caps !== false) {
    faces.push(...capFaces);
    faceUVs.push(...capUVs);
  } else uvs.length = uvRows * (n + 1);

  // Edges: each row, and a line along the surface from each point around
  const edges = [];
  for (const r of rows) if (!isTip(r)) edges.push(r.slice());
  for (let k = 0; k < n; k++) {
    if (loop) edges.push(rows.map((r) => r[k]));
    else for (let r = 0; r < R - 1; r++) if (rows[r][k] !== rows[r + 1][k]) edges.push([rows[r][k], rows[r + 1][k]]);
  }

  return { vertices, edges, faces, uvs, faceUVs };
}

