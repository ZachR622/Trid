import { Scene, makeShape, WebGLRenderer, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, camera: { z: -2, fov: 0.7 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  // A flat grid of 64 × 64 squares; smooth shading shows the ripples
  const water = makeShape("plane", { size: 2, div: 64 });
  scene.add({ mesh: water, material: { fill: "#5fb3d9", smooth: true, doubleSided: true } });
  scene.use(new OrbitCamera({ pitch: -0.55, distance: 2.9 }));

  scene.start((dt, t) => {
    for (const v of water.vertices) {
      const d = Math.hypot(v.x, v.z);
      v.y = Math.sin(d * 8 - t * 3) * 0.06 / (1 + d * 2); // rings moving out from the middle
    }
    water.dirty = true; // changed in place: the WebGL renderer sends it again, and normals are worked out again
  });

  return () => scene.destroy();
}
