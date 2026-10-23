# Groups

Any object can hold other objects in `children`. Children are placed **relative to their parent**: move, turn or scale the parent and its whole subtree follows. A model made of parts (a sword: blade, guard, grip) moves as one, and a moon can orbit a planet that orbits a sun.

<Demo src="groups" hint="Drag a ring to turn the sword · click a part: first the sword, then a level deeper each click · drag to orbit" />

<<< @/demos/groups.js

## Making a group

Give an object `children`. Leave out `mesh` when it's only there to hold them:

```js
const sword = scene.add({
  pos: { x: 0, y: 1, z: 0 },
  children: [
    { mesh: blade, pos: { x: 0, y: 0.45, z: 0 } },
    { name: "hilt", children: [
      { mesh: guard },
      { mesh: grip, pos: { x: 0, y: -0.12, z: 0 } },
    ]},
  ],
});

sword.rot.y += dt;                // the whole sword turns
sword.children[1].rot.z = 0.3;    // only the hilt tilts, around the sword's center
```

- A child's `pos`, `rot` and `scale` are in its **parent's space**: `pos: { x: 0, y: 0.45, z: 0 }` is 0.45 above the sword's origin, wherever the sword is and however it's turned. Scaling a group scales its children's sizes *and* distances.
- Groups nest as deep as you like.
- Missing `pos`, `rot` and `scale` get defaults, down the whole tree.
- Each object keeps its own `material`, `color` and `lineWidth`; they aren't inherited.

## Changing the tree

`children` is a plain array, read every frame: `push`, `splice` and replace it freely.

```js
sword.children.push({ mesh: gem, pos: { x: 0, y: 0.1, z: 0.03 } });  // shows up next frame
scene.remove(gem);              // takes a child out of its group (or a top-level object out of the scene)
hilt.visible = false;           // hides the hilt and everything in it
```

An object should only be in one place at a time: one parent, or the scene's top level.

## Where things are: `parent` and `world`

Every object gets two fields, kept up to date by the scene each frame (and set right away by `scene.add`):

| Field | Meaning |
| --- | --- |
| `obj.parent` | The group it's in, or `null` at the top level |
| `obj.world` | Its world matrix: its parents' transforms times its own, from the last frame |

Both are hidden from `Object.keys`, `JSON.stringify` and `{ ...obj }`, so objects stay easy to save and copy. To work them out now (after changing a transform, between frames):

```js
worldPosition(grip)                       // → { x, y, z } of its origin in the world
transformPoint(worldMatrix(grip), point)  // → a point of its mesh, in the world
ancestors(grip)                           // → [grip, hilt, sword]
worldObjects(scene)                       // → every visible object, parents first, with world set
```

## Clicking and moving parts

- **Picking** finds the part that was hit, even deep in a group. [`pickHit`](./api#pickhit) also returns its `path`, the part then its groups up to the top (`[guard, hilt, sword]`), so you can choose what a click selects. The demo above selects the whole sword first, then one level deeper each click.
- **`DragObject`** moves the part that was clicked, inside its group: it follows the cursor however the group is turned or scaled. With `root: true` it drags the whole group instead.
- **`TransformGizmo`** takes groups and parts as `targets`. Handles work in world space and each target is changed in its parent's space. With `apply: false`, turn the reported operation into a target's space with `transformOpToLocal(op, worldMatrix(target.parent))`.

## Uneven scales

Groups use 4 × 4 matrices, so everything is exact, even a group scaled unevenly (`scale: { x: 2, y: 1, z: 1 }`) with turned children inside: the children come out stretched along the group's X, skewed if they're turned, just as you'd expect. (That's something a single `pos`, `rot` and `scale` can't describe, so a child's own transform can't be "flattened" to one in that case.)

## Exporting and merging

- [`exportOBJ`](./export#obj-files) writes every mesh in a group where it's drawn, one OBJ object per part (named after `name`).
- [`mergeMeshes([group])`](./shapes#mergemeshes-items-opts) bakes a whole group into one mesh, placed by the group's own transform.
- [`meshBounds(group)`](./shapes#meshbounds-input) measures a group with everything in it.

## Matrices

From `trid/math/matrix.js`, for working with world matrices yourself. A matrix is 16 numbers in column-major order (`m[col * 4 + row]`), the order WebGL uses.

```js
identityMat4()                   // → matrix that changes nothing
mat4FromTransform({ pos, rot, scale })
mulMat4(a, b)                    // → a · b (b first): world = mulMat4(parentWorld, local)
invertMat4(m)                    // → world → local
determinantMat4(m)               // → < 0 when it mirrors
transformPoint(m, p)             // → point (moved)
transformDirection(m, v)         // → direction or offset (not moved)
normalMatrix(m)                  // → 3 × 3 normal matrix, column-major
transformNormal(nm, n)           // → unit normal
transformOpToLocal(op, parentWorld)
```
