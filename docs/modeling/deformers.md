# Deformers

The everyday modifiers, one call each: `taperMesh`, `twistMesh`, `bendMesh` and `bulgeMesh`. Like [`displaceMesh`](../shapes#mesh-helpers), each one changes the mesh **in place** and returns it. The mesh's own normals (from an OBJ file) are removed, since they no longer fit, and the renderers compute new ones.

```js
import { taperMesh, twistMesh, bendMesh, bulgeMesh } from "./trid/index.js";
```

<Demo src="deform" hint="tapered · twisted · bent halfway up · with a bulge — drag to orbit" />

<<< @/demos/deform.js

::: tip Give it enough faces
A deformer only moves vertices, so a shape needs vertices along the way to bend or twist smoothly. The built-in `box` and `cylinder` have none along their height: build tall shapes with `lathe`, `loft` or `sweep` (which make rows), or [subdivide](./smoothing#subdividemesh-mesh-opts) them first (`smooth: false` adds rows without changing the shape).
:::

## Along an axis: taper, twist, bend

These three work along an `axis` (default `"y"`). Positions along it are measured over the mesh's size, from `0` at its low end to `1` at its high end, so the same numbers work at any size:

| Option | Default | Meaning |
| --- | --- | --- |
| `axis` | `"y"` | Axis the effect goes along |
| `from` | `0` | Where the change starts |
| `to` | `1` | Where it ends. Past it, the full effect carries on |
| `center` | the box's middle | A point the axis line goes through (`{ x, z }` is enough for a `"y"` axis) |

Below `from` nothing changes. `from: 0.5` changes only the top half.

## `taperMesh(mesh, opts?)`

Narrows or widens the mesh around the axis line. The start of the range keeps its size, and the end is `amount` times as wide (default `0.5`). `amount` can be a function of how far into the range a vertex is (`w`, 0 to 1) that returns its size:

```js
taperMesh(trunk, { amount: 0.6 });                              // narrower at the top
taperMesh(vase, { amount: (w) => 1 + 0.4 * Math.sin(w * Math.PI) }); // wider in the middle
```

## `twistMesh(mesh, opts?)`

Turns the mesh around the axis line, more and more along it: `angle` radians in all (default π/2), in the same direction as `rotateX` / `rotateY` / `rotateZ`. `angle` can also be a function of `w`.

```js
twistMesh(column, { angle: Math.PI });            // half a turn from bottom to top
twistMesh(horn, { angle: 2, from: 0.3 });         // only past 30 % of the way up
```

## `bendMesh(mesh, opts?)`

Bends the mesh into an arc of `angle` radians (default π/2, a quarter turn), curving toward the `toward` axis (default `"z"` for a `"y"` axis). A negative angle curves the other way. The range is the part that curves, and it keeps its length. Before it nothing moves. After it the mesh carries on straight in the new direction, like a bent pipe.

```js
bendMesh(finger, { angle: 1.2, toward: "z", from: 0.4, to: 0.6 }); // a knuckle
bendMesh(stem, { angle: -0.8, toward: "x" });                       // leans to -x
```

## `bulgeMesh(mesh, opts)`

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
