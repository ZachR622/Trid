import { Scene, makeShape, makeTexture, TEXTURE_STYLES, OrbitCamera, WebGLRenderer } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 380, camera: { z: -3.1 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  // Every built-in style, on a sphere (they tile, so there's no seam where the texture wraps around)
  const balls = TEXTURE_STYLES.map((style, i) => scene.add({
    mesh: makeShape("sphere", { r: 0.28, rings: 24, segments: 48 }),
    pos: { x: ((i % 5) - 2) * 0.72, y: i < 5 ? 0.38 : -0.38, z: 0 },
    material: { texture: makeTexture(style, { size: 256, scale: 3, seed: 7, grain: style === "solid" ? 0.4 : 0.1 }), smooth: true },
  }));

  scene.use(new OrbitCamera());
  scene.start((dt) => balls.forEach((b) => (b.rot.y += dt * 0.3)));
  return () => scene.destroy();
}
