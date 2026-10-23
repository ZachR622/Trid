# Scene

`Scene` holds a canvas, a camera and a list of objects, and runs the frame loop for you. Most programs only need this class, `makeShape` and a tool or two.

```js
import { Scene } from "./trid/scene.js";
```

## Creating a scene

```js
new Scene(canvas, options?)
```

| Option | Default | Meaning |
| --- | --- | --- |
| `width` | canvas's current width | Sets `canvas.width` (drawing resolution in pixels) |
| `height` | canvas's current height | Sets `canvas.height` |
| `background` | `"#141414"` | Color the canvas is cleared with each frame |
| `color` | `"#ffffff"` | Default wireframe color |
| `lineWidth` | `3` | Default wireframe thickness |
| `camera` | `{ z: -1 }` | The [camera](./concepts#the-camera) object |
| `light` | `{ x: -0.5, y: 1, z: -0.8 }` | Direction light comes from, for [filled faces](./faces#light) |
| `ambient` | `0.25` | Brightness of faces turned away from the light (0..1) |
| `renderer` | a new `CanvasRenderer` | What draws the scene, for example a `WebGLRenderer`. See [Renderers](./renderers) |

The canvas can be resized with CSS (for example `width: 100%`). Drawing stays at `width` × `height`, and tools still get pointer positions in canvas pixels.

## Adding and removing objects

### `scene.add(obj)`

Adds an [object](./concepts#objects-mesh-instances), fills in a missing `pos`, `rot` or `scale`, and returns the **same object** so you can keep it and animate it.

```js
const ball = scene.add({
  mesh: makeShape("sphere"),
  pos: { x: 0, y: 0.5, z: 0 }, // rot and scale get defaults
  color: "tomato",
});
ball.rot.y = Math.PI / 4;
```

An object can hold other objects in `children`, placed relative to it: see [Groups](./groups). `add` fills in transforms down the whole tree.

### `scene.remove(obj)`

Takes an object out of the scene, or out of its group if it's a [child](./groups). Its own children go with it. Does nothing if it isn't there.

### `scene.objects`

The array of top-level objects, drawn in order (children right after their parent). You can read it or change it directly. To go through every object, children included, use [`worldObjects(scene)`](./groups#where-things-are-parent-and-world).

## Running the loop

### `scene.start(update?)`

Starts the frame loop. Each frame:

1. every tool's `update(dt)` runs,
2. your `update(dt, time, scene)` runs,
3. `scene.render()` redraws everything.

Calling `start` again restarts the loop with the new `update`. Returns the scene.

### `scene.stop()`

Stops the loop. The last frame stays on the canvas.

### `scene.running`

Read-only: `true` while the loop is running.

### `scene.render()`

Draws a single frame: the renderer clears the canvas and draws every object, then tools draw on top. Use it without `start` for static images, or to redraw only when something changes.

<Demo src="loop" hint="Click to pause / resume" />

<<< @/demos/loop.js

## Tools

### `scene.use(tool)`

Adds a [tool](./tools) and returns it. **Tools added later get the first chance at clicks and scrolls**, so add camera tools first and object tools after.

```js
const orbit = scene.use(new OrbitCamera());
scene.use(new DragObject());
```

### `scene.unuse(tool)`

Removes a tool and its event listeners. Does nothing if it isn't added.

### `scene.tools`

The scene's [`ToolManager`](./api#toolmanager). You don't usually need it directly.

## Exporting

### `scene.screenshot(options?)`

Draws a new frame and returns it as an image file (a promise for a `Blob`, PNG by default). The page's canvas doesn't change. See [Screenshots](./export#screenshots).

```js
download(scene.screenshot(), "scene.png");
```

### `scene.record(options?)`

Starts recording the canvas as a video. Returns a recording with `stop()` and `done`. See [Videos](./export#videos).

## Cleaning up

### `scene.destroy()`

Stops the loop, removes every tool along with its canvas and keyboard listeners, and frees the renderer (for example WebGL memory). Call it when the scene is no longer needed, for example before removing the canvas from the page.

## Other properties

These can all be changed at any time and take effect on the next frame:

| Property | Meaning |
| --- | --- |
| `camera` | The camera object (tools like `OrbitCamera` move it for you) |
| `background` | Clear color |
| `color` | Default wireframe color |
| `lineWidth` | Default wireframe thickness |
| `light`, `ambient` | Lighting for [filled faces](./faces#light) |
| `renderer` | What draws the scene |
| `canvas`, `ctx` | The canvas and its 2D context (read them, don't replace them) |
