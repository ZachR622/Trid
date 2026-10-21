import { DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";
import { clear, edgeSegments } from "./draw.js";
import { parseColor } from "./color.js";
import { DEFAULT_LIGHT, DEFAULT_AMBIENT, newell } from "./canvasRenderer.js";

/** Farthest distance drawn by the WebGL renderer, unless the camera sets `far`. */
export const DEFAULT_FAR = 1000;

// Trid's transform pipeline, written in GLSL. It matches localToWorld,
// worldToCamera and project() exactly, so tools and picking line up.
const COMMON = `
uniform vec3 uPos, uRot, uScale;
uniform vec3 uCamPos;
uniform vec2 uCamRot; // yaw, pitch
uniform float uF, uAspect, uNear, uFar;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
vec3 rotXYZ(vec3 p) { return rotZ(rotY(rotX(p, uRot.x), uRot.y), uRot.z); }
vec3 toWorld(vec3 v) { return rotXYZ(v * uScale) + uPos; }
vec3 toCamera(vec3 p) { return rotX(rotY(p - uCamPos, uCamRot.x), uCamRot.y); }
vec4 toClip(vec3 p) {
  float a = (uFar + uNear) / (uFar - uNear);
  float b = -2.0 * uFar * uNear / (uFar - uNear);
  return vec4(p.x * uF / uAspect, p.y * uF, a * p.z + b, p.z);
}
`;

const FACE_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
varying vec3 vNormal;
${COMMON}
void main() {
  vNormal = rotXYZ(aNormal / uScale); // inverse scale keeps normals right on stretched objects
  gl_Position = toClip(toCamera(toWorld(aPos)));
}
`;

const FACE_FS = `
precision mediump float;
uniform vec4 uColor;
uniform vec3 uLight;
uniform float uAmbient;
uniform float uShade;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float b = mix(1.0, uAmbient + (1.0 - uAmbient) * max(0.0, dot(n, uLight)), uShade);
  gl_FragColor = vec4(uColor.rgb * b * uColor.a, uColor.a);
}
`;

// Each line segment is a thin rectangle facing the screen, `uWidth` pixels wide
const LINE_VS = `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aCorner; // x: 0 = at A, 1 = at B; y: -1 / +1 = which side
uniform vec2 uRes;
uniform float uWidth;
${COMMON}
void main() {
  vec3 a = toCamera(toWorld(aA));
  vec3 b = toCamera(toWorld(aB));
  float near = uNear * 1.001;
  if (a.z < near && b.z < near) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  if (a.z < near) a = mix(a, b, (near - a.z) / (b.z - a.z));
  if (b.z < near) b = mix(b, a, (near - b.z) / (a.z - b.z));
  vec4 ca = toClip(a), cb = toClip(b);
  vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 side = len > 1e-6 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
  vec4 c = aCorner.x < 0.5 ? ca : cb;
  c.xy += side * aCorner.y * uWidth / uRes * c.w;
  gl_Position = c;
}
`;

const LINE_FS = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a);
}
`;

const UNIFORMS = ["uPos", "uRot", "uScale", "uCamPos", "uCamRot", "uF", "uAspect", "uNear", "uFar", "uColor"];

/**
 * Draws a scene with WebGL, on the graphics card.
 *
 * Same objects, materials and light as `CanvasRenderer`, but:
 * - a depth buffer decides what's in front, per pixel, so faces always
 *   overlap correctly (no sorting mistakes)
 * - much faster on big models
 *
 * The scene is drawn on a hidden WebGL canvas, then copied onto the
 * scene's 2D canvas. Tools draw on top as usual, the page keeps a
 * single canvas, and `canvas.toDataURL()` includes everything.
 *
 * Meshes are sent to the graphics card once and reused. After changing
 * a mesh's vertices, edges or faces in place, set `mesh.dirty = true`.
 *
 * @example
 * const scene = new Scene(canvas, { renderer: new WebGLRenderer() });
 */
