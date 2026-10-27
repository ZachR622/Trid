import { localToWorld, worldToCamera, cameraToScreen, clipNear, DEFAULT_NEAR } from "../math/transform.js";
import { transformPoint } from "../math/matrix.js";

/**
 * Clears the entire canvas, then paints it with a background color.
 * This should usually be called once per frame before drawing.
 *
 * A see-through color (`"transparent"`, or `rgba(...)` with an alpha below 1),
 * or no color (`null`), lets the page behind the canvas show through.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {string|null} [color] - Background color (CSS color); none: left see-through
 */
export function clear(ctx, w, h, color) {
  ctx.clearRect(0, 0, w, h);
  if (!isVisible(color)) return;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/** Whether a background color paints anything (not null, empty or "transparent"). */
function isVisible(color) {
  return color != null && color !== "" && String(color).trim().toLowerCase() !== "transparent";
}

/**
 * Draws a square point centered at a given 2D position.
 * Useful for debugging or drawing vertices.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {{x:number, y:number}} p - Screen-space point
 * @param {string} color - Point color
 * @param {number} size - Width/height of the square (default: 20)
 */
export function point(ctx, p, color, size = 20) {
  ctx.fillStyle = color;
  ctx.fillRect(
    p.x - size / 2,
    p.y - size / 2,
    size,
    size
  );
}

/**
 * Draws a straight line between two 2D screen-space points.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {{x:number, y:number}} p1 - Start point
 * @param {{x:number, y:number}} p2 - End point
 * @param {string} color - Line color
 * @param {number} width - Line thickness (default: 4)
 */
export function line(ctx, p1, p2, color, width = 4) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

/**
 * Turns edge definitions into pairs of vertex indices.
 *
 * - An edge with 2 indices is a single segment: [a, b]
 * - An edge with 3+ indices is a closed loop: the last index
 *   connects back to the first
 *
 * @param {number[][]} [edges] - Edge definitions using vertex indices (none: no segments)
 * @returns {Generator<[number, number]>} Index pairs to connect
 */
export function* edgeSegments(edges) {
  for (const e of edges ?? []) {
    const closed = e.length > 2;
    const count = closed ? e.length : e.length - 1;
    for (let i = 0; i < count; i++) {
      yield [e[i], e[(i + 1) % e.length]];
    }
  }
}

/**
 * The lines to draw for a mesh shown as a wireframe: its `edges`, or the
 * outline of each face when it has no `edges` (a face-only mesh).
 *
 * @param {{ edges?: number[][], faces?: number[][] }} mesh
 * @returns {number[][]} Edge definitions (faces are closed loops)
 */
export function wireEdges(mesh) {
  return mesh.edges ?? mesh.faces ?? [];
}

/**
 * Draws a wireframe object by connecting projected vertices
 * using index-based edge definitions.
 *
 * Each edge is defined as an array of vertex indices.
 * A 2-index edge is a single segment; with 3 or more indices,
 * consecutive indices are connected and the last index
 * connects back to the first (closed loop).
 *
 * This function assumes:
 * - `points2` indices match the original vertex order
 * - All points are already in screen space
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {{x:number, y:number}[]} points2 - 2D screen-space points
 * @param {number[][]} edges - Edge definitions using vertex indices
 * All segments go into one path and are stroked once.
 *
 * @param {string} color - Stroke color
 * @param {number} width - Line thickness (default: 4)
 */
export function drawWireframe(ctx, points2, edges, color, width = 4) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;

  ctx.beginPath();
  for (const [i, j] of edgeSegments(edges)) {
    ctx.moveTo(points2[i].x, points2[i].y);
    ctx.lineTo(points2[j].x, points2[j].y);
  }
  ctx.stroke();
}

/**
 * Draws a mesh instance by applying its transform and rendering
 * its wireframe representation.
 *
 * Segments are clipped against the camera's near plane, so parts
 * of the mesh behind the camera are not drawn. All segments go
 * into one path and are stroked once.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {{
 *   mesh:{ vertices:{x:number,y:number,z:number}[], edges?:number[][], faces?:number[][] },
 *   pos:{x:number,y:number,z:number},
 *   rot:{x:number,y:number,z:number},
 *   scale:{x:number,y:number,z:number}
 * }} inst - Mesh instance
 * @param {import("../math/transform.js").Camera} camera - Camera settings
 * @param {number} w - Canvas width
 * @param {number} h - Canvas height
 * @param {string} color - Wireframe color
 * @param {number} lineWidth - Wireframe width
 * @param {number[]} [world] - World matrix to place it with (e.g. `obj.world` inside a group).
 *   Default: the instance's own pos / rot / scale
 */
export function drawInstance(ctx, inst, camera, w, h, color, lineWidth = 3, world) {
  const near = camera.near ?? DEFAULT_NEAR;
  const toWorld = world ? (v) => transformPoint(world, v) : (v) => localToWorld(v, inst);
  const ptsCam = inst.mesh.vertices.map((v) => worldToCamera(toWorld(v), camera));

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;

  ctx.beginPath();
  for (const [i, j] of edgeSegments(wireEdges(inst.mesh))) {
    const seg = clipNear(ptsCam[i], ptsCam[j], near);
    if (!seg) continue;
    const a = cameraToScreen(seg[0], camera, w, h);
    const b = cameraToScreen(seg[1], camera, w, h);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}
