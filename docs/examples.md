# Examples

Small complete programs. Each one is the exact code running above it.

## Orbits

A moon orbiting a planet orbiting a sun. There's no parent/child system yet, so each frame computes the moon's position from the planet's.

<Demo src="solar" hint="Drag to orbit · scroll to zoom" />

<<< @/demos/solar.js

## Animated mesh

Meshes are plain data, so you can change vertices every frame. Don't share a mesh you rewrite like this — every object using it would change too.

<Demo src="wave" hint="Drag to orbit" />

<<< @/demos/wave.js

## Labels with a custom tool

A tool's `draw` runs after the objects, so it can write text on top. `worldToScreen` finds where a 3D point lands on the canvas.

<Demo src="labels" hint="Drag to orbit — labels follow" />

<<< @/demos/labels.js

## Tunnel

Rings rushing toward the camera, recycled when they pass it. The near plane clips them cleanly as they go by.

<Demo src="tunnel" />

<<< @/demos/tunnel.js
