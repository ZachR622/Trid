# Textures

A texture is an image drawn on an object's faces. Give a material a `texture`:

```js
import { loadTexture } from "./trid/loaders/texture.js";

const crate = await loadTexture("textures/crate.png");
scene.add({ mesh: makeShape("cube"), material: { texture: crate } });
```

<Demo src="textures" hint="image file · live canvas · pixel art · drag to orbit" />

<<< @/demos/textures.js

## Texture sources

`texture` can be anything the canvas can draw:

| Source | Notes |
| --- | --- |
| An image (`<img>`, `loadTexture(url)`) | Uploaded once |
| A `<canvas>` | Uploaded once. After drawing on it again, call `updateTexture(canvas)`, or set `liveTexture: true` to read it every frame. See [Changing a canvas](#changing-a-canvas) |
| A `<video>` | Read every frame, so the video plays on the object |
| An `ImageBitmap` | Uploaded once |

Until an image has loaded, the object is drawn with its fill color. You can also set or change `material.texture` at any time.

### Changing a canvas

A canvas is read **once**, the first time it's drawn: that keeps it fast (no upload every frame) and sharp (the WebGL renderer makes mipmaps for it, so it doesn't shimmer far away). When you draw on it again, tell Trid:

```js
paint(canvas);           // your drawing code
updateTexture(canvas);   // read again on the next frame, everywhere it's used
```

For a canvas you redraw **every frame** (a clock, a mini game, a video effect), set `liveTexture: true` on its material instead, as the demo above does:

```js
scene.add({ mesh, material: { texture: canvas, liveTexture: true } });
```

::: warning Changed in 0.3
Before 0.3, every canvas was read again every frame. If a canvas texture stopped changing after you updated, add `updateTexture(canvas)` after drawing, or `liveTexture: true`.
:::

Paint a canvas **before** the first frame that draws it, or call `updateTexture` once it's painted: a canvas drawn later (after an image loads, for example) would otherwise stay blank.

`loadTexture(url)` returns a promise for the loaded image. It asks for permission to use images from other sites (CORS): images from your own site always work, while images from other sites only work if that site allows it.

## Material options

