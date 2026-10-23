# Tools

Tools add interaction and overlays to a scene: camera controls, dragging, hover effects, an FPS counter. Add one with `scene.use(tool)`.

```js
import {
  OrbitCamera, FlyCamera, DragObject, HoverHighlight, FpsMeter,
} from "./trid/tools/index.js";

scene.use(new OrbitCamera());    // camera tools first
scene.use(new DragObject());     // object tools after, so they get clicks first
scene.use(new HoverHighlight());
scene.use(new FpsMeter());
```

## How tools share the mouse

The scene owns the canvas's mouse, touch and scroll listeners and passes events on to its tools. Tools are stacked like layers:

- **The last tool added gets the first chance** at a click or a scroll.
- The first tool that accepts a click gets the **whole drag**, until the button is released.
- While nothing is being dragged, every tool sees pointer moves (for hover effects).

That's why the order above works: clicking an object starts a `DragObject` drag, and clicking empty space falls through to `OrbitCamera`.

::: tip
Use **one camera tool at a time**. Two tools moving the same camera will fight over it.
:::

## OrbitCamera

Turns the camera around a target point. It starts from wherever the camera currently is.

| Input | Action |
| --- | --- |
| Left drag | Orbit around the target |
| Right drag, middle drag, or <kbd>Shift</kbd> + left drag | Pan (moves the target with the cursor) |
| Scroll | Zoom in and out |

| Option | Default | Meaning |
| --- | --- | --- |
| `target` | `{ x: 0, y: 0, z: 0 }` | Point to orbit around |
| `distance` | camera's distance to target | Starting distance |
| `yaw`, `pitch` | camera's yaw / pitch | Starting angles |
| `rotateSpeed` | `0.005` | Radians per dragged pixel |
| `zoomSpeed` | `0.001` | Zoom amount per scroll unit |
| `minDistance` | `0.1` | Closest zoom |
| `maxDistance` | `100` | Farthest zoom |
| `rotate`, `pan`, `zoom` | `true` | Turn each control off with `false` |
| `autoRotate` | `false` | Turn around the target on its own (paused while dragging) |
| `autoRotateSpeed` | `0.5` | Radians per second; negative turns the other way |
| `autoRotateDelay` | `0` | Seconds to wait after a drag before turning again |

`target`, `distance`, `yaw`, `pitch` and the `autoRotate` options are public properties you can change at any time. Pitch is kept just under ±90° so the view never flips.

::: warning
OrbitCamera places the camera **every frame**. To move the view in code, change the tool's properties (e.g. `orbit.yaw += dt`), not `scene.camera` — direct camera changes are overwritten.
:::

<Demo src="orbit" hint="Drag to orbit · right drag to pan · scroll to zoom · it auto-rotates" />

<<< @/demos/orbit.js

## FlyCamera

A free-flying camera driven by the keyboard and mouse.

| Input | Action |
| --- | --- |
| <kbd>W</kbd> / <kbd>S</kbd> | Forward / back |
| <kbd>A</kbd> / <kbd>D</kbd> | Left / right |
| <kbd>E</kbd> / <kbd>Q</kbd> | Up / down |
| Arrow keys | Turn |
| Left drag | Look around |
| Hold <kbd>Shift</kbd> | Move faster |

Keys use physical positions (`KeyboardEvent.code`), so on an AZERTY keyboard the same keys are <kbd>Z</kbd> <kbd>Q</kbd> <kbd>S</kbd> <kbd>D</kbd>. Keys are ignored while typing in an input.

| Option | Default | Meaning |
| --- | --- | --- |
| `speed` | `1` | Units per second |
| `fastMultiplier` | `3` | Speed multiplier while <kbd>Shift</kbd> is held |
| `turnSpeed` | `1.5` | Radians per second with the arrow keys |
| `lookSpeed` | `0.005` | Radians per dragged pixel |

::: tip
FlyCamera listens to the keyboard on the **whole window** and stops the arrow keys from scrolling the page. On a page with other content, add it only while the canvas is in use — the demo below does exactly that.
:::

<Demo src="fly" hint="Click the canvas, then W A S D / Q E / arrows · click outside to release" />

<<< @/demos/fly.js

## DragObject

Click an object to pick it, then drag to move it. The object follows the cursor exactly, parallel to the screen. Hold <kbd>Shift</kbd> while dragging to push it away (drag up) or pull it closer (drag down).

