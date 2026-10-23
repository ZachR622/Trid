/**
 * Textures: images drawn on faces.
 *
 * A material's `texture` can be anything the canvas can draw:
 * an `<img>`, a `<canvas>`, a `<video>` or an `ImageBitmap`.
 *
 * Videos are read again every frame. Everything else, canvases included,
 * is read once: after redrawing a canvas, call `updateTexture(canvas)`, or
 * give its material `liveTexture: true` to read it every frame.
 */

/** How many times each source was updated with `updateTexture` (0 when never). */
const versions = new WeakMap();

/**
 * Loads an image to use as a texture.
 *
 * @param {string} url
 * @returns {Promise<HTMLImageElement>} The image, fully loaded
 * @throws {Error} If the image can't be loaded
 *
 * @example
 * const crate = await loadTexture("textures/crate.png");
 * scene.add({ mesh: makeShape("cube"), material: { texture: crate } });
 */
export function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Lets WebGL use images from other sites when they allow it (CORS)
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load texture ${url}`));
    img.src = url;
  });
}

/** Whether a texture source has pixels to draw yet. */
export function textureReady(src) {
  if (!src) return false;
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) {
    return src.complete && src.naturalWidth > 0;
  }
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) {
    return src.readyState >= 2;
  }
  return (src.width ?? 0) > 0 && (src.height ?? 0) > 0;
}

/** Pixel size of a texture source. */
export function textureSize(src) {
  return {
    w: src.naturalWidth || src.videoWidth || src.width || 0,
    h: src.naturalHeight || src.videoHeight || src.height || 0,
  };
}

/**
 * Whether a texture is read again every frame: videos, and any source whose
 * material has `liveTexture: true`. `liveTexture: false` freezes a video.
 *
 * @param {CanvasImageSource} src
 * @param {{ liveTexture?: boolean }} [material] - The material using it
 * @returns {boolean}
 */
export function textureIsLive(src, material) {
  return material?.liveTexture ?? (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement);
}

/**
 * Tells the renderers a texture source changed: call it after drawing on a
 * canvas used as a texture. It's read again (once) on the next frame, by
 * every renderer and every material using it.
 *
 * Canvases are read only once otherwise, which keeps them fast and sharp
 * (they get mipmaps). For a canvas redrawn every frame, set
 * `liveTexture: true` on its material instead.
 *
 * @example
 * paintClouds(canvas, seed);
 * updateTexture(canvas);
 *
 * @param {CanvasImageSource} src - The canvas (or image) that changed
 */
export function updateTexture(src) {
  if (src && typeof src === "object") versions.set(src, (versions.get(src) ?? 0) + 1);
}

/**
 * How many times `updateTexture` was called for a source (0 when never).
 * Renderers compare it with the version they read last.
 *
 * @param {CanvasImageSource} src
 * @returns {number}
 */
export function textureVersion(src) {
  return versions.get(src) ?? 0;
}
