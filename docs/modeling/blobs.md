# Blobs

Shapes that melt together into one smooth surface, instead of looking like stacked balls: creatures, soft bodies, clay-like forms. Each shape is a *distance field* (how far a point is from its surface, negative inside). They're joined with smooth unions, subtractions and intersections, and the result is turned into a mesh.

```js
import { blobMesh, blobField, sdfMesh } from "./trid/index.js";
```

<Demo src="blobs" hint="a spiky ball: a sphere and rounded cones melting together · a die carved by spheres (marching cubes) — drag to orbit" />

<<< @/demos/blobs.js

## `blobMesh(shapes, opts?)`

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
| `uvs` | `"box"` | Texture mapping for the texture coordinates, like [`computeUVs`](../textures#texture-mapping) (`"box"`, `"sphere"`, `{ type: "cylinder", axis: "x" }`…), or `false` |

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

## `blobField(shapes, opts?)` and `sdfMesh(field, bounds, opts?)`

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
