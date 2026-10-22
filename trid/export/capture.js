/**
 * Saving what a scene shows: still images, videos, and a helper that
 * downloads anything as a file.
 */

/**
 * @typedef {Object} ScreenshotOptions
 * @property {string} [type="image/png"] - "image/png", "image/jpeg" or "image/webp"
 * @property {number} [quality=0.92] - For JPEG and WebP, from 0 to 1
 * @property {number} [width] - Image width in pixels (default: the canvas's).
 *   Line widths and tool overlays stay the same size in pixels.
 * @property {number} [height] - Image height in pixels (default: the canvas's)
 * @property {boolean} [tools=true] - Include what tools draw on top (FPS meter, labels…)
 */

/**
 * Draws a new frame of the scene and returns it as an image file.
 *
 * The frame is drawn on a separate canvas, so the page doesn't change
 * and it works whether or not the scene is running.
 *
 * @param {import("../scene.js").Scene} scene
 * @param {ScreenshotOptions} [opts]
 * @returns {Promise<Blob>}
 */
export function screenshot(scene, { type = "image/png", quality = 0.92, width, height, tools = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width ?? scene.canvas.width));
  canvas.height = Math.max(1, Math.round(height ?? scene.canvas.height));

  // Draw the scene on the new canvas, then put the real one back
  const saved = { canvas: scene.canvas, ctx: scene.ctx };
  scene.canvas = canvas;
  scene.ctx = canvas.getContext("2d");
  try {
    scene.renderer.render(scene);
    if (tools) scene.tools.draw(scene.ctx);
  } finally {
    scene.canvas = saved.canvas;
    scene.ctx = saved.ctx;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Trid: the browser couldn't make the image"))),
      type,
      quality,
    );
  });
}

/** Video formats to try, best first. Browsers each support a few of them. */
const VIDEO_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

/**
 * @typedef {Object} RecordOptions
 * @property {number} [fps=60] - Frames per second of the video
 * @property {string} [type] - Video format, like "video/webm" (default: the best one the browser has)
 * @property {number} [bitsPerSecond=8000000] - Quality: higher is sharper and bigger
 * @property {number} [duration] - Stop by itself after this many seconds
 *
 * @typedef {Object} Recording
 * @property {string} type - The video format being recorded
 * @property {() => Promise<Blob>} stop - Stops recording; resolves with the video
 * @property {Promise<Blob>} done - Resolves with the video once recording stops
 * @property {boolean} recording - Whether it's still recording
 */

/**
 * Records the scene's canvas as a video, everything it shows, tools included.
 * The scene has to be running (`scene.start`) for frames to be recorded.
 *
 * @param {import("../scene.js").Scene} scene
 * @param {RecordOptions} [opts]
 * @returns {Recording}
 * @throws {Error} If the browser can't record a canvas
 *
 * @example
 * const rec = scene.record({ duration: 3 });
 * download(await rec.done, "clip.webm");
 */
export function record(scene, { fps = 60, type, bitsPerSecond = 8_000_000, duration } = {}) {
  if (typeof MediaRecorder === "undefined" || !scene.canvas.captureStream) {
    throw new Error("Trid: this browser can't record a canvas (no MediaRecorder or captureStream)");
  }
  const mimeType = type ?? VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error("Trid: this browser can't record any video format Trid knows");

  const stream = scene.canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  let timer = null;
  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      clearTimeout(timer);
      for (const track of stream.getTracks()) track.stop();
      resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    };
    recorder.onerror = (e) => reject(e.error ?? new Error("Trid: recording failed"));
  });

  recorder.start(250); // hand over data every 250 ms, so a long video isn't one huge piece at the end
  if (duration != null) timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), duration * 1000);

  return {
    type: mimeType,
    done,
    get recording() {
      return recorder.state !== "inactive";
    },
    stop() {
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
  };
}

/**
 * Saves something as a file in the browser's downloads.
 *
 * @param {Blob|string|Promise<Blob|string>} data - A file (like a screenshot or video),
 *   or text (like an OBJ file)
 * @param {string} filename - Name of the saved file, like "scene.png"
 * @returns {Promise<void>}
 *
 * @example
 * download(scene.screenshot(), "scene.png");
 * download(exportOBJ(mesh), "model.obj");
 */
export async function download(data, filename) {
  const value = await data;
  const blob = value instanceof Blob ? value : new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // after the browser has started the download
}
