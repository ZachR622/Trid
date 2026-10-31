# Placing objects

Put things where they belong without guessing numbers: drop an object until it touches what's under it, stick it onto a surface facing out, line objects up, space them out. Like snapping and aligning in Blender.

```js
import { dropOnto, attachTo, alignObjects, distributeObjects } from "./trid/index.js";
```

<Demo src="placement" hint="a table dropped onto the floor · books spaced side by side, then dropped on it · a box on top of a ball · crates stacked · frames attached to the wall — drag to orbit" />

<<< @/demos/placement.js

These functions **move the object** (its `pos`, and its `rot` for `attachTo`); meshes are never changed. They work in world space, through [groups](../groups): an object inside a group is moved in its parent's space so it ends up where asked. Objects inside groups need their `parent` link, which `scene.add` sets (or call [`worldObjects`](../groups#where-things-are-parent-and-world) on the group).

**Targets** are a `Scene`, an object, or a list of objects. Every visible object with faces under them counts, except the object being placed and its own children, so `dropOnto(cup, scene)` works.

## `dropOnto(obj, targets, opts?)`

Moves an object along a direction (down by default) until its surface touches a target's: a cup onto a table, a rock onto terrain, a crate pushed against a wall.

```js
dropOnto(cup, table);                                          // rests on the table
dropOnto(rock, [ground, ...rocks]);                            // on the ground, or on the rocks already there
dropOnto(crate, scene, { direction: { x: 1, y: 0, z: 0 } });  // pushed right until it meets something
```

| Option | Default | Meaning |
| --- | --- | --- |
| `direction` | `{ x: 0, y: -1, z: 0 }` | Which way it moves, any length |
| `gap` | `0` | Stop this far before touching |
| `maxDistance` | `Infinity` | Don't move further than this |

The contact is **exact** for flat-faced meshes: corners against faces both ways, and edges against edges, so two crossed beams meet ridge on ridge and a box rests on the very top of a sphere. Nothing floats and nothing sinks.

If the object is **already sunk** into a target, it's lifted back out (against `direction`) and set on top: the usual fix for a part placed a bit too low. It returns `{ distance, point, object }`: how far it moved along the direction (negative when lifted), where it touches, and what. When nothing is in the way, it returns `null` and the object doesn't move.

::: tip Big meshes
Each call prepares the meshes involved for fast questions (see [`meshQuery`](./queries#meshquery-mesh)). With a few thousand faces that's well under a millisecond; an 8,000-face rock onto a 22,000-face terrain takes about a quarter of a second. Pass only the targets that matter, not the whole scene, when the scene is big.
:::

## `attachTo(obj, targets, opts?)`

Puts an object on the nearest surface of the targets, turned to follow it: horns on a head, a handle on a mug, a window on a wall, spikes on a ball. Place it roughly first, or pass `at`, and it snaps onto the surface there.

```js
attachTo(horn, head, { offset: -0.02 });                             // grows out of the head
attachTo(eye, head, { at: { x: 0.1, y: 0.2, z: 0.5 }, axis: "z" });  // its z faces out of the face
attachTo(painting, wall, { axis: "-z" });                            // its back against the wall
```

| Option | Default | Meaning |
| --- | --- | --- |
| `at` | its position | Find the surface point nearest to this world point |
| `axis` | `"y"` | The object's axis that points out of the surface: `"x"`, `"y"`, `"z"`, or `"-x"`, `"-y"`, `"-z"` |
| `align` | `true` | Turn the object so `axis` follows the surface's normal (the shortest turn from how it was). `false` keeps its turn |
| `anchor` | `"base"` | The point of the object put on the surface: `"base"` is the middle of its box's side opposite `axis` (the bottom, for `"y"`); `"origin"` its origin; or a point in its own space |
| `offset` | `0` | Distance out along the normal. Negative sinks it in, so a horn grows out of the head instead of sitting on it |

It returns `{ point, normal, object, distance }`: the surface point, its normal (pointing out), the object it's on, and how far the surface was from `at`. `null` when there's no surface.

## `alignObjects(objects, opts?)`

Lines objects up by their boxes, like Blender's Align.

```js
alignObjects(legs, { axis: "y", to: "min" });                                       // all on the same floor
alignObjects([lamp, vase], { axis: ["x", "z"], to: "center", reference: table });   // centered over the table
alignObjects([shelf], { axis: "y", to: "max", reference: 1.8 });                    // its top at 1.8
```

| Option | Default | Meaning |
| --- | --- | --- |
| `axis` | `"y"` | Axis, or a list of them |
| `to` | `"min"` | Which side lines up: `"min"` (the low sides: bottoms for `"y"`), `"center"` or `"max"` |
| `reference` | the box around all of them | Line up with a world coordinate (a number), or with an object's box |

## `distributeObjects(objects, opts?)`

Spreads objects out along an axis by their boxes, in the order they're already in along it.

```js
distributeObjects(posts, { axis: "z" });           // the end posts stay, equal spaces between
distributeObjects(books, { axis: "x", gap: 0 });   // side by side, touching
```

Without `gap`, the first and last objects stay and the ones between move so every space between neighbors is the same. With `gap`, the first stays and each next one starts `gap` after the one before it ends.
