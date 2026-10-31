# Modifier stack

A list of modeling steps applied in order, like Blender's modifier stack. The list is plain data: keep the original mesh and the list, change a number, apply again. Save it, send it, write it by hand, or have it written.

```js
import { applyModifiers, MODIFIERS } from "./trid/index.js";
```

<Demo src="modifiers" hint="one stack, step by step: a box · subdivided · shaped with a lattice · bent · roughened — drag to orbit" />

<<< @/demos/modifiers.js

## `applyModifiers(mesh, modifiers)`

Applies the steps in order and returns a **new mesh**: the original is never changed. Each step is `{ type, ...options }`, with the options of the function it stands for. `enabled: false` skips a step, like Blender's eye icon, without removing it.

```js
const vase = applyModifiers(lathe(profile), [
  { type: "lattice", div: 3, edits: [{ select: { y: 1 }, scale: 0.7 }] },
  { type: "twist", angle: 0.4 },
  { type: "noise", amount: 0.004, enabled: false }, // off for now
]);
```

**Order matters**, as in Blender: tapering then mirroring isn't mirroring then tapering. When a step fails, the error says which one and why, like `Modifier 3 ("lattice"): latticePoints: no y index 5 (the lattice has 3)`. The original error is kept as its `cause`.

## Steps

| `type` | Does | Options |
| --- | --- | --- |
| `"mirror"` | Mirrors across a plane, keeping both halves | as [`mirrorMesh`](./symmetry#mirrormesh-mesh-opts) |
| `"symmetrize"` | Copies one side over the other | as [`symmetrizeMesh`](./symmetry#symmetrizemesh-mesh-opts) |
| `"bisect"` | Cuts along a plane, keeps one side | as [`bisectMesh`](./symmetry#bisectmesh-mesh-opts) |
| `"array"` | Copies a step apart | as [`arrayMesh`](./symmetry#arraymesh-mesh-opts) |
| `"radialArray"` | Copies around an axis | as [`radialArrayMesh`](./symmetry#radialarraymesh-mesh-opts) |
| `"subdivide"` | Smooths and adds faces | as [`subdivideMesh`](./smoothing#subdividemesh-mesh-opts) |
| `"bevel"` | Rounds or cuts edges | as [`bevelMesh`](./smoothing#bevelmesh-mesh-opts) |
| `"boolean"` | Union, subtract or intersect | `op` (default `"union"`), `with`: a mesh, an object or a list; as [`booleanMesh`](./booleans) |
| `"taper"`, `"twist"`, `"bend"`, `"bulge"` | Deforms | as the [deformers](./deformers) |
| `"sculpt"` | One brush | `brush`, then as [`sculptMesh`](./sculpting#sculptmesh-mesh-brush-opts) |
| `"noise"` | Lumps all over, along the surface | `amount`: their height (default a fifth of `size`); `size`: about how wide (default a fifth of the mesh); `seed` |
| `"lattice"` | Reshapes with a cage of points | see [below](#lattice-steps) |
| `"remesh"` | Even, sculptable faces | as [`remeshMesh`](./sculpting#remeshmesh-input-opts) |
| `"weld"` | Merges points at the same place | `distance` |
| `"clean"` | Removes what's broken | as [`cleanMesh`](./cleanup#cleanmesh-mesh-opts) |
| `"fixWinding"` | Turns faces outward | |
| `"transform"` | Moves, turns, scales the vertices | `pos`, `rot`, `scale` |

## Lattice steps

A [lattice](./lattice) made in code can be given as `{ type: "lattice", lattice }`. As data, a step makes its own lattice around the mesh as it is at that step, and edits it:

```js
{
  type: "lattice", div: 3, padding: 0, interpolation: "cardinal",
  edits: [
    { select: { y: -1 }, scale: { x: 1.5, z: 1.5 } },  // the top layer, wider
    { select: { y: 1 }, scale: 0.7 },                   // the middle layer, smaller
    { select: { x: -1, y: -1 }, move: { y: 0.1 } },     // one row, lifted
    { select: { y: -1 }, rotate: { y: 0.5 } },          // the top layer, turned
  ],
}
```

Each edit picks points like [`latticePoints`](./lattice#latticepoints-lattice-which) (one index: a layer, two: a row, three: a point; negative: from the end), then scales and turns them around their middle, and moves them, in that order. Edits run one after the other.

## Your own steps

`MODIFIERS` holds the step types by name. Add a function of the mesh so far and the step: return a new mesh, or change the mesh in place and return nothing (it's the stack's own copy, never the original).

```js
MODIFIERS.lift = (mesh, { by = 0.1 }) => {
  for (const v of mesh.vertices) v.y += by;
};
applyModifiers(base, [{ type: "lift", by: 0.5 }]);
```

## Good to know

- **A stack is data.** Steps hold numbers, names and lists, so a stack survives `JSON.stringify` and gives the same mesh when read back. The exceptions are steps that hold other meshes (`boolean`'s `with`, a `lattice` object): store those your own way.
- **Each apply starts over.** The whole list runs on a copy of the original every time, so a stack with `remesh` or `boolean` steps takes as long as those steps. For live editing, keep heavy steps early and apply them once, then run the rest of the list on their result.
- **Lattice steps fit the mesh at their place in the list**: after a `mirror`, a lattice surrounds the whole mirrored mesh.
