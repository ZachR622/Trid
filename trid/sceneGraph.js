import { mat4FromTransform, mulMat4, transformPoint } from "./math/matrix.js";

/**
 * Groups: any object can have `children`, placed relative to it. An object
 * without a `mesh` is just a group. Moving, turning or scaling an object
 * moves its whole subtree.
 *
 *   const sword = scene.add({ pos, children: [
 *     { mesh: blade },
 *     { name: "hilt", children: [{ mesh: guard }, { mesh: grip, pos: { x: 0, y: -0.12, z: 0 } }] },
 *   ] });
 *   sword.rot.y += dt; // everything turns
 *
 * `children` is a plain array, read every frame: push and splice freely.
 * Each object gets two read-only-by-convention fields, kept up to date every
 * frame (and set right away by `scene.add`):
 * - `parent`: the object it's a child of, or null at the top
 * - `world`: its world matrix (parent's world matrix × its own transform)
 * Both are non-enumerable, so they don't show up in JSON or `{ ...obj }`.
 *
 * `visible: false` hides an object and everything under it.
 */

/** Sets a field without making it enumerable (keeps objects clean for JSON and spreads). */
function hidden(obj, key, value) {
  if (Object.prototype.hasOwnProperty.call(obj, key)) obj[key] = value;
  else Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: false });
}

/** Fills missing transform fields, like `scene.add` does. */
function fill(obj) {
  obj.pos ??= { x: 0, y: 0, z: 0 };
  obj.rot ??= { x: 0, y: 0, z: 0 };
  obj.scale ??= { x: 1, y: 1, z: 1 };
}

/**
 * An object's world matrix, worked out now from its own transform and its
 * parents' (following `obj.parent`). Use it between frames, after changing
 * a transform; renderers keep `obj.world` up to date on their own.
 *
 * @param {Object} obj - A scene object
 * @returns {number[]} 4×4 matrix (see `trid/math/matrix.js`)
 */
export function worldMatrix(obj) {
  const own = mat4FromTransform(obj);
  return obj.parent ? mulMat4(worldMatrix(obj.parent), own) : own;
}

/**
 * Where an object's origin is in the world, now (with its parents).
 *
 * @param {Object} obj - A scene object
 * @returns {{x:number, y:number, z:number}}
 */
export function worldPosition(obj) {
  return transformPoint(worldMatrix(obj), { x: 0, y: 0, z: 0 });
}

/**
 * Calls `fn(obj, world)` for every visible object under some roots, parents
 * before children, with each one's world matrix. Changes nothing: objects
 * don't need to be in a scene.
 *
 * @param {Object[]} roots - Top objects
 * @param {(root:Object) => number[]|null} baseOf - Matrix a root's own transform goes under (null: none)
 * @param {(obj:Object, world:number[], parent:Object|null) => void} fn
 */
export function forEachPlaced(roots, baseOf, fn) {
  const visit = (obj, parent, parentWorld) => {
    if (!obj || typeof obj !== "object") return;
    const world = parentWorld ? mulMat4(parentWorld, mat4FromTransform(obj)) : mat4FromTransform(obj);
    if (obj.visible === false) return;
    fn(obj, world, parent);
    if (Array.isArray(obj.children)) for (const child of obj.children) visit(child, obj, world);
  };
  for (const root of roots) visit(root, root?.parent ?? null, baseOf(root));
}

/**
 * Every visible object of a scene (or of a list of objects and their
 * subtrees), parents before their children, with `parent` and `world` set
 * and missing transforms filled in. Groups without a mesh are included;
 * renderers skip them.
 *
 * Objects given in a list keep their place in the scene: an object that is
 * a child of a group still gets its parents' transforms.
 *
 * @param {Object|Object[]} input - A Scene, a scene object or a list of them
 * @returns {Object[]} The objects, flattened
 */
export function worldObjects(input) {
  const roots = Array.isArray(input) ? input : Array.isArray(input?.objects) ? input.objects : input ? [input] : [];
  // The scene's own list is the top: those have no parent
  if (roots === input?.objects) for (const obj of roots) if (obj && obj.parent) hidden(obj, "parent", null);
  const out = [];
  forEachPlaced(roots, (root) => (root.parent ? worldMatrix(root.parent) : null), (obj, world, parent) => {
    fill(obj);
    if (obj.parent !== parent) hidden(obj, "parent", parent);
    hidden(obj, "world", world);
    out.push(obj);
  });
  // Hidden objects still get their links (so a hidden group's children know their parent)
  for (const root of roots) if (root?.visible === false) linkTree(root, root.parent ?? null);
  return out;
}

/**
 * Sets `parent` links and fills transforms down a subtree, right away.
 * `scene.add` calls it, so `obj.parent` works before the first frame.
 *
 * @param {Object} obj
 * @param {Object|null} [parent=null]
 */
export function linkTree(obj, parent = null) {
  fill(obj);
  if (obj.parent !== parent) hidden(obj, "parent", parent);
  if (Array.isArray(obj.children)) for (const child of obj.children) linkTree(child, obj);
}

/**
 * The chain from an object up to the top of its tree: `[obj, parent, ..., root]`.
 *
 * @param {Object} obj
 * @returns {Object[]}
 */
export function ancestors(obj) {
  const path = [];
  for (let o = obj; o; o = o.parent) path.push(o);
  return path;
}
