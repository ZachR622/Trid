/**
 * A modifier stack, like Blender's: a list of modeling steps applied in
 * order to a mesh, kept as data. Change a number, apply the list again to
 * the original mesh, and get the new result; save the list, send it, or
 * write it by hand (or have it written).
 *
 *   const blade = applyModifiers(base, [
 *     { type: "mirror", axis: "x" },
 *     { type: "taper", axis: "y", amount: 0.2 },
 *     { type: "subdivide", levels: 2 },
 *   ]);
 *
 * Each step is `{ type, ...options }`, with the options of the function it
 * stands for. `enabled: false` skips a step. The original mesh is never
 * changed. Add your own types to `MODIFIERS`.
 */
import { cloneMesh, transformMesh, meshBounds } from "../render/meshUtils.js";
import { mirrorMesh, symmetrizeMesh, bisectMesh, arrayMesh, radialArrayMesh } from "./symmetry.js";
import { subdivideMesh } from "./subdivide.js";
import { bevelMesh } from "./bevel.js";
import { booleanMesh } from "./boolean.js";
import { taperMesh, twistMesh, bendMesh, bulgeMesh } from "./deform.js";
import { sculptMesh } from "./sculpt.js";
import { remeshMesh } from "./remesh.js";
import { makeLattice, latticePoints, latticeMesh } from "./lattice.js";
import { weldVertices, cleanMesh, fixWinding } from "./cleanup.js";
import { matFromEuler, mulVec } from "../math/rotation.js";

/** A step's options without its `type` and `enabled`. */
const optionsOf = ({ type, enabled, ...rest }) => rest;

/** A lattice step's lattice: given, or made for the mesh as it is now and edited. */
function latticeFor(mesh, step) {
  if (step.lattice) return step.lattice;
  const lattice = makeLattice(mesh, { div: step.div, padding: step.padding });
  for (const [n, edit] of (step.edits ?? []).entries()) {
    const points = latticePoints(lattice, edit.select ?? {});
    if (!points.length) continue;
    // Scale and turn around the middle of the points picked
    const c = { x: 0, y: 0, z: 0 };
    for (const p of points) { c.x += p.x / points.length; c.y += p.y / points.length; c.z += p.z / points.length; }
    const s = typeof edit.scale === "number" ? { x: edit.scale, y: edit.scale, z: edit.scale } : { x: 1, y: 1, z: 1, ...edit.scale };
    const r = edit.rotate ? matFromEuler({ x: 0, y: 0, z: 0, ...edit.rotate }) : null;
    const m = { x: 0, y: 0, z: 0, ...edit.move };
    for (const p of points) {
      let d = { x: (p.x - c.x) * s.x, y: (p.y - c.y) * s.y, z: (p.z - c.z) * s.z };
      if (r) d = mulVec(r, d);
      p.x = c.x + d.x + m.x;
      p.y = c.y + d.y + m.y;
      p.z = c.z + d.z + m.z;
      if (!Number.isFinite(p.x + p.y + p.z)) throw new Error(`edit ${n + 1} gives a point that isn't finite numbers`);
    }
  }
  return lattice;
}

/**
 * The modifier types `applyModifiers` knows, by name: each a function of
 * the mesh so far and the step, returning the new mesh (or changing it in
 * place and returning nothing; it's the stack's own copy). Add your own:
 *
 *   MODIFIERS.inflate = (mesh, { amount = 0.05 }) => displaceMesh(mesh, (v) => ...);
 */
