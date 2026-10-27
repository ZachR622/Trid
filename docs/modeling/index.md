# Modeling

Tools for making your own shapes in code, beyond `makeShape`, `lathe` and `extrude`. Everything here returns plain data (points or meshes), so it works with every renderer, and meshes come with texture coordinates and clockwise faces like the built-in shapes.

```js
import {
  spline, resamplePath, sweep, loft, subdivideMesh, bevelMesh, blobMesh, blobField, sdfMesh,
  taperMesh, twistMesh, bendMesh, bulgeMesh, weldVertices, cleanMesh, validateMesh, fixWinding,
  meshQuery, raycastMesh, pointInMesh, distanceToMesh, closestPointOnMesh, isClosed, raycastScene,
} from "./trid/index.js";
```

| Page | Tools |
| --- | --- |
| [Curves, sweeps & lofts](./curves) | `spline`, `resamplePath`, `sweep`, `loft` |
| [Subdivision & bevels](./smoothing) | `subdivideMesh`, `bevelMesh` |
| [Blobs](./blobs) | `blobMesh`, `blobField`, `sdfMesh` |
| [Deformers](./deformers) | `taperMesh`, `twistMesh`, `bendMesh`, `bulgeMesh` |
| [Cleanup and checks](./cleanup) | `weldVertices`, `cleanMesh`, `validateMesh`, `fixWinding` |
| [Rays, inside and distance](./queries) | `meshQuery`, `raycastScene`, `isClosed` and one-off helpers |

## Which tool for which shape

| You want | Use |
| --- | --- |
| A body, a creature, something soft or organic | [Blobs](./blobs): shapes that melt together |
| A tail, a horn, a pipe, a rope, a handle | [`sweep`](./curves#sweep-path-opts) along a [`spline`](./curves#spline-points-opts) |
| A bottle, a hull, a head: a shape whose cross-section changes | [`loft`](./curves#loft-sections-opts) |
| A vase, a wheel, a lamp: turned around an axis | [`lathe`](../shapes#lathe-profile-opts) |
| A flat outline with depth: a logo, a key, a star | [`extrude`](../shapes#extrude-outline-depth-0-2) |
| Something smooth, built from a few boxes | [`subdivideMesh`](./smoothing#subdividemesh-mesh-opts) |
| Furniture, devices, robots: soft edges | [`bevelMesh`](./smoothing#bevelmesh-mesh-opts), or `makeShape("box", { radius })` |
| A trunk that tapers, a twisted column, a bent arm | [Deformers](./deformers) |
| Rocks, terrain, wobbly surfaces | [`displaceMesh`](../shapes#mesh-helpers) with [noise](../noise) |
| Eyes, buttons or pebbles placed on a surface | [`meshQuery`](./queries#meshquery-mesh) or [`raycastScene`](./queries#raycastscene-scene-origin-direction-opts) |
| A mesh from a file or your own code that looks wrong | [Cleanup and checks](./cleanup) |

## Putting it together

The fox on the [home page](/) uses most of these: a body, a head and fluffy cheeks of blobs, ears lofted from an oval to a point, a tail swept along a spline, eyes placed on the face with rays, and a beveled round platform. Its code is in [`docs/demos/fox.js`](https://github.com/ZachR622/Trid/blob/master/docs/demos/fox.js).
