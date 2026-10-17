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

### Demo (`main.js`)

A sphere and a box spinning, driven by `requestAnimationFrame` with the real elapsed time (`dt`, capped at 0.1 s).

## 2. Is the code solid for a library?

The base is good. The files are cleanly separated into math and render, the JSDoc is thorough, the functions are pure and the instance model (`mesh` plus `pos`/`rot`/`scale`) is sensible. The known bugs and quality issues are fixed; what's left is mostly packaging.

### Remaining issues

- **Library basics are missing:** a single entry file (`index.js`), `package.json`, README, tests and git. The folder isn't a git repository yet.

## 3. Ideas for future features

Roughly in order of value:

1. **Cleanup and packaging:** an `index.js` that re-exports the public API, `package.json`, a README with examples, and git.
2. **A renderer or scene helper:** something like `new Scene(canvas)`, `scene.add(obj)` and `scene.start(update)` that wraps the `requestAnimationFrame` loop and `dt`.
3. **Mouse orbit controls:** drag to rotate and scroll to zoom, built on the camera's position, `yaw` and `pitch`.
4. **More shapes:** cylinder, cone, torus, plane or grid, pyramid, and an axes helper.
5. **Filled faces:** add `faces` to meshes, sort them back to front (painter's algorithm), skip faces turned away from the camera (backface culling) and add simple flat shading. This turns it from a wireframe viewer into a small 3D engine.
6. **OBJ file loading** for real models.
7. **Per-instance style:** color and line width stored on the object, plus fading lines with depth.
8. **Parent/child transforms**, such as a moon orbiting a planet.
9. **4×4 matrices** in place of chained function calls. They're faster and make the camera and hierarchy straightforward.
10. **Tests** (for example with Vitest) for the math functions, which are pure and easy to test.
