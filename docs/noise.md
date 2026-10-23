# Random & noise

Seeded random numbers and smooth noise, for building shapes and textures in code: rocks, terrain, clouds, wood. The same seed always gives the same result, so a model can be built again exactly.

```js
import { rng, noise2, noise3, fbm2, fbm3 } from "./trid/index.js";
```

<Demo src="noise" hint="a sphere displaced with fbm3 · a plane lifted with fbm2 — drag to orbit" />

<<< @/demos/noise.js

## `rng(seed = 0)`

Returns a function that gives the next random number in [0, 1) each time you call it. Use it instead of `Math.random` when the same seed must give the same model.

```js
const random = rng(42);
const trees = Array.from({ length: 20 }, () => ({ x: random() * 10 - 5, z: random() * 10 - 5 }));
```

## `noise2(x, y, opts?)` and `noise3(x, y, z, opts?)`

Smooth noise in [0, 1): random at whole coordinates, blended smoothly in between. Nearby points get nearby values, which is what makes it look natural. Multiply the coordinates to change the size of the blobs: `noise2(x * 4, y * 4)` has blobs four times smaller.

| Option | Default | Meaning |
| --- | --- | --- |
| `seed` | `0` | Whole number. Another seed gives other noise |
| `period` | `0` | Repeat every this many units on every axis (a whole number). `0` never repeats |

Use `noise3` (or `fbm3`) at a mesh's vertex positions to displace a closed shape like a sphere: sampled in 3D, it has no seam where the texture coordinates wrap around.

## `fbm2(x, y, opts?)` and `fbm3(x, y, z, opts?)`

Fractal noise ("fractional Brownian motion"): several layers (*octaves*) of noise added together, each twice as fine and half as strong as the one before. Big shapes with small details on top, like real terrain or rock. The result is in about [0, 1) and averages 0.5.

| Option | Default | Meaning |
| --- | --- | --- |
| `octaves` | `5` | Layers of detail. More is finer but slower |
| `gain` | `0.5` | Strength of each layer compared to the one before. Higher is rougher |
| `seed` | `0` | Whole number. Another seed gives other noise |
| `period` | `0` | Repeat every this many units (a whole number). `0` never repeats |

## Seamless textures

With `period`, the noise repeats, so a texture painted with it tiles with no visible seam. Map the texture's width to `period` units:

```js
const size = 256, p = 4; // 4 blobs across the texture
const tex = document.createElement("canvas");
tex.width = tex.height = size;
const ctx = tex.getContext("2d");
const img = ctx.createImageData(size, size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const n = fbm2((x / size) * p, (y / size) * p, { period: p });
    const i = (y * size + x) * 4;
    img.data.set([90 + n * 120, 60 + n * 80, 30 + n * 40, 255], i); // brown
  }
}
ctx.putImageData(img, 0, 0);

scene.add({ mesh: makeShape("sphere"), material: { texture: tex, textureRepeat: { u: 2, v: 1 } } });
```

::: tip
Noise is cheap, but a 1024 × 1024 texture with 5 octaves is 5 million calls. Paint textures once, not every frame, and prefer a smaller size with `textureRepeat`.
:::

## On meshes

Combine noise with [`displaceMesh`](./shapes#displacemesh-mesh-fn) or the plane's `height` option:

```js
// A lumpy rock
const rock = displaceMesh(makeShape("sphere", { rings: 16, segments: 32 }), (v) => {
  const k = 0.8 + 0.4 * fbm3(v.x * 4, v.y * 4, v.z * 4, { seed: 7 });
  return { x: v.x * k, y: v.y * k, z: v.z * k };
});

// Rolling hills
const hills = makeShape("plane", { size: 4, div: 64, height: (x, z) => 0.5 * fbm2(x, z) });
```
