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
| A `<canvas>` | Read again every frame, so you can draw on it to animate |
| A `<video>` | Read every frame, so the video plays on the object |
| An `ImageBitmap` | Uploaded once |

Until an image has loaded, the object is drawn with its fill color. You can also set or change `material.texture` at any time.

`loadTexture(url)` returns a promise for the loaded image. It asks for permission to use images from other sites (CORS): images from your own site always work, while images from other sites only work if that site allows it.

## Material options

| Option | Default | Meaning |
| --- | --- | --- |
| `texture` | none | The image |
| `fill` | `"#ffffff"` with a texture | Multiplies the texture's colors. White keeps them as they are; any other color tints them |
| `pixelated` | `false` | Keep pixels sharp (for pixel art) instead of smoothing them |

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

A mesh without texture coordinates is drawn without its texture, and a warning is printed in the console.

## Renderers

The [WebGL renderer](./renderers) maps textures per pixel, with correct perspective and smooth results on surfaces seen at a grazing angle. Pixels that are fully transparent in the image (like the empty parts of a PNG) are left out, so you can see through them.

The canvas renderer draws the image on each triangle with the 2D canvas. It works everywhere, but:

- The image bends a little along the diagonal of big faces seen up close. [Splitting faces](./faces#splitting-big-faces) with `maxFaceSize` fixes most of it.
- Surfaces seen almost edge-on can look noisy.
- It's slower: each textured triangle is several drawing steps.
- See-through parts of an image and [effects](./effects) aren't supported on textured faces.

For textured models, prefer WebGL.
