# js3Dsimple — Overview

A small **wireframe 3D renderer** that draws on an HTML `<canvas>` using the 2D context (no WebGL).

## 1. Current features

### Math (`simple3d/math/`)

**Transforms** (`transform.js`)

- `scale`, `translate`, `rotateX`, `rotateY` and `rotateZ`, plus `rotateXYZ`, which applies Euler rotations in X → Y → Z order.
- `localToWorld(v, inst)` runs the standard per-instance pipeline: scale, then rotate, then translate.
- `worldToCamera(p, camera)` moves the point relative to the camera's position, then undoes its yaw and pitch (camera space).
- `cameraToScreen(p, camera, w, h)` projects with the camera's field of view and the canvas aspect ratio, then maps to pixels.
- `worldToScreen(p, camera, w, h)` combines the two.
- `clipNear(a, b, near)` clips a camera-space segment against the near plane, so nothing behind the camera is drawn.
- `cameraForward(camera)`, `cameraRight(camera)` and `cameraUp(camera)` give the camera's directions in world space, as unit vectors.

**Camera**

A plain object where every field is optional (documented as the `Camera` typedef in `transform.js`):

| Field   | Default     | Meaning                                         |
| ------- | ----------- | ----------------------------------------------- |
| `x, y, z` | `0`       | Position in world space                         |
| `yaw`   | `0`         | Turn around Y in radians (> 0 turns right)      |
| `pitch` | `0`         | Tilt around X in radians (> 0 looks up)         |
| `fov`   | `Math.PI/2` | Vertical field of view in radians (90°)         |
| `near`  | `0.01`      | Near plane distance; closer geometry is clipped |

With yaw and pitch at 0, the camera looks down +Z. `DEFAULT_FOV` and `DEFAULT_NEAR` are exported.

**Projection** (`projection.js`)

- `project(p, fov, aspect)` is the perspective projection. X is divided by the aspect ratio, so shapes don't stretch on non-square canvases.
- `screen(p, w, h)` converts normalized coordinates (−1..1) to canvas pixels, with Y flipped.

### Rendering (`simple3d/render/`)

**Drawing** (`draw.js`)

- Primitives: `clear`, `point` and `line`.
- `drawWireframe` draws index-based edges. A 2-index edge `[a, b]` is a single segment; an edge with 3+ indices is a closed loop.
- `drawInstance(ctx, inst, camera, …)` is the main call: it takes a mesh with its position, rotation and scale and draws it, clipped against the camera's near plane.
- Both wireframe functions put all their lines into one path and stroke it once.

**Shapes** (`shapes.js`)

- `makeShape("cube" | "box" | "sphere", opts)` builds meshes:
  - `{ size }` for a cube, `{ w, h, d }` for a box, `{ r, rings, segments }` for a sphere.
  - The sphere is made of latitude and longitude lines, with a single vertex at each pole.
- `scaleMesh` scales a mesh's vertices in place.

**Frame loop** (`loop.js`)

- `loop(update, { maxDt })` calls `update(dt, time)` every frame with `requestAnimationFrame`. `dt` is the seconds since the last frame (0 on the first, capped at `maxDt`, default 0.1 s) and `time` is the seconds since the loop started.
- It returns a `stop()` function.

### Scene (`simple3d/scene.js`)

`Scene` holds a canvas, a camera and a list of objects, and runs the frame loop for you.

```js
const scene = new Scene(canvas, { width: 800, height: 800, background: "#141414" });
const box = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });
scene.start((dt) => { box.rot.y += dt; });
```

- `new Scene(canvas, opts)`. The options are `width`, `height`, `background`, a default `color` and `lineWidth`, and `camera` (default `{ z: -1 }`).
- `scene.add(obj)` fills in a missing `pos`, `rot` or `scale` with defaults and returns the object. Each object can set its own `color` and `lineWidth`.
- `scene.remove(obj)` takes an object out of the scene.
- `scene.use(tool)` adds a tool and returns it; `scene.unuse(tool)` removes it.
- `scene.render()` clears the canvas, draws every object once, then lets tools draw on top.
- `scene.start(update)` updates the tools, runs `update(dt, time, scene)`, then calls `render()` every frame. Calling it again replaces `update`.
- `scene.stop()` stops the loop, and `scene.running` says whether it's running.
- `scene.destroy()` stops the loop and removes every tool and its event listeners.
- `scene.camera` and `scene.objects` can be changed at any time.

