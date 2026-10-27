import { Scene, makeShape, gridHelper, FlyCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, camera: { y: 0.5, z: -2, pitch: -0.15 } });

  // A field of blocks on a floor grid, to fly through
  scene.add(gridHelper({ size: 14, divisions: 28 }));
  const block = makeShape("cube", { size: 0.3 });
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 6; z++) {
      scene.add({ mesh: block, pos: { x, y: 0.15, z }, material: { fill: `hsl(${(x + z) * 25}, 70%, 65%)` } });
    }
  }

  // Only take the keyboard while the canvas is being used
  const fly = new FlyCamera({ speed: 2, lookSpeed: 0 });
  const release = (e) => {
    if (e.target !== canvas) scene.unuse(fly);
  };
  canvas.addEventListener("pointerdown", () => scene.use(fly));
  document.addEventListener("pointerdown", release);

  scene.start();

  return () => {
    document.removeEventListener("pointerdown", release);
    scene.destroy();
  };
}
