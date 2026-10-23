import { test } from "node:test";
import assert from "node:assert/strict";
import { OrbitCamera } from "../trid/tools/index.js";

const scene = () => ({ camera: { x: 0, y: 0, z: -2, yaw: 0, pitch: 0 } });

test("OrbitCamera doesn't auto-rotate by default", () => {
  const s = scene(), orbit = new OrbitCamera();
  orbit.attach(s);
  orbit.update(1, s);
  assert.equal(orbit.yaw, 0);
});

test("autoRotate turns by speed × dt, pauses while dragging, and waits autoRotateDelay after", () => {
  const s = scene();
  const orbit = new OrbitCamera({ autoRotate: true, autoRotateSpeed: 0.5, autoRotateDelay: 1 });
  orbit.attach(s);
  orbit.update(1, s); // idle 1 s: delay reached
  assert.equal(orbit.yaw, 0.5);

  orbit.pointerDown({ button: 0 });
  orbit.update(1, s); // dragging: paused
  assert.equal(orbit.yaw, 0.5);

  orbit.pointerUp();
  orbit.update(0.5, s); // still in the delay
  assert.equal(orbit.yaw, 0.5);
  orbit.update(0.5, s); // delay over
  assert.equal(orbit.yaw, 0.75);
  assert.equal(s.camera.yaw, 0.75);
});
