import { Scene, makeShape, WebGLRenderer, loadTexture, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -2.4, fov: 0.7 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  // 1. An image file. Materials work before it loads; the texture shows up when it's ready.
  const cube = scene.add({ mesh: makeShape("cube", { size: 0.5 }), pos: { x: -1, y: 0, z: 0 }, material: {} });
  const globe = scene.add({ mesh: makeShape("sphere", { r: 0.3 }), pos: { x: -0.33, y: 0, z: 0 }, material: { smooth: true } });
  // On the docs site, files live under BASE_URL. In your page: loadTexture("textures/grid.png")
  loadTexture(import.meta.env.BASE_URL + "textures/grid.png").then((grid) => {
    cube.material.texture = grid;
    globe.material.texture = grid;
  });

  // 2. A canvas you draw on: it's read again every frame, so it can move
  const live = document.createElement("canvas");
  live.width = live.height = 128;
  const g = live.getContext("2d");
  const screen = scene.add({
    mesh: makeShape("box", { w: 0.55, h: 0.45, d: 0.1 }), pos: { x: 0.36, y: 0, z: 0 },
    material: { texture: live },
  });

  // 3. Pixel art: an 8 × 8 image, kept sharp
  const pixels = document.createElement("canvas");
  pixels.width = pixels.height = 8;
  const p = pixels.getContext("2d");
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      p.fillStyle = (x + y) % 2 ? "#E9806E" : "#f5f0e6";
      p.fillRect(x, y, 1, 1);
    }
  }
  const block = scene.add({
    mesh: makeShape("cube", { size: 0.45 }), pos: { x: 1.05, y: 0, z: 0 },
    material: { texture: pixels, pixelated: true },
  });

  scene.use(new OrbitCamera({ pitch: -0.3 }));

  scene.start((dt, time) => {
    for (const o of [cube, globe, screen, block]) o.rot.y += dt * 0.4;

    // Redraw the live texture: a bar sweeping across
    g.fillStyle = "#141414";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#7ae96e";
    g.fillRect(0, 0, ((time * 60) % 128), 128);
    g.fillStyle = "#ffffff";
    g.font = "bold 28px sans-serif";
    g.fillText(time.toFixed(1), 30, 74);
  });

  return () => scene.destroy();
}
