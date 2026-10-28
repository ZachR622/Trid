<script setup lang="ts">
// The home page logo: the fox from docs/demos/fox.js on its round platform, drawn
// live by Trid on a see-through canvas. It stays still; drag to turn around it.
import { ref, onMounted, onBeforeUnmount } from "vue";

const canvas = ref<HTMLCanvasElement>();
let destroy: (() => void) | undefined;
let unmounted = false;

onMounted(async () => {
  // Loaded here, so the fox is only built in the browser
  const [{ Scene, WebGLRenderer, OrbitCamera }, { makeFox, makePlatform, foxLights }] = await Promise.all([
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
    lights: foxLights(),
  });
  scene.add(makePlatform());
  // Without WebGL the canvas renderer sorts and draws every face itself: a lighter fox keeps it smooth
  scene.add(makeFox({ detail: webgl ? 1 : 0.5 }));

  // Turns only when dragged: no auto-rotate, and no zoom or pan (the page keeps its scroll)
  scene.use(new OrbitCamera({ target: p(0, 0.33, 0), distance: 2.6, yaw: Math.PI + 0.5, pitch: -0.28, zoom: false, pan: false }));

  scene.start();
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
