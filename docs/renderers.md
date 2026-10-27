# Renderers

A renderer is what turns your scene into pixels. Trid has two, and you can switch at any time without changing anything else: objects, materials, the light, tools and picking all work the same.

| | `CanvasRenderer` (default) | `WebGLRenderer` |
| --- | --- | --- |
| Draws with | The canvas 2D context | The graphics card |
| What's in front | Faces sorted far to near (approximate) | Depth buffer, per pixel (exact) |
| Big models | Slow (thousands of faces) | Fast |
| Works | Everywhere | Wherever WebGL works (almost every browser) |

<Demo src="renderers" hint="Drag to orbit · switch renderers with the button" />

<<< @/demos/renderers.js

## Using WebGL

```js
import { Scene } from "./trid/scene.js";
import { WebGLRenderer } from "./trid/render/webglRenderer.js";

const scene = new Scene(canvas, { renderer: new WebGLRenderer() });
```

To fall back to the canvas renderer where WebGL isn't available:

```js
const scene = new Scene(canvas, {
  renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
});
```

| Option | Default | Meaning |
| --- | --- | --- |
| `antialias` | `true` | Smooth edges |
| `releaseAfter` | `300` | Free meshes and textures not drawn for this many frames (about 5 s at 60 fps). `Infinity` keeps everything until `dispose()`. See [Graphics card memory](#graphics-card-memory) |

### How it fits in

The WebGL renderer draws on a hidden canvas of its own, then copies the picture onto your canvas each frame. So your page keeps **one canvas**, tools draw on top of the 3D scene exactly as before, and `canvas.toDataURL()` includes everything. The copy costs about a millisecond per frame.

### Changing a mesh

Meshes are sent to the graphics card the first time they're drawn and reused after that. If you change a mesh's vertices, edges or faces **in place** (like the [animated mesh](./examples#waves) example), mark it:

```js
mesh.vertices[0].y += 0.1;
mesh.dirty = true; // re-sent on the next frame
```

Replacing the arrays (`mesh.vertices = [...]`) or adding and removing items is noticed automatically. Both renderers clear `dirty` after the next frame. The canvas renderer reads vertices fresh every frame, but caches smooth-shading normals and split faces, so set `dirty` there too when you use those.

### Far distance

The depth buffer needs a limit: nothing farther than `camera.far` (default `1000`) is drawn. Raise it for huge scenes.

### Graphics card memory

Each mesh and texture drawn is copied to the graphics card. When one hasn't been drawn for `releaseAfter` frames (about 5 seconds by default), its copy is freed, so code that keeps making new meshes or textures (`obj.mesh = makeShape(...)` on every change, a generator, a model editor, an OBJ uploader used many times) doesn't fill the card's memory. If a freed mesh or texture is drawn again, it's simply sent again.

To free one right away, without waiting:

```js
scene.remove(obj);
renderer.release(obj.mesh);             // its buffers
renderer.release(obj.material.texture); // its image
```

`renderer.memory` says what's on the card right now: `{ meshes, buffers, textures }`. Handy to check that a long-running page stays flat.

### Cleaning up

`scene.destroy()` frees the renderer's graphics card memory. If you swap renderers yourself, call `renderer.dispose()` on the one you no longer need.

## Using the canvas renderer

It's the default, so there's nothing to set up. Its one option, `maxFaceSize`, splits big faces so they sort better. See [Splitting big faces](./faces#splitting-big-faces).

```js
import { CanvasRenderer } from "./trid/render/canvasRenderer.js";

new Scene(canvas, { renderer: new CanvasRenderer({ maxFaceSize: 0.05 }) });
```

## Writing your own

A renderer is any object with a `render(scene)` method (and an optional `dispose()`). It should clear `scene.canvas` and draw `scene.objects` as seen from `scene.camera`. Tools draw after it, on `scene.ctx`.
