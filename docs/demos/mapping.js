import { Scene, makeShape, scaleMesh, WebGLRenderer, loadTexture, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, camera: { z: -2.4, fov: 0.7 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });

  // 1. A die: a list of materials, one per side of the cube (sides are numbered 0 to 5)
  const side = (pips) => {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#f5f0e6";
    g.fillRect(0, 0, 96, 96);
    g.fillStyle = pips === 1 ? "#E9806E" : "#141414";
    for (const [x, y] of PIPS[pips]) {
      g.beginPath();
      g.arc(48 + x * 26, 48 + y * 26, 9, 0, Math.PI * 2);
      g.fill();
    }
    return { texture: c };
  };
  // Opposite sides add up to 7: front/back, top/bottom, right/left
  const die = scene.add({
    mesh: makeShape("cube", { size: 0.5 }), pos: { x: -0.95, y: 0, z: 0 },
    material: [side(1), side(6), side(2), side(5), side(3), side(4)],
  });

  // 2. A tall ellipsoid with the image wrapped around like a label,
  //    repeated 4 times around and scrolled sideways every frame
  const label = scene.add({
    mesh: scaleMesh(makeShape("sphere", { r: 0.3 }), 0.8, 1.3, 0.8), pos: { x: 0, y: 0, z: 0 },
    material: { mapping: "cylinder", textureRepeat: { u: 4, v: 2 }, smooth: true },
  });

  // 3. A sphere with box mapping: each face takes the image from the side it faces most
  const boxed = scene.add({
    mesh: makeShape("sphere", { r: 0.3 }), pos: { x: 0.95, y: 0, z: 0 },
    material: { mapping: "box", smooth: true },
  });

  // On the docs site, files live under BASE_URL. In your page: loadTexture("textures/grid.png")
  loadTexture(import.meta.env.BASE_URL + "textures/grid.png").then((grid) => {
    label.material.texture = grid;
    boxed.material.texture = grid;
  });

  scene.use(new OrbitCamera({ pitch: -0.3 }));

  scene.start((dt, time) => {
    die.rot.y += dt * 0.5;
    die.rot.x += dt * 0.3;
    boxed.rot.y += dt * 0.4;
    label.material.textureOffset = { u: time * 0.1, v: 0 };
  });

  return () => scene.destroy();
}

// Pip positions on a 3 × 3 grid (-1, 0, 1)
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
