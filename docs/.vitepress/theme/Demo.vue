<script setup lang="ts">
// Runs a live demo from docs/demos/<src>.js on a canvas.
// A demo file exports a function that gets the canvas and returns
// a cleanup function. It runs only while it's on screen: it starts when
// it scrolls into view, is cleaned up when it scrolls out (so a page of
// demos doesn't run them all at once), and starts again when it's back.
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = defineProps<{ src: string; hint?: string }>();

const demos = import.meta.glob("../../demos/*.js");
const canvas = ref<HTMLCanvasElement>();
const error = ref("");

let cleanup: (() => void) | undefined;
let observer: IntersectionObserver | undefined;
let disposed = false;
let visible = false;
let running = false;

async function run() {
  const load = demos[`../../demos/${props.src}.js`];
  if (!load) {
    error.value = `Unknown demo: ${props.src}`;
    return;
  }
  try {
    const mod = (await load()) as { default: (c: HTMLCanvasElement) => (() => void) | void };
    if (disposed || !visible || running) return;
    running = true;
    cleanup = mod.default(canvas.value!) ?? undefined;
  } catch (e) {
    console.error(e);
    error.value = (e as Error).message;
  }
}

function stop() {
  if (!running) return;
  running = false;
  cleanup?.();
  cleanup = undefined;
  // Demos add buttons next to the canvas and listeners on it: start the next run clean
  const fresh = canvas.value!.cloneNode() as HTMLCanvasElement;
  canvas.value!.replaceWith(fresh);
  canvas.value = fresh;
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) run();
      else stop();
    },
    { rootMargin: "100px" },
  );
  observer.observe(canvas.value!.parentElement!);
});

onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  stop();
});
</script>

<template>
  <div class="trid-demo">
    <canvas ref="canvas"></canvas>
    <div v-if="hint" class="trid-demo-hint">{{ hint }}</div>
    <div v-if="error" class="trid-demo-error">Demo failed to run: {{ error }}</div>
  </div>
</template>
