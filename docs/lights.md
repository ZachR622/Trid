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

## Shadows

Give a light `shadows: true` and objects cast shadows on each other and on the floor:

```js
const scene = new Scene(canvas, {
  renderer: new WebGLRenderer(),
  lights: [
    { type: "ambient", intensity: 0.35 },
    { type: "directional", direction: { x: -0.6, y: 1, z: -0.4 }, intensity: 0.75, shadows: true },
  ],
});
```

<Demo src="shadows" hint="the sun circles · drag to orbit" />

<<< @/demos/shadows.js

Directional and point lights can both cast shadows, up to two of each at once (`MAX_SHADOWS`): the first ones in `scene.lights` with `shadows`. Others still light the scene, without shadows. A shadow takes away that light's share only, so the ambient light and other lights still reach shadowed places.

A point light's shadows spread out from it, longer the lower it is, like under a lamp:

```js
scene.lights.push({ type: "point", position: { x: 0, y: 1.2, z: 0 }, color: "#ffd9a0", range: 4, shadows: true });
```

Objects cast and receive shadows unless they say otherwise:

| Object field | Default | Meaning |
| --- | --- | --- |
| `castShadow` | `true` | `false`: this object (and its children, for a group) casts no shadow. Good for a floor, a sky, or a little bulb drawn where a point light is |
| `receiveShadow` | `true` | `false`: no shadow falls on it (WebGL) |

Only faces cast shadows: lines (wireframes) and see-through faces don't, and the see-through parts of a texture (a PNG's holes) let the light through.

Instead of `true`, `shadows` can be settings:

| Setting | Default | Meaning |
| --- | --- | --- |
| `softness` | `1.5` | Blur of the shadows' edges. `0`: sharp |
| `size` | `2048`, point lights `512` | Width of the shadow map in pixels (WebGL; a point light has six, one per side of a cube around it). Bigger is sharper, but slower |
| `bias` | `1` | Raise it if lit surfaces get dark speckles; too high and shadows come loose from their objects |
| `ground` | found | The floor's height, for the canvas renderer (see below) |

Change them at any time: `sun.shadows = { softness: 4 }`, or `sun.shadows = false`.

### With each renderer

- **WebGL** uses shadow maps: each frame, the scene is drawn once more from each light casting shadows. A directional light's map is a box fitted around the objects that cast shadows; for a big world with small details, its pixels get big too (raise `size`, or turn `castShadow` off for objects far away). A point light draws six maps, one for each side of a cube around it, reaching as far as its `range` (or the farthest object casting shadows). Every object can shade every other one, and itself.
- **The canvas renderer** draws ground shadows: the objects are flattened onto the floor along the light (spreading out from a point light), as one soft dark shape per light on the floor's faces. A point light below the floor casts none on it. The floor is the height where flat faces turned up have the most area (or `ground`), and only faces lying there get shadows: objects don't shadow each other. It's quick and suits objects standing on a floor; for more, use WebGL.

## Lights and effects

[Effects](./effects) get the light at the point they draw: `s.lightColor` (the light added up, as a color), `s.light` (its brightness), `s.diffuse` and `s.ambient`. `toon` keeps the lights' colors and steps only the brightness, and `gradient` (with `lit`) is tinted by them. See [What `s` contains](./effects#what-s-contains).

::: tip Canvas renderer
The canvas renderer lights each face at its center (or at each corner with `smooth`), so a point light close to a big face looks coarser than with [WebGL](./renderers), which lights every pixel. Textured faces can get darker or tinted under the canvas renderer, but not brighter than the image.
:::
