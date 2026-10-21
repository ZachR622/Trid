/**
 * Turns any CSS color into [r, g, b, a], using the canvas to understand it.
 * Unknown colors come out black.
 *
 * @param {CanvasRenderingContext2D} ctx - Any 2D context (only used to read the color)
 * @param {string} color - Any CSS color
 * @returns {number[]} [r, g, b, a] with r, g, b in 0..255 and a in 0..1
 */
export function parseColor(ctx, color) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillStyle = color;
  const s = String(ctx.fillStyle);
  ctx.restore();

  if (s[0] === "#") {
    const hex = s.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1);
  }
  const nums = (s.match(/[\d.]+/g) ?? []).map(Number);
  return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0, nums[3] ?? 1];
}
