import {
  Scene, makeShape, OrbitCamera, worldToScreen, worldToCamera, DEFAULT_NEAR,
} from "./trid/index.js";

// A tool that writes each object's label above it
const labels = {
  draw(ctx, scene) {
    const { camera, canvas } = scene;
    ctx.font = "15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ddd";
    for (const obj of scene.objects) {
      const above = { x: obj.pos.x, y: obj.pos.y + 0.38, z: obj.pos.z };
      // Skip points behind the camera
      if (worldToCamera(above, camera).z < DEFAULT_NEAR) continue;
      const p = worldToScreen(above, camera, canvas.width, canvas.height);
      ctx.fillText(obj.label, p.x, p.y);
    }
  },
};

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 340, camera: { fov: 0.6 },
  });

  ["cube", "sphere", "torus"].forEach((kind, i) => scene.add({
    mesh: makeShape(kind, { size: 0.4, radius: 0.05, r: 0.25, R: 0.2, tube: 0.07 }),
    pos: { x: (i - 1) * 0.75, y: 0, z: 0 },
    material: { fill: ["#E9806E", "#7ae96e", "#8ab4f8"][i], smooth: true },
    label: kind, // any field you like: the tool below reads it
  }));

  scene.use(new OrbitCamera({ pitch: -0.2, distance: 2.4 }));
  scene.use(labels);
  scene.start((dt) => scene.objects.forEach((o) => (o.rot.y += dt * 0.4)));

  return () => scene.destroy();
}