| Option | Default | Meaning |
| --- | --- | --- |
| `texture` | none | The image |
| `fill` | `"#ffffff"` with a texture | Multiplies the texture's colors. White keeps them as they are; any other color tints them |
| `pixelated` | `false` | Keep pixels sharp (for pixel art) instead of smoothing them |
| `liveTexture` | `true` for videos | Read the texture again every frame. For a canvas you redraw every frame; `false` freezes a video |
| `mapping` | `"uv"` | Where texture coordinates come from. See [Texture mapping](#texture-mapping) |
| `textureRepeat` | `1` | How many times the image repeats across: a number, or `{ u, v }` |
| `textureOffset` | `{ u: 0, v: 0 }` | Moves the image; 1 is its whole width or height |
| `textureRotation` | `0` | Turns the image around its center, in radians |

Everything else still applies: the light shades textured faces, `smooth` works, and [effects](./effects) see the texture's color in `s.base` and the texture coordinates in `s.uv`.

## Texture coordinates

To know which part of the image goes where, a mesh needs **texture coordinates** (often called UVs): for each corner of each face, a point in the image. `u` goes from 0 (left edge) to 1 (right edge), and `v` from 0 (bottom) to 1 (top). Values past 1 repeat the image.

They're stored like this:

```js
const quad = {
  vertices: [
    { x: -0.5, y: -0.5, z: 0 }, { x: 0.5, y: -0.5, z: 0 },
    { x:  0.5, y:  0.5, z: 0 }, { x: -0.5, y: 0.5, z: 0 },
  ],
  edges: [[0, 1, 2, 3]],
  faces: [[0, 3, 2, 1]],
  uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
  faceUVs: [[0, 3, 2, 1]], // for each face, the uv of each corner, in the same order
};
```

You rarely write them by hand:

- **Built-in shapes** have them. Cubes and boxes show the whole image on each face, upright as seen from outside. Spheres wrap it around like a world map: `u` around the equator, `v` from bottom to top.
- **OBJ files** exported with texture coordinates (`vt` lines) keep them. In Blender, that's the UV map, exported with *UV Coordinates* checked.

A mesh without texture coordinates is drawn without its texture, and a warning is printed in the console. Give it a [mapping](#texture-mapping) instead.

## Texture mapping

A material's `mapping` makes texture coordinates from the mesh's shape, so any mesh can be textured, including OBJ files without `vt` lines. It also replaces coordinates a mesh already has.

```js
scene.add({ mesh, material: { texture: wood, mapping: "box" } });
```

<Demo src="mapping" hint="a die with a texture per side · cylinder mapping, scrolling · box mapping · drag to orbit" />

<<< @/demos/mapping.js

| Mapping | What it does | Good for |
| --- | --- | --- |
| `"uv"` | The mesh's own texture coordinates (the default) | Built-in shapes, OBJ files with `vt` |
| `"planar"` | Projects the image straight through the mesh, from the front | Flat things: floors, walls, signs |
| `"box"` | Each face takes the image from the side of the box it faces most | Boxy models, terrain, buildings |
| `"sphere"` | Wraps the image around like a world map | Round things: planets, balls |
| `"cylinder"` | Wraps the image around the sides like a label; the ends get a flat image | Cans, bottles, columns |

Every mapping fits the image to the mesh's bounding box. Add `textureRepeat` to tile it instead of stretching it.

`"planar"`, `"sphere"` and `"cylinder"` work along an axis. Pass an object to pick it:

```js
material: { mapping: { type: "planar", axis: "y" } }    // from above, like a floor
material: { mapping: { type: "cylinder", axis: "x" } }  // a can lying on its side
```

| Mapping | Default axis | Meaning of `axis` |
| --- | --- | --- |
| `"planar"` | `"z"` | The direction the image is projected along |
| `"sphere"`, `"cylinder"` | `"y"` | The line the image wraps around |

### Baking a mapping into a mesh

`mapUVs(mesh, mapping)` writes the coordinates into the mesh itself, as `uvs` and `faceUVs`. Use it once instead of setting `mapping` on every material, or to keep the coordinates when you change or export the mesh:

```js
import { loadOBJ, mapUVs } from "trid3d";

const rock = mapUVs(await loadOBJ("rock.obj", { fit: 1 }), "box");
```

`computeUVs(mesh, mapping)` returns `{ uvs, faceUVs }` without changing the mesh.

## Repeat, offset and rotation

These three options move the image on the faces without changing the mesh:

```js
material: {
  texture: tiles,
  textureRepeat: { u: 4, v: 2 },   // 4 times across, twice up
  textureOffset: { u: 0.25, v: 0 }, // a quarter of the image to the side
  textureRotation: Math.PI / 4,     // turned 45°
}
```

The image is turned around its center first, then repeated, then moved. They can change every frame, which makes scrolling textures like water or conveyor belts cheap:

```js
scene.start((dt, time) => (belt.material.textureOffset = { u: time * 0.5, v: 0 }));
```

::: tip WebGL 1 and repeating
In browsers that only have WebGL 1, the WebGL renderer can only repeat images whose width and height are powers of two (64, 128, 256…). Other sizes are stretched at the edges instead. WebGL 2, which every current browser has, doesn't have this limit.
:::

[Effects](./effects) get the final coordinates in `s.uv`, with repeat, offset and rotation applied.

## A texture per face

`material` can also be a **list of materials**. The mesh's `faceMaterials` says which one each face uses, by its position in the list:

```js
scene.add({
  mesh: makeShape("cube"),
  material: [
    { texture: front }, { texture: back }, { texture: top },
    { texture: bottom }, { texture: right }, { texture: left },
  ],
});
```

Each material in the list is complete on its own: it can have its own `fill`, texture, `mapping`, `smooth` or effects. Faces without an entry in `faceMaterials`, or pointing past the end of the list, use the first material.

Where `faceMaterials` comes from:

- **Cubes and boxes** number their sides: 0 front (−Z), 1 back (+Z), 2 top, 3 bottom, 4 right (+X), 5 left (−X).
- **OBJ files** with `usemtl` lines get one number per material name, listed in `mesh.materialNames`. See [Loading OBJ files](./obj#materials).
- **Your own meshes**: set `mesh.faceMaterials` to a list with a number per face, like `faces`.

```js
// A sphere with a band around the middle
const ball = makeShape("sphere");
ball.faceMaterials = ball.faces.map((f) => {
  const y = f.reduce((s, i) => s + ball.vertices[i].y, 0) / f.length;
  return Math.abs(y) < 0.1 ? 1 : 0;
});
scene.add({ mesh: ball, material: [{ fill: "#8ab4f8" }, { fill: "#E9806E" }] });
```

After changing `faceMaterials` in place, set `mesh.dirty = true`.

## Renderers

The [WebGL renderer](./renderers) maps textures per pixel, with correct perspective and smooth results on surfaces seen at a grazing angle. Pixels that are fully transparent in the image (like the empty parts of a PNG) are left out, so you can see through them.

Graphics cards have a largest texture size (usually 8192 or 16384 pixels). A bigger image is drawn at that size instead, and a warning is printed in the console.

The canvas renderer draws the image on each triangle with the 2D canvas. It works everywhere, but:

- The image bends a little along the diagonal of big faces seen up close. [Splitting faces](./faces#splitting-big-faces) with `maxFaceSize` fixes most of it.
- Surfaces seen almost edge-on can look noisy.
- It's slower: each textured triangle is several drawing steps.
- See-through parts of an image and [effects](./effects) aren't supported on textured faces.

For textured models, prefer WebGL.
