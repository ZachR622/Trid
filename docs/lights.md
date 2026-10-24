# Lights

Lights decide how bright [filled faces](./faces) are. A scene has a list of them, `scene.lights`: ambient light that reaches every side, directional lights like the sun, and point lights like bulbs. Each one has a color and an intensity, and they add up.

```js
const scene = new Scene(canvas, {
  lights: [
    { type: "ambient", intensity: 0.15 },
    { type: "directional", direction: { x: -0.5, y: 1, z: -0.8 }, intensity: 0.4 },
    { type: "point", position: { x: 0, y: 0.5, z: 0 }, color: "#ff6a3d", intensity: 2, range: 2 },
  ],
});
```

<Demo src="lights" hint="two colored point lights circling · drag to orbit" />

<<< @/demos/lights.js

## Kinds of light

| `type` | Fields | Light |
| --- | --- | --- |
| `"ambient"` | `color`, `intensity` | Reaches every face from every side, the same everywhere. Faces turned away from every other light get only this |
| `"directional"` | `direction`, `color`, `intensity` | Comes from one direction, like the sun: the same at every distance. `direction` is where it comes **from** (any length) |
| `"point"` | `position`, `color`, `intensity`, `range` | Shines from a point in all directions, like a bulb. With `range`, it fades out smoothly and reaches nothing past that distance; without, it doesn't fade |

| Field | Default | Meaning |
| --- | --- | --- |
| `color` | `"#ffffff"` | Any CSS color |
| `intensity` | `1` | Multiplies the color. Lights add up, so a face can get brighter than its own color (it's then clamped) |
| `enabled` | `true` | `false` turns a light off without removing it |

A face's color is its material color × the light reaching it. For each light, that's its color × intensity × how much the face turns toward it (and, for a point light, how close it is). Ambient lights are added as they are.

Both renderers use at most `MAX_LIGHTS` (8) directional and point lights; ambient lights don't count.

## Changing lights

`scene.lights` is a plain array, read every frame. Push, splice and change fields freely:

```js
const lamp = { type: "point", position: { x: 0, y: 1, z: 0 }, color: "#ffd9a0", range: 3 };
scene.lights.push(lamp);

scene.start((dt, time) => {
  lamp.position.x = Math.sin(time);   // move it
  lamp.intensity = 1 + 0.2 * Math.sin(time * 9); // flicker
});

lamp.enabled = false; // off
```

## The default lights

Without a `lights` option, a scene has two lights, and faces look the same as they did before lights could be added:

```js
[
  { type: "ambient", color: "#ffffff", intensity: 0.25 },                                 // ambient
  { type: "directional", direction: { x: -0.5, y: 1, z: -0.8 }, color: "#ffffff", intensity: 0.75 }, // 1 - ambient
]
```

The `light` and `ambient` options set those two: `new Scene(canvas, { light: { x: 1, y: 1, z: 0 }, ambient: 0.4 })` gives a directional light from that direction at 0.6 and an ambient light at 0.4. `defaultLights(direction?, ambient?)` builds the same list.

`scene.light` and `scene.ambient` stay as shortcuts:

- `scene.light` is the direction of the first directional light (`null` if there's none). Change its fields, or set a new one.
- `scene.ambient` is the intensity of the first ambient light (0 if there's none). Setting it only changes the ambient light, not the directional one.

## Lights and effects

[Effects](./effects) get the light at the point they draw: `s.lightColor` (the light added up, as a color), `s.light` (its brightness), `s.diffuse` and `s.ambient`. `toon` keeps the lights' colors and steps only the brightness, and `gradient` (with `lit`) is tinted by them. See [What `s` contains](./effects#what-s-contains).

::: tip Canvas renderer
The canvas renderer lights each face at its center (or at each corner with `smooth`), so a point light close to a big face looks coarser than with [WebGL](./renderers), which lights every pixel. Textured faces can get darker or tinted under the canvas renderer, but not brighter than the image.
:::
