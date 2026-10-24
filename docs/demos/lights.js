import { Scene, makeShape, gridHelper, WebGLRenderer, OrbitCamera } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 360, camera: { y: 0.7, z: -2.6 },
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
    lights: [
      { type: "ambient", intensity: 0.12 },
      { type: "directional", direction: { x: -0.5, y: 1, z: -0.8 }, intensity: 0.3 },
      { type: "point", position: { x: 0, y: 0.4, z: 0 }, color: "#ff6a3d", intensity: 2.2, range: 2.2 },
      { type: "point", position: { x: 0, y: 0.4, z: 0 }, color: "#3d8bff", intensity: 2.2, range: 2.2 },
    ],
  });
  const [, , warm, cold] = scene.lights;

  scene.add(gridHelper({ size: 3, divisions: 30 }));
  const ball = makeShape("sphere", { r: 0.22, rings: 20, segments: 28 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    scene.add({ mesh: ball, pos: { x: Math.cos(a) * 0.7, y: 0.22, z: Math.sin(a) * 0.7 }, material: { fill: "#ffffff", smooth: true } });
  }
  scene.add({ mesh: makeShape("plane", { size: 3, div: 1 }), pos: { x: 0, y: -0.002, z: 0 }, material: { fill: "#55555c" } });
  // Little bulbs where the point lights are
  const bulb = makeShape("sphere", { r: 0.03 });
  const bulbs = [warm, cold].map((l) => scene.add({ mesh: bulb, pos: l.position, material: { fill: l.color, shade: false } }));

  scene.use(new OrbitCamera({ pitch: -0.4 }));
  scene.start((dt, time) => {
    // The two lights circle in opposite directions
    warm.position.x = Math.cos(time) * 1.1;
    warm.position.z = Math.sin(time) * 1.1;
    cold.position.x = Math.cos(-time + 2) * 1.1;
    cold.position.z = Math.sin(-time + 2) * 1.1;
    bulbs.forEach((b, i) => (b.pos = [warm, cold][i].position));
  });
  return () => scene.destroy();
}
