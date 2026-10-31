# Lattice

A coarse cage of control points around a mesh, like Blender's Lattice modifier: move a few points and the whole shape follows smoothly. Widen a top, pinch a waist, lean a tower, twist a column, bulge a belly, with a handful of numbers instead of one per vertex.

```js
import { makeLattice, latticePoints, latticeMesh, latticeCage } from "./trid/index.js";
```

<Demo src="lattice" hint="a vase: top wider, middle pinched · a lean, one corner pulled out · a square column twisting live — drag to orbit" />

<<< @/demos/lattice.js

```js
const lattice = makeLattice(vase, { div: 3 });                       // 3 × 3 × 3 points around it
for (const p of latticePoints(lattice, { y: -1 })) { p.x *= 1.5; p.z *= 1.5; } // the top layer, wider
latticeMesh(vase, lattice);                                          // the vase follows
```

A lattice only moves vertices, so the mesh needs plenty of them where it bends: build it with rows (`lathe`, `loft`, `sweep`), subdivide it, or [`remeshMesh`](./sculpting#remeshmesh-input-opts) it.

## `makeLattice(input, opts?)`

A lattice around a mesh's box (or around any box `{ min, max }`), its points spread evenly over it.

| Option | Default | Meaning |
| --- | --- | --- |
| `div` | `3` | Points per side: a number, or `{ x, y, z }`. At least 2 (a side of no size, like a flat sheet's, gets 1) |
| `padding` | `0` | Make the box this much bigger on every side, so the cage sits a little off the surface |

A lattice is plain data, in the mesh's own space: `{ min, max, div, points }`. `points[i + div.x * (j + div.y * k)]` is the point `i` along x, `j` along y and `k` along z, counted from the low corner. Move the points freely; where they started is remembered by the box and `div`, so they can always be compared with their rest places.

## `latticePoints(lattice, which?)`

Picks a lattice's points to move: one index gives a **layer**, two a **row**, three a single **point**. Negative indices count from the end. The points are the lattice's own, so changing them changes the lattice.

```js
latticePoints(lattice, { y: 0 });              // the bottom layer
latticePoints(lattice, { y: -1 });             // the top layer
latticePoints(lattice, { x: 0, z: -1 });       // one vertical row: left, back
latticePoints(lattice, { x: 1, y: 1, z: 1 })[0] // the middle point of a 3 × 3 × 3 lattice
```

## `latticeMesh(mesh, lattice, opts?)`

Deforms a mesh by its lattice, **in place**, like the [deformers](./deformers): each vertex moves by how far the points around it moved from their rest places, blended smoothly. An untouched lattice changes nothing; a lattice shifted, scaled or sheared as a whole moves the mesh exactly that way. Vertices outside the lattice's box move like the nearest place on it.

`interpolation` sets how the points' moves blend:

| Interpolation | Shape | A vertex at a moved point |
| --- | --- | --- |
| `"bspline"` (default, like Blender) | The smoothest, soft | Moves less than the point: 2/3 as far as its layer when a whole layer inside the lattice moves, about 0.3 as far when one point moves alone |
| `"cardinal"` | Smooth, follows the points | Moves exactly with it: easiest to aim |
| `"linear"` | Straight between points, creased at them | Moves exactly with it |

Make the lattice for the mesh as it is, move its points, and apply it once. To try other moves, apply the lattice to a fresh copy of the original each time (`cloneMesh`), like the live column in the demo.

## `latticeCage(lattice)`

The lattice as a wireframe mesh, to show it: lines between neighboring points. Its vertices **are** the lattice's points (the same objects), so it always shows the lattice as it is. After moving points, set the cage's `dirty` so it's drawn again, and apply the lattice again to a copy of the original mesh.

```js
const cage = scene.add({ mesh: latticeCage(lattice), pos: vase.pos }); // no material: drawn as lines
```
