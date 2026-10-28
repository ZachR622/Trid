# Post effects

Post effects change the whole picture after the scene is drawn: a glow around bright parts, darker corners, color grading, film grain, cartoon outlines. Put them in `scene.post`; they run in order, each on the result of the one before. Tools (gizmos, labels) draw on top afterwards, so they aren't affected.

```js
import { bloom, vignette, grade, grain } from "./trid/index.js";

const scene = new Scene(canvas, {
  renderer: new WebGLRenderer(),
  post: [bloom(), grade({ saturation: 1.2 }), vignette()],
});
```

<Demo src="post" hint="click to turn the effects off one by one · drag to orbit" />

<<< @/demos/post.js

::: tip Use WebGL for post effects
With the [WebGL renderer](./renderers) they're shaders that run on the graphics card. The canvas renderer uses each effect's canvas version (CSS filters and overlays): close, but bloom is an approximation and needs a browser with canvas `filter` support.
:::

## Built-in effects

| Effect | Options (defaults) | What it does |
| --- | --- | --- |
| `bloom()` | `threshold` (0.7), `strength` (0.8), `radius` (1) | A glow around the parts brighter than `threshold` (0..1). `radius` 1 spreads about 25 pixels |
| `vignette()` | `strength` (0.5), `radius` (0.5), `softness` (0.5), `color` (`"#000000"`) | Darkens the corners. `radius` is where it starts (0 = center, 1 = corners), `softness` how far it takes to reach `strength` |
| `grade()` | `brightness` (1), `contrast` (1), `saturation` (1), `tint` (`"#ffffff"`) | Color grading, in that order, like the CSS filters of the same names. `saturation: 0` is black and white |
| `grain()` | `amount` (0.08), `size` (1), `animated` (`true`) | Film grain: random noise, new every frame unless `animated` is false |
| `outline()` | `color` (`"#1a1a1a"`), `width` (2), `creases` (40), `depth` (1), `objects` | Cartoon lines around objects and along their sharp edges. See [Outlines](#outlines) |

Settings live in `uniforms`, read every frame, like [material effects](./effects#changing-settings). `enabled: false` turns an effect off without removing it:

```js
const glow = bloom();
scene.post.push(glow);
glow.uniforms.uStrength = 1.5;
glow.enabled = false;
```

| Effect | Uniforms |
| --- | --- |
| `bloom` | `uThreshold`, `uStrength`, `uRadius` |
| `vignette` | `uStrength`, `uRadius`, `uSoftness`, `uColor` |
| `grade` | `uBrightness`, `uContrast`, `uSaturation`, `uTint` |
| `grain` | `uAmount`, `uGrain` (size), `uAnimated` |
| `outline` | `uColor`, `uWidth`, `uCreaseAngle` (180 = no inner lines), `uDepth` |

## Outlines

`outline()` draws lines like a cartoon: around each object, where one object passes in front of another, and inside an object where its surface turns sharply (a cube's edges, a fox's ear against its head). With [`toon()`](./effects) shading, it gives the hand-drawn look:

```js
import { outline, toon } from "./trid/index.js";

scene.post.push(outline({ color: "#2b1d16", width: 2.5 }));
scene.add({ mesh, material: { fill: "#f0843a", smooth: true, effects: [toon()] } });
```

<Demo src="outline" hint="click: outer lines only, then no lines · drag to orbit" />

<<< @/demos/outline.js

| Option | Default | What it does |
| --- | --- | --- |
| `color` | `"#1a1a1a"` | Line color. A see-through color makes see-through lines |
| `width` | 2 | Line width in pixels (up to 16 with WebGL) |
| `creases` | 40 | An inner line where the surface turns by more than this many degrees. `false`: outer lines only |
| `depth` | 1 | How small a jump in distance still makes a line. Higher finds smaller steps (a book on a table); 0 turns these lines off, leaving creases |
| `objects` | all | Only outline these objects (and their children) |

Smooth surfaces only get inner lines where their shading keeps a hard edge: a [`smooth`](./faces) sphere gets none, a cube gets all twelve edges. Lines are drawn on the nearer side of each edge, so they hug the object in front.

The WebGL renderer finds the lines in the picture, from the faces' depth and normals. The canvas renderer draws the meshes' outer edges and creases as lines, sorted with the faces: close, but a little more angular on curved shapes.

## Writing your own

A post effect is a plain object with GLSL code defining `vec4 post(vec4 color, Frame f)`, run for every pixel. `color` is the picture at that pixel:

```js
const scanlines = {
  name: "scanlines",
  uniforms: { uDark: 0.25 },
  glsl: `
vec4 post(vec4 color, Frame f) {
  float line = mod(floor(f.uv.y * f.size.y), 2.0);
  return vec4(color.rgb * (1.0 - uDark * line), color.a);
}`,
};
scene.post.push(scanlines);
```

| In GLSL | Meaning |
| --- | --- |
| `f.uv` | Position in the picture, 0 to 1 (0, 0 = bottom left) |
| `f.size` | Size of the picture being made, in pixels |
| `f.texel` | One pixel of the input picture, in `uv` units (to read neighbors) |
| `f.time` | Seconds since the renderer started |
| `f.background` | The scene's background color |
| `frame(uv)` | The input picture at any point |
| `source(uv)` | The picture this effect started from (differs from `frame` in later passes) |

Colors are premultiplied by alpha, which is the same as plain colors when the scene's background is opaque.

### Reading depth and normals

Set `geometry: true` and the effect can also read the scene's shape, for outlines, fog by distance, or edge glows. The WebGL renderer then draws the opaque faces' depth and normals once more, into a picture only those effects read (one extra draw of the scene, only while such an effect is on):

| In GLSL | Meaning |
| --- | --- |
| `depthAt(uv)` | Distance from the camera along its view, in scene units. `f.far` or more where nothing is drawn |
| `normalAt(uv)` | The surface's normal, in camera space (z points away from the camera, so faces you see have z < 0) |
| `maskAt(uv)` | 1 on the effect's `objects` (all objects without a list), else 0 |
| `f.near`, `f.far` | The camera's near and far distances |

```js
const distanceFog = {
  geometry: true,
  uniforms: { uFogColor: "#cfe6f5", uStart: 2, uEnd: 12 },
  glsl: `
vec4 post(vec4 color, Frame f) {
  float k = smoothstep(uStart, uEnd, depthAt(f.uv));
  return mix(color, uFogColor, k);
}`,
};
```

Only faces count, not lines or see-through faces. The canvas renderer has no depth picture: give such an effect a `canvas` version if it needs one.

### Several passes

Blurs need more than one pass. Give `passes` instead of `glsl`: each `{ glsl, scale }` runs on the previous one's result, at `scale` × the canvas size (0.5 = half, cheaper). `bloom` is made of four: keep the bright parts at half size, blur across, blur down, then add onto `source(uv)`.

```js
const softFocus = {
  uniforms: { uMix: 0.5 },
  passes: [
    { scale: 0.25, glsl: "vec4 post(vec4 color, Frame f) { return color; }" }, // a small copy: blurry when stretched back
    { glsl: "vec4 post(vec4 color, Frame f) { return mix(source(f.uv), color, uMix); }" },
  ],
};
```

### Canvas version

For the canvas renderer, give the effect a `canvas(ctx, frame, uniforms)` function that changes the canvas directly. `frame` has `width`, `height`, `time`, `background`, `canvas` and `rgba(value)` (a CSS color → [r, g, b, a] from 0 to 1). The context is saved before and restored after.

```js
scanlines.canvas = (ctx, f, u) => {
  ctx.fillStyle = `rgba(0, 0, 0, ${u.uDark})`;
  for (let y = 0; y < f.height; y += 2) ctx.fillRect(0, y, f.width, 1);
};
```

An effect with only a `canvas` function also works with WebGL: it runs after the GPU effects.

`outline()` has no `canvas` function: it sets `contour: true` instead, which asks the canvas renderer to draw the meshes' silhouettes and creases as lines with the effect's `uColor`, `uWidth` and `uCreaseAngle`.

## How it works

With post effects on, the WebGL renderer draws the scene into a texture instead of straight to the screen, then each pass draws the next picture from it. On WebGL 2 it keeps antialiasing (multisampling); on WebGL 1, edges get a little rougher while post effects are on. Effects with `geometry: true` add one more picture of the scene's depth and normals (not antialiased, so lines from it are a little sharp-edged). The textures are freed when post effects stay off for a while.
