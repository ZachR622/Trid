# Loading OBJ files

Trid can load 3D models saved as Wavefront `.obj` files — the format almost every 3D tool (Blender, Maya, SketchUp…) can export.

```js
import { parseOBJ, loadOBJ, readOBJFile, pickOBJFile, fitMesh } from "./trid/loaders/obj.js";
import { ObjUploader } from "./trid/tools/index.js";
```

<Demo src="obj" hint="Drop an .obj file on the canvas, or use the button · drag to orbit" />

```js
import { Scene } from "./trid/scene.js";
import { OrbitCamera, ObjUploader } from "./trid/tools/index.js";

const scene = new Scene(document.getElementById("canvas"), {
  color: "#E9806E",
  camera: { z: -2 },
});
scene.use(new OrbitCamera());

// Drop an .obj on the canvas, or pick one with a button
const uploader = scene.use(new ObjUploader());
document.getElementById("open").onclick = () => uploader.open();

scene.start();
```

## From a URL

```js
const mesh = await loadOBJ("models/teapot.obj", { fit: 1 });
scene.add({ mesh });
```

## From an upload

The easiest way is the [`ObjUploader`](#objuploader) tool. To build your own upload UI, pass the `File` to `readOBJFile`:

```js
input.addEventListener("change", async () => {
  const mesh = await readOBJFile(input.files[0], { fit: 1 });
  scene.add({ mesh });
});
```

## What gets loaded

- **Vertices** (`v`), **texture coordinates** (`vt`), **normals** (`vn`), **faces** (`f`) and **lines** (`l`). Materials (`.mtl` files) and groups are skipped for now, so load textures yourself with [`loadTexture`](./textures).
- Texture coordinates are kept as `mesh.uvs` and `mesh.faceUVs`, and used by [textures](./textures).
- Normals are kept as `mesh.normals` and `mesh.faceNormals` (each face's corner normal indices), and used by [smooth shading](./faces#smooth-shading).
- Faces become **edges**, and an edge shared by two faces is drawn once.
- The mesh also keeps its **`faces`**, so a model can be [filled and shaded](./faces): `scene.add({ mesh, material: { fill: "#8ab4f8" } })`.
- **Z is flipped** on load. OBJ files are right-handed and Trid is [left-handed](./concepts), so without the flip models would come out mirrored.
- Faces or lines pointing at a vertex that doesn't exist throw an `Error` with the line number.

::: tip Use `fit`
OBJ files come in any size and are rarely centered. `{ fit: 1 }` centers the model on the origin and scales it so its largest side is 1 unit.
:::

## Functions

All of them take the same options: `{ fit }` (see above). Without `fit`, the file's own coordinates are kept.

| Function | Returns | Meaning |
| --- | --- | --- |
| `parseOBJ(text, opts?)` | mesh | Parses the text of an OBJ file |
| `loadOBJ(url, opts?)` | `Promise<mesh>` | Downloads a file, then parses it |
| `readOBJFile(file, opts?)` | `Promise<mesh>` | Parses a `File` or `Blob` (from an `<input>` or a drop) |
| `pickOBJFile()` | `Promise<File \| null>` | Opens the file dialog for `.obj` files. Call it from a click. `null` if cancelled |
| `fitMesh(mesh, size = 1)` | the same mesh | Centers and scales any mesh **in place** |

The mesh is `{ vertices, edges, faces }` (plus `normals`, `faceNormals`, `uvs` and `faceUVs` when the file has them): pass it to `scene.add({ mesh })` like any other.

## ObjUploader

A [tool](./tools) that loads `.obj` files into the scene. Drop a file on the canvas, or call `open()` from a button to show the file dialog. By default the new model replaces the last one it loaded.

```js
const uploader = scene.use(new ObjUploader());
button.onclick = () => uploader.open();
```

| Option | Default | Meaning |
| --- | --- | --- |
| `fit` | `1` | Size of the model's largest side. `null` keeps the file's units |
| `color` | scene's color | Color of loaded models |
| `replace` | `true` | Remove the previously loaded model first |
| `hint` | `"Drop an .obj file here"` | Text shown on the canvas while nothing is loaded (`""` for none) |
| `onLoad` | — | `(obj, file, scene) => void`: called after the model is added |
| `onError` | logs the error | `(err, file) => void`: called when a file can't be read |

| Member | Meaning |
| --- | --- |
| `open()` | Shows the file dialog and loads the chosen file. Returns the added object, or `null` |
| `load(file)` | Loads a `File` or `Blob`. Returns the added object, or `null` on error |
| `object` | The last object it added, or `null` |

While a file is dragged over the canvas, the tool draws a dashed border. It works whether or not the scene is running.