export const MODIFIERS = {
  // Symmetry and repeats (see mirrorMesh and friends)
  mirror: (mesh, step) => mirrorMesh(mesh, optionsOf(step)),
  symmetrize: (mesh, step) => symmetrizeMesh(mesh, optionsOf(step)),
  bisect: (mesh, step) => bisectMesh(mesh, optionsOf(step)),
  array: (mesh, step) => arrayMesh(mesh, optionsOf(step)),
  radialArray: (mesh, step) => radialArrayMesh(mesh, optionsOf(step)),

  // Smoothing and edges
  subdivide: (mesh, step) => subdivideMesh(mesh, optionsOf(step)),
  bevel: (mesh, step) => bevelMesh(mesh, optionsOf(step)),

  // Booleans: { op: "union" | "subtract" | "intersect", with: a mesh, an object, or a list }
  boolean: (mesh, { op = "union", with: other, materials, epsilon }) => {
    if (!other) throw new Error('needs `with`: the mesh (or object, or list) to combine with');
    return booleanMesh(mesh, other, op, { materials, epsilon });
  },

  // Deformers
  taper: (mesh, step) => taperMesh(mesh, optionsOf(step)),
  twist: (mesh, step) => twistMesh(mesh, optionsOf(step)),
  bend: (mesh, step) => bendMesh(mesh, optionsOf(step)),
  bulge: (mesh, step) => bulgeMesh(mesh, optionsOf(step)),

  // Sculpting: { brush, center or along, radius, ... } (see sculptMesh)
  sculpt: (mesh, { brush, ...rest }) => sculptMesh(mesh, brush, optionsOf(rest)),
  // Lumps all over: { amount: their height, size: about how wide (default: a fifth of the mesh), seed }
  noise: (mesh, { amount, size, seed }) => {
    const b = meshBounds(mesh);
    if (!b) return mesh;
    const radius = Math.hypot(b.size.x, b.size.y, b.size.z) || 1;
    const lump = Number.isFinite(size) && size > 0 ? size : Math.max(b.size.x, b.size.y, b.size.z) / 5 || 1;
    return sculptMesh(mesh, "noise", {
      center: b.center, radius: radius * 1.01, falloff: "constant",
      strength: Number.isFinite(amount) ? amount : lump * 0.2, scale: radius / lump, seed,
    });
  },

  // A lattice: { lattice } made in code, or { div, padding, edits: [{ select, move, scale, rotate }], interpolation }
  lattice: (mesh, step) => latticeMesh(mesh, latticeFor(mesh, step), { interpolation: step.interpolation }),

  // Rebuilding and cleaning
  remesh: (mesh, step) => remeshMesh(mesh, optionsOf(step)),
  weld: (mesh, { distance }) => weldVertices(mesh, distance),
  clean: (mesh, step) => cleanMesh(mesh, optionsOf(step)),
  fixWinding: (mesh) => fixWinding(mesh),

  // Placing: { pos, rot, scale }, baked into the vertices
  transform: (mesh, { pos, rot, scale }) => transformMesh(mesh, { pos, rot, scale }),
};

/**
 * Applies a list of modeling steps to a mesh, in order, like Blender's
 * modifier stack. Each step is `{ type, ...options }` (see `MODIFIERS` for
 * the types), and `enabled: false` skips it. Returns a new mesh: the
 * original is never changed, so keep it, change the list, and apply again.
 *
 * When a step fails, the error says which one (its number, from 1, and its
 * type) and why.
 *
 * @example
 * // A rounded, symmetric, slightly lumpy rock with a flat bottom
 * const rock = applyModifiers(makeShape("sphere"), [
 *   { type: "noise", amount: 0.05, seed: 3 },
 *   { type: "symmetrize", axis: "x" },
 *   { type: "bisect", axis: "y", center: { y: -0.2 } },
 * ]);
 *
 * @param {import("../index.d.ts").Mesh} mesh
 * @param {{ type: string, enabled?: boolean, [option: string]: any }[]} modifiers
 * @returns {import("../index.d.ts").Mesh} A new mesh
 */
export function applyModifiers(mesh, modifiers = []) {
  if (!mesh?.vertices) throw new Error("applyModifiers: give a mesh with vertices");
  if (!Array.isArray(modifiers)) throw new Error("applyModifiers: the modifiers are a list of steps");
  let current = cloneMesh(mesh);
  modifiers.forEach((step, i) => {
    if (!step || step.enabled === false) return;
    const run = MODIFIERS[step.type];
    const name = `Modifier ${i + 1} ("${step.type}")`;
    if (typeof run !== "function") {
      throw new Error(`${name}: unknown type; use one of ${Object.keys(MODIFIERS).join(", ")}`);
    }
    let out;
    try {
      out = run(current, step);
    } catch (e) {
      throw new Error(`${name}: ${e.message}`, { cause: e });
    }
    if (out !== undefined) {
      if (!out?.vertices) throw new Error(`${name}: didn't give a mesh`);
      current = out;
    }
  });
  return current;
}
