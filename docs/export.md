# Exporting

Save what a scene shows as an image or a video, or its meshes as an OBJ file that Blender and other 3D programs can open.

```js
import { exportOBJ, download } from "trid3d";

download(scene.screenshot(), "scene.png");   // an image
download(exportOBJ(scene), "scene.obj");     // the 3D models

const clip = scene.record({ duration: 3 });  // a 3-second video
download(clip.done, "clip.webm");
```

<Demo src="export" hint="screenshot · 3-second video · OBJ file · drag to orbit" />

<<< @/demos/export.js

## Saving files

`download(data, filename)` saves something in the browser's downloads. `data` can be a file (`Blob`), text, or a promise for either, so you can pass `scene.screenshot()` or `recording.done` straight in.

```js
download(scene.screenshot(), "scene.png");
download(exportOBJ(mesh), "model.obj");
```

Browsers only allow downloads that start from a user action, like a click, so call it from a button.

If you'd rather keep the file (to upload it, or show it in an `<img>`), use the `Blob` directly:

```js
const image = await scene.screenshot();
img.src = URL.createObjectURL(image);
```

## Screenshots

`scene.screenshot(options)` draws a new frame and returns it as an image file (a promise for a `Blob`).

The frame is drawn on a separate canvas, so the page doesn't flicker, and it works whether or not the scene is running.

| Option | Default | Meaning |
| --- | --- | --- |
| `type` | `"image/png"` | `"image/png"`, `"image/jpeg"` or `"image/webp"` |
| `quality` | `0.92` | For JPEG and WebP, from 0 to 1 |
| `width`, `height` | the canvas's | Size of the image in pixels. A bigger size gives a sharper image |
| `tools` | `true` | Include what tools draw on top, like the FPS meter |

```js
// A 4K wallpaper, without the FPS meter
download(scene.screenshot({ width: 3840, height: 2160, tools: false }), "wallpaper.png");
```

Line widths and tool overlays are in pixels, so they look thinner on a bigger image. Raise `lineWidth` for the shot if you need to.

## Videos

`scene.record(options)` starts recording the canvas as a video, tools included. The scene has to be running (`scene.start()`), because only new frames are recorded.

| Option | Default | Meaning |
| --- | --- | --- |
| `duration` | none | Stop by itself after this many seconds |
| `fps` | `60` | Frames per second |
| `bitsPerSecond` | `8000000` | Quality: higher is sharper and bigger |
| `type` | the best one available | Video format, like `"video/webm"` |

It returns a recording:

| Property | Meaning |
| --- | --- |
| `stop()` | Stops recording. Returns a promise for the video |
| `done` | A promise for the video, once recording stops |
| `recording` | Whether it's still recording |
| `type` | The video format |

```js
const recording = scene.record();
stopButton.onclick = async () => download(await recording.stop(), "clip.webm");
```

Chrome, Edge and Firefox record WebM; Safari records MP4. Check `recording.type` to name the file. `record` throws an `Error` in browsers that can't record a canvas at all.

## OBJ files

`exportOBJ(input, options)` writes meshes as the text of an OBJ file, the format [Trid loads](./obj). `input` can be:

| Input | What's written |
| --- | --- |
| A mesh | The mesh as it is |
| A scene object (`{ mesh, pos, rot, scale }`) | The mesh where the object is: its position, rotation and scale are applied |
| A list of meshes or objects | One object (`o`) each in the file |
| A `Scene` | Every object in it |

Objects are named after their `name` field when they have one (`scene.add({ name: "box", mesh })`).

What's written:

- **Vertices**, **faces**, **texture coordinates** and **normals** (when the mesh has them).
- **Lines** (`l`) for edges that aren't the side of a face, so wireframe-only meshes are kept too.
- **Material names** (`usemtl`) for meshes with [a material per face](./textures#a-texture-per-face): the names from the OBJ file it came from (`mesh.materialNames`), or the materials' `name` fields.
- Texture coordinates as they're drawn: an object whose material has a [`mapping`](./textures#texture-mapping), `textureRepeat`, `textureOffset` or `textureRotation` gets the coordinates the renderer uses, so its texture lands the same way in other programs.

Trid flips Z when it loads an OBJ file (see [Loading OBJ files](./obj#what-gets-loaded)), and `exportOBJ` flips it back. A model loaded and exported again comes out the same as the original.

| Option | Default | Meaning |
| --- | --- | --- |
| `uvs` | `true` | Write texture coordinates |
| `normals` | `true` | Write the mesh's normals, when it has them |
| `lines` | `true` | Write edges that aren't the side of a face |
| `precision` | `6` | Decimals kept in numbers. Fewer makes smaller files |
| `header` | `"Exported by Trid"` | Comment at the top of the file; `""` for none |
| `mtllib` | none | Name of an `.mtl` file to link. Every material then gets a name (see below) |

## Colors and textures (MTL)

OBJ files only hold shapes; colors and textures go in a separate `.mtl` file next to it, and the textures in image files. `exportModel` gives you all of them:

```js
const files = await exportModel(scene, { name: "sword" });
// sword.obj, sword.mtl, sword_blade.png...
for (const f of files) await download(f.data, f.name);
```

Save them in the same folder (or zip them into one download) and the model opens with its colors and textures in Blender and other 3D programs.

Or write the two text files yourself:

```js
download(exportOBJ(scene, { mtllib: "scene.mtl" }), "scene.obj");
download(exportMTL(scene), "scene.mtl");
```

- Each material object gets **one name**, used by the OBJ's `usemtl` lines and the MTL's `newmtl` blocks: its `name` field, or the object's name (`sword`, or `sword_1` for an object's second material). Materials shared by several objects are written once.
- The MTL has each material's fill (`Kd`; white under a texture), see-through fills as `d`, and the texture's file name (`map_Kd`), `name.png` by default. Pass `textureFile: (name, texture) => "textures/" + name + ".png"` to change it.
- `objMaterials(input)` lists the materials with their names, textures and file names, to save the textures yourself. `textureToBlob(texture)` turns one into a PNG.
- `exportMTL` also takes plain descriptions: `exportMTL([{ name: "red", fill: "#f00" }, { name: "skin", texture: "skin.png" }])`.
