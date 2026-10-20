/**
 * Runs a callback every animation frame using requestAnimationFrame.
 *
 * The callback receives:
 * - `dt`: seconds since the previous frame (0 on the first frame),
 *   capped at `maxDt` so a hidden tab doesn't cause a big jump
 * - `time`: seconds since the loop started
 *
 * Typical usage:
 *   const stop = loop((dt) => { ... });
 *   stop(); // later, to end the loop
 *
 * @param {(dt:number, time:number) => void} update - Called once per frame
 * @param {Object} [opts]
 * @param {number} [opts.maxDt=0.1] - Largest dt passed to `update`, in seconds
 * @returns {() => void} Function that stops the loop
 */
export function loop(update, { maxDt = 0.1 } = {}) {
  let running = true;
  let id = 0;
  let start = null;
  let last = null;

  function frame(now) {
    if (!running) return;

    if (start === null) start = last = now;
    const dt = Math.min(Math.max(now - last, 0) / 1000, maxDt);
    last = now;

    update(dt, (now - start) / 1000);

    if (running) id = requestAnimationFrame(frame);
  }

  id = requestAnimationFrame(frame);

  return function stop() {
    running = false;
    cancelAnimationFrame(id);
  };
}