| Option | Default | Meaning |
| --- | --- | --- |
| `button` | `0` | Mouse button that drags (0 left, 1 middle, 2 right) |
| `filter` | objects without `draggable: false` | `(obj) => boolean`: which objects can be dragged |
| `exact` | `false` | Pick by triangles instead of bounding boxes (see [`pickHit`](./api#pickhit)) |
| `onPick` | — | `(obj) => void`: called when an object is picked |
| `onMove` | — | `(obj) => void`: called each time it moves |
| `onDrop` | — | `(obj) => void`: called when it's released |

`tool.dragging` is the object being dragged, or `null`. Objects are found with [`pick`](./api#pick): by screen-space bounding box, or by their triangles with `exact: true`.

## HoverHighlight

Recolors the object under the pointer, and puts its own color back when the pointer leaves it, leaves the canvas, or the tool is removed. Filled objects get their fill recolored too; their `material` is swapped for a copy, so objects sharing it don't change.

| Option | Default | Meaning |
| --- | --- | --- |
| `color` | `"#ffffff"` | Highlight color |
| `filter` | objects without `hoverable: false` | `(obj) => boolean`: which objects can be highlighted |
| `exact` | `false` | Pick by triangles instead of bounding boxes (see [`pickHit`](./api#pickhit)) |
| `onChange` | — | `(obj) => void`: called when the hovered object changes (`obj` is `null` when nothing is hovered) |

`tool.hovered` is the object under the pointer, or `null`.

## FpsMeter

Draws the frames per second in a corner of the canvas. The value is averaged and refreshed every `interval` seconds so it stays readable.

| Option | Default | Meaning |
| --- | --- | --- |
| `color` | `"#ffffff"` | Text color |
| `font` | `"14px monospace"` | CSS font |
| `corner` | `"top-left"` | `"top-left"`, `"top-right"`, `"bottom-left"` or `"bottom-right"` |
| `interval` | `0.5` | Seconds between refreshes |

`tool.fps` holds the last reading. It only counts while the scene is running.

## ObjUploader

Loads `.obj` files dropped on the canvas, or picked with `tool.open()`. See [Loading OBJ files](./obj#objuploader).

## ViewGizmo

The X, Y and Z axes in a corner of the canvas, turning with the camera, like Blender's navigation gizmo. Axes pointing away from you are dimmed; the dots without a letter are the negative ends. **Click an axis** and the `OrbitCamera` turns smoothly to look along it.

```js
scene.use(new OrbitCamera());
const gizmo = scene.use(new ViewGizmo({ corner: "top-right" })); // after the camera
gizmo.lookAlong({ x: 0, y: 1, z: 0 }); // look down from above, from code
```

| Option | Default | Meaning |
| --- | --- | --- |
| `orbit` | the scene's first `OrbitCamera` | Camera controls to turn. Without one, the gizmo only shows the axes |
| `corner` | `"top-right"` | `"top-right"`, `"top-left"`, `"bottom-right"` or `"bottom-left"` |
| `size` | `42` | Radius in CSS pixels |
| `margin` | `14` | Distance from the corner in CSS pixels: a number, or `{ x, y }` |
| `duration` | `0.35` | Seconds the camera takes to turn |

Set `gizmo.visible = false` to hide it without removing it. `gizmo.contains(x, y)` tells whether a canvas pixel is on it. While it turns the camera, auto-rotate waits (see `autoRotateDelay`).

## TransformGizmo

Handles to move, rotate and scale objects with the mouse. It works on one or more `targets` at once, around their shared center (the middle of their bounding box).

<Demo src="gizmo" hint="Click a shape to select it · drag a handle · 1 move, 2 rotate, 3 scale · click the corner axes to turn the view" />

<<< @/demos/gizmo.js

| Mode | Handles | Drag |
| --- | --- | --- |
| `"move"` | X, Y, Z arrows | Moves along that world axis |
| `"rotate"` | X, Y, Z rings | Turns around that axis. The ring follows the mouse from any angle; where rings cross, the one facing you wins |
| `"scale"` | X, Y, Z handles with square ends, and a center square | Stretches along that axis; the center square scales evenly (×2 per 100 px dragged right, smaller to the left) |

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `"move"` | `"move"`, `"rotate"` or `"scale"`; change `gizmo.mode` at any time |
| `targets` | `[]` | Objects it edits; change `gizmo.targets` at any time. No targets: no handles |
| `size` | `70` | Handle length in CSS pixels (the same on screen at any distance) |
| `apply` | `true` | Change the targets' `pos`, `rot` and `scale` while dragging |
| `onGrab` | — | `(targets) => void`: a handle was grabbed |
| `onChange` | — | `(op, targets) => void`: while dragging, the operation since the grab |
| `onDrop` | — | `(op, targets) => void`: on release, the whole operation |

`gizmo.dragging` is `true` while a handle is held, and `gizmo.visible = false` hides it. Clicks that miss the handles fall through to the tools below (the camera), so add the gizmo **after** the camera tool.

### Applying the changes yourself

Stretching a rotated object along a world axis can't be stored as `scale` (that would shear it), so the gizmo stretches the object's own axis that points most along it. A rotation turns both the position (around the center) and `rot`.

With `apply: false`, the gizmo changes nothing and only reports operations, so an app can apply them to its own data (an undo stack, a model made of parts, a server). Each operation is relative to the grab, so apply it to the transform you saved in `onGrab`:

```js
let saved = [];
const gizmo = scene.use(new TransformGizmo({
  apply: false,
  onGrab: (targets) => (saved = targets.map((t) => ({ pos: { ...t.pos }, rot: { ...t.rot }, scale: { ...t.scale } }))),
  onChange: (op, targets) => targets.forEach((t, i) => Object.assign(t, applyTransformOp(saved[i], op))),
  onDrop: (op) => history.push(op),
}));
```

An operation is one of:

```js
{ mode: "move",   delta }                // a world-space vector
{ mode: "rotate", axis, angle, center }  // right-handed, radians, around the unit axis
{ mode: "scale",  axis, factor, center } // axis null: uniform
```

## All together

<Demo src="tools" hint="Hover a shape · drag it · Shift + drag to push / pull · drag empty space to orbit" />

<<< @/demos/tools.js
