import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { WebGLRenderer } from "./trid/render/webglRenderer.js";
import { toon, rim, edgeGlow, gradient } from "./trid/render/effects.js";
import { OrbitCamera } from "./trid/tools/index.js";

// A custom effect: stripes that scroll up over time
const stripes = {
  name: "stripes",
  uniforms: { uCount: 10, uSpeed: 0.3, uDark: "#1d2b3a" },
  glsl: `
vec4 effect(vec4 color, Surface s) {
  float band = step(0.5, fract(s.local.y * uCount - s.time * uSpeed));
  return mix(color, vec4(uDark.rgb, color.a), band);
}`,
};

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -2.4, fov: 0.7 },
    // Effects work per pixel with WebGL (the canvas renderer runs them per face)
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  const ball = makeShape("sphere", { r: 0.27 });
  const glow = rim({ color: "#ffe08a", strength: 1 });

  const objects = [
    scene.add({ mesh: ball, pos: { x: -1.05, y: 0, z: 0 }, material: { fill: "#E9806E", smooth: true, effects: [toon({ steps: 3 })] } }),
    scene.add({ mesh: ball, pos: { x: -0.35, y: 0, z: 0 }, material: { fill: "#2a3550", smooth: true, effects: [glow] } }),
    scene.add({
      mesh: makeShape("box", { w: 0.4, h: 0.6, d: 0.4 }), pos: { x: 0.35, y: 0, z: 0 },
      material: { effects: [gradient({ from: "#E9806E", to: "#8ab4f8", min: -0.3, max: 0.3 }), edgeGlow({ color: "#ffffff", strength: 0.8 })] },
    }),
    scene.add({ mesh: ball, pos: { x: 1.05, y: 0, z: 0 }, material: { fill: "#8ab4f8", smooth: true, effects: [stripes, rim()] } }),
  ];

  scene.use(new OrbitCamera({ pitch: -0.25 }));

  scene.start((dt, time) => {
    for (const o of objects) o.rot.y += dt * 0.4;
    glow.uniforms.uStrength = 0.7 + 0.5 * Math.sin(time * 2); // settings can change every frame
  });

  return () => scene.destroy();
}
