import { Scene, makeShape, OrbitCamera, FpsMeter, exportOBJ, download } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, camera: { z: -2.2, fov: 0.7 } });

  const box = scene.add({
    name: "box", mesh: makeShape("cube", { size: 0.5 }), pos: { x: -0.7, y: 0, z: 0 },
    material: { fill: "#E9806E" },
  });
  const ball = scene.add({
    name: "ball", mesh: makeShape("sphere", { r: 0.3 }), pos: { x: 0.1, y: 0, z: 0 },
    material: { fill: "#8ab4f8", smooth: true },
  });
  const ring = scene.add({
    name: "ring", mesh: makeShape("sphere", { r: 0.25, rings: 4, segments: 10 }), pos: { x: 0.85, y: 0, z: 0 },
    color: "#7ae96e", lineWidth: 2,
  });

  scene.use(new OrbitCamera({ pitch: -0.3 }));
  scene.use(new FpsMeter({ color: "#888888" }));

  // Buttons over the top-right corner of the canvas
  const bar = document.createElement("div");
  bar.className = "trid-demo-bar";
  const status = document.createElement("span");
  const button = (text, onclick) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.onclick = onclick;
    bar.append(b);
    return b;
  };
  bar.append(status);

  // 1. A still image: a new frame at twice the size, without the FPS meter
  button("Screenshot", () => {
    download(scene.screenshot({ width: 1600, height: 640, tools: false }), "trid.png");
  });

  // 2. A 3-second video of the canvas
  const rec = button("Record 3 s", async () => {
    let recording;
    try {
      recording = scene.record({ duration: 3 });
    } catch (err) {
      status.textContent = err.message;
      return;
    }
    rec.disabled = true;
    status.textContent = "● recording…";
    const video = await recording.done;
    rec.disabled = false;
    status.textContent = `${(video.size / 1e6).toFixed(1)} MB`;
    download(video, video.type.includes("mp4") ? "trid.mp4" : "trid.webm");
  });

  // 3. The objects as an OBJ file, placed where they are in the scene
  button("Export .obj", () => download(exportOBJ(scene), "trid.obj"));

  canvas.parentElement.append(bar);

  scene.start((dt) => {
    box.rot.y += dt * 0.6;
    box.rot.x += dt * 0.3;
    ring.rot.z += dt * 0.8;
    ball.pos.y = Math.sin(performance.now() / 600) * 0.15;
  });

  return () => {
    scene.destroy();
    bar.remove();
  };
}
