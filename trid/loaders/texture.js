/**
 * Textures: images drawn on faces.
 *
 * A material's `texture` can be anything the canvas can draw:
 * an `<img>`, a `<canvas>`, a `<video>` or an `ImageBitmap`.
 * Canvases and videos are read again every frame, so they can change.
 */

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

/** Whether a source can change over time (canvas, video), so it's read every frame. */
export function textureIsLive(src) {
  return (typeof HTMLCanvasElement !== "undefined" && src instanceof HTMLCanvasElement)
    || (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement)
    || (typeof OffscreenCanvas !== "undefined" && src instanceof OffscreenCanvas);
}