### Tools (`simple3d/tools/`)

Tools plug into a `Scene` with `scene.use(tool)`. Everything can be imported from `simple3d/tools/index.js`.

```js
scene.use(new OrbitCamera());     // camera tools first
scene.use(new DragObject());      // object tools after, so they get clicks first
scene.use(new HoverHighlight());
scene.use(new FpsMeter());
```

**How tools work** (`manager.js`)

- The scene owns the canvas mouse, touch and scroll listeners and passes events to its tools. Positions are in canvas pixels, even when the canvas is resized with CSS.
- **Tools added later get the first chance** at a click or a scroll. The first tool that takes it gets the whole drag. That's why clicking an object drags it while clicking empty space orbits the camera.
- A tool is any object with some of these optional methods: `attach`, `detach`, `pointerDown` (return `true` to take the drag), `pointerMove`, `pointerUp`, `pointerLeave`, `wheel` (return `true` to use the scroll), `update(dt)` and `draw(ctx)`. Setting `blockContextMenu: true` disables the right-click menu. Writing your own tool is just an object or class with these methods.

**Camera tools**

- `OrbitCamera`: left drag orbits around a target point; right drag, middle drag or Shift + drag pans; scroll zooms. It starts from the current camera. Options include `target`, `rotateSpeed`, `zoomSpeed`, `minDistance`, `maxDistance`, and `rotate`/`pan`/`zoom` to turn parts off.
- `FlyCamera`: W/A/S/D move, E/Q go up/down, arrow keys turn, left drag looks around, and Shift moves faster. Keys use physical positions, so on AZERTY it's Z/Q/S/D. Keys are ignored while typing in an input.
- Use only one camera tool at a time.

**Object tools**

- `DragObject`: click an object to pick it, then drag to move it parallel to the screen. It follows the cursor exactly. Shift + drag pushes it away or pulls it closer. It has `onPick`, `onMove` and `onDrop` callbacks, and `draggable: false` on an object excludes it.
- `HoverHighlight`: recolors the object under the pointer and puts its color back afterwards. It has an `onChange` callback, and `hoverable: false` excludes an object.

**Overlay tools**

- `FpsMeter`: draws the frames per second in a corner (`corner`, `color`, `font`).

**Helpers** (`helpers.js`)

- `pick(scene, x, y)` returns the object under a canvas pixel, or `null`. It checks each object's screen-space bounding box, and the closest object wins.
- `screenBounds(scene, obj)` gives an object's bounding box on screen.
- `worldPerPixel(scene, depth)` gives how many world units one pixel covers at a distance from the camera.

### Demo (`main.js`)

A sphere and a box spinning, built with `Scene`. The demo uses `OrbitCamera`, `DragObject`, `HoverHighlight` and `FpsMeter`.

## 2. Is the code solid for a library?

The base is good. The files are cleanly separated into math and render, the JSDoc is thorough, the functions are pure and the instance model (`mesh` plus `pos`/`rot`/`scale`) is sensible. The known bugs and quality issues are fixed; what's left is mostly packaging.

### Remaining issues

- **Library basics are missing:** a single entry file (`index.js`), `package.json`, README and tests.
- **Picking is approximate:** `pick` uses screen-space bounding boxes, so clicking the empty corner of a sphere's box still picks it.

## 3. Ideas for future features

Roughly in order of value:

1. **Cleanup and packaging:** an `index.js` that re-exports the public API, `package.json`, and a README with examples.
2. **More tools:** rotate or scale a selected object with the mouse, click to select (with a selection outline), and keyboard shortcuts such as resetting the camera.
3. **More shapes:** cylinder, cone, torus, plane or grid, pyramid, and an axes helper.
4. **Filled faces:** add `faces` to meshes, sort them back to front (painter's algorithm), skip faces turned away from the camera (backface culling) and add simple flat shading. This turns it from a wireframe viewer into a small 3D engine.
5. **OBJ file loading** for real models.
6. **Depth fading:** lines that fade or get thinner with distance. (Per-object `color` and `lineWidth` already work through `Scene`.)
7. **Parent/child transforms**, such as a moon orbiting a planet.
8. **4×4 matrices** in place of chained function calls. They're faster and make the camera and hierarchy straightforward.
9. **Tests** (for example with Vitest) for the math functions, which are pure and easy to test.
