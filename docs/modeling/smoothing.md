# Subdivision & bevels

Two ways to soften a mesh: subdivide a rough cage into a smooth surface, or round only its sharp edges.

```js
import { subdivideMesh, bevelMesh } from "./trid/index.js";
```

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
