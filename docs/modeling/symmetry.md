# Mirror & array

Model one side and get the whole, or one piece and get the row: Blender's Mirror and Array modifiers, as functions. They work on meshes (joined into one new mesh) and on scene objects (separate copies that share the mesh and material). Nothing here changes its input.

```js
import {
  mirrorMesh, symmetrizeMesh, bisectMesh, arrayMesh, radialArrayMesh,
  mirrorObject, arrayObject, radialArrayObject,
} from "./trid/index.js";
```

<Demo src="symmetry" hint="half a heart mirrored · a lumpy rock symmetrized · a spiral staircase · 7 petals around an axis — drag to orbit" />

<<< @/demos/symmetry.js

## Planes

Mirroring and cutting happen across a plane:

| Option | Default | Meaning |
| --- | --- | --- |
| `axis` | `"x"` | The plane where that coordinate stays the same: `"x"` mirrors left and right, `"y"` up and down, `"z"` front and back |
| `normal` | none | Any plane instead, by the direction it faces (replaces `axis`) |
| `center` | the origin | A point the plane goes through. For meshes, the mesh's own origin; for objects, the parent's origin. `{ x: 0.2 }` is enough for an `"x"` plane |

The `"+"` side of a plane is the side its normal points to: `x > 0` for `axis: "x"`.

## `mirrorMesh(mesh, opts?)`

Mirrors a mesh and keeps both halves. Build the right half of a chair, a face or a car, and mirror it to get the whole.

| Option | Default | Meaning |
| --- | --- | --- |
| `axis`, `normal`, `center` | `"x"` through the origin | The [plane](#planes). `axis` can be a list: `["x", "z"]` mirrors across both, 4 copies |
| `weld` | `true` | Points on the plane are shared by both halves, so the seam is closed and smooth, and faces lying on the plane (now inside) are removed. `true` uses a hundred-thousandth of the mesh's size as "on the plane"; a number sets that distance; `false` keeps two separate copies |
| `bisect` | `false` | First cut away what's past the plane, so the result is exactly symmetric (see [`symmetrizeMesh`](#symmetrizemesh-mesh-opts)) |
| `keep` | `"+"` | The side `bisect` keeps |

```js
const legs = mirrorMesh(leftLegs, { axis: ["x", "z"] }); // one leg → four
const body = mirrorMesh(halfBody);                         // welded at x = 0
```

The mirrored half has the same texture coordinates (so the texture is mirrored too) and the same materials. Its faces are turned around, so they still face outward.

::: tip Put the seam on the plane
For a closed result, the half should end exactly on the plane: an open edge at `x = 0`, or a flat side there (it's removed). Points a hair away are moved onto it. A half that crosses the plane comes out overlapping its mirror image. Use `bisect: true` to cut that part off first.
:::

## `symmetrizeMesh(mesh, opts?)`

Makes a mesh exactly symmetric: cuts it along the plane, then copies the kept side over the other, welded at the seam. It's the same as `mirrorMesh(mesh, { ...opts, bisect: true })`, and it's Blender's Symmetrize. Good after noise or a deformer made a shape lopsided:

```js
const head = symmetrizeMesh(lumpyHead, { axis: "x", keep: "+" }); // the right side wins
```

## `bisectMesh(mesh, opts?)`

Cuts a mesh along a [plane](#planes) and keeps one side (`keep`: `"+"` by default, or `"-"`). Faces crossing the plane are cut, with their texture coordinates and normals carried over. The cut is left open:

```js
const dome = bisectMesh(makeShape("sphere"), { axis: "y" });                  // the top half
const cup  = bisectMesh(makeShape("sphere"), { axis: "y", center: { y: 0.1 }, keep: "-" });
```

Faces are cut as flat, convex polygons, like the ones the renderers draw. Edges are cut too, and an edge loop that gets cut comes out as separate segments. `distance` sets how close to the plane a point is moved onto it (default: a hundred-thousandth of the mesh's size).

## `arrayMesh(mesh, opts?)`

Repeats a mesh, each copy a step further than the one before, and joins the copies into one mesh. A step is any mix of:

| Option | Default | Meaning |
| --- | --- | --- |
| `count` | `2` | Number of copies, the first where the mesh is |
| `relative` | `{ x: 1 }` when no step is given | A move in sizes of the mesh: `{ x: 1 }` puts the copies side by side, touching; `{ x: 1.2 }` leaves a gap of a fifth |
| `offset` | none | A move in units |
| `rotate` | none | A turn per copy, in radians, like an object's `rot`, around `center` |
| `scale` | none | A size factor per copy (`0.9` = each a bit smaller), around `center` |
| `center` | the origin | The point `rotate` and `scale` work around |
| `weld` | `false` | Copies that touch share their points and the faces between them are removed, so touching copies become one solid. `true` or a distance |

```js
const fence = arrayMesh(plank, { count: 8, relative: { x: 1.3 } });
const stairs = arrayMesh(step, { count: 16, offset: { y: 0.2 }, rotate: { y: Math.PI / 8 } }); // a spiral
const shell = arrayMesh(chamber, { count: 20, rotate: { y: 0.5 }, scale: 0.9 });               // smaller and smaller
const beam = arrayMesh(block, { count: 5, weld: true });                                       // one long box
```

## `radialArrayMesh(mesh, opts?)`

Copies of a mesh around an axis: wheel spokes, petals, gear teeth, columns around a temple. Place the first copy off the axis (on `+x` for a `"y"` axis), and the others follow around.

| Option | Default | Meaning |
| --- | --- | --- |
| `count` | `6` | Number of copies |
| `axis` | `"y"` | Axis they turn around, in the same direction as `rot` |
| `angle` | `2π` | A full turn spreads them evenly; a smaller angle goes from the first copy to the last (`Math.PI` with 3 copies: at 0°, 90° and 180°) |
| `center` | the origin | A point the axis goes through |
| `weld` | `false` | As in `arrayMesh` |

```js
const wheel = radialArrayMesh(spoke, { count: 12, axis: "z" });
```

## Objects: `mirrorObject`, `arrayObject`, `radialArrayObject`

The same for scene objects. The copies are separate objects that **share** the original's mesh and material, so nothing is duplicated, and each one can still be moved, hidden or picked on its own. They aren't added to the scene: add them where you want them.

```js
// The right arm from the left one
robot.children.push(mirrorObject(leftArm, { axis: "x" }));

// A row of 5 columns, 2 apart; four legs around a round table
scene.add({ children: arrayObject(column, { count: 5, offset: { x: 2 } }) });
table.children.push(...radialArrayObject(leg, { count: 4 }));
```

- `mirrorObject(obj, opts?)` takes a [plane](#planes) in the object's parent's space. The copy is mirrored with a negative scale on its local axis that points most along the plane's normal (an unturned object mirrored in `"x"` gets `scale.x = -1`), and it draws exactly the mirror image, light and shadows included.
- `arrayObject(obj, opts?)` and `radialArrayObject(obj, opts?)` return a list of `count` objects, the first where the original is. Add them instead of the original, or skip the first. `relative` is in sizes of the object as it stands (with its scale and turn), and `scale` is a single factor.

Children come along as copies, with their own transforms; their meshes are shared too.
