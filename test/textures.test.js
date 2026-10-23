import { test } from "node:test";
import assert from "node:assert/strict";
import { texturePixels, colorBytes, TEXTURE_STYLES } from "../trid/index.js";

const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

test("every style paints a full, opaque image, the same for the same seed", () => {
  for (const style of TEXTURE_STYLES) {
    const img = texturePixels(style, { size: 32, seed: 3 });
    assert.equal(img.data.length, 32 * 32 * 4);
    for (let i = 3; i < img.data.length; i += 4) assert.equal(img.data[i], 255);
    assert.deepEqual(texturePixels(style, { size: 32, seed: 3 }).data, img.data);
  }
  // Another seed: another texture (except the ones with no randomness)
  for (const style of ["noise", "marble", "wood", "spots", "bark"]) {
    assert.notDeepEqual(texturePixels(style, { size: 32, seed: 1 }).data, texturePixels(style, { size: 32, seed: 2 }).data);
  }
});

test("every style tiles: across each edge, pixels change no more than inside the image", () => {
  const N = 128;
  for (const style of TEXTURE_STYLES) {
    const img = texturePixels(style, { size: N, scale: 3, seed: 5, grain: 0.2 });
    let seam = 0, inside = 0, seamV = 0, insideV = 0;
    for (let i = 0; i < N; i++) {
      seam += diff(px(img, N - 1, i), px(img, 0, i));
      inside += diff(px(img, N / 2 - 1, i), px(img, N / 2, i));
      seamV += diff(px(img, i, N - 1), px(img, i, 0));
      insideV += diff(px(img, i, N / 2 - 1), px(img, i, N / 2));
    }
    // A texture that doesn't tile shows a jump at its edges much bigger than between neighbors
    assert.ok(seam <= inside * 2.5 + 40 * N / 8, `${style}: left/right seam ${seam} vs ${inside}`);
    assert.ok(seamV <= insideV * 2.5 + 40 * N / 8, `${style}: top/bottom seam ${seamV} vs ${insideV}`);
  }
});

test("colors: the two colors are the ends of the mix; a custom function picks between them", () => {
  const black = texturePixels((u) => (u < 0.5 ? 0 : 1), { size: 8, colors: ["#000", "rgb(255, 0, 0)"] });
  assert.deepEqual(px(black, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(px(black, 7, 0), [255, 0, 0, 255]);
  assert.deepEqual(colorBytes("#11223380"), [17, 34, 51, 128 / 255]);
  assert.deepEqual(colorBytes("rgba(10, 20, 30, 0.5)"), [10, 20, 30, 0.5]);
  assert.deepEqual(colorBytes([1, 2, 3]), [1, 2, 3, 1]);
  assert.throws(() => texturePixels("lava"));
});
