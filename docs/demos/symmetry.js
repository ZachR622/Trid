import {
  Scene, makeShape, extrude, displaceMesh, transformMesh, fbm3,
  mirrorMesh, symmetrizeMesh, arrayMesh, radialArrayMesh, OrbitCamera,
} from "./trid/index.js";

// Mirror: half a heart, drawn on the right of x = 0, mirrored to the left and welded at the seam
const halfHeart = extrude(
  [{ x: 0, y: -0.2 }, { x: 0.13, y: -0.05 }, { x: 0.19, y: 0.07 }, { x: 0.16, y: 0.16 }, { x: 0.08, y: 0.18 }, { x: 0, y: 0.11 }],
  0.08,
);
const heart = mirrorMesh(halfHeart, { axis: "x" });

// Symmetrize: a lumpy, lopsided rock, made exactly symmetric from its right side
const lumpy = displaceMesh(makeShape("sphere", { r: 0.17 }), (v) => {
  const k = 1 + 0.5 * (fbm3(v.x * 6 + 3, v.y * 6, v.z * 6) - 0.5);
  return { x: v.x * k, y: v.y * k * 1.2, z: v.z * k };
});
const mask = symmetrizeMesh(lumpy, { axis: "x", keep: "+" });

// Array: a spiral staircase, each step a bit higher and turned 1/12 of a turn
const step = transformMesh(makeShape("box", { w: 0.15, h: 0.02, d: 0.05 }), { pos: { x: 0.1, y: -0.2, z: 0 } });
const stairs = arrayMesh(step, { count: 12, offset: { y: 0.035 }, rotate: { y: Math.PI / 6 } });

// Radial array: 7 petals around the middle of a flower
const petal = transformMesh(makeShape("sphere", { r: 0.1 }), { pos: { x: 0.12, y: 0, z: 0 }, scale: { x: 1, y: 0.25, z: 0.45 } });
const flower = radialArrayMesh(petal, { count: 7, axis: "y" });

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 320, lineWidth: 1, camera: { z: -2, fov: 0.6 } });
  const colors = ["#E9806E", "#a0a8b8", "#e5c07b", "#c678dd"];
  [heart, mask, stairs, flower].forEach((mesh, i) => {
    scene.add({
      mesh,
      pos: { x: -0.75 + i * 0.5, y: i === 3 ? 0.05 : 0, z: 0 },
      rot: { x: i === 3 ? -1.1 : 0, y: 0, z: 0 },
      material: { fill: colors[i], smooth: i === 1 || i === 3 },
    });
  });
  scene.use(new OrbitCamera({ pitch: -0.25, autoRotate: true, autoRotateSpeed: 0.4, autoRotateDelay: 2 }));
  scene.start();
  return () => scene.destroy();
}
