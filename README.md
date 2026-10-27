<p align="center">
  <img src="https://raw.githubusercontent.com/ZachR622/Trid/master/docs/public/logo.svg" width="96" alt="Trid logo">
</p>

<h1 align="center">Trid</h1>

<p align="center">A small 3D library for the HTML canvas. No dependencies, no build step.</p>

---

Trid gives you a scene, shapes you can model in code, lights, effects, model loading and mouse/keyboard tools, all in plain ES modules you can drop next to your page. See the [docs](https://zachr622.github.io/Trid/) for live demos.

> **Status:** early (0.x): the API can still change between minor versions. See [Upgrading](#upgrading).

## Features

- **Scene** — holds a canvas, a camera and your objects, and runs the frame loop for you.
- **Groups** — give any object `children` and they move, turn and scale with it (models made of parts, a moon orbiting a planet).
- **Shapes** — cubes, boxes (sharp or rounded), spheres, cylinders, cones, tori and planes built in, `lathe` for round shapes and `extrude` for flat ones, or any mesh you define as vertices and edges.
- **Modeling** — smooth curves through a few points (`spline`), shapes swept along a 3D path (`sweep`: tails, horns, pipes, rails), surfaces through cross-sections (`loft`: bodies, bottles, hulls, heads), subdivision surfaces with creases (`subdivideMesh`: box modeling), shapes that melt together (`blobMesh`: creatures, clay; or any distance field with `sdfMesh`), rounded or cut edges on any mesh (`bevelMesh`), taper, twist, bend and bulge deformers, mesh cleanup and checks (weld, clean, validate, fix winding), and rays, inside tests and distances against meshes and scenes (`meshQuery`, `raycastScene`).
- **Mesh helpers** — clone, transform, displace, merge and measure meshes; seeded random numbers and smooth noise (`fbm2`, `fbm3`, tileable) for rocks, terrain and procedural textures.
- **Filled faces** — give an object a `material` to fill and shade its faces, flat or smooth.
- **Lights** — ambient, directional and point lights, with colors and intensities, as many as you need (up to 8 at once besides ambient).
- **Textures** — images, canvases or videos on faces, with texture coordinates from built-in shapes and OBJ files, or made from the shape (planar, box, sphere and cylinder mapping). Repeat, offset and rotate them, or give each face its own material. Or paint one in code: wood, marble, bricks and more, all seamless.
- **Effects** — stack shader effects like toon, rim and edge glow, gradients and fog on a material, or write your own in GLSL.
- **Post effects** — bloom, vignette, color grading and film grain over the whole picture, or your own full-screen shaders (several passes if needed).
- **Two renderers** — the canvas 2D context by default, or `WebGLRenderer` for exact depth and big models, with the same scene code.
- **OBJ files** — load models from a URL (with their `.mtl` colors and textures), or let users drop their own `.obj` files on the canvas.
- **Export** — `scene.screenshot()` and `scene.record()` save images and videos of the canvas; `exportOBJ` / `exportModel` write meshes, objects or whole scenes as OBJ files with their MTL materials and textures.
- **Camera** — position, yaw, pitch and field of view, with near-plane clipping.
- **Tools** — orbit and fly cameras, object dragging, hover highlight, a move / rotate / scale gizmo (with a pivot of your choice), a view axes gizmo, a floor grid, an FPS meter and an OBJ uploader, one line each. Exact picking by triangles, with the hit point and texture coordinates under the mouse. Writing your own is a plain object with a few methods.
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
| `trid/render/` | Renderers (Canvas 2D, WebGL), lights, effects, post effects, shapes, grids, mesh helpers, procedural textures, drawing, frame loop |
| `trid/modeling/` | Modeling tools: curves, sweep, loft, subdivision, blobs, bevel, deformers, cleanup, queries (rays, inside, distance) |
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

Uses Node's built-in test runner (Node 21+), so there's nothing to install. The tests cover shapes, mesh helpers, curves, sweeps, lofts, subdivision, blobs, bevels, deformers, mesh cleanup, mesh and scene queries, noise, textures, OBJ / MTL, picking, tools, groups and matrices, lights, post effects, grids, and the WebGL renderer's GPU memory on a fake WebGL context.

## Upgrading

### From 0.5 to 0.6

- **The default field of view is 50°** (`DEFAULT_FOV`), instead of 90°. Scenes whose camera has no `fov` look about twice as close, like in most 3D tools. To keep the old view, give the camera `fov: Math.PI / 2`.

### From 0.3 to 0.4

- **Lights are a list**: `scene.lights`. A scene still starts with one directional light and an ambient level, and looks the same. `scene.light` and `scene.ambient` are now shortcuts for the first directional light's direction and the first ambient light's intensity.
- Setting `scene.ambient` after the scene is made no longer dims the directional light (it used to be `1 - ambient` all the time; now that's only how the default lights start). To keep the old look, also set `scene.lights[1].intensity = 1 - ambient`.
- `scene.light` is `null` for a scene whose `lights` have no directional light.
- Effects get `s.lightColor`, and `toon` and `gradient` are tinted by colored lights (no change with white lights).

### From 0.2 to 0.3

- **Canvas textures are read once.** A canvas used as a `texture` is now uploaded once (faster, and sharper with mipmaps). If you draw on it again, call `updateTexture(canvas)` after drawing, or give its material `liveTexture: true` to read it every frame. Videos still play on their own. See [Changing a canvas](https://zachr622.github.io/Trid/textures#changing-a-canvas).
- **The WebGL renderer frees unused GPU memory**: meshes and textures not drawn for 300 frames are freed (and sent again if they come back). Set `new WebGLRenderer({ releaseAfter: Infinity })` to keep the old behavior.
- **Objects can have `children`**, and `mesh` is optional for a group. Code that walks `scene.objects` only sees the top level; use `worldObjects(scene)` to include children.
- `parseOBJ` now sets `materialNames` / `faceMaterials` for a file with a single material too.

## Roadmap

Roughly in order:

- **More import and export formats** — STL; basic glTF later
- **More tools** — a selection outline
- **More post effects** — outlines (from depth), antialiasing (FXAA)
- **More tests** — the canvas renderer's drawing and the remaining math functions
