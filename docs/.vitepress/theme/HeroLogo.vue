<script setup lang="ts">
// The home page logo: the fox from docs/demos/fox.js on its round platform, drawn
// live by Trid on a see-through canvas. It stays still; drag to turn around it.
import { ref, onMounted, onBeforeUnmount } from "vue";

const canvas = ref<HTMLCanvasElement>();
let destroy: (() => void) | undefined;
let unmounted = false;

onMounted(async () => {
  // Loaded here, so the fox is only built in the browser
  const [{ Scene, WebGLRenderer, OrbitCamera }, { makeFox, makePlatform }] = await Promise.all([
    import("../../../trid/index.js"),
    import("../../demos/fox.js"),
  ]);
  if (unmounted) return;
  const el = canvas.value!;
  const p = (x: number, y: number, z: number) => ({ x, y, z });

  const webgl = WebGLRenderer.isSupported();
  const scene = new Scene(el, {
    background: "transparent",
    camera: { fov: 0.6 },
    renderer: webgl ? new WebGLRenderer() : undefined,
    lights: [
      { type: "ambient", intensity: 0.55 },
      { type: "directional", direction: p(-0.4, 0.8, 1), intensity: 0.6, color: "#fff4e6" },  // key, from the front
      { type: "directional", direction: p(0.5, -0.3, 0.6), intensity: 0.25, color: "#fff4e6" }, // fill from below, so the chin isn't dark
      { type: "directional", direction: p(0.6, 0.6, -1), intensity: 0.45, color: "#ffe9d6" },  // rim, from behind
    ],
  });
  scene.add(makePlatform());
  // Without WebGL the canvas renderer sorts and draws every face itself: a lighter fox keeps it smooth
  scene.add(makeFox({ detail: webgl ? 1 : 0.5 }));

  // Turns only when dragged: no auto-rotate, and no zoom or pan (the page keeps its scroll)
  scene.use(new OrbitCamera({ target: p(0, 0.33, 0), distance: 2.6, yaw: Math.PI + 0.5, pitch: -0.28, zoom: false, pan: false }));

  scene.start(() => {
    // The renderers paint the background each frame; a see-through one needs clearing here
    scene.ctx.clearRect(0, 0, el.width, el.height);
  });
  destroy = () => scene.destroy();
});

onBeforeUnmount(() => {
  unmounted = true;
  destroy?.();
});
</script>

<template>
  <canvas ref="canvas" class="hero-logo" width="960" height="600" aria-label="Trid logo: a fox made in code, drag to turn around it" role="img"></canvas>
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
  cursor: grab;
}

.hero-logo:active {
  cursor: grabbing;
}
</style>
