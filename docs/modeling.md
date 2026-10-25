# Modeling

Tools for making your own shapes in code, beyond `makeShape`, `lathe` and `extrude`. Everything here returns plain data (points or meshes), so it works with every renderer, and meshes come with texture coordinates and clockwise faces like the built-in shapes.

```js
import { spline, resamplePath } from "./trid/index.js";
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
