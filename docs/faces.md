# Filled faces

Give an object a **`material`** and its faces are filled and shaded instead of drawn as lines. Objects without a material stay wireframes.

```js
scene.add({ mesh: makeShape("cube"), material: { fill: "#E9806E" } });
```

<Demo src="faces" hint="Drag to orbit · hover a shape" />

<<< @/demos/faces.js

## Materials

| Option | Default | Meaning |
| --- | --- | --- |
| `fill` | scene's `color` | Face color, any CSS color (`rgba()` works for see-through faces) |
| `shade` | `true` | Faces get darker the more they turn away from the light. `false` uses `fill` as-is |
| `wireframe` | `false` | Also draw each face's outline, with the object's `color` and `lineWidth` |
| `doubleSided` | `false` | Also draw faces seen from behind. Needed for open shapes, like a flat plane |
| `smooth` | `false` | Blend the light across faces so curved shapes look round. See [Smooth shading](#smooth-shading) |
| `texture` | none | An image drawn on the faces. See [Textures](./textures) |
| `pixelated` | `false` | Keep texture pixels sharp |
| `effects` | none | A list of shader effects, like `[toon(), rim()]`. See [Effects](./effects) |

A material is a plain object, so several objects can share one:

```js
const metal = { fill: "#9aa0a6" };
scene.add({ mesh: makeShape("cube"), material: metal });
scene.add({ mesh: makeShape("sphere"), material: metal, pos: { x: 1, y: 0, z: 0 } });
```

## Smooth shading

By default each face has one color, so curved shapes look faceted. `smooth: true` blends the light across faces instead:

```js
scene.add({ mesh: makeShape("sphere"), material: { fill: "#8ab4f8", smooth: true } });
```

<Demo src="smooth" hint="Same mesh: flat (left) and smooth: true (right) · drag to orbit" />

Sharp edges stay sharp: faces that meet at more than **60°** aren't blended, so a smooth cube still looks like a cube. Pass an angle to change that limit:

```js
material: { fill: "#9aa0a6", smooth: 30 }   // only blend faces closer than 30°
material: { fill: "#9aa0a6", smooth: 180 }  // blend everything
```

Lower the angle if a model with big flat areas gets odd dark bands; raise it if a low-poly curved shape still looks faceted.

**OBJ files** often store their own smoothing as normals (`vn` lines). With `smooth` on, [loaded models](./obj) use those normals where the file has them, so they look the way they did in your 3D tool.

The canvas renderer shades each triangle with a gradient, and WebGL blends per pixel. Both give the same result.

## Light

The scene has one light, set by **direction** (where the light comes from), and an **ambient** level (how bright a face turned fully away still is, from 0 = black to 1 = no shading).

```js
const scene = new Scene(canvas, {
  light: { x: -0.5, y: 1, z: -0.8 }, // the default: above, left, in front
  ambient: 0.25,                     // the default
});

scene.light = { x: 1, y: 0, z: 0 }; // can be changed at any time
```

## Faces in a mesh

Meshes get a third array, `faces`: polygons as lists of vertex indices. [`makeShape`](./shapes) and [`parseOBJ`](./obj) fill it in for you.

```js
const square = {
  vertices: [
    { x: -0.5, y: -0.5, z: 0 }, { x: 0.5, y: -0.5, z: 0 },
    { x:  0.5, y:  0.5, z: 0 }, { x: -0.5, y: 0.5, z: 0 },
  ],
  edges: [[0, 1, 2, 3]],
  faces: [[0, 3, 2, 1]], // clockwise, seen from the front (-Z, the default camera side)
};
```

::: tip Which side is the front?
A face's **front** is the side from which its vertices go **clockwise**. Faces seen from behind are skipped, which roughly halves the work on closed shapes. If a face of your own mesh is missing, list its vertices the other way round, or set `doubleSided: true`.
:::

A face can have any number of vertices, but they should all lie in one plane.

## How it's drawn

1. Every face of every filled object is moved into camera space.
2. Faces seen from behind are dropped (unless `doubleSided`).
3. Faces are cut at the camera's near plane, so you can fly through objects.
4. Each face's brightness comes from the angle between it and the light.
5. **Canvas renderer (default):** all faces, and the lines of wireframe objects, are **sorted far to near** and drawn in that order, so near things cover far ones (the "painter's algorithm"). Scenes with only wireframe objects skip all of this and draw exactly as before.
   **[WebGL renderer](./renderers):** the graphics card keeps the nearest depth of every pixel, so no sorting is needed.

::: warning Limits of sorting (canvas renderer)
Sorting whole faces is an approximation. Faces that cross through each other, or a long face next to small ones, can sometimes be drawn in the wrong order: small faces behind a big one poke through as slivers. This shows most on detailed models with big flat areas.
:::

### Splitting big faces

The canvas renderer can split big faces into small triangles, which sort much better:

```js
import { CanvasRenderer } from "./trid/render/canvasRenderer.js";

const scene = new Scene(canvas, {
  renderer: new CanvasRenderer({ maxFaceSize: 0.05 }),
});
```

`maxFaceSize` is a fraction of each mesh's size: `0.05` splits any face longer than 5% of its mesh. Smaller values fix more but draw more faces, so start around `0.05` and lower it only if slivers remain. The split is computed once per mesh and reused, and outlines (`wireframe: true`) still follow the original faces.

## Renderers

Everything on this page works with both renderers. The sorting limits above only apply to the default canvas renderer: the [WebGL renderer](./renderers) uses a depth buffer, so faces always overlap correctly, and it's much faster on big models.

```js
new Scene(canvas, { renderer: new WebGLRenderer() });
```
