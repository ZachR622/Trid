# Examples

Small complete programs. Each one is the exact code running above it.

## Orbits

A moon orbiting a planet orbiting a sun, with [groups](./groups): each frame only changes angles, and every position follows from the tree. The sun is an unlit sphere with a point light in its middle, and [bloom](./post) makes it glow.

<Demo src="solar" hint="Drag to orbit · scroll to zoom" />

<<< @/demos/solar.js

## Waves

Meshes are plain data, so you can move their vertices every frame. Set `mesh.dirty = true` after changing them in place, so the WebGL renderer sends them again and the smooth shading follows the new shape. Don't share a mesh you rewrite like this: every object using it would change too.

<Demo src="wave" hint="Drag to orbit" />

<<< @/demos/wave.js

## Labels with a custom tool

A tool's `draw` runs after the objects, so it can write text on top. `worldToScreen` finds where a 3D point lands on the canvas.

<Demo src="labels" hint="Drag to orbit — labels follow" />

<<< @/demos/labels.js

## Tunnel

Rings rushing toward the camera, recycled when they pass it. The near plane clips them cleanly as they go by, and bloom makes the lines glow.

<Demo src="tunnel" />

<<< @/demos/tunnel.js
