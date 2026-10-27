# Modeling

Tools for making your own shapes in code, beyond `makeShape`, `lathe` and `extrude`. Everything here returns plain data (points or meshes), so it works with every renderer, and meshes come with texture coordinates and clockwise faces like the built-in shapes.

```js
import {
  spline, resamplePath, sweep, loft, taperMesh, twistMesh, bendMesh, bulgeMesh,
  weldVertices, cleanMesh, validateMesh, fixWinding, subdivideMesh,
  blobMesh, blobField, sdfMesh, bevelMesh,
  meshQuery, raycastMesh, pointInMesh, distanceToMesh, closestPointOnMesh, isClosed, raycastScene,
} from "./trid/index.js";
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

## `loft(sections, opts?)`

A surface through cross-sections: bodies, bottles, boat hulls, car bodies, heads, fuselages. Each section is a closed outline, and the surface joins them in order, smoothly.

<Demo src="loft" hint="a bottle along Y · a hull from square to round to a point · a horn along a curved path — drag to orbit" />

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

## `subdivideMesh(mesh, opts?)`

Smooths a mesh by subdividing it (Catmull-Clark, like a subdivision surface modifier). Build a rough cage of a few boxes and faces, and get a smooth, organic shape from it: box modeling. Each level splits every face into one quad per corner (about 4 times the faces) and rounds the surface. Returns a **new mesh**; the original isn't changed.

<Demo src="subdivide" hint="a cage of boxes · smoothed twice · a box smoothed · a box with creaseAngle — drag to orbit" />

<<< @/demos/subdivide.js

| Option | Default | Meaning |
| --- | --- | --- |
| `levels` | `1` | Times to subdivide (at most 6). 2 or 3 is usually plenty |
| `smooth` | `true` | `false`: only split the faces, keep the shape (to give a deformer more rows) |
| `creaseAngle` | none | Edges where faces meet sharper than this (degrees) stay hard |
| `creases` | none | Edges that stay hard: pairs or polylines of vertex indices |
| `uvs` | `"smooth"` | `"smooth"`: texture coordinates are smoothed with the surface, keeping their seams. `"linear"`: only split |

```js
// A smooth body from a rough cage: a box with a smaller box on top
const cage = mergeMeshes([
  makeShape("box", { w: 0.6, h: 0.4, d: 0.4 }),
  { mesh: makeShape("cube", { size: 0.3 }), pos: { x: 0, y: 0.35, z: 0 } },
]);
const body = subdivideMesh(cage, { levels: 2 });

