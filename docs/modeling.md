# Modeling

Tools for making your own shapes in code, beyond `makeShape`, `lathe` and `extrude`. Everything here returns plain data (points or meshes), so it works with every renderer, and meshes come with texture coordinates and clockwise faces like the built-in shapes.

```js
import { spline, resamplePath, sweep } from "./trid/index.js";
```

## Curves

A few control points in, a smooth curve out: paths for sweeps, profiles for [`lathe`](./shapes#lathe-profile-opts), outlines for [`extrude`](./shapes#extrude-outline-depth-0-2). Write 5 points, get a smooth curve of 40.

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
