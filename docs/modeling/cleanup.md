# Cleanup and checks

Meshes written by code (or loaded from files) can have vertices at the same place, faces pointing to vertices that don't exist, `NaN`s, faces of no area, or faces turned the wrong way. These four find and fix that. All but `validateMesh` change the mesh **in place** and return it.

```js
import { weldVertices, cleanMesh, validateMesh, fixWinding } from "./trid/index.js";
```

```js
const problems = validateMesh(mesh);        // what's wrong, without changing anything
cleanMesh(mesh, { weld: true });             // merge, then remove what's broken
fixWinding(mesh);                            // turn faces so they all point outward
```

## `validateMesh(mesh)`

Lists what's wrong, one entry per kind of problem: `{ kind, level, message, faces?, vertices?, edges? }`. An empty list means nothing was found. The message is a short sentence with the first few items, ready to show (or to hand back to whoever wrote the mesh):

```js
validateMesh(mesh);
// [{ kind: "bad-index", level: "error",
//    message: "2 faces pointing to vertices that don't exist (faces 4, 9)", faces: [4, 9] }]
```

| Level | Kinds | Meaning |
| --- | --- | --- |
| `"error"` | `no-vertices`, `bad-vertex`, `bad-index`, `bad-faceUVs`, `bad-faceNormals`, `bad-edge` | Breaks drawing or export: missing vertices, positions that aren't numbers, lists that don't fit their faces |
| `"warning"` | `few-corners`, `crossed-face`, `no-area`, `repeated-face`, `turned-face`, `inside-out`, `many-faces-edge`, `bad-material` | Draws wrong: holes in the shading, faces that flicker or disappear |
| `"info"` | `open-edge`, `unused-vertex`, `same-place` | Worth knowing: a sheet has open borders on purpose, a solid shouldn't |

## `weldVertices(mesh, epsilon?)`

Merges vertices closer than `epsilon` (default: a ten-millionth of the mesh's size), so faces that touch share their vertices. Smooth shading then has no seams, and tools that follow neighbors (like `fixWinding`) see one surface. Texture coordinates and normals belong to face corners, so they're kept as they are. Corners that end up on the same vertex are removed, and faces left with fewer than 3 corners are dropped. Edges follow.

## `cleanMesh(mesh, opts?)`

Removes what's broken:

- faces pointing to vertices that don't exist, or whose positions aren't numbers;
- corners repeated in a row, faces left with fewer than 3 corners, faces that go through a vertex twice, faces of no area, and faces repeating another;
- texture coordinate and normal lists that don't fit their face (set to `null` for that face);
- edges to missing vertices;
- vertices, texture coordinates and normals that nothing uses.

Texture coordinates, normals and materials stay with their faces. With `weld: true` (or a distance), vertices at the same place are merged first.

## `fixWinding(mesh)`

Turns faces around so that faces next to each other agree, then each separate piece points outward: clockwise from outside, like the built-in shapes. Pieces are found by vertex position, so it works on unwelded meshes too. Texture coordinates and normals turn with their faces.

For a closed piece, outward is certain. For an open piece (a cup, a sheet), it's a guess: away from its middle. A flat piece keeps the way most of its faces already point.