// A rounded box: smooth, but its 90° edges stay hard
const panel = subdivideMesh(box, { levels: 2, creaseAngle: 60 });
```

::: tip One piece or several
Pieces that don't share vertices (like boxes merged together) are smoothed one by one, each into its own rounded blob. For one continuous surface, the cage must be one connected mesh: neighboring faces sharing their edges.
:::

### Creases

A sharp edge keeps its shape: the surface stays creased along it at every level. A point with 3 sharp edges or more is a hard corner and stays put. A loop of sharp edges (each point on 2) stays sharp across, but rounds a little along the loop, like a creased edge in other modelers.

Open borders (a sheet, a hole) count as sharp: they stay where they are, smoothed along the border only, and an open sheet keeps its corners.

### What the result keeps

- Faces stay turned the way they were, and the result is welded (vertices at the same place merged first, so an unwelded mesh is still smoothed as one surface).
- Each new face keeps its face's material (`faceMaterials`).
- Texture coordinates come along when every face has them.
- The mesh's own normals (from an OBJ file) are dropped: the renderers compute new ones, and `material.smooth` makes it look round.

## Blobs

Shapes that melt together into one smooth surface, instead of looking like stacked balls: creatures, soft bodies, clay-like forms. Each shape is a *distance field* (how far a point is from its surface, negative inside). They're joined with smooth unions, subtractions and intersections, and the result is turned into a mesh.

<Demo src="blobs" hint="a panda of melting shapes · a die carved by spheres (marching cubes) — drag to orbit" />

<<< @/demos/blobs.js

### `blobMesh(shapes, opts?)`

One mesh of all the shapes, applied in order. Each shape has a `kind` and its own fields:

| Kind | Fields | Shape |
| --- | --- | --- |
| `"sphere"` | `center`, `radius` | A ball |
| `"ellipsoid"` | `center`, `radii` (`{ x, y, z }`), `rot` | A stretched ball: bodies, heads, eggs |
| `"capsule"` | `a`, `b`, `radius` (or `ra`, `rb`) | A rod with round ends between two points: limbs, necks, tails. Different `ra` and `rb` make a rounded cone (claws, carrots) |
| `"cylinder"` | `a`, `b`, `radius`, `round` | A rod with flat ends, edges rounded by `round` |
| `"box"` | `center`, `size` (`{ x, y, z }`), `round`, `rot` | A box, edges rounded by `round` |
| `"torus"` | `center`, `R`, `tube`, `rot` | A ring lying flat in XZ, like `makeShape("torus")` |

`rot` turns a shape (radians, X then Y then Z, like objects). Every shape can also have:

| Field | Default | Meaning |
| --- | --- | --- |
| `op` | `"add"` | `"add"` melts it into what's before it, `"subtract"` carves it out (eye sockets, mouths, holes), `"intersect"` keeps only the overlap. `subtract: true` also works |
| `blend` | `opts.blend` | How far it melts in, as a distance. `0` is a hard join |

| Option | Default | Meaning |
| --- | --- | --- |
| `blend` | a tenth of the model's size | How far shapes melt into each other, unless a shape has its own |
| `resolution` | `64` | Grid cells along the longest side (4 to 256). Twice as many is about 4 times the faces and 8 times the work |
| `method` | `"nets"` | `"nets"`: surface nets, smooth even quads. `"cubes"`: marching cubes, triangles (about twice as many) |
| `project` | `true` | Pull every vertex exactly onto the surface |
| `normals` | `true` | Normals from the field, for smooth shading without a faceted look |
| `uvs` | `"box"` | Texture mapping for the texture coordinates, like [`computeUVs`](./textures#texture-mapping) (`"box"`, `"sphere"`, `{ type: "cylinder", axis: "x" }`…), or `false` |

```js
// A snowman: three balls melting into each other, a carrot nose, a carved mouth
const snowman = blobMesh([
  { kind: "sphere", center: { x: 0, y: -0.25, z: 0 }, radius: 0.3 },
  { kind: "sphere", center: { x: 0, y: 0.15, z: 0 }, radius: 0.22 },
  { kind: "sphere", center: { x: 0, y: 0.45, z: 0 }, radius: 0.15 },
  { kind: "capsule", a: { x: 0, y: 0.45, z: 0.12 }, b: { x: 0, y: 0.43, z: 0.3 }, ra: 0.035, rb: 0.005, blend: 0.01 },
  { kind: "capsule", a: { x: -0.05, y: 0.38, z: 0.15 }, b: { x: 0.05, y: 0.38, z: 0.15 }, radius: 0.015, op: "subtract", blend: 0.01 },
], { blend: 0.08 });
```

::: tip nets or cubes?
Both give a closed, watertight mesh (every edge shared by exactly two faces), even where shapes nearly touch. Surface nets give about half as many faces, as even quads, which shade smoother and subdivide well. Marching cubes give triangles whose corners lie exactly on the grid's edges, so they keep thin creases and sharp cuts a little better.
:::

How fast: about 0.2 s for a ball at the default resolution, and 0.3 s for 20 shapes (most of the empty space is skipped).

### `blobField(shapes, opts?)` and `sdfMesh(field, bounds, opts?)`

`blobField` returns the joined distance field of the shapes as a function of a point, so you can mix it with your own math. `sdfMesh` meshes any such field within a box. It takes the same options as `blobMesh` (except `blend`), plus `sparse`.

```js
// A ball with ripples
const body = blobField([{ kind: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 0.4 }]);
const rippled = sdfMesh(
  (p) => body(p) + 0.02 * Math.sin(p.x * 30),
  { min: { x: -0.5, y: -0.5, z: -0.5 }, max: { x: 0.5, y: 0.5, z: 0.5 } },
  { sparse: false },
);
```

The field should be negative inside and about the distance to the surface (or less). Far from the surface, `sdfMesh` skips whole blocks of the grid by trusting that. A field that changes faster than the distance (strong noise, a stretched distance) should pass `sparse: false`, or thin parts may be missed.

## `bevelMesh(mesh, opts?)`

Rounds the sharp edges of any mesh, or cuts them flat, like a bevel modifier. Manufactured things are rarely sharp-edged: furniture, devices, robots, panels, tools. Returns a **new mesh**; the original isn't changed.

<Demo src="bevel" hint="an extruded star · a cylinder with rounded rims · one rounded edge · corners cut (vertices mode) — drag to orbit" />

<<< @/demos/bevel.js

| Option | Default | Meaning |
| --- | --- | --- |
| `radius` | a twentieth of the mesh's size | How round: the radius of a ball rolled along the edge |
| `segments` | `3` | Rows across each rounded edge. `1` cuts it flat (a chamfer) |
| `angle` | `30` | Edges where faces meet sharper than this (degrees) are beveled |
| `edges` | none | Instead of `angle`: which edges, as pairs or polylines of vertex indices (`[[0, 1], [4, 5, 6, 7, 4]]`) |
| `mode` | `"edges"` | `"edges"` rounds the edges. `"vertices"` cuts only the corners |
| `vertices` | none | With `"vertices"`, instead of `angle`: which corners, as vertex indices |

```js
// A crate: every sharp edge rounded
const crate = bevelMesh(makeShape("box"), { radius: 0.03 });

