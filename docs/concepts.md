# Core concepts

Five ideas cover the whole library: the coordinate system, meshes, objects, the camera and the frame loop.

## Coordinate system

Trid uses a **left-handed** system, as seen from the default camera:

- **+X** points right
- **+Y** points up
- **+Z** points forward, into the screen

Units are arbitrary. Angles are always in **radians** (`Math.PI` is half a turn).

<Demo src="axes" hint="X red · Y green · Z blue — drag to orbit" />

<<< @/demos/axes.js

## Meshes

A mesh is a plain object with two arrays:

- `vertices` — points in the mesh's own (local) space: `{ x, y, z }`
- `edges` — lines to draw, as arrays of *vertex indices*

An edge with **2 indices** is a single segment. An edge with **3 or more** is a closed loop: the last index connects back to the first.

```js
// A square in the XY plane, drawn as one closed loop
const square = {
  vertices: [
    { x: -0.5, y: -0.5, z: 0 },
    { x:  0.5, y: -0.5, z: 0 },
    { x:  0.5, y:  0.5, z: 0 },
    { x: -0.5, y:  0.5, z: 0 },
  ],
  edges: [[0, 1, 2, 3]], // same as [0,1], [1,2], [2,3], [3,0]
};
```

You rarely write meshes by hand: [`makeShape`](./shapes) builds cubes, boxes and spheres.

## Objects (mesh instances)

An **object** places a mesh in the world. It's a plain object too:

| Field | Default | Meaning |
| --- | --- | --- |
| `mesh` | required | The mesh to draw |
| `pos` | `{ x: 0, y: 0, z: 0 }` | Position in world space |
| `rot` | `{ x: 0, y: 0, z: 0 }` | Rotation around each axis, in radians |
| `scale` | `{ x: 1, y: 1, z: 1 }` | Scale along each axis |
| `color` | scene's color | Any CSS color |
| `lineWidth` | scene's lineWidth | Line thickness in pixels |
| `draggable` | `true` | Set `false` to ignore [`DragObject`](./tools#dragobject) |
| `hoverable` | `true` | Set `false` to ignore [`HoverHighlight`](./tools#hoverhighlight) |

`scene.add()` fills in missing `pos`, `rot` and `scale`. Many objects can share one mesh — drawing never modifies a mesh.

### Transform order

Each vertex goes from local space to world space in this order:

1. **Scale** by `scale`
2. **Rotate** around X, then Y, then Z by `rot`
3. **Translate** by `pos`

So an object always spins around its own center, wherever it sits.

## The camera

The camera is a plain object where every field is optional:

| Field | Default | Meaning |
| --- | --- | --- |
| `x, y, z` | `0` | Position in world space |
| `yaw` | `0` | Turn around Y in radians (> 0 turns right) |
| `pitch` | `0` | Tilt around X in radians (> 0 looks up) |
| `fov` | `Math.PI / 2` | Vertical field of view (90°) |
| `near` | `0.01` | Near plane: anything closer is clipped |

With yaw and pitch at 0, the camera looks down **+Z**. That's why `Scene`'s default camera is `{ z: -1 }`: one unit back from the origin, looking at it.

The camera has no roll. Lines that cross behind the camera are cut at the near plane, so you can fly through objects safely.

## How a frame is drawn

For every object, every vertex goes through:

1. **Local → world**: the object's scale, rotation and position (`localToWorld`)
2. **World → camera**: move relative to the camera, undo its yaw and pitch (`worldToCamera`)
3. **Near clipping**: each edge is clipped against `z = near` (`clipNear`)
4. **Camera → screen**: perspective projection with the camera's fov and the canvas aspect ratio, then conversion to pixels (`cameraToScreen`)

All edges of an object go into one canvas path and are stroked once. Each step is an exported function — see the [API reference](./api#math).

## The frame loop

`scene.start(update)` calls your `update(dt, time, scene)` every animation frame, then redraws:

- `dt` — seconds since the last frame. It's `0` on the first frame and capped at `0.1`, so switching tabs doesn't make objects jump.
- `time` — seconds since the loop started.

Multiply speeds by `dt` so motion is the same at 30 or 144 FPS:

```js
scene.start((dt, time) => {
  cube.rot.y += Math.PI * dt;        // half a turn per second
  cube.pos.y = Math.sin(time) * 0.3; // bob up and down
});
```
