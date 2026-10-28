import { Scene, WebGLRenderer, OrbitCamera, exportOBJ, exportMTL, parseOBJ, parseMTL, download } from "./trid/index.js";
import { makeFox, makePlatform, foxLights } from "./fox.js";

const p = (x, y, z) => ({ x, y, z });

export default function (canvas) {
  const webgl = WebGLRenderer.isSupported();
  const scene = new Scene(canvas, {
    width: 800, height: 360, camera: { fov: 0.6 },
    renderer: webgl ? new WebGLRenderer() : undefined,
    lights: foxLights(),
  });

  // The fox made in code (a group of parts), not added to the scene...
  const fox = { children: [makePlatform(), makeFox({ detail: webgl ? 1 : 0.5 })] };

  // ...saved as the text of an OBJ file and its MTL file (the parts' colors)...
  const obj = exportOBJ(fox, { mtllib: "fox.mtl", precision: 4 });
  const mtl = exportMTL(fox);

  // ...and read back: one mesh, with a material name per face
  const mesh = parseOBJ(obj);
  const colors = parseMTL(mtl);
  const material = mesh.materialNames.map((name) => ({ fill: colors[name].fill, smooth: true }));

  scene.add({ mesh, material });

  // One button per file: browsers block a click that starts several downloads
  const bar = document.createElement("div");
  bar.className = "trid-demo-bar";
  for (const [name, text] of [["fox.obj", obj], ["fox.mtl", mtl]]) {
    const b = document.createElement("button");
    b.textContent = `${name} (${text.length < 1e5 ? `${Math.ceil(text.length / 1e3)} KB` : `${(text.length / 1e6).toFixed(1)} MB`})`;
    b.onclick = () => download(text, name);
    bar.append(b);
  }
  canvas.parentElement.append(bar);

  scene.use(new OrbitCamera({ target: p(0, 0.33, 0), distance: 2.4, yaw: Math.PI + 0.5, pitch: -0.25 }));
  scene.start();
  return () => {
    bar.remove();
    scene.destroy();
  };
}
