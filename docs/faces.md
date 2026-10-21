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

A material is a plain object, so several objects can share one:

```js
const metal = { fill: "#9aa0a6" };
scene.add({ mesh: makeShape("cube"), material: metal });
scene.add({ mesh: makeShape("sphere"), material: metal, pos: { x: 1, y: 0, z: 0 } });
```

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
5. All faces, and the lines of wireframe objects, are **sorted far to near** and drawn in that order, so near things cover far ones (the "painter's algorithm").

Scenes with only wireframe objects skip all of this and draw exactly as before.

::: warning Limits of sorting
Sorting whole faces is an approximation. Faces that cross through each other, or a long face next to small ones, can sometimes be drawn in the wrong order. Splitting big faces into smaller ones helps.
:::

## Renderers

All drawing goes through `scene.renderer`, a `CanvasRenderer` by default. A renderer is any object with a `render(scene)` method, so a different one (for example WebGL) can be plugged in later without changing your scene code:

```js
new Scene(canvas, { renderer: myRenderer });
```
