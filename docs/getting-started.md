# Introduction

**Trid** is a small 3D renderer for the HTML `<canvas>`. No dependencies, no build step.

## What it does

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Shapes** — cubes, boxes and spheres out of the box, or any mesh you define as vertices and edges.
- **Filled faces** — fill and shade any mesh with a material (flat or smooth), or keep it as a wireframe.
- **Textures** — images, canvases or videos on any mesh, wrapped by its own texture coordinates or by planar, box, sphere and cylinder mapping, with a material per face if you like.
- **Effects** — toon, rim glow, gradients, fog, or your own shaders, stacked on a material.
- **Two renderers** — the canvas 2D context by default, or WebGL for exact depth and big models.
- **OBJ files** — load models from a URL or let users drop their own `.obj` files.
- **Camera** — position, yaw, pitch, field of view, with near-plane clipping so nothing behind the camera is drawn.
- **Tools** — ready-made orbit and fly cameras, object dragging, hover highlighting and an FPS meter. Writing your own is a plain object with a few methods.
- **Pure math** — every transform and projection function is exported, so you can use the pipeline piece by piece.

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
  { "imports": { "trid3d": "https://cdn.jsdelivr.net/npm/trid3d@0.1/trid/index.js" } }
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
import { Scene, makeShape } from "trid3d"; // or "./trid/index.js"

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
- Picking (used by dragging and hover) tests each object's *screen-space bounding box*, so clicking near a sphere's corner still picks it.

## Where to go next

- [Core concepts](./concepts) — coordinates, meshes, objects and the camera
- [Scene](./scene) — everything the `Scene` class can do
- [Tools](./tools) — mouse and keyboard controls in one line
- [API reference](./api) — every exported function and class
