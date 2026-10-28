# Booleans

Combine closed meshes like Blender's Boolean modifier: cut one out of another (holes, windows, notches), join them into one solid, or keep only where they overlap.

```js
import { booleanMesh, subtractMesh, unionMesh, intersectMesh } from "./trid/index.js";
```

<Demo src="booleans" hint="subtract · union · intersect — drag to orbit" />

<<< @/demos/booleans.js

## `booleanMesh(a, b, op, opts?)`

Returns a **new mesh**; the inputs aren't changed. `op` is `"union"`, `"subtract"` (or Blender's name, `"difference"`) or `"intersect"`. The shortcuts do the same:

| Function | Result |
| --- | --- |
| `subtractMesh(a, b)` | `a` with `b` cut out of it |
| `unionMesh(a, b)` | `a` and `b` joined into one solid (the inside walls removed) |
| `intersectMesh(a, b)` | Only where `a` and `b` overlap |

`a` and `b` can be meshes, or scene objects (and groups), which are used where they stand: their position, rotation and scale applied, like [`exportOBJ`](../export#obj-files). `b` can also be a list, applied one after the other, like a cutter collection in Blender:

```js
// A plate with three holes
const plate = makeShape("box", { w: 1, h: 0.1, d: 0.4 });
const hole = makeShape("cylinder", { r: 0.06, h: 0.3 });
const drilled = subtractMesh(plate, [-0.3, 0, 0.3].map((x) => ({ mesh: hole, pos: { x, y: 0, z: 0 } })));
scene.add({ mesh: drilled, material: { fill: "#9aa3ad", smooth: true } });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `materials` | `"transfer"` | Materials of faces that come from `b`. `"transfer"`: their own, numbered after `a`'s (see below). `"index"`: their numbers as they are, picking from `a`'s list |
| `epsilon` | tiny | How close counts as touching: a hundred-thousandth of the meshes' size |

## Materials and textures

Every face of the result keeps its texture coordinates and its material from the mesh it came from, like Blender's "Transfer" materials: the walls of a hole cut with a blue box are blue. The result's `faceMaterials` numbers `a`'s materials first, then `b`'s (then the next cutter's):

```js
const cup = subtractMesh(body, inside); // body has 1 material, inside has 1
scene.add({ mesh: cup, material: [{ fill: "#e07a5f" }, { fill: "#f4e9d8" }] }); // outside, inside walls
```

When the inputs are objects with a `material`, the result also has `materials`, that list made for you, as in the demo above: `scene.add({ mesh: cup, material: cup.materials })`. With `materials: "index"`, faces from `b` keep their own numbers, picking from `a`'s list, so the walls look like the object being cut.

## Good to know

- **The meshes must be closed**: no holes in their surface. An open mesh has no inside, so the result can be wrong (you get a warning once). Built-in shapes (except `plane`), `lathe` with closed ends, `extrude` and blobs are closed; [`isClosed(mesh)`](./queries) checks.
- **Faces lying on each other work**: two boxes side by side join into one, a cutter flush with a side cuts a notch, and a box cut with an identical box leaves nothing.
- **Faces are cut where the meshes cross**, then pieces of the same face joined back where they can, so the result has more faces than the inputs near the cut. Faces far from the other mesh are kept as they are. The result's corners are shared, and corners are added where needed so no cracks show between faces.
- **Speed**: only the faces near the other mesh are cut, so a small hole in a big mesh is quick. A cube cut out of a sphere of 10 000 faces takes about a fifth of a second (the first boolean of a page takes longer, while JavaScript warms up). Do it once when building a model, not every frame.
- **Smooth shading**: give the result `smooth: true` to round curved parts; the edges of a cut are sharper than 60°, so they stay crisp.
