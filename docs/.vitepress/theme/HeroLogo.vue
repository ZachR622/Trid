<script setup lang="ts">
// The home page logo: a cube, drawn live by Trid.
// It sits still; drag it to turn it around.
import { ref, onMounted } from "vue";
import { drawInstance } from "../../../trid/render/draw.js";
import { makeShape } from "../../../trid/render/shapes.js";
import { cameraForward } from "../../../trid/math/transform.js";

const canvas = ref<HTMLCanvasElement>();

const cube = {
  mesh: makeShape("cube", { size: 0.75 }),
  pos: { x: 0, y: 0, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

// The camera circles the cube (like OrbitCamera), starting at a 3/4 view from above
const DISTANCE = 2.05;
const SPEED = 0.01; // radians per dragged pixel
const MAX_PITCH = Math.PI / 2 - 0.01;
const camera = { x: 0, y: 0, z: 0, yaw: -0.6, pitch: -0.45, fov: 0.9 };

function placeCamera() {
  camera.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, camera.pitch));
  const f = cameraForward(camera);
  camera.x = -f.x * DISTANCE;
  camera.y = -f.y * DISTANCE;
  camera.z = -f.z * DISTANCE;
}

onMounted(() => {
  const el = canvas.value!;
  const ctx = el.getContext("2d")!;
  const { width: w, height: h } = el;

  const draw = () => {
    placeCamera();
    ctx.clearRect(0, 0, w, h);
    drawInstance(ctx, cube, camera, w, h, "#e9806e", 6);
  };

  let last: { x: number; y: number } | null = null;
  el.addEventListener("pointerdown", (e) => {
    last = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!last) return;
    camera.yaw += (e.clientX - last.x) * SPEED;
    camera.pitch -= (e.clientY - last.y) * SPEED;
    last = { x: e.clientX, y: e.clientY };
    draw();
  });
  const end = () => (last = null);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  draw();
});
</script>

<template>
  <canvas ref="canvas" class="hero-logo" width="960" height="600" aria-label="Trid logo: a cube you can drag to rotate" role="img"></canvas>
</template>

<style scoped>
.hero-logo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(520px, 92vw);
  aspect-ratio: 16 / 10;
  transform: translate(-50%, -50%);
  touch-action: none;
}

.hero-logo:active {
  cursor: grabbing;
}
</style>
