<p align="center">
  <img src="docs/public/logo.svg" width="96" alt="Trid logo">
</p>

<h1 align="center">Trid</h1>

<p align="center">A small 3D library for the HTML canvas. No dependencies, no build step.</p>

---

Trid gives you a scene, a camera, shapes, model loading and mouse/keyboard tools, all in plain ES modules you can drop next to your page.

> **Status:** early. Objects can be wireframes or filled and shaded; textures and shaders are on the way.

## Features

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Shapes** — cubes, boxes and spheres built in, or any mesh you define as vertices and edges.
- **Filled faces** — give an object a `material` to fill and shade its faces, flat or smooth, with one directional light.
- **Effects** — stack shader effects like toon, rim glow, gradients and fog on a material, or write your own in GLSL.
- **Two renderers** — the canvas 2D context by default, or `WebGLRenderer` for exact depth and big models, with the same scene code.
- **OBJ files** — load models from a URL, or let users drop their own `.obj` files on the canvas.
- **Camera** — position, yaw, pitch and field of view, with near-plane clipping.
- **Tools** — orbit and fly cameras, object dragging, hover highlight, an FPS meter and an OBJ uploader, one line each. Writing your own is a plain object with a few methods.
- **Pure math** — every transform and projection step is exported, so you can use the pipeline piece by piece.

## Quick start

For now, Trid is a folder of ES modules: copy the `trid/` folder next to your page. An npm package is planned, so you'll be able to install it with `npm install` later.

```
my-project/
├── index.html
├── main.js
└── trid/
```

```html
<canvas id="canvas"></canvas>
<script type="module" src="main.js"></script>
```

```js
// main.js
import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { OrbitCamera } from "./trid/tools/index.js";

const scene = new Scene(document.getElementById("canvas"), { width: 800, height: 400 });
const cube = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });              // wireframe
const ball = scene.add({ mesh: makeShape("sphere"), material: { fill: "#8ab4f8" } }); // filled and shaded
ball.pos.x = 0.8;

scene.use(new OrbitCamera()); // drag to orbit, scroll to zoom
scene.start((dt) => (cube.rot.y += dt));
```

Browsers block module imports from `file://` pages, so serve the folder: `python3 -m http.server`, then open `http://localhost:8000`.

### Loading a model

```js
import { loadOBJ } from "./trid/loaders/obj.js";

const mesh = await loadOBJ("models/teapot.obj", { fit: 1 }); // centered, 1 unit wide
scene.add({ mesh });
```

Or let users load their own: `scene.use(new ObjUploader())` accepts dropped `.obj` files, and `uploader.open()` shows a file dialog.

## Project layout

| Folder | Content |
| --- | --- |
| `trid/scene.js` | The `Scene` class |
| `trid/math/` | Transforms, camera directions, projection |
| `trid/render/` | Drawing, frame loop, built-in shapes |
| `trid/loaders/` | OBJ loading |
| `trid/tools/` | Camera, object and overlay tools |
| `docs/` | Documentation site with live demos |

## Documentation

The docs explain every class, option and function, with live demos. To run them locally (Node 18+):

```sh
npm install
npm run docs:dev
```

See [`docs/README.md`](docs/README.md) for building and editing the docs.

## Roadmap

- **Textures** — images on faces, with texture coordinates from OBJ files
- **More shapes** — cylinder, cone, torus, plane/grid
- **More tools** — rotate/scale objects with the mouse, selection outline
- **Parent/child transforms** — e.g. a moon orbiting a planet
- **Packaging** — a single entry file and an npm package
- **Tests** for the math functions
