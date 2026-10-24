# Post effects

Post effects change the whole picture after the scene is drawn: a glow around bright parts, darker corners, color grading, film grain. Put them in `scene.post`; they run in order, each on the result of the one before. Tools (gizmos, labels) draw on top afterwards, so they aren't affected.

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

## How it works

With post effects on, the WebGL renderer draws the scene into a texture instead of straight to the screen, then each pass draws the next picture from it. On WebGL 2 it keeps antialiasing (multisampling); on WebGL 1, edges get a little rougher while post effects are on. The textures are freed when post effects stay off for a while.
