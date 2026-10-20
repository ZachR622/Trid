import { Scene } from "./trid/scene.js";
import { makeShape } from "./trid/render/shapes.js";
import { FlyCamera } from "./trid/tools/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 320, lineWidth: 2, camera: { y: 0.3, z: -3 },
  });

  // A field of cubes to fly through
  const cube = makeShape("cube", { size: 0.3 });
  for (let x = -3; x <= 3; x++) {
    for (let z = 0; z <= 6; z++) {
      scene.add({ mesh: cube, pos: { x, y: 0, z }, color: `hsl(${(x + z) * 25}, 70%, 65%)` });
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
