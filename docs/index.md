---
layout: home

hero:
  name: Trid
  text: 3D on the HTML canvas
  tagline: A small 3D renderer for the browser. No dependencies, no build step.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Examples
      link: /examples
    - theme: alt
      text: GitHub
      link: https://github.com/ZachR622/Trid

features:
  - icon: 🎬
    title: Scene
    details: One class holds your canvas, camera and objects, and runs the frame loop for you.
    link: /scene
  - icon: 🟥
    title: Shapes & meshes
    details: Cubes, boxes and spheres built in, any mesh you define yourself, or models loaded from .obj files.
    link: /shapes
  - icon: 🎥
    title: Tools
    details: Orbit and fly cameras, object dragging, hover highlight and an FPS meter, one line each.
    link: /tools
  - icon: 📐
    title: Pure math
    details: Every transform and projection step is exported, so you can use the pipeline piece by piece.
    link: /api
---

<div class="home-demo">
  <Demo src="hero" hint="Drag empty space to orbit · drag a shape to move it · scroll to zoom" />
</div>
