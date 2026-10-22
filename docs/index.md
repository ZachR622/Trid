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
  - icon: 🎨
    title: Filled faces
    details: Fill and shade any mesh with a material, or keep it as a wireframe. Faces are sorted so near ones cover far ones.
    link: /faces
  - icon: ⚡
    title: Canvas 2D or WebGL
    details: Draw with the plain canvas, or switch to WebGL for exact depth and big models. Same scene, same code.
    link: /renderers
  - icon: ✨
    title: Effects
    details: Toon, rim glow, gradients and fog, stacked on any material, or your own shaders in a few lines of GLSL.
    link: /effects
  - icon: 🖼️
    title: Textures
    details: Images, canvases or videos on faces. Wrap them by shape (box, sphere, cylinder…), tile and scroll them, or give each face its own.
    link: /textures
  - icon: 💾
    title: Export
    details: Save screenshots and videos of the canvas, or your meshes as OBJ files for Blender and other 3D programs.
    link: /export
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
