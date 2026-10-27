# Shapes & meshes

Build meshes with `makeShape`, spin a profile with `lathe`, thicken an outline with `extrude`, change them with the [mesh helpers](#mesh-helpers), or write your own from vertices and edges.

```js
import { makeShape, lathe, extrude, scaleMesh, transformMesh, mergeMeshes } from "./trid/index.js";
```

<Demo src="shapes" hint="cube · rounded box · sphere · your own pyramid / cylinder · cone · torus · plane — the lines show how each is built · drag to orbit" />

<<< @/demos/shapes.js

## `makeShape(kind, opts?)`

Returns a new mesh centered on the origin, with `vertices`, `edges`, `faces` and texture coordinates (so it can be drawn as a wireframe, [filled](./faces) or [textured](./textures)). `kind` is not case-sensitive. An unknown kind throws an `Error`.

| Kind | Options (defaults) | Result |
| --- | --- | --- |
| `"cube"` | `size` (0.5), `radius` (0), `segments` (4) | Cube with sides of `size` |
| `"box"` | `w` (0.6), `h` (0.6), `d` (0.6), `radius` (0), `segments` (4) | Box of width (X), height (Y), depth (Z) |
| `"sphere"` | `r` (0.45), `rings` (12), `segments` (24) | Sphere of latitude and longitude lines |
| `"cylinder"` | `r` (0.3), `h` (0.8), `segments` (32) | Capped cylinder standing along Y |
| `"cone"` | `r` (0.35), `h` (0.8), `segments` (32), `rTop` (0) | Cone with its tip up (a single point); with `rTop` > 0, a tapered cylinder |
| `"torus"` | `R` (0.35), `tube` (0.12), `segments` (48), `tubeSegments` (20) | Ring lying flat in XZ. `R` goes from the center to the middle of the tube |
| `"plane"` | `size` (1), `div` (8), `height` (none) | Flat grid in XZ facing +Y, `div` cells per side |

`segments` is always the number of points around (the Y axis, or the sphere's circles). Cylinders, cones and tori are built with [`lathe`](#lathe-profile-opts).

### Rounded boxes

With a `radius`, a cube or box gets rounded edges and corners: furniture, devices, cushions, phones. `segments` is the rows around each rounded edge. Vertices along the edges are shared, so `smooth: true` shades it without seams. Each side keeps its material number and its whole texture, like the plain box.

```js
const phone = makeShape("box", { w: 0.35, h: 0.7, d: 0.04, radius: 0.015 });
```

To round the edges of any other mesh, use [`bevelMesh`](./modeling/smoothing#bevelmesh-mesh-opts).

### Plane heights

`height(x, z)` returns the height of each grid point, which turns the plane into a terrain:

```js
const hills = makeShape("plane", {
  size: 2, div: 40,
  height: (x, z) => 0.1 * Math.sin(x * 4) * Math.cos(z * 3),
});
```

### Sphere details

- `rings` is the number of latitude *bands* from pole to pole (minimum 2), so it draws `rings - 1` circles.
- `segments` is the number of points on each circle, and the number of meridian lines.
- Each pole is a single vertex. Fewer rings and segments draw faster and look more stylized.

## `lathe(profile, opts?)`

Spins a profile around the Y axis, like a potter's wheel: vases, bottles, cups, columns, chess pieces. The profile is a list of `{ r, y }` points: the distance from the axis and the height.

<Demo src="lathe" hint="a lathe vase and an extruded star — drag to orbit" />

<<< @/demos/lathe.js

| Option | Default | Meaning |
| --- | --- | --- |
| `segments` | `32` | Points around the axis |
| `capBottom` | `false` | Close the bottom with a flat disc |
| `capTop` | `false` | Close the top with a flat disc |
| `closed` | `false` | Join the last point back to the first (a ring, like a torus) |

::: tip Which way to walk the profile
Walk it so the **outside is on your right** in the (r, y) plane: bottom to top for a vase, or, for a closed ring, counter-clockwise (like the torus). Walked the other way, the faces point inward.
:::

A point with `r: 0` is a **pole**: a single vertex with triangles around it, so that end closes to a tip with no cap needed (the cone's tip, both ends of a spinning top). Texture coordinates go around (u) and along the profile by its length (v); caps map the texture as a disc.

## `extrude(outline, depth = 0.2)`

Turns a flat outline in the XY plane into a solid `depth` thick along Z, centered on the origin: blades, axes, keys, stars, letters, floor plans. The outline is a list of `{ x, y }` points. It may go either way round and may be concave, but can't have holes or cross itself.

```js
// A sword blade, thin along Z, with sharpened edges
const blade = extrude([
  { x: -0.04, y: 0 }, { x: 0.04, y: 0 }, { x: 0.04, y: 0.8 }, { x: 0, y: 0.9 }, { x: -0.04, y: 0.8 },
], 0.015, { bevel: 0.0075 });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `bevel` | `0` | Cuts the edges between the sides and the front / back by this much, so they catch the light. Up to half the depth: a bevel of half the depth makes a sharp edge (a blade) |
| `bevelSegments` | `1` | `1` is a flat chamfer; more steps make a rounded edge |
| `taper` | `1` | Size of the back compared to the front (`0.5` = half as big), around the middle of the outline's bounding box |

The front and back map the texture over the outline's bounding box; the sides wrap it along the outline. Rotate the object (or bake it with `scaleMesh`) to stand it another way.

`triangulate(points)` is the ear-clipping function `extrude` uses to cut the outline into triangles, if you need it for your own meshes. Give it a counter-clockwise outline; it returns index triples.

## `scaleMesh(mesh, sx = 1, sy = 1, sz = 1)`

Multiplies every vertex by the given factors and returns the same mesh.

```js
// An egg: a sphere stretched along Y
const egg = scaleMesh(makeShape("sphere", { r: 0.3 }), 1, 1.4, 1);
```

::: warning It changes the mesh in place
Every object sharing that mesh changes too. To stretch a single object, change its `scale` instead - that's cheaper and reversible.
:::

## Mesh helpers

Functions that copy, change, join and measure meshes. `transformMesh`, `displaceMesh` and `scaleMesh` change the mesh **in place** (every object sharing it changes too) and mark it `dirty`, so the WebGL renderer uploads it again. Use `cloneMesh` first to keep the original.

### `cloneMesh(mesh)`

A deep copy: vertices, edges, faces, texture coordinates, normals and materials.

```js
const big = scaleMesh(cloneMesh(rockMesh), 2, 2, 2); // rockMesh is unchanged
```

### `transformMesh(mesh, { pos?, rot?, scale? })`

Bakes a transform into the vertices: scale, then rotate (X, then Y, then Z), then move, the same order objects use, so a baked mesh drawn at the origin looks exactly like the original drawn with that transform. Parts left out change nothing (`{ pos: { y: 1 } }` only moves up).

- The mesh's own normals (from OBJ files) turn with it.
- A mirroring scale (`scale: { x: -1, y: 1, z: 1 }`) reverses the faces, so they still face outward.
- Pass a scene object to bake its `pos`, `rot` and `scale`, then reset them on the object, or it's transformed twice.

### `displaceMesh(mesh, fn)`

Moves each vertex to `fn(vertex, index)`: lumps on a rock, waves on a plane, a bend or a twist. The function gets a copy of the vertex and returns the new position. The mesh's own normals no longer fit the new shape, so they're removed and the renderers compute new ones.

```js
// Twist a box around Y: the higher the vertex, the more it turns
displaceMesh(makeShape("box", { w: 0.3, h: 1, d: 0.3 }), (v) => {
  const a = v.y * 2, c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c };
});
```

Displace with [noise](./noise) for natural shapes. Faces are only as smooth as the mesh is fine, so start from a shape with enough vertices (`rings`, `segments`, `div`).

### `mergeMeshes(items, opts?)`

Joins meshes into a new one: one object to draw and move instead of many, or one mesh to export. Faces, edges, texture coordinates, normals and materials are kept. The inputs aren't changed.

An object in the list (`{ mesh, pos, rot, scale }`, in a scene or not) is merged where it stands, with its transform baked in.

```js
// A sword from parts, each with its own material
const sword = mergeMeshes([
  { mesh: blade, pos: { x: 0, y: 0.45, z: 0 } },
  { mesh: guard, pos: { x: 0, y: 0, z: 0 } },
  { mesh: grip,  pos: { x: 0, y: -0.12, z: 0 } },
], { materialPerMesh: true });

scene.add({ mesh: sword, material: [{ fill: "#ccd" }, { fill: "#c90" }, { fill: "#642" }] });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `materialPerMesh` | `false` | The faces of the i-th mesh use material i of the object's [material list](./textures#a-texture-per-face). Without it, each mesh keeps its own `faceMaterials` (OBJ material names are joined into one list) |

A mesh without `edges` keeps showing its face outlines in the merged wireframe.

### `meshBounds(input)`

The box around a mesh, an object, a list of them or a whole `Scene`: `{ min, max, center, size }`. Objects are measured where they stand, with their transform. Returns `null` when there's nothing to measure.

```js
// Point the camera at everything
const { center, size } = meshBounds(scene);
orbit.target = center;
orbit.distance = Math.max(size.x, size.y, size.z) * 2;
```

To center a mesh and scale it to a size, use `fitMesh(mesh, size)` from the [OBJ loader](./obj).

## Floor grids

<Demo src="grid" hint="drag to orbit" />

### `gridHelper(opts?)`

A floor grid like 3D editors have, as one object to `scene.add`: thin minor lines, brighter major lines, the axes through the origin in color (X red, Y green, Z blue, like the gizmos), fading out toward the edge.

```js
scene.add(gridHelper({ size: 4, divisions: 40 }));
```

| Option | Default | Meaning |
| --- | --- | --- |
| `size` | `4` | Width of the whole grid |
| `divisions` | `40` | Cells along each side |
| `major` | `10` | A major line every this many cells (`0`: none) |
| `plane` | `"xz"` | The plane it lies in: `"xz"` (a floor), `"xy"` or `"yz"` |
| `color` | `"rgba(255, 255, 255, 0.12)"` | Minor lines |
| `majorColor` | `"rgba(255, 255, 255, 0.25)"` | Major lines |
| `axes` | `true` | Draw the axes; or their colors, like `{ x: "#f00" }`; `false` for none |
| `fade` | `true` | Fade toward the edge, in a circle. A number sets where the fade starts (0 = center, 1 = edge; `true` = 0.5). Needs colors written as hex, `rgb()` or `rgba()` |
| `lineWidth` | `1` | Line width in pixels |

It's a group (`children` are line-only meshes, one per color and fade step), so move, turn or hide it like any object. It has `pickable: false`, so [picking](./api#pickhit) never finds it.

### `gridMesh(opts?)`

Just the lines: a square grid centered on the origin, `divisions + 1` lines each way, as a line-only mesh. Options `size` (4), `divisions` (40) and `plane` (`"xz"`).

```js
scene.add({ mesh: gridMesh({ size: 2, divisions: 10 }), color: "#333" });
```

## Custom meshes

A mesh is just `{ vertices, edges }`, plus `faces` if you want to [fill it](./faces#faces-in-a-mesh). Edges with 2 indices are segments; edges with 3 or more are closed loops. See [Meshes](./concepts#meshes).

`edges` can be left out on a mesh that has `faces`: an object with no material then draws the outline of each face. Pass `edges: []` to draw no lines at all.

### Example: lines by hand

(`gridMesh()` does this, see [Floor grids](#floor-grids); this shows how to build lines yourself.)

```js
function makeGrid(size = 2, divisions = 10) {
  const vertices = [];
  const edges = [];
  const half = size / 2;

  for (let i = 0; i <= divisions; i++) {
    const t = -half + (i / divisions) * size;
    const a = vertices.push({ x: t, y: 0, z: -half }, { x: t, y: 0, z: half }) - 2;
    edges.push([a, a + 1]); // line along Z
    const b = vertices.push({ x: -half, y: 0, z: t }, { x: half, y: 0, z: t }) - 2;
    edges.push([b, b + 1]); // line along X
  }
  return { vertices, edges };
}

scene.add({ mesh: makeGrid(), pos: { x: 0, y: -0.5, z: 0 }, color: "#333" });
```

### Tips

- Center meshes on the origin: objects rotate around their local origin.
- Share meshes between objects. Drawing never modifies a mesh, so one sphere mesh can back a hundred objects.
- Prefer loops over many 2-index edges where you can: `[0, 1, 2, 3]` is shorter than four segments and draws the same.
