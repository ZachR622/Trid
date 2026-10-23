# API reference

Everything the library exports, module by module. Points are plain `{ x, y, z }` objects (or `{ x, y }` on screen). No function changes its inputs unless it says so.

## Modules

| Module | Exports |
| --- | --- |
| `trid/index.js` (`"trid3d"`) | Everything below, from one file |
| `trid/scene.js` | [`Scene`](./scene) |
| `trid/math/transform.js` | [Pipeline](#pipeline), [camera directions](#camera-directions), [basic transforms](#basic-transforms), [constants](#constants) |
| `trid/math/projection.js` | [`project`, `screen`](#projection) |
| `trid/render/draw.js` | [`clear`, `point`, `line`, `drawWireframe`, `drawInstance`](#drawing) |
| `trid/render/loop.js` | [`loop`](#frame-loop) |
| `trid/render/canvasRenderer.js` | [`CanvasRenderer`, `DEFAULT_LIGHT`, `DEFAULT_AMBIENT`, `materialsOf`](#canvasrenderer) |
| `trid/render/uvMapping.js` | [`computeUVs`, `mapUVs`](./textures#texture-mapping), [`uvsFor`, `uvTransform`, `applyUVTransform`, `mappingOf`, `mappingKey`, `MAPPINGS`](#texture-mapping) |
| `trid/render/webglRenderer.js` | [`WebGLRenderer`, `DEFAULT_FAR`](#webglrenderer) |
| `trid/render/normals.js` | [`cornerNormals`, `creaseOf`, `newell`, `DEFAULT_CREASE`](#normals) |
| `trid/render/effects.js` | [`toon`, `rim`, `edgeGlow`, `unlit`, `gradient`, `fog`](./effects#built-in-effects), [`buildEffects`, `effectsKey`, `uniformType`, `SURFACE_GLSL`](#effects) |
| `trid/render/color.js` | [`parseColor`](#parsecolor) |
| `trid/render/shapes.js` | [`makeShape`, `lathe`, `extrude`, `triangulate`, `scaleMesh`](./shapes) |
| `trid/render/meshUtils.js` | [`cloneMesh`, `transformMesh`, `displaceMesh`, `mergeMeshes`, `meshBounds`](./shapes#mesh-helpers) |
| `trid/math/noise.js` | [`rng`, `noise2`, `noise3`, `fbm2`, `fbm3`](./noise) |
| `trid/loaders/texture.js` | [`loadTexture`](./textures), [`textureReady`, `textureSize`, `textureIsLive`](#textures) |
| `trid/loaders/obj.js` | [`parseOBJ`, `loadOBJ`, `readOBJFile`, `pickOBJFile`, `fitMesh`](./obj) |
| `trid/export/obj.js` | [`exportOBJ`](./export#obj-files) |
| `trid/export/capture.js` | [`screenshot`, `record`, `download`](./export) |
| `trid/tools/index.js` | [Tools](./tools), [`pick`, `pickHit`, `screenBounds`, `worldPerPixel`](#helpers), [`ToolManager`](#toolmanager) |
| `trid/sceneGraph.js` | [`worldObjects`, `worldMatrix`, `worldPosition`, `ancestors`, `forEachPlaced`](./groups#where-things-are-parent-and-world) |
| `trid/math/matrix.js` | [`identityMat4`, `mat4FromTransform`, `mulMat4`, `invertMat4`, `determinantMat4`, `transformPoint`, `transformDirection`, `normalMatrix`, `transformNormal`, `transformOpToLocal`](./groups#matrices) |
| `trid/math/rotation.js` | [`matFromEuler`, `eulerFromMat`, `matFromAxisAngle`, `mulMat`, `mulVec`, `applyTransformOp`](#rotations) |

## Math

### Pipeline

From `trid/math/transform.js`.

```js
localToWorld(v, inst)            // → point
worldToCamera(p, camera)         // → point
cameraToScreen(p, camera, w, h)  // → { x, y }
worldToScreen(p, camera, w, h)   // → { x, y }
clipNear(a, b, near)             // → [a, b] or null
```

- **`localToWorld`** moves a mesh vertex into world space using an object's transform: scale, then rotate (X → Y → Z), then translate by `pos`. `inst` needs `pos`, `rot` and `scale`.
- **`worldToCamera`** moves a world point into camera space: subtracts the camera position, then undoes its yaw and pitch. In camera space the camera sits at the origin looking down +Z, so `z` is the distance in front of it.
- **`cameraToScreen`** projects a camera-space point to canvas pixels, using `camera.fov` and the aspect ratio `w / h`. `p.z` must be > 0 — clip segments with `clipNear` first if they can cross behind the camera.
- **`worldToScreen`** is `worldToCamera` followed by `cameraToScreen`. Handy for placing labels on top of 3D points.
- **`clipNear`** clips a camera-space segment against the plane `z = near`. Returns the segment unchanged if both ends are in front, `null` if both are behind, or a shortened segment with the hidden end moved onto the plane.

### Camera directions

```js
cameraForward(camera)  // → point
cameraRight(camera)    // → point
cameraUp(camera)       // → point
```

Unit vectors in world space for where the camera looks, the screen's right side and the screen's top side. Use them to move things relative to the view.

### Basic transforms

```js
scale(p, sx, sy, sz)       // → point
translate(p, dx, dy, dz)   // → point
rotateX(p, angle)          // → point  (pitch, YZ plane)
rotateY(p, angle)          // → point  (yaw, XZ plane)
rotateZ(p, angle)          // → point  (roll, XY plane)
rotateXYZ(p, { x, y, z })  // → point  (X, then Y, then Z)
```

Each returns a new point. Angles are in radians. Rotation order matters: `rotateXYZ` always applies X first, then Y, then Z.

### Constants

| Name | Value |
| --- | --- |
| `DEFAULT_FOV` | `Math.PI / 2` — 90° vertical field of view |
| `DEFAULT_NEAR` | `0.01` — near plane distance |

### Projection

From `trid/math/projection.js`.

```js
project(p, fov = Math.PI / 2, aspect = 1)  // → { x, y }
screen(p, w, h)                            // → { x, y }
```

- **`project`** is the perspective projection of a camera-space point to normalized coordinates (−1 to +1). X is divided by `aspect` so shapes don't stretch on wide canvases. `p.z` must be > 0.
- **`screen`** converts normalized coordinates to canvas pixels. Y is flipped: +1 is the top of the canvas.

## Rendering

### Drawing

From `trid/render/draw.js`.

```js
clear(ctx, w, h, color)
point(ctx, p, color, size = 20)
line(ctx, p1, p2, color, width = 4)
drawWireframe(ctx, points2, edges, color, width = 4)
drawInstance(ctx, inst, camera, w, h, color, lineWidth = 3)
edgeSegments(edges)
wireEdges(mesh)
```

- **`clear`** fills the whole canvas with `color`.
- **`point`** draws a filled square centered on screen point `p`. Useful for debugging vertices.
- **`line`** draws one line between two screen points.
- **`drawWireframe`** connects already-projected screen points using index edges (2 indices = segment, 3+ = closed loop). Everything is stroked as one path. No clipping is done.
- **`drawInstance`** is the main drawing call: it transforms an object's mesh, clips every edge against the camera's near plane, projects it and strokes it as one path. The canvas renderer uses it for scenes with only wireframe objects.
- **`edgeSegments`** turns edge definitions into `[a, b]` index pairs (a generator), expanding closed loops. Missing `edges` give no pairs.
- **`wireEdges`** is what a wireframe draws for a mesh: its `edges`, or the outline of each face when it has none.

### CanvasRenderer

From `trid/render/canvasRenderer.js`. The default `scene.renderer`: it draws wireframes and [filled faces](./faces) with the canvas 2D context.

```js
new CanvasRenderer({ maxFaceSize = null } = {})
renderer.render(scene)
```

- **`maxFaceSize`** splits faces bigger than that fraction of their mesh's size into triangles, so they sort better (see [Splitting big faces](./faces#splitting-big-faces)). Off by default.
- **`render(scene)`** clears the canvas and draws every object of the scene. `Scene.render` calls it, then lets tools draw.
- **`DEFAULT_LIGHT`** is `{ x: -0.5, y: 1, z: -0.8 }` and **`DEFAULT_AMBIENT`** is `0.25`.

### WebGLRenderer

From `trid/render/webglRenderer.js`. Draws with the graphics card and a depth buffer. See [Renderers](./renderers).

```js
WebGLRenderer.isSupported()
new WebGLRenderer({ antialias = true } = {})
renderer.render(scene)
renderer.dispose()
renderer.canvas
```

- **`isSupported()`** says whether the browser can create a WebGL context.
- The constructor throws an `Error` if WebGL isn't available.
- **`render(scene)`** draws on the hidden `renderer.canvas`, then copies the picture onto `scene.canvas`.
- **`dispose()`** frees the graphics card memory; `scene.destroy()` calls it. Safe to call twice.
- Meshes are uploaded once. Set **`mesh.dirty = true`** after changing a mesh's arrays in place.
- **`DEFAULT_FAR`** is `1000`, the farthest distance drawn unless the camera sets `far`.

### Normals

From `trid/render/normals.js`.

```js
cornerNormals(mesh, crease = 60)
creaseOf(smooth)
newell(points)
```

- **`cornerNormals`** returns, for each face, one unit normal per corner: the average of the faces around that vertex that meet it at less than `crease` degrees. Faces with normals from an OBJ file use those. Cached per mesh until its arrays change or `mesh.dirty` is set.
- **`creaseOf`** turns a material's `smooth` value into a crease angle (`true` → 60), or `null` for flat shading.
- **`newell`** returns the (not normalized) normal of a polygon. For points clockwise as seen from a side, it points to that side. Also exported from `canvasRenderer.js`.
- **`DEFAULT_CREASE`** is `60`.

### Effects

From `trid/render/effects.js`. The built-in effects and how to write your own are on the [Effects](./effects) page. The helpers below are what the renderers use:

- **`buildEffects(effects)`** joins a list of effects into GLSL code, with names made unique per effect. Returns `{ code, calls, uniforms }`.
- **`effectsKey(effects)`** returns a string that's equal for lists that compile to the same shader (same code, same uniform types).
- **`uniformType(value)`** returns the GLSL type a uniform value becomes, or `null`.
- **`SURFACE_GLSL`** is the GLSL declaration of the `Surface` struct.

### Textures

From `trid/loaders/texture.js`. Using textures is explained on the [Textures](./textures) page.

- **`loadTexture(url)`** returns a promise for a loaded `<img>` (with CORS enabled).
- **`textureReady(src)`** says whether an image, canvas or video has pixels to draw yet.
- **`textureSize(src)`** returns `{ w, h }` in pixels.
- **`textureIsLive(src, material?)`** is `true` for textures read again every frame: videos, or any source whose material has `liveTexture: true` (`liveTexture: false` freezes a video).
- **`updateTexture(src)`** tells the renderers a canvas (or image) changed: it's read again once, on the next frame. See [Changing a canvas](./textures#changing-a-canvas).
- **`textureVersion(src)`** is how many times `updateTexture` was called for a source (0 when never); renderers compare it with the version they read last.

### Texture mapping

From `trid/render/uvMapping.js`. Using mappings is explained on the [Textures](./textures#texture-mapping) page.

- **`computeUVs(mesh, mapping)`** returns `{ uvs, faceUVs }` made from the mesh's shape. The mesh isn't changed.
- **`mapUVs(mesh, mapping)`** writes them into the mesh and returns it.
- **`uvsFor(mesh, mapping)`** returns the coordinates a renderer uses: the mesh's own, or computed for the mapping and cached until the mesh changes.
- **`uvTransform(material)`** turns `textureRepeat`, `textureOffset` and `textureRotation` into a 2D matrix `[a, b, c, d, e, f]` (`u' = a·u + c·v + e`, `v' = b·u + d·v + f`), or `null` when they change nothing. **`applyUVTransform(m, uv)`** applies it to one coordinate.
- **`mappingOf(mapping)`** returns the mapping as `{ type, axis }` and throws for an unknown one. **`mappingKey(mapping)`** is a short string for caches. **`MAPPINGS`** lists the mapping types.
- **`materialsOf(obj)`** (from `canvasRenderer.js`) returns an object's materials as a list, or `null` for a wireframe.

### parseColor

From `trid/render/color.js`.

```js
parseColor(ctx, color)
```

Turns any CSS color into `[r, g, b, a]` (0..255, alpha 0..1), using a 2D context to read it. Unknown colors come out black.

### Frame loop

From `trid/render/loop.js`.

```js
const stop = loop(update, { maxDt = 0.1 } = {})
```

Calls `update(dt, time)` every animation frame with `requestAnimationFrame`. `dt` is the seconds since the last frame (0 on the first, capped at `maxDt`) and `time` is the seconds since the loop started. Call the returned `stop()` to end it.

### Using the pipeline without Scene

`Scene` is a thin layer over these functions. You can drive them yourself:

<Demo src="raw" />

<<< @/demos/raw.js

## Helpers

From `trid/tools/helpers.js` (also exported by `trid/tools/index.js`).

### pick

```js
pick(scene, x, y, { filter, padding = 4, exact = false } = {})  // → object or null
```

Returns the object under canvas pixel (`x`, `y`). An object is hit when the point is inside its screen-space bounding box, grown by `padding` pixels. If several are hit, the one whose center is closest to the camera wins. `filter(obj)` can exclude objects.

::: info
Bounding boxes are approximate: clicking the empty corner around a sphere still picks it, and of two objects overlapping on screen, the one with the nearer center wins even where the other is in front. Pass `exact: true` to test triangles instead (same as [`pickHit`](#pickhit)).
:::

### pickHit

```js
pickHit(scene, x, y, { filter, padding = 4, objects = scene.objects } = {})  // → { object, face, depth } or null
```

Exact picking: the nearest object whose drawn surface is under the pixel. Every face is projected with the renderers' own math and tested triangle by triangle, so a click always matches what's drawn: through a ring's hole, a sword guard in front of its blade. `face` is the index in `mesh.faces` that was hit, `depth` the distance in front of the camera. Objects without faces (wireframes) are hit within `padding` pixels of one of their lines (`face` is then `-1`).

Faces with a corner behind the camera's near plane are skipped. It's one pass over the objects' vertices per call: fine for clicks and hover on models of a few thousand faces.

### screenBounds

```js
screenBounds(scene, obj)  // → { minX, minY, maxX, maxY } or null
```

An object's bounding box on screen, in canvas pixels. Only vertices in front of the near plane count; returns `null` if the whole object is behind the camera.

### worldPerPixel

```js
worldPerPixel(scene, depth)  // → number
```

How many world units one canvas pixel covers at `depth` units in front of the camera. Multiply pointer `dx` / `dy` by it to make something follow the cursor exactly.

## Rotations

From `trid/math/rotation.js`. 3×3 rotation matrices (row-major, `m[row][col]`, applied as M · v), built from `rotateXYZ` itself so they always match the renderers, and the operations `TransformGizmo` reports.

```js
matFromEuler(rot)              // → matrix that rotateXYZ(p, rot) applies
eulerFromMat(m)                // → rot angles for a matrix (handles looking straight along Y)
matFromAxisAngle(axis, angle)  // → right-handed turn around a unit axis
mulMat(a, b)                   // → a · b (b applied first)
mulVec(m, v)                   // → m · v
applyTransformOp(t, op)        // → new { pos, rot, scale }
```

Combine rotations with matrices, then turn the result back into an object's `rot`:

```js
// Turn an object 90° around the world Y axis, whatever its current rotation
const turn = matFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
obj.rot = eulerFromMat(mulMat(turn, matFromEuler(obj.rot)));
```

`applyTransformOp(t, op)` applies a [TransformGizmo operation](./tools#applying-the-changes-yourself) to a transform and returns the new one (the input isn't changed).

## ToolManager

From `trid/tools/manager.js`. Each scene creates one as `scene.tools`. It keeps the tool list and turns canvas pointer events into [tool events](./custom-tools#event-objects). Canvas listeners are only added while at least one tool is in the list. You normally go through `scene.use` / `scene.unuse` instead.

| Member | Meaning |
| --- | --- |
| `new ToolManager(scene)` | Creates a manager for a scene's canvas |
| `add(tool)` | Adds a tool and calls its `attach`. Adding the same tool twice does nothing. |
| `remove(tool)` | Removes a tool (ending its drag if it holds one) and calls its `detach` |
| `clear()` | Removes every tool |
| `update(dt)` | Calls every tool's `update` |
| `draw(ctx)` | Calls every tool's `draw` |
| `list` | The tools, in the order they were added |