export class WebGLRenderer {
  /** Whether this browser can create a WebGL context. */
  static isSupported() {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  }

  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.antialias=true] - Smooth edges
   * @throws {Error} If WebGL isn't available (check `WebGLRenderer.isSupported()` first)
   */
  constructor({ antialias = true } = {}) {
    /** The hidden canvas WebGL draws on. */
    this.canvas = document.createElement("canvas");
    this._options = { antialias, alpha: true, premultipliedAlpha: true, depth: true };
    this._colors = new Map();
    this._lost = false;

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // allows the context to come back
      this._lost = true;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this._init();
      this._lost = false;
    });

    this._init();
  }

  _init() {
    const gl = this.canvas.getContext("webgl2", this._options) || this.canvas.getContext("webgl", this._options);
    if (!gl) throw new Error("WebGL is not available in this browser");
    this.gl = gl;
    this._meshes = new WeakMap();
    this._buffers = new Set();

    this._face = program(gl, FACE_VS, FACE_FS, ["aPos", "aNormal"], [...UNIFORMS, "uLight", "uAmbient", "uShade"]);
    this._line = program(gl, LINE_VS, LINE_FS, ["aA", "aB", "aCorner"], [...UNIFORMS, "uRes", "uWidth"]);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.frontFace(gl.CW); // Trid faces are clockwise from the front
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Push faces back a little so outlines on them win the depth test
    gl.polygonOffset(1, 1);
  }

  /**
   * Draws every object of the scene, then copies the image onto the scene's canvas.
   *
   * @param {import("../scene.js").Scene} scene
   */
  render(scene) {
    const { ctx, canvas, camera } = scene;
    const w = canvas.width, h = canvas.height;
    clear(ctx, w, h, scene.background);
    if (this._lost || this._disposed) return;

    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const view = {
      camPos: [camera.x ?? 0, camera.y ?? 0, camera.z ?? 0],
      camRot: [camera.yaw ?? 0, camera.pitch ?? 0],
      f: 1 / Math.tan((camera.fov ?? DEFAULT_FOV) / 2),
      aspect: w / h,
      near: camera.near ?? DEFAULT_NEAR,
      far: camera.far ?? DEFAULT_FAR,
    };
    const l = scene.light ?? DEFAULT_LIGHT;
    const len = Math.hypot(l.x, l.y, l.z) || 1;
    const light = [l.x / len, l.y / len, l.z / len];
    const ambient = scene.ambient ?? DEFAULT_AMBIENT;

    // Opaque things first; see-through ones after, without writing depth
    const opaque = [], clear2 = [];
    for (const obj of scene.objects) {
      const geo = this._geometry(obj.mesh);
      const lineColor = this._color(ctx, obj.color ?? scene.color);
      const lineWidth = obj.lineWidth ?? scene.lineWidth;
      const mat = obj.material;

      if (mat) {
        const fill = this._color(ctx, mat.fill ?? scene.color);
        (fill[3] < 1 ? clear2 : opaque).push({ kind: "face", obj, geo, color: fill, mat });
        if (mat.wireframe) {
          (lineColor[3] < 1 ? clear2 : opaque).push({ kind: "line", obj, buf: geo.outlines, color: lineColor, width: lineWidth });
        }
      } else {
        (lineColor[3] < 1 ? clear2 : opaque).push({ kind: "line", obj, buf: geo.edges, color: lineColor, width: lineWidth });
      }
    }

    for (const d of opaque) this._draw(d, view, light, ambient, w, h);
    gl.depthMask(false);
    for (const d of clear2) this._draw(d, view, light, ambient, w, h);

    ctx.drawImage(this.canvas, 0, 0);
  }

  /** Frees the graphics card memory. The renderer can't be used afterwards. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const gl = this.gl;
    for (const b of this._buffers) gl.deleteBuffer(b);
    this._buffers.clear();
    gl.deleteProgram(this._face.program);
    gl.deleteProgram(this._line.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  _draw(d, view, light, ambient, w, h) {
    const gl = this.gl;
    const isFace = d.kind === "face";
    const prog = isFace ? this._face : this._line;
    const buf = isFace ? d.geo.faces : d.buf;
    if (!buf.count) return;

    gl.useProgram(prog.program);
    const u = prog.uniforms;
    const { pos, rot, scale } = d.obj;
    gl.uniform3f(u.uPos, pos.x, pos.y, pos.z);
    gl.uniform3f(u.uRot, rot.x, rot.y, rot.z);
    gl.uniform3f(u.uScale, scale.x, scale.y, scale.z);
    gl.uniform3fv(u.uCamPos, view.camPos);
    gl.uniform2fv(u.uCamRot, view.camRot);
    gl.uniform1f(u.uF, view.f);
    gl.uniform1f(u.uAspect, view.aspect);
    gl.uniform1f(u.uNear, view.near);
    gl.uniform1f(u.uFar, view.far);
    gl.uniform4fv(u.uColor, d.color);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);
    const a = prog.attributes;

    if (isFace) {
      gl.uniform3fv(u.uLight, light);
      gl.uniform1f(u.uAmbient, ambient);
      gl.uniform1f(u.uShade, d.mat.shade === false ? 0 : 1);
      if (d.mat.doubleSided) gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, 24, 0);
      if (a.aNormal >= 0) gl.vertexAttribPointer(a.aNormal, 3, gl.FLOAT, false, 24, 12);
    } else {
      if (a.aA < 0) return;
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uWidth, d.width);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.vertexAttribPointer(a.aA, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(a.aB, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(a.aCorner, 2, gl.FLOAT, false, 32, 24);
    }
    const locs = Object.values(a).filter((loc) => loc >= 0);
    for (const loc of locs) gl.enableVertexAttribArray(loc);
    gl.drawArrays(gl.TRIANGLES, 0, buf.count);
    for (const loc of locs) gl.disableVertexAttribArray(loc);
  }

  /** Graphics card buffers for a mesh, built once and rebuilt when it changes. */
  _geometry(mesh) {
    let geo = this._meshes.get(mesh);
    const stale = !geo || mesh.dirty || geo.vertices !== mesh.vertices || geo.faceList !== mesh.faces
      || geo.edgeList !== mesh.edges || geo.counts !== countsOf(mesh);
    if (!stale) return geo;

    if (geo) for (const b of [geo.faces, geo.outlines, geo.edges]) this._free(b);
    const v = mesh.vertices;
    const faces = mesh.faces ?? [];

    // Faces: every triangle gets its own corners, with its face's normal (flat shading)
    const tri = [];
    const outline = new Set();
    const outlinePairs = [];
    for (const f of faces) {
      if (f.length < 3) continue;
      const n = newell(f.map((i) => v[i]));
      const len = Math.hypot(n.x, n.y, n.z) || 1;
      const nx = n.x / len, ny = n.y / len, nz = n.z / len;
      for (let k = 1; k < f.length - 1; k++) {
        for (const i of [f[0], f[k], f[k + 1]]) tri.push(v[i].x, v[i].y, v[i].z, nx, ny, nz);
      }
      for (let k = 0; k < f.length; k++) {
        const a = f[k], b = f[(k + 1) % f.length];
        const key = a < b ? a + "," + b : b + "," + a;
        if (!outline.has(key)) {
          outline.add(key);
          outlinePairs.push([a, b]);
        }
      }
    }

    geo = {
      vertices: mesh.vertices,
      faceList: mesh.faces,
      edgeList: mesh.edges,
      counts: countsOf(mesh),
      faces: this._upload(tri, 6),
      outlines: this._upload(lineData(v, outlinePairs), 8),
      edges: this._upload(lineData(v, edgeSegments(mesh.edges ?? [])), 8),
    };
    this._meshes.set(mesh, geo);
    mesh.dirty = false;
    return geo;
  }

  _upload(data, floatsPerVertex) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    this._buffers.add(buffer);
    return { buffer, count: data.length / floatsPerVertex };
  }

  _free(b) {
    this.gl.deleteBuffer(b.buffer);
    this._buffers.delete(b.buffer);
  }

  /** [r, g, b, a] in 0..1 for a CSS color, cached. */
  _color(ctx, css) {
    let c = this._colors.get(css);
    if (!c) {
      const [r, g, b, a] = parseColor(ctx, css);
      c = [r / 255, g / 255, b / 255, a];
      this._colors.set(css, c);
    }
    return c;
  }
}

/** A short string that changes when a mesh's arrays grow or shrink. */
function countsOf(mesh) {
  return `${mesh.vertices.length}/${mesh.edges?.length ?? 0}/${mesh.faces?.length ?? 0}`;
}

/** Six corners (two triangles) per segment: A, B, then which corner. */
function lineData(v, pairs) {
  const out = [];
  const corners = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
  for (const [i, j] of pairs) {
    const a = v[i], b = v[j];
    for (const [cx, cy] of corners) out.push(a.x, a.y, a.z, b.x, b.y, b.z, cx, cy);
  }
  return out;
}

function program(gl, vsSource, fsSource, attributes, uniforms) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error("Trid shader error: " + gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error("Trid shader error: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const out = { program: p, attributes: {}, uniforms: {} };
  for (const name of attributes) out.attributes[name] = gl.getAttribLocation(p, name);
  for (const name of uniforms) out.uniforms[name] = gl.getUniformLocation(p, name);
  return out;
}
