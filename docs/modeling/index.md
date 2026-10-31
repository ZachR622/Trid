# Modeling

Tools for making your own shapes in code, beyond `makeShape`, `lathe` and `extrude`. Everything here returns plain data (points or meshes), so it works with every renderer, and meshes come with texture coordinates and clockwise faces like the built-in shapes.

```js
import {
  spline, resamplePath, sweep, loft, subdivideMesh, bevelMesh, blobMesh, blobField, sdfMesh,
  booleanMesh, unionMesh, subtractMesh, intersectMesh,
  mirrorMesh, symmetrizeMesh, bisectMesh, arrayMesh, radialArrayMesh, mirrorObject, arrayObject, radialArrayObject,
  taperMesh, twistMesh, bendMesh, bulgeMesh, sculptMesh, remeshMesh,
  makeLattice, latticePoints, latticeMesh, latticeCage, weldVertices, cleanMesh, validateMesh, fixWinding,
  dropOnto, attachTo, alignObjects, distributeObjects,
  meshQuery, raycastMesh, pointInMesh, distanceToMesh, closestPointOnMesh, isClosed, raycastScene,
} from "./trid/index.js";
```

| Page | Tools |
| --- | --- |
| [Curves, sweeps & lofts](./curves) | `spline`, `resamplePath`, `sweep`, `loft` |
| [Subdivision & bevels](./smoothing) | `subdivideMesh`, `bevelMesh` |
| [Blobs](./blobs) | `blobMesh`, `blobField`, `sdfMesh` |
| [Booleans](./booleans) | `booleanMesh`, `unionMesh`, `subtractMesh`, `intersectMesh` |
| [Mirror & array](./symmetry) | `mirrorMesh`, `symmetrizeMesh`, `bisectMesh`, `arrayMesh`, `radialArrayMesh`, and the same for objects |
| [Deformers](./deformers) | `taperMesh`, `twistMesh`, `bendMesh`, `bulgeMesh` |
| [Sculpting](./sculpting) | `sculptMesh`: inflate, grab, smooth, flatten, pinch, crease, noise; `remeshMesh` |
| [Lattice](./lattice) | `makeLattice`, `latticePoints`, `latticeMesh`, `latticeCage` |
| [Cleanup and checks](./cleanup) | `weldVertices`, `cleanMesh`, `validateMesh`, `fixWinding` |
| [Rays, inside and distance](./queries) | `meshQuery`, `raycastScene`, `isClosed` and one-off helpers |
| [Placing objects](./placement) | `dropOnto`, `attachTo`, `alignObjects`, `distributeObjects` |

## Which tool for which shape

| You want | Use |
| --- | --- |
| A body, a creature, something soft or organic | [Blobs](./blobs): shapes that melt together |
| A tail, a horn, a pipe, a rope, a handle | [`sweep`](./curves#sweep-path-opts) along a [`spline`](./curves#spline-points-opts) |
| A bottle, a hull, a head: a shape whose cross-section changes | [`loft`](./curves#loft-sections-opts) |
| A vase, a wheel, a lamp: turned around an axis | [`lathe`](../shapes#lathe-profile-opts) |
| A flat outline with depth: a logo, a key, a star | [`extrude`](../shapes#extrude-outline-depth-0-2) |
| Something smooth, built from a few boxes | [`subdivideMesh`](./smoothing#subdividemesh-mesh-opts) |
| Holes, windows, notches, cut-outs; or one solid from overlapping parts | [Booleans](./booleans): subtract, union, intersect |
| Furniture, devices, robots: soft edges | [`bevelMesh`](./smoothing#bevelmesh-mesh-opts), or `makeShape("box", { radius })` |
| Anything symmetric: a chair, a face, a car, a creature | Build one half, then [`mirrorMesh`](./symmetry#mirrormesh-mesh-opts); or [`symmetrizeMesh`](./symmetry#symmetrizemesh-mesh-opts) a lopsided one |
| Rows, fences, stairs, spokes, petals, legs around a table | [`arrayMesh`](./symmetry#arraymesh-mesh-opts) and [`radialArrayMesh`](./symmetry#radialarraymesh-mesh-opts), or the object versions |
| Faces, creatures, details: cheeks, snouts, mouths, wrinkles, rough skin | [`sculptMesh`](./sculpting) on a dense mesh, with `symmetry: "x"` |
| One smooth body from overlapping parts, or any shape made sculptable | [`remeshMesh`](./sculpting#remeshmesh-input-opts) |
| A whole shape reshaped with a few points: a wider top, a pinched waist, a lean, a twist | [Lattice](./lattice) |
| A trunk that tapers, a twisted column, a bent arm | [Deformers](./deformers) |
| Rocks, terrain, wobbly surfaces | [`displaceMesh`](../shapes#mesh-helpers) with [noise](../noise) |
| Parts that rest on each other: a cup on a table, rocks on the ground, a roof on walls | [`dropOnto`](./placement#droponto-obj-targets-opts) |
| Horns, handles, ears or spikes growing out of a surface | [`attachTo`](./placement#attachto-obj-targets-opts) |
| Legs on the same floor, things centered or evenly spaced | [`alignObjects`](./placement#alignobjects-objects-opts), [`distributeObjects`](./placement#distributeobjects-objects-opts) |
| Eyes, buttons or pebbles placed on a surface | [`meshQuery`](./queries#meshquery-mesh) or [`raycastScene`](./queries#raycastscene-scene-origin-direction-opts) |
| A mesh from a file or your own code that looks wrong | [Cleanup and checks](./cleanup) |

## Putting it together

The fox on the [home page](/) uses most of these: a body, a head and fluffy cheeks of blobs, ears lofted from an oval to a point, a tail swept along a spline, eyes placed on the face with rays, and a beveled round platform. Its code is in [`docs/demos/fox.js`](https://github.com/ZachR622/Trid/blob/master/docs/demos/fox.js).