// A cylinder: only its rims are sharper than 30°, so only they're rounded
const knob = bevelMesh(makeShape("cylinder", { r: 0.2, h: 0.1 }), { radius: 0.02, segments: 4 });

// One edge of a table top, cut flat
const top = makeShape("box", { w: 1.2, h: 0.05, d: 0.6 });
const edged = bevelMesh(top, { edges: [[top.faces[0][0], top.faces[0][1]]], radius: 0.02, segments: 1 });
```

### How it rounds

Each beveled edge is rounded the way a ball of `radius` rolling along it would: the round surface meets both faces smoothly. Where 3 rounded edges meet (a box's corner), the corner is a piece of a sphere, exactly as on a rounded box. Where a rounded edge ends on a flat side, its end becomes part of that side. Concave edges (an inside corner) are rounded too, with the ball outside.

- **Overlap.** On short edges, bevels from both ends would run into each other. The radius then shrinks everywhere (not only there), so the shape stays even.
- **Flat faces cut into triangles** (an extruded star's caps) are treated as the flat face they make up.
- **Open borders** (a sheet, a hole in a surface) stay sharp: there is no second face to round toward.
- **Texture coordinates** follow each face (new points on a face get the coordinates the face's texture gives them there), and the rounded strips take them from the faces on either side. **Materials** follow their faces; the rounded strips and corners take a neighbor's.

The result is welded and closed (when the mesh was), with faces clockwise from outside, so `validateMesh` finds nothing on it.

::: tip makeShape or bevelMesh?
For a plain rounded box, `makeShape("box", { radius })` is simpler and makes an even grid. `bevelMesh` is for everything else: extruded outlines, lathed shapes, meshes from code or files.
:::

### Vertices mode

With `mode: "vertices"`, only the corners are cut: wherever 3 sharp edges or more meet (or each vertex in `vertices`), each edge is cut `radius` along from the corner. With `segments: 1` the cut is flat; with more, it's a small dome.

## Deformers

The everyday modifiers, one call each: `taperMesh`, `twistMesh`, `bendMesh` and `bulgeMesh`. Like [`displaceMesh`](./shapes#mesh-helpers), each one changes the mesh **in place** and returns it. The mesh's own normals (from an OBJ file) are removed, since they no longer fit, and the renderers compute new ones.

<Demo src="deform" hint="tapered · twisted · bent halfway up · with a bulge — drag to orbit" />

<<< @/demos/deform.js

::: tip Give it enough faces
A deformer only moves vertices, so a shape needs vertices along the way to bend or twist smoothly. The built-in `box` and `cylinder` have none along their height: build tall shapes with `lathe`, `loft` or `sweep` (which make rows), or [subdivide](#subdividemesh-mesh-opts) them first (`smooth: false` adds rows without changing the shape).
:::

### Along an axis: taper, twist, bend

These three work along an `axis` (default `"y"`). Positions along it are measured over the mesh's size, from `0` at its low end to `1` at its high end, so the same numbers work at any size:

| Option | Default | Meaning |
| --- | --- | --- |
| `axis` | `"y"` | Axis the effect goes along |
| `from` | `0` | Where the change starts |
| `to` | `1` | Where it ends. Past it, the full effect carries on |
| `center` | the box's middle | A point the axis line goes through (`{ x, z }` is enough for a `"y"` axis) |

Below `from` nothing changes. `from: 0.5` changes only the top half.

### `taperMesh(mesh, opts?)`

Narrows or widens the mesh around the axis line. The start of the range keeps its size, and the end is `amount` times as wide (default `0.5`). `amount` can be a function of how far into the range a vertex is (`w`, 0 to 1) that returns its size:

```js
taperMesh(trunk, { amount: 0.6 });                              // narrower at the top
taperMesh(vase, { amount: (w) => 1 + 0.4 * Math.sin(w * Math.PI) }); // wider in the middle
```

### `twistMesh(mesh, opts?)`

Turns the mesh around the axis line, more and more along it: `angle` radians in all (default π/2), in the same direction as `rotateX` / `rotateY` / `rotateZ`. `angle` can also be a function of `w`.

```js
twistMesh(column, { angle: Math.PI });            // half a turn from bottom to top
twistMesh(horn, { angle: 2, from: 0.3 });         // only past 30 % of the way up
```

### `bendMesh(mesh, opts?)`

Bends the mesh into an arc of `angle` radians (default π/2, a quarter turn), curving toward the `toward` axis (default `"z"` for a `"y"` axis). A negative angle curves the other way. The range is the part that curves, and it keeps its length. Before it nothing moves. After it the mesh carries on straight in the new direction, like a bent pipe.

```js
bendMesh(finger, { angle: 1.2, toward: "z", from: 0.4, to: 0.6 }); // a knuckle
bendMesh(stem, { angle: -0.8, toward: "x" });                       // leans to -x
```

### `bulgeMesh(mesh, opts)`

Pushes the surface out around `center`, fading smoothly to nothing at `radius`: cheeks, bellies, muscles. A negative `amount` makes a dent.

| Option | Default | Meaning |
| --- | --- | --- |
| `center` | required | Middle of the bulge, usually on the surface |
| `radius` | required | Distance where it fades to nothing |
| `amount` | `0.1` | How far the middle moves |
| `mode` | `"normal"` | `"normal"`: each point moves along the surface's normal, like a sculpting "inflate" brush, so it works on flat sides too. `"radial"`: points move away from `center` (put it inside the part that swells) |

```js
bulgeMesh(head, { center: { x: 0.12, y: -0.05, z: 0.15 }, radius: 0.1, amount: 0.03 }); // a cheek
```

Vertices at the same place (texture seams, OBJ files) move together, so the surface doesn't tear.

## Cleanup and checks

Meshes written by code (or loaded from files) can have vertices at the same place, faces pointing to vertices that don't exist, `NaN`s, faces of no area, or faces turned the wrong way. These four find and fix that. All but `validateMesh` change the mesh **in place** and return it.

```js
const problems = validateMesh(mesh);        // what's wrong, without changing anything
cleanMesh(mesh, { weld: true });             // merge, then remove what's broken
fixWinding(mesh);                            // turn faces so they all point outward
```

### `validateMesh(mesh)`

Lists what's wrong, one entry per kind of problem: `{ kind, level, message, faces?, vertices?, edges? }`. An empty list means nothing was found. The message is a short sentence with the first few items, ready to show (or to hand back to whoever wrote the mesh):

```js
validateMesh(mesh);
// [{ kind: "bad-index", level: "error",
//    message: "2 faces pointing to vertices that don't exist (faces 4, 9)", faces: [4, 9] }]
```

| Level | Kinds | Meaning |
| --- | --- | --- |
| `"error"` | `no-vertices`, `bad-vertex`, `bad-index`, `bad-faceUVs`, `bad-faceNormals`, `bad-edge` | Breaks drawing or export: missing vertices, positions that aren't numbers, lists that don't fit their faces |
| `"warning"` | `few-corners`, `crossed-face`, `no-area`, `repeated-face`, `turned-face`, `inside-out`, `many-faces-edge`, `bad-material` | Draws wrong: holes in the shading, faces that flicker or disappear |
| `"info"` | `open-edge`, `unused-vertex`, `same-place` | Worth knowing: a sheet has open borders on purpose, a solid shouldn't |

### `weldVertices(mesh, epsilon?)`

Merges vertices closer than `epsilon` (default: a ten-millionth of the mesh's size), so faces that touch share their vertices. Smooth shading then has no seams, and tools that follow neighbors (like `fixWinding`) see one surface. Texture coordinates and normals belong to face corners, so they're kept as they are. Corners that end up on the same vertex are removed, and faces left with fewer than 3 corners are dropped. Edges follow.

### `cleanMesh(mesh, opts?)`

Removes what's broken:

- faces pointing to vertices that don't exist, or whose positions aren't numbers;
- corners repeated in a row, faces left with fewer than 3 corners, faces that go through a vertex twice, faces of no area, and faces repeating another;
- texture coordinate and normal lists that don't fit their face (set to `null` for that face);
- edges to missing vertices;
- vertices, texture coordinates and normals that nothing uses.

Texture coordinates, normals and materials stay with their faces. With `weld: true` (or a distance), vertices at the same place are merged first.

### `fixWinding(mesh)`

Turns faces around so that faces next to each other agree, then each separate piece points outward: clockwise from outside, like the built-in shapes. Pieces are found by vertex position, so it works on unwelded meshes too. Texture coordinates and normals turn with their faces.

For a closed piece, outward is certain. For an open piece (a cup, a sheet), it's a guess: away from its middle. A flat piece keeps the way most of its faces already point.

## Rays, inside and distance

Questions about a mesh's surface, asked in code: where a ray first meets it, whether a point is inside it, and how far a point is from it. Use them to stick eyes and buttons onto a curved body, drop things onto terrain, scatter rocks or grass on a surface, check line of sight, or find parts hidden inside others.

<Demo src="query" hint="dots shot at a rock land on its surface · a ray found with raycastScene · grid points inside a ring — drag to orbit" />

<<< @/demos/query.js

### `meshQuery(mesh)`

Prepares a mesh for many questions. It splits the faces into triangles and builds a BVH (boxes inside boxes), so each question only looks at the few triangles near it: a ray on a 16,000-triangle body takes a few microseconds instead of a third of a millisecond. Preparing costs about as much as one slow question (a few tens of milliseconds for 16,000 triangles), so keep the query while you ask.

```js
const q = meshQuery(head);
const hit = q.raycast(from, { x: 0, y: 0, z: 1 });  // first hit, or null
q.contains(p);                                       // inside? (closed meshes)
q.distance(p);                                       // to the surface
q.closest(p);                                        // the nearest point, with its normal
```

A query is a **snapshot**: it copies the triangles when it's made, so changing the mesh afterwards doesn't change its answers. Make a new one after editing. Everything is in the mesh's own space (`mesh.vertices`); for objects placed in a scene, see [`raycastScene`](#raycastscene-scene-origin-direction-opts).

| Method | Returns |
| --- | --- |
| `raycast(origin, direction, { maxDistance, side })` | The first hit, or `null`. `direction` can be any length but zero. `side`: `"both"` (default), `"front"` (only faces hit from outside) or `"back"` (only from inside) |
| `contains(p)` | Whether the point is inside. Only meaningful for a closed mesh (see `isClosed`) |
| `closest(p, { maxDistance })` | The nearest point of the surface, or `null` when nothing is within `maxDistance` |
| `distance(p, maxDistance?)` | The distance to the surface; `Infinity` when nothing is within `maxDistance` (a limit makes it faster) |
| `triangleCount`, `bounds` | How many triangles, and the mesh's box `{ min, max }` |

A hit (and `closest`) has:

| Field | Meaning |
| --- | --- |
| `point` | Where it is |
| `normal` | Unit normal of the face, pointing **out** of the mesh, whichever side the ray came from |
| `distance` | From the ray's origin (or from `p` for `closest`) |
| `face` | Index in `mesh.faces` |
| `front` | `true` when the ray met the face from outside (not on `closest`) |
| `triangle`, `barycentric` | The 3 vertex indices of the triangle (faces with more corners are fans from their first corner, like [`pickHit`](./api#pickhit)) and their weights at the point |

To put something on a surface, shoot a ray at it and use the point and the normal:

```js
const hit = q.raycast({ x: 0.2, y: 0.3, z: 2 }, { x: 0, y: 0, z: -1 }, { side: "front" });
if (hit) eye.pos = { x: hit.point.x + hit.normal.x * 0.01, y: hit.point.y + hit.normal.y * 0.01, z: hit.point.z + hit.normal.z * 0.01 };
```

Rays start just past their origin, so a ray starting on the surface doesn't hit the face it starts on.

`contains` sends rays in a few fixed, odd directions and counts the faces each one crosses: an odd count is inside. Rays that pass too close to an edge or a corner are ignored, and the answer is what most of the remaining rays say, so points lined up with edges get the right answer. On a mesh with holes, the answer depends on the direction and means little.

### One-off questions

`raycastMesh(mesh, origin, direction, opts?)`, `pointInMesh(mesh, p)`, `distanceToMesh(mesh, p, maxDistance?)` and `closestPointOnMesh(mesh, p, opts?)` are the same as calling `meshQuery(mesh)` and asking once. Each one prepares the mesh again, so for more than a couple of questions on the same mesh, keep a `meshQuery`.

### `isClosed(mesh)`

Whether the mesh is closed (watertight): every edge is shared by exactly two faces. Edges are matched by vertex position, so unwelded meshes and texture seams count as closed. Only a closed mesh has an inside. The built-in cube, box, sphere, torus and cylinder are closed, and so are `blobMesh` results. A plane isn't, and neither is the default cone (its tip is a tiny open ring). For more detail, [`validateMesh`](#validatemesh-mesh) lists the open edges.

### `raycastScene(scene, origin, direction, opts?)`

The first object a ray meets in a scene, in **world space**: the 3D version of [`pickHit`](./api#pickhit). Each object's position, rotation, scale and groups are taken into account, so the point, normal and distance are where things are drawn (normals stay outward on stretched and mirrored objects).

```js
// What's below the player?
const ground = raycastScene(scene, player.pos, { x: 0, y: -1, z: 0 }, { filter: (o) => o !== player });
if (ground) player.pos.y = ground.point.y;
```

`scene` is a `Scene` or a list of objects. The options are `maxDistance` and `side` (as for `raycast`, in world units), `filter(obj)` to skip objects, and `objects` to look only at some objects and their children. Hidden objects, objects with `pickable: false` (or inside a group with it), and objects without faces (wireframes) are skipped.

The hit has the fields above, in the world, plus `object` (the object with the mesh hit), `path` (`[part, group, ..., root]`) and `local` (the point in the mesh's own space).

Each mesh is prepared the first time a ray reaches it, and kept until the mesh changes: new `vertices` or `faces` arrays, a different number of them, or `mesh.dirty` set. Moving objects costs nothing. If you change a mesh's vertices in place and a renderer has already cleared `dirty` (it does after each frame), call `clearQueryCache(mesh)`.
