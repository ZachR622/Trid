# Introduction

**Trid** is a small 3D renderer for the HTML `<canvas>`. No dependencies, no build step.

## What it does

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Shapes** — cubes, boxes and spheres out of the box, or any mesh you define as vertices and edges.
- **Filled faces** — fill and shade any mesh with a material (flat or smooth), or keep it as a wireframe.
- **Effects** — toon, rim glow, gradients, fog, or your own shaders, stacked on a material.
- **Two renderers** — the canvas 2D context by default, or WebGL for exact depth and big models.
- **OBJ files** — load models from a URL or let users drop their own `.obj` files.
- **Camera** — position, yaw, pitch, field of view, with near-plane clipping so nothing behind the camera is drawn.
- **Tools** — ready-made orbit and fly cameras, object dragging, hover highlighting and an FPS meter. Writing your own is a plain object with a few methods.
- **Pure math** — every transform and projection function is exported, so you can use the pipeline piece by piece.

## Quick start

For now, Trid is a folder of ES modules. Copy the `trid/` folder next to your page:

```
my-project/
├── index.html
├── main.js
└── trid/
    ├── scene.js
    ├── math/
    ├── render/
    ├── loaders/
    └── tools/
```

::: info npm package coming
An npm package is planned. Until then, copying the folder is the way to install Trid.
:::

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
import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";

const scene = new Scene(document.getElementById("canvas"), {
  width: 800, height: 300,
});

const cube = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });

scene.start((dt) => {
  cube.rot.x += dt;
  cube.rot.y += dt * 0.7;
});
```

That gives you this:

<Demo src="quick" />

::: warning Use a local server
Browsers block ES module imports from `file://` pages. From your project folder run `python3 -m http.server` (or `npx serve`) and open `http://localhost:8000`.
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

- With the default canvas renderer, filled faces are sorted far to near, so faces that cross each other can be drawn in the wrong order (`maxFaceSize` reduces this). The [WebGL renderer](./renderers) doesn't have this limit. Textures are planned.
- Picking (used by dragging and hover) tests each object's *screen-space bounding box*, so clicking near a sphere's corner still picks it.
- There is no single entry file or npm package yet: import from the individual modules.

## Where to go next

- [Core concepts](./concepts) — coordinates, meshes, objects and the camera
- [Scene](./scene) — everything the `Scene` class can do
- [Tools](./tools) — mouse and keyboard controls in one line
- [API reference](./api) — every exported function and class
