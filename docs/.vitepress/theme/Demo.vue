<script setup lang="ts">
// Runs a live demo from docs/demos/<src>.js on a canvas.
// A demo file exports a function that gets the canvas and returns
// a cleanup function. It starts when it scrolls into view and is
// cleaned up when you leave the page.
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{ src: string; hint?: string }>();

const demos = import.meta.glob("../../demos/*.js");
const canvas = ref<HTMLCanvasElement>();
const error = ref("");

let cleanup: (() => void) | undefined;
let observer: IntersectionObserver | undefined;
let disposed = false;

async function run() {
  const load = demos[`../../demos/${props.src}.js`];
  if (!load) {
    error.value = `Unknown demo: ${props.src}`;
    return;
  }
  try {
    const mod = (await load()) as { default: (c: HTMLCanvasElement) => (() => void) | void };
    if (disposed) return;
    cleanup = mod.default(canvas.value!) ?? undefined;
  } catch (e) {
    console.error(e);
    error.value = (e as Error).message;
  }
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer?.disconnect();
      run();
    },
    { rootMargin: "200px" },
  );
  observer.observe(canvas.value!);
});

onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  cleanup?.();
});
</script>

<template>
  <div class="trid-demo">
    <canvas ref="canvas"></canvas>
    <div v-if="hint" class="trid-demo-hint">{{ hint }}</div>
    <div v-if="error" class="trid-demo-error">Demo failed to run: {{ error }}</div>
  </div>
</template>
