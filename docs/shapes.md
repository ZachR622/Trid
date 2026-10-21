# Shapes & meshes

Build meshes with `makeShape`, reshape them with `scaleMesh`, or write your own from vertices and edges.

```js
import { makeShape, scaleMesh } from "./trid/render/shapes.js";
```

<Demo src="shapes" hint="cube · box · sphere · custom pyramid — drag to orbit" />

<<< @/demos/shapes.js

## `makeShape(kind, opts?)`

Returns a new mesh centered on the origin, with `vertices`, `edges` and `faces` (so it can be drawn as a wireframe or [filled](./faces)). `kind` is not case-sensitive. An unknown kind throws an `Error`.

| Kind | Options (defaults) | Result |
| --- | --- | --- |
| `"cube"` | `size` (0.5) | Cube with sides of `size` |
| `"box"` | `w` (0.6), `h` (0.6), `d` (0.6) | Box of width (X), height (Y), depth (Z) |
| `"sphere"` | `r` (0.45), `rings` (12), `segments` (24) | Sphere of latitude and longitude lines |

### Sphere details

- `rings` is the number of latitude *bands* from pole to pole (minimum 2), so it draws `rings - 1` circles.
- `segments` is the number of points on each circle, and the number of meridian lines.
- Each pole is a single vertex. Fewer rings and segments draw faster and look more stylized.

## `scaleMesh(mesh, sx = 1, sy = 1, sz = 1)`

Multiplies every vertex by the given factors and returns the same mesh.

```js
// An egg: a sphere stretched along Y
const egg = scaleMesh(makeShape("sphere", { r: 0.3 }), 1, 1.4, 1);
```

::: warning It changes the mesh in place
Every object sharing that mesh changes too. To stretch a single object, change its `scale` instead - that's cheaper and reversible.
:::

## Custom meshes

A mesh is just `{ vertices, edges }`, plus `faces` if you want to [fill it](./faces#faces-in-a-mesh). Edges with 2 indices are segments; edges with 3 or more are closed loops. See [Meshes](./concepts#meshes).

### Example: a floor grid

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
