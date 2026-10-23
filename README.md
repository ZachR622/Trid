<p align="center">
  <img src="https://raw.githubusercontent.com/ZachR622/Trid/master/docs/public/logo.svg" width="96" alt="Trid logo">
</p>

<h1 align="center">Trid</h1>

<p align="center">A small 3D library for the HTML canvas. No dependencies, no build step.</p>

---

Trid gives you a scene, a camera, shapes, model loading and mouse/keyboard tools, all in plain ES modules you can drop next to your page.

> **Status:** early (0.x): the API can still change between minor versions. See [Upgrading](#upgrading).

## Features

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Groups** — give any object `children` and they move, turn and scale with it (models made of parts, a moon orbiting a planet).
- **Shapes** — cubes, boxes, spheres, cylinders, cones, tori and planes built in, `lathe` for round shapes and `extrude` for flat ones, or any mesh you define as vertices and edges.
- **Mesh helpers** — clone, transform, displace, merge and measure meshes; seeded random numbers and smooth noise (`fbm2`, `fbm3`, tileable) for rocks, terrain and procedural textures.
- **Filled faces** — give an object a `material` to fill and shade its faces, flat or smooth, with one directional light.
- **Textures** — images, canvases or videos on faces, with texture coordinates from built-in shapes and OBJ files, or made from the shape (planar, box, sphere and cylinder mapping). Repeat, offset and rotate them, or give each face its own material. Or paint one in code: wood, marble, bricks and more, all seamless.
- **Effects** — stack shader effects like toon, rim and edge glow, gradients and fog on a material, or write your own in GLSL.
- **Two renderers** — the canvas 2D context by default, or `WebGLRenderer` for exact depth and big models, with the same scene code.
- **OBJ files** — load models from a URL (with their `.mtl` colors and textures), or let users drop their own `.obj` files on the canvas.
- **Export** — `scene.screenshot()` and `scene.record()` save images and videos of the canvas; `exportOBJ` / `exportModel` write meshes, objects or whole scenes as OBJ files with their MTL materials and textures.
- **Camera** — position, yaw, pitch and field of view, with near-plane clipping.
- **Tools** — orbit and fly cameras, object dragging, hover highlight, a move / rotate / scale gizmo, a view axes gizmo, an FPS meter and an OBJ uploader, one line each. Exact picking by triangles. Writing your own is a plain object with a few methods.
- **Pure math** — every transform and projection step is exported, plus 4×4 matrices and rotations, so you can use the pipeline piece by piece.

## Install

```sh
npm install trid3d
```

No bundler? Use the CDN with an import map, or copy the `trid/` folder next to your page and import `./trid/index.js`:

```html
<script type="importmap">
  { "imports": { "trid3d": "https://cdn.jsdelivr.net/npm/trid3d@0.3/trid/index.js" } }
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

const mesh = await loadOBJ("models/teapot.obj", { fit: 1, materials: true }); // centered, 1 unit wide
scene.add({ mesh, material: mesh.materials }); // colors and textures from its .mtl file
```

Or let users load their own: `scene.use(new ObjUploader())` accepts dropped `.obj` files, and `uploader.open()` shows a file dialog.

## Project layout

| Folder | Content |
| --- | --- |
| `trid/index.js` | Entry file: exports everything (`"trid3d"`) |
| `trid/scene.js` | The `Scene` class |
| `trid/sceneGraph.js` | Groups: `children`, world matrices |
| `trid/math/` | Transforms, camera directions, projection, matrices, rotations, random numbers and noise |
| `trid/render/` | Renderers (Canvas 2D, WebGL), effects, shapes, mesh helpers, procedural textures, drawing, frame loop |
| `trid/loaders/` | OBJ, MTL and texture loading |
| `trid/export/` | Screenshots, video recording, OBJ and MTL export |
| `trid/tools/` | Camera, object, gizmo and overlay tools |
| `docs/` | Documentation site with live demos |
| `test/` | Tests (`npm test`) |

## Documentation

**[zachr622.github.io/Trid](https://zachr622.github.io/Trid/)**: every class, option and function, with live demos.

To run the docs locally (Node 18+):

```sh
npm install
npm run docs:dev
```

See [`docs/README.md`](https://github.com/ZachR622/Trid/blob/master/docs/README.md) for building and editing the docs.

## Tests

```sh
npm test
```

Uses Node's built-in test runner (Node 21+), so there's nothing to install. The tests cover shapes, mesh helpers, noise, textures, OBJ / MTL, picking, tools, groups and matrices, and the WebGL renderer's GPU memory on a fake WebGL context.

## Upgrading

### From 0.2 to 0.3

- **Canvas textures are read once.** A canvas used as a `texture` is now uploaded once (faster, and sharper with mipmaps). If you draw on it again, call `updateTexture(canvas)` after drawing, or give its material `liveTexture: true` to read it every frame. Videos still play on their own. See [Changing a canvas](https://zachr622.github.io/Trid/textures#changing-a-canvas).
- **The WebGL renderer frees unused GPU memory**: meshes and textures not drawn for 300 frames are freed (and sent again if they come back). Set `new WebGLRenderer({ releaseAfter: Infinity })` to keep the old behavior.
- **Objects can have `children`**, and `mesh` is optional for a group. Code that walks `scene.objects` only sees the top level; use `worldObjects(scene)` to include children.
- `parseOBJ` now sets `materialNames` / `faceMaterials` for a file with a single material too.

## Roadmap

Roughly in order:

- **More import and export formats** — STL; basic glTF later
- **More tools** — a selection outline, a grid helper
- **Post effects** (WebGL) — bloom, vignette, outlines, antialiasing and color grading over the whole image
- **More tests** — the canvas renderer's drawing and the remaining math functions
