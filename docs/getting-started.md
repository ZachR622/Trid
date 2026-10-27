# Introduction

**Trid** is a small 3D library for the HTML `<canvas>`: build shapes in code, light them, and draw them with Canvas 2D or WebGL. No dependencies, no build step.

## What it does

- **Scene and groups** — a scene holds a canvas, a camera, lights and your objects, and runs the frame loop. Objects can hold children that move, turn and scale with them.
- **Shapes** — cubes, rounded boxes, spheres, cylinders, cones, tori and planes, shapes turned around an axis (`lathe`) or pushed out of an outline (`extrude`), or any mesh you write as vertices and faces.
- **Modeling** — smooth curves, sweeps along a path, lofts through cross-sections, blobs that melt together, subdivision, bevels, taper / twist / bend / bulge, and cleanup tools for broken meshes.
- **Materials and lights** — fill colors, flat or smooth shading, ambient, directional and point lights in any color.
- **Textures** — images, canvases or videos, or textures made in code (marble, wood, bricks…), wrapped by the mesh's own coordinates or by planar, box, sphere and cylinder mapping, with a material per face if you like.
- **Effects** — toon, rim glow, gradients, fog or your own shaders on a material, and bloom, vignette, color grading and grain on the whole picture.
- **Two renderers** — the canvas 2D context by default, or WebGL for exact depth, per-pixel lighting and big models.
- **Picking and rays** — the exact triangle under the mouse, rays cast through a scene, inside tests and distances.
- **Tools** — orbit and fly cameras, move / rotate / scale gizmos, a view cube, dragging, hover highlight and an FPS meter. Writing your own is a plain object with a few methods.
- **Files** — load `.obj` / `.mtl` models, export OBJ for Blender and other 3D programs, take screenshots and record videos.
- **Noise** — seeded random numbers and smooth noise for rocks, terrain and anything that shouldn't look made by hand.
- **Pure math** — every transform, projection and matrix function is exported, so you can use the pipeline piece by piece.

## Install

Pick one of three ways. They all give you the same library.

### With npm

For projects with a bundler (Vite, webpack, Parcel...):

```sh
npm install trid3d
```

```js
import { Scene, makeShape } from "trid3d";
```

### From a CDN, no install

For a plain HTML page, load Trid from [jsDelivr](https://www.jsdelivr.com/) with an import map:

```html
<script type="importmap">
  { "imports": { "trid3d": "https://cdn.jsdelivr.net/npm/trid3d@0.5/trid/index.js" } }
</script>
<script type="module">
  import { Scene, makeShape } from "trid3d";
</script>
```

### Copy the folder

Trid is a folder of plain ES modules with no dependencies. Copy the `trid/` folder next to your page and import its entry file:

```js
import { Scene, makeShape } from "./trid/index.js";
```

::: tip One file or many
`trid/index.js` (or `"trid3d"`) exports everything. Each module can also be imported on its own, like `"./trid/render/effects.js"` or `"trid3d/render/effects.js"`. The rest of these docs show the module each function lives in.
:::

## Quick start

Add a canvas and load your script as a module:

```html
<!DOCTYPE html>
<html lang="en">
<body>
  <canvas id="canvas"></canvas>
  <script type="module" src="main.js"></script>
</body>
</html>
```

Then create a scene, add a shape and start the loop in `main.js`:

```js
import { Scene, makeShape, OrbitCamera } from "trid3d"; // or "./trid/index.js"

const scene = new Scene(document.getElementById("canvas"), {
  width: 800, height: 300,
  camera: { z: -1.6, fov: 0.6 }, // a step back, with a narrower lens
});

// A cube with rounded edges, filled and smoothly shaded
const cube = scene.add({
  mesh: makeShape("cube", { radius: 0.08 }),
  material: { fill: "#E9806E", smooth: true },
});

scene.use(new OrbitCamera()); // drag to turn around it
scene.start((dt) => {
  cube.rot.x += dt * 0.5;
  cube.rot.y += dt * 0.35;
});
```

That gives you this:

<Demo src="quick" />

::: warning Use a local server
Without a bundler, browsers block ES module imports from `file://` pages. From your project folder run `python3 -m http.server` (or `npx serve`) and open `http://localhost:8000`.
:::

## About the live demos

Every demo in these docs runs the code shown under it, against the real `trid/` folder. Demo files are written as a function that receives the canvas and returns a cleanup function, so the docs can start and stop them:

```js
export default function (canvas) {
  const scene = new Scene(canvas, { /* ... */ });
  // ...
  return () => scene.destroy();
}
```

In your own page, use the body of that function with `const canvas = document.getElementById("canvas")`.

## Current limits

- With the default canvas renderer, filled faces are sorted far to near, so faces that cross each other can be drawn in the wrong order (`maxFaceSize` reduces this). The [WebGL renderer](./renderers) doesn't have this limit.
- No shadows yet: lights brighten and darken faces, but objects don't cast shadows on each other.
- `pick`, `DragObject` and `HoverHighlight` test each object's *screen-space bounding box* by default, which is fast but rough. Pass `exact: true` to test triangles (see [`pickHit`](./api#pickhit)).

## Where to go next

- [Core concepts](./concepts) — coordinates, meshes, objects and the camera
- [Scene](./scene) — everything the `Scene` class can do
- [Modeling](./modeling/) — building your own shapes in code
- [Lights](./lights) and [Effects](./effects) — making it look good
- [Tools](./tools) — mouse and keyboard controls in one line
- [Examples](./examples) — small complete programs, like a solar system
- [API reference](./api) — every exported function and class
