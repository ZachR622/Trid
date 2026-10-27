import { Scene, parseOBJ, fixWinding, OrbitCamera, ObjUploader } from "./trid/index.js";

// A small house, written as OBJ text, shown until you load your own file
const HOUSE = `
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 1 -1
v  1 1 -1
v  1 1  1
v -1 1  1
v  0 1.7 -1
v  0 1.7  1
f 1 2 3 4
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 5 6 9
f 7 8 10
f 5 9 10 8
f 6 7 10 9
`;

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 400, lineWidth: 1, color: "#00000066", camera: { z: -2, fov: 1.1 },
  });

  // fit: 1 scales and centers the model to fit in a 1-unit box.
  // Files often have some faces turned the wrong way: fixWinding turns them all outward.
  const look = { fill: "#E9806E", wireframe: true };
  const house = scene.add({ mesh: fixWinding(parseOBJ(HOUSE, { fit: 1 })), material: look });

  scene.use(new OrbitCamera({ pitch: -0.3, yaw: -0.5 }));
  const uploader = scene.use(new ObjUploader({
    hint: "",
    onLoad: (obj, file) => {
      scene.remove(house);
      fixWinding(obj.mesh);
      obj.material ??= { ...look, smooth: true }; // files without a .mtl get the same look
      status.textContent = `${file.name} · ${obj.mesh.vertices.length} vertices · ${obj.mesh.faces?.length ?? 0} faces`;
    },
    onError: (err) => (status.textContent = err.message),
  }));

  // A button that opens the file dialog, over the top-right corner of the canvas
  const bar = document.createElement("div");
  bar.className = "trid-demo-bar";
  const button = document.createElement("button");
  button.textContent = "Choose .obj file";
  button.onclick = () => uploader.open();
  const status = document.createElement("span");
  bar.append(status, button);
  canvas.parentElement.append(bar);

  scene.start();

  return () => {
    scene.destroy();
    bar.remove();
  };
}
