import { clear, drawInstance, point } from "./trid/render/draw.js";
import { loop } from "./trid/render/loop.js";
import { makeShape } from "./trid/render/shapes.js";
import { worldToScreen } from "./trid/math/transform.js";

export default function (canvas) {
  canvas.width = 800;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;

  const camera = { z: -1.5, fov: Math.PI / 3 };
  const box = {
    mesh: makeShape("box", { w: 0.8, h: 0.4, d: 0.4 }),
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0.4, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };

  const stop = loop((dt, time) => {
    box.rot.y = time * 0.8;
    clear(ctx, w, h, "#141414");
    drawInstance(ctx, box, camera, w, h, "#e5c07b", 2);

    // A dot circling the box, projected by hand
    const p = { x: Math.cos(time) * 0.7, y: 0, z: Math.sin(time) * 0.7 };
    point(ctx, worldToScreen(p, camera, w, h), "#E9806E", 8);
  });

  return stop;
}
