# Curves, sweeps & lofts

Smooth curves from a few points, and surfaces built along them: a section swept along a path (`sweep`), or a surface through several cross-sections (`loft`).

```js
import { spline, resamplePath, sweep, loft } from "./trid/index.js";
```

## Curves

A few control points in, a smooth curve out: paths for sweeps, profiles for [`lathe`](../shapes#lathe-profile-opts), outlines for [`extrude`](../shapes#extrude-outline-depth-0-2). Write 5 points, get a smooth curve of 40.

<Demo src="splines" hint="a lathe profile without and with spline · a 3D spline — drag to orbit" />

<<< @/demos/splines.js

Points can be 2D (`{ x, y }`), 3D (`{ x, y, z }`) or lathe profile points (`{ r, y }`). Every number field of the first point is a coordinate, and the result has the same fields.

### `spline(points, opts?)`

A smooth curve that passes through every point (a Catmull-Rom spline). Returns new points.

| Option | Default | Meaning |
| --- | --- | --- |
| `segments` | `8` | Points made between two control points |
| `closed` | `false` | The last point joins the first (a loop). The result doesn't repeat the first point |
| `alpha` | `0.5` | How the curve bends: `0` uniform, `0.5` centripetal (never loops or overshoots at sharp turns), `1` chordal (hugs the points) |
| `tension` | `0` | `0` smooth, `1` straight lines between the points |
| `count` | none | Instead of `segments`: this many points in all, evenly spaced by length |
| `spacing` | none | Instead of `segments`: points about this far apart, evenly spaced |

```js
// A smooth vase profile from 5 points
const vase = lathe(spline([
  { r: 0.1, y: -0.4 }, { r: 0.3, y: -0.25 }, { r: 0.12, y: 0.05 }, { r: 0.08, y: 0.25 }, { r: 0.18, y: 0.4 },
]), { capBottom: true });

// A tail path with 40 evenly spaced points
const tail = spline([
  { x: 0, y: 0, z: 0 }, { x: 0.2, y: 0.3, z: -0.4 }, { x: 0, y: 0.6, z: -0.7 }, { x: -0.2, y: 0.5, z: -1 },
], { count: 40 });
```

::: tip segments or count?
With `segments`, close control points get as many points between them as far ones, so points bunch up where control points are close. `count` and `spacing` space the points evenly along the whole curve, which gives sweeps and lofts faces of even size.
:::

Repeated points in a row and points with `NaN` or infinite numbers are skipped. With fewer than 2 points, the points are returned as they are.

### `resamplePath(points, opts?)`

The same points along a polyline (straight lines between them), evenly spaced by length. The ends stay where they are. Use it to even out a path without smoothing it.

| Option | Default | Meaning |
| --- | --- | --- |
| `count` | none | Number of points in all |
| `spacing` | none | Distance between points (used when `count` isn't given) |
| `closed` | `false` | The points form a loop |

Without `count` or `spacing`, it returns a copy of the points.

## `sweep(path, opts?)`

Moves a cross-section along a 3D path: tails, horns, tentacles, handles, pipes, cables, rails, picture frames. Without a `profile`, it's a round tube.

<Demo src="sweep" hint="a tapered tail · a twisted star knot · a level road — drag to orbit" />

<<< @/demos/sweep.js

The path is used as given, so pass it through [`spline`](#spline-points-opts) for a smooth one (with `count` or `spacing` for faces of even size).

| Option | Default | Meaning |
| --- | --- | --- |
| `profile` | a circle | The cross-section, a list of `{ x, y }`: x goes to the path's side, y to its "up" |
| `profileClosed` | `true` | `false`: the profile is an open line (a ribbon, a leaf, a road surface) |
| `radius` | `0.1` | Radius of the default circle. Ignored with a `profile` |
| `segments` | `16` | Points around the default circle |
| `scale` | `1` | Size of the section along the path |
| `twist` | `0` | Turn of the section from start to end, in radians |
| `closed` | `false` | The path is a loop (a ring, a handle closed on itself) |
| `caps` | `true` | Close the ends with flat caps |
| `up` | none | Keep the section's y pointed this way |
| `miter` | `true` | Stretch the section at sharp corners so the tube keeps its thickness |

`radius` and `scale` can be:
- a number;
- a list of numbers spread evenly from the start to the end (`[0.1, 0.05, 0]`);
- a function of `t`, which is 0 at the start and 1 at the end (`(t) => 0.1 * (1 - t)`).

An end whose size is 0 closes into a single point, for horns and tail tips.

```js
// A horn: curved, from thick to a point
const horn = sweep(spline([
  { x: 0, y: 0, z: 0 }, { x: 0.05, y: 0.2, z: 0.05 }, { x: 0.2, y: 0.35, z: 0.1 }, { x: 0.35, y: 0.38, z: 0.05 },
], { count: 30 }), { radius: (t) => 0.08 * (1 - t) ** 0.8 });

// A picture frame: a square path, a molding profile kept upright, sharp mitered corners
const molding = [{ x: -0.1, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.05 }, { x: 0, y: 0.08 }, { x: -0.1, y: 0.04 }];
const frame = sweep(
  [{ x: -1, y: 0, z: -1 }, { x: 1, y: 0, z: -1 }, { x: 1, y: 0, z: 1 }, { x: -1, y: 0, z: 1 }],
  { profile: molding, closed: true, up: { x: 0, y: 1, z: 0 } },
);
```

### How the section turns

By default, the section is carried along the path without spinning, so it never flips at bends, even on knotted 3D paths. On a closed loop, the small turn it picks up around the loop is spread evenly, so there's no seam where the ends meet.

With `up`, the section's y stays pointed that way instead (it only turns around `up`). Use it for things that must stay level: roads, rails, shelves, frames. Where the path goes straight along `up`, the section is carried as usual.

On a closed path, `twist` is rounded to whole turns so the ends still meet.

### Faces and textures

Faces are clockwise from outside like the built-in shapes, whichever way the path and a closed profile go. An open profile faces its right side (like a `lathe` profile). Texture coordinates: u goes around the section and v along the path, both by length. Caps map the section's box.

## `loft(sections, opts?)`

A surface through cross-sections: bodies, bottles, boat hulls, car bodies, heads, fuselages. Each section is a closed outline, and the surface joins them in order, smoothly.

<Demo src="loft" hint="a bottle along Y · a boat hull from a flat stern to a pointed bow · a horn along a curved path — drag to orbit" />

<<< @/demos/loft.js

Sections come in two kinds (all sections must be the same kind):

| Kind | Fields | Placed |
| --- | --- | --- |
| Outline | `outline` (2D points), `at`, and optional `scale`, `rotate`, `offset` | Along a straight `axis`, or along a 3D `path` |
| Ring | `points` (3D points) | Where they are |

For outlines, `at` is where the section sits: the position on the axis, or from `0` (the path's start) to `1` (its end) along a path. Sections are joined in order of `at`; without it, they're spread evenly. `scale` (a number, or `{ x, y }`), `rotate` (radians) and `offset` (`{ x, y }`) change a section in its own plane, so one outline can be reused at many sizes.

| Option | Default | Meaning |
| --- | --- | --- |
| `axis` | `"z"` | Straight axis for outlines. An outline's x and y go to X and Y for `"z"`, X and Z for `"y"`, Z and Y for `"x"` |
| `path` | none | A 3D path to place the outlines along instead (use [`spline`](#spline-points-opts) for a smooth one) |
| `up` | none | With `path`: keep the outlines' y pointed this way, like [`sweep`](#how-the-section-turns) |
| `closed` | `false` | The surface loops back to its first section: a closed `path`, or rings in a loop |
| `caps` | `true` | Close the ends with flat caps |
| `segments` | `6` | Rows between two sections, on average (shared out by distance, so faces stay even) |
| `points` | auto | Points around each section |
| `smooth` | `true` | Smooth between sections; `false` joins them with straight lines |
| `align` | `true` | Line the sections up so the surface doesn't twist |

```js
const circle = (r, n = 24) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
});

// A boat hull: a flat stern, a round middle, a sharp bow
const hull = loft([
  { at: -1, outline: [{ x: -0.3, y: 0.2 }, { x: -0.3, y: -0.1 }, { x: 0.3, y: -0.1 }, { x: 0.3, y: 0.2 }] },
  { at: 0, outline: spline([{ x: -0.4, y: 0.2 }, { x: -0.35, y: -0.15 }, { x: 0, y: -0.3 }, { x: 0.35, y: -0.15 }, { x: 0.4, y: 0.2 }]) },
  { at: 1, outline: [{ x: 0, y: 0.25 }] },
]);

// A neck along a curve, from round to oval, kept upright
const neckPath = spline([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0.3, z: 0.1 }, { x: 0, y: 0.5, z: 0.35 }], { count: 30 });
const neck = loft([
  { at: 0, outline: circle(0.2) },
  { at: 1, outline: circle(0.2), scale: { x: 0.7, y: 1 } },
], { path: neckPath, up: { x: 0, y: 1, z: 0 } });
```

### How sections are joined

- **Point counts.** When every section has the same number of points, they're kept as they are, so you decide which points join. Otherwise each section is resampled to the same count (`points`, by default the most any section has, at least 24). A section's own points are kept, so a square keeps its corners.
- **Lining up.** Each section is turned to match the one before it, so the surface doesn't twist even if the outlines start at different points. Rings of 3D points can also be walked either way. Turn it off with `align: false` to join point *k* to point *k* exactly.
- **Smooth, never past the sections.** Between sections the surface follows smooth curves that never go past the sections themselves: the widest section is the widest point, with no bulge between two equal sections. `smooth: false` joins them with straight lines.
- **Tips.** A section of one point (or `scale: 0`) closes the surface into a point: a nose, a bow, a tail.

### Faces and textures

Faces are clockwise from outside like the built-in shapes, however the outlines and the axis or path go. Texture coordinates: u goes around the sections and v along the surface (by distance). Caps map their own box.
