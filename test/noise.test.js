import { test } from "node:test";
import assert from "node:assert/strict";
import { rng, noise2, noise3, fbm2, fbm3 } from "../trid/index.js";

test("rng repeats for a seed and stays in [0, 1)", () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(Array.from({ length: 1000 }, b), xs);
  assert.notEqual(c(), xs[0]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05);
});

test("noise is in [0, 1), smooth, and changes with the seed", () => {
  const random = rng(1);
  for (let i = 0; i < 2000; i++) {
    const x = random() * 100 - 50, y = random() * 100 - 50, z = random() * 100 - 50;
    for (const n of [noise2(x, y), noise3(x, y, z), fbm2(x, y), fbm3(x, y, z)]) assert.ok(n >= 0 && n < 1);
    // Smooth: a tiny step changes it a tiny bit
    assert.ok(Math.abs(noise2(x, y) - noise2(x + 1e-4, y)) < 1e-2);
    assert.ok(Math.abs(noise3(x, y, z) - noise3(x, y, z + 1e-4)) < 1e-2);
  }
  assert.notEqual(noise2(0.5, 0.5, { seed: 1 }), noise2(0.5, 0.5, { seed: 2 }));
  assert.equal(noise2(3.3, 1.7, { seed: 5 }), noise2(3.3, 1.7, { seed: 5 }));
});

test("period makes the noise repeat, so textures tile", () => {
  const random = rng(7);
  for (let i = 0; i < 500; i++) {
    const x = random() * 10, y = random() * 10, z = random() * 10;
    near(noise2(x, y, { period: 4 }), noise2(x + 4, y - 8, { period: 4 }));
    near(fbm2(x, y, { period: 3, seed: 9 }), fbm2(x + 3, y + 3, { period: 3, seed: 9 }));
    near(noise3(x, y, z, { period: 5 }), noise3(x + 5, y, z - 5, { period: 5 }));
    near(fbm3(x, y, z, { period: 2 }), fbm3(x - 2, y + 4, z + 2, { period: 2 }));
  }
});

function near(a, b) {
  assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
}
