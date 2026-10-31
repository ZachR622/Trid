# Sculpting

Blender's sculpt brushes as one function: `sculptMesh(mesh, brush, opts)` pushes, pulls, smooths and carves a mesh around a point or along a path, fading out at a radius. To paint them with the mouse, see [`SculptTool`](../tools#sculpttool). Like the [deformers](./deformers), it changes the mesh **in place** and returns it. The mesh's own normals (from an OBJ file) are removed, and the renderers compute new ones.

```js
import { sculptMesh, SCULPT_BRUSHES, remeshMesh } from "./trid/index.js";
```

<Demo src="sculpt" hint="inflate · grab · smooth (the front of a lumpy ball) · flatten · pinch (a raised ridge made sharp) · crease (a smile) · noise — drag to orbit" />

<<< @/demos/sculpt.js

::: tip Give it enough vertices
A brush only moves vertices, so the mesh needs plenty where it's sculpted: a sphere with many `rings` and `segments`, [blobs](./blobs), lofts and sweeps, or any shape after [`remeshMesh`](#remeshmesh-input-opts). A built-in box has 8 corners and nothing between them to move.
:::

## `sculptMesh(mesh, brush, opts)`

```js
sculptMesh(head, "inflate", { center: cheek, radius: 0.1, strength: 0.02, symmetry: "x" }); // both cheeks
sculptMesh(head, "grab", { center: noseTip, radius: 0.08, delta: { z: -0.05 } });          // a longer nose
sculptMesh(head, "crease", { along: [a, b, c], radius: 0.02, strength: 0.01 });             // a mouth line
```

Where the brush works:

| Option | Default | Meaning |
| --- | --- | --- |
| `center` | | Middle of the brush, in the mesh's own space |
| `along` | | Or a path (a list of points): the brush works along all of it at once, like a stroke. A groove along a path is the same depth everywhere on it |
| `radius` | required | Distance where the brush fades to nothing |
| `falloff` | `"smooth"` | How it fades from the middle to the radius: `"smooth"`, `"sharp"` (strong in the middle only), `"linear"`, `"constant"` (full strength up to the radius: a hard edge), or a function of distance / radius (0 to 1) |
| `symmetry` | none | `"x"` (or a list of axes): the brush also works mirrored across the mesh's origin, like Blender's X mirror. A symmetric mesh stays exactly symmetric, and points on the mirror plane stay on it |

## Brushes

| Brush | What it does | `strength` (default) | Also |
| --- | --- | --- | --- |
| `"inflate"` | Pushes the surface out along its normals; negative pushes it in. Cheeks, bellies, muscles, dents | How far the middle moves (radius / 5) | |
| `"grab"` | Moves the area by `delta`, fading out: pull a snout, lift a shoulder, bend an ear | A factor on `delta` (1) | `delta`: the move at the middle |
| `"smooth"` | Moves points toward the middle of their neighbors: softens noise, bumps and harsh edits | 0 to 1 per pass (0.5) | `iterations`: passes (1); more passes smooth wider bumps |
| `"flatten"` | Presses the area onto the plane through it: a cut face, the sole of a foot, a seat | 0 to 1 (0.5); 1 with `falloff: "constant"` makes a clean flat face | |
| `"pinch"` | Pulls points toward the brush, along the surface: makes ridges and grooves sharp | 0 to 1 (0.3) | |
| `"crease"` | A groove: pushes in and pinches at once. Mouths, eyelids, wrinkles, the line between fingers. Negative makes a sharp ridge | Depth at the middle (radius × 0.15) | `pinch`: 0 to 1 (0.5) |
| `"noise"` | Lumps the surface in and out with [`fbm3`](../noise): skin, bark, rock | Height of the lumps (radius × 0.15) | `scale`: lumps per radius (3); `seed` |

`SCULPT_BRUSHES` lists the brush names.

A brush with `symmetry` reads the noise on each side as if it were the first, so `"noise"` is mirrored too.

## Good to know

- **Points at the same place move together.** Meshes split at texture seams (and many OBJ files) have several vertices at one place. They're moved as one, so the surface doesn't tear.
- **Order matters, like in Blender.** Each call works on the mesh as the last one left it. Inflate a ridge, then pinch it, and you get a sharp fin (the blue ball in the demo).
- **Strokes are exact.** With `along`, each point is weighed by its distance to the whole path, so there are no dabs to space out: a crease is equally deep from one end of the path to the other, and fades past its ends.
- **Speed.** Only the points in the brush's reach are looked at, plus one pass over the faces. On a 33,000-vertex sphere, a call takes 10 to 30 ms, and a small dab about 4 ms.

## `remeshMesh(input, opts?)`

Rebuilds any shape as one new mesh with small, even faces, like Blender's Voxel Remesh, so it can be sculpted everywhere: a box, a low-poly part, or **several overlapping parts**, which melt into one solid with no walls left inside.

<Demo src="remesh" hint="a creature made of overlapping parts · remeshed into one surface · then sculpted: softer joins, cheeks, a snout — drag to orbit" />

<<< @/demos/remesh.js

```js
const clay = remeshMesh(makeShape("box"), { resolution: 48 });       // a sculptable box
const body = remeshMesh([torso, head, ...legs], { size: 0.01 });     // parts → one surface, faces ~1 cm
sculptMesh(body, "smooth", { center: neck, radius: 0.05, strength: 1, iterations: 8 }); // soften a join
```

`input` is a mesh, a scene object, or a list of them. Objects are placed by their own `pos`, `rot` and `scale` (like [`mergeMeshes`](../shapes#mesh-helpers)), so a group's children come out where they are in the group.

| Option | Default | Meaning |
| --- | --- | --- |
| `resolution` | `64` | Cells along the shape's longest side (at most 256): more cells, smaller faces |
| `size` | | Or the size of a cell, in units (replaces `resolution`) |
| `method` | `"nets"` | `"nets"`: even faces. `"cubes"`: marching cubes |
| `normals` | `true` | Smooth normals taken from the surface |
| `uvs` | `"box"` | Texture coordinates to make: a [mapping](../textures#texture-mapping), or `false` |

What to expect:

- **The shape is kept, its details down to a cell.** Flat sides stay flat and sizes stay the same; sharp edges and corners are softened a little (by less than a cell). A cube at the default resolution has the same volume to four decimals.
- **Each closed piece counts as solid**, and pieces turned inside out are fixed first. An open piece (a sheet, a cup without a bottom) becomes a thin shell two cells thick.
- **Texture coordinates are made again**, and materials per face aren't kept: the result is one surface.
- **Speed.** About half a second at the default resolution for one part, a second for eight overlapping parts, and about 4 seconds at `resolution: 128`. Remesh once, then sculpt as much as you like.
- Where two parts only just touch (closer than a cell), the surface can pinch into an edge shared by four faces. Nudge them together, or raise the resolution.
