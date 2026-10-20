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

`target`, `distance`, `yaw` and `pitch` are public properties you can change at any time. Pitch is kept just under ±90° so the view never flips.

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
| `onPick` | — | `(obj) => void`: called when an object is picked |
| `onMove` | — | `(obj) => void`: called each time it moves |
| `onDrop` | — | `(obj) => void`: called when it's released |

`tool.dragging` is the object being dragged, or `null`. Objects are found with [`pick`](./api#pick), which uses screen-space bounding boxes.

## HoverHighlight

Recolors the object under the pointer, and puts its own color back when the pointer leaves it, leaves the canvas, or the tool is removed.

| Option | Default | Meaning |
| --- | --- | --- |
| `color` | `"#ffffff"` | Highlight color |
| `filter` | objects without `hoverable: false` | `(obj) => boolean`: which objects can be highlighted |
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

## All together

<Demo src="tools" hint="Hover a shape · drag it · Shift + drag to push / pull · drag empty space to orbit" />

<<< @/demos/tools.js
