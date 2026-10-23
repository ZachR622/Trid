<p align="center">
  <img src="https://raw.githubusercontent.com/ZachR622/Trid/master/docs/public/logo.svg" width="96" alt="Trid logo">
</p>

<h1 align="center">Trid</h1>

<p align="center">A small 3D library for the HTML canvas. No dependencies, no build step.</p>

---

Trid gives you a scene, a camera, shapes, model loading and mouse/keyboard tools, all in plain ES modules you can drop next to your page.

> **Status:** early. Objects can be wireframes or filled, shaded and textured, with shader effects.

## Features

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Shapes** — cubes, boxes, spheres, cylinders, cones, tori and planes built in, `lathe` for round shapes and `extrude` for flat ones, or any mesh you define as vertices and edges.
- **Filled faces** — give an object a `material` to fill and shade its faces, flat or smooth, with one directional light.
- **Textures** — images, canvases or videos on faces, with texture coordinates from built-in shapes and OBJ files, or made from the shape (planar, box, sphere and cylinder mapping). Repeat, offset and rotate them, or give each face its own material.
- **Effects** — stack shader effects like toon, rim and edge glow, gradients and fog on a material, or write your own in GLSL.
- **Two renderers** — the canvas 2D context by default, or `WebGLRenderer` for exact depth and big models, with the same scene code.
- **OBJ files** — load models from a URL, or let users drop their own `.obj` files on the canvas.
- **Export** — `scene.screenshot()` and `scene.record()` save images and videos of the canvas; `exportOBJ` writes meshes, objects or whole scenes as OBJ files.
- **Camera** — position, yaw, pitch and field of view, with near-plane clipping.
- **Tools** — orbit and fly cameras, object dragging, hover highlight, an FPS meter and an OBJ uploader, one line each. Writing your own is a plain object with a few methods.
- **Pure math** — every transform and projection step is exported, so you can use the pipeline piece by piece.

## Install

```sh
npm install trid3d
```

No bundler? Use the CDN with an import map, or copy the `trid/` folder next to your page and import `./trid/index.js`:

```html
<script type="importmap">
  { "imports": { "trid3d": "https://cdn.jsdelivr.net/npm/trid3d@0.1/trid/index.js" } }
</script>
```

## Quick start

```html
<canvas id="canvas"></canvas>
<script type="module" src="main.js"></script>
```

```js
// main.js
import { Scene, makeShape, OrbitCamera } from "trid3d";

const scene = new Scene(document.getElementById("canvas"), { width: 800, height: 400 });
const cube = scene.add({ mesh: makeShape("cube"), color: "#E9806E" });              // wireframe
const ball = scene.add({ mesh: makeShape("sphere"), material: { fill: "#8ab4f8" } }); // filled and shaded
ball.pos.x = 0.8;

scene.use(new OrbitCamera()); // drag to orbit, scroll to zoom
scene.start((dt) => (cube.rot.y += dt));
```

Without a bundler, serve the folder (`python3 -m http.server`) instead of opening the file directly: browsers block module imports from `file://` pages.

### Loading a model

```js
import { loadOBJ } from "trid3d";

const mesh = await loadOBJ("models/teapot.obj", { fit: 1 }); // centered, 1 unit wide
scene.add({ mesh });
```

Or let users load their own: `scene.use(new ObjUploader())` accepts dropped `.obj` files, and `uploader.open()` shows a file dialog.

## Project layout

| Folder | Content |
| --- | --- |
| `trid/index.js` | Entry file: exports everything (`"trid3d"`) |
| `trid/scene.js` | The `Scene` class |
| `trid/math/` | Transforms, camera directions, projection |
| `trid/render/` | Renderers (Canvas 2D, WebGL), effects, shapes, drawing, frame loop |
| `trid/loaders/` | OBJ and texture loading |
| `trid/export/` | Screenshots, video recording and OBJ export |
| `trid/tools/` | Camera, object and overlay tools |
| `docs/` | Documentation site with live demos |

## Documentation

**[zachr622.github.io/Trid](https://zachr622.github.io/Trid/)**: every class, option and function, with live demos.

To run the docs locally (Node 18+):

```sh
npm install
npm run docs:dev
```

See [`docs/README.md`](https://github.com/ZachR622/Trid/blob/master/docs/README.md) for building and editing the docs.

## Roadmap

Roughly in order:

- **More import and export formats** — `.mtl` material files for OBJ (colors and textures per part, both ways), STL; basic glTF later
- **Parent/child transforms** — e.g. a moon orbiting a planet
- **More tools** — a gizmo to move, rotate and scale objects with the mouse, a selection outline, a grid/axes helper
- **Post effects** (WebGL) — bloom, vignette, outlines, antialiasing and color grading over the whole image
- **More tests** — `npm test` covers shapes and tools so far; the math functions are next
