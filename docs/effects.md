# Effects

Effects change how a material looks: a cartoon look, a glowing edge, a color gradient, fog... Add them to a material as a list. They're applied in order, each one starting from the color the previous one produced.

```js
import { toon, rim, unlit, gradient, fog } from "./trid/render/effects.js";

scene.add({
  mesh: makeShape("sphere"),
  material: { fill: "#8ab4f8", smooth: true, effects: [toon({ steps: 3 }), rim()] },
});
```

<Demo src="effects" hint="toon · rim (animated) · gradient · custom stripes + rim · drag to orbit" />

<<< @/demos/effects.js

::: tip Use WebGL for effects
Effects are small shaders: with the [WebGL renderer](./renderers) they run for every pixel. The canvas renderer runs them once per face, which looks blockier (and custom effects need a [canvas version](#canvas-version) there).
:::

## Built-in effects

| Effect | Options (defaults) | What it does |
| --- | --- | --- |
| `toon()` | `steps` (3) | Cartoon look: the light comes in a few hard steps |
| `rim()` | `color` (`"#ffffff"`), `power` (2), `strength` (1) | A glow along the edges, where the surface turns away from you. Higher `power` = thinner glow |
| `unlit()` | — | Ignores the light: the fill color everywhere, like it glows |
| `gradient()` | `from`, `to`, `axis` (`"y"`), `min` (-0.5), `max` (0.5), `space` (`"local"`), `lit` (`true`) | Color changes along an axis. `space: "world"` measures in the world instead of the mesh |
| `fog()` | `near` (1), `far` (5), `color` (the background) | Fades into a color with distance from the camera |

Order matters: `[toon(), rim()]` draws a cartoon object with a glowing edge, while `[rim(), unlit()]` loses the rim (`unlit` replaces the color).

## Changing settings

An effect's settings live in its `uniforms` and are read every frame, so you can animate them:

```js
const glow = rim({ color: "#ffe08a" });
scene.add({ mesh, material: { fill: "#2a3550", effects: [glow] } });

scene.start((dt, time) => {
  glow.uniforms.uStrength = 0.7 + 0.5 * Math.sin(time * 2);
});
```

| Effect | Uniforms |
| --- | --- |
| `toon` | `uSteps` |
| `rim` | `uRimColor`, `uPower`, `uStrength` |
| `gradient` | `uFrom`, `uTo`, `uMin`, `uMax`, `uLit` |
| `fog` | `uNearFog`, `uFarFog`, `uFogColor` |

One effect object can be shared by many materials. They all change together.

## Writing your own

An effect is a plain object. The built-in ones are written exactly like this, so [their source](https://github.com/ZachR622/Trid/blob/master/trid/render/effects.js) is a good place to copy from.

```js
const pulse = {
  name: "pulse", // optional, shown in error messages
  uniforms: { uSpeed: 3 },
  glsl: `
vec4 effect(vec4 color, Surface s) {
  float k = 0.75 + 0.25 * sin(s.time * uSpeed);
  return vec4(color.rgb * k, color.a);
}`,
};

scene.add({ mesh, material: { fill: "#E9806E", effects: [pulse] } });
```

The `glsl` code must define **`vec4 effect(vec4 color, Surface s)`**: it gets the color so far and returns the new one. It's written in GLSL (OpenGL ES 1.0, the language of WebGL shaders). You can add helper functions next to it.

### What `s` contains

| Field | Type | Meaning |
| --- | --- | --- |
| `s.base` | `vec4` | The material's fill color, times the [texture](./textures)'s color |
| `s.uv` | `vec2` | Texture coordinates (0, 0 when the mesh has none) |
| `s.normal` | `vec3` | Unit normal in world space, facing the camera's side |
| `s.position` | `vec3` | World position |
| `s.local` | `vec3` | Position in the mesh's own space (moves with the object) |
| `s.view` | `vec3` | Unit direction from the point to the camera |
| `s.lightDir` | `vec3` | Unit direction the light comes from |
| `s.diffuse` | `float` | How much the point faces the light, 0 to 1 |
| `s.light` | `float` | The brightness Trid used: ambient + (1 − ambient) × diffuse |
| `s.ambient` | `float` | The scene's ambient level |
| `s.depth` | `float` | Distance to the camera |
| `s.time` | `float` | Seconds since the renderer started, for animation |
| `s.background` | `vec4` | The scene's background color |

The color that reaches the first effect is `s.base` × `s.light`.

### Uniforms

Every entry in `uniforms` becomes a GLSL variable with the same name. Its type comes from the value:

| Value | GLSL type |
| --- | --- |
| `2.5` | `float` |
| `true` / `false` | `float` (1 or 0) |
| `[1, 0]`, `[1, 0, 0]`, `[1, 0, 0, 1]` | `vec2`, `vec3`, `vec4` |
| `{ x, y, z }` | `vec3` |
| `"#ffe08a"` (any CSS color) | `vec4` (r, g, b, a from 0 to 1) |

Names are made unique behind the scenes, so the same effect can be used twice in one list, and two effects can use the same uniform or helper names.

### Canvas version

The canvas renderer can't run GLSL. Give your effect a `canvas` function to support it; it runs once per face:

```js
const pulse = {
  uniforms: { uSpeed: 3 },
  glsl: `...`,
  canvas: (color, s, u) => {
    const k = 0.75 + 0.25 * Math.sin(s.time * u.uSpeed);
    return [color[0] * k, color[1] * k, color[2] * k, color[3]];
  },
};
```

Colors are `[r, g, b, a]` arrays from 0 to 1, vectors are `{ x, y, z }` objects, and `s` has the same fields as in GLSL. `u` is the effect's `uniforms`; `s.rgba(value)` turns a color uniform into an array. Without a `canvas` function, the canvas renderer skips the effect.

### When something's wrong

If an effect's GLSL doesn't compile, the error is printed in the console once, and the object is drawn without its effects instead of breaking the scene.
