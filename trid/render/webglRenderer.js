import { DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";
import { clear, edgeSegments } from "./draw.js";
import { parseColor } from "./color.js";
import { DEFAULT_LIGHT, DEFAULT_AMBIENT } from "./canvasRenderer.js";
import { newell, cornerNormals, creaseOf } from "./normals.js";
import { SURFACE_GLSL, buildEffects, effectsKey } from "./effects.js";
import { textureReady, textureSize, textureIsLive } from "../loaders/texture.js";

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
attribute vec2 aUV;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec2 vUV;
${COMMON}
void main() {
  vNormal = rotXYZ(aNormal / uScale); // inverse scale keeps normals right on stretched objects
  vLocal = aPos;
  vUV = aUV;
  vWorld = toWorld(aPos);
  gl_Position = toClip(toCamera(vWorld));
}
`;

/** Fragment shader for faces: Trid's lighting, then the material's effects in order. */
function faceFS(effects) {
  const fx = buildEffects(effects);
  const source = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 uColor;
uniform vec3 uLight;
uniform float uAmbient;
uniform float uShade;
uniform float uTime;
uniform vec4 uBackground;
uniform vec3 uCamWorld;
uniform sampler2D uTexture;
uniform float uUseTexture;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec2 vUV;
${SURFACE_GLSL}
${fx.code}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float diffuse = max(0.0, dot(n, uLight));
  float light = mix(1.0, uAmbient + (1.0 - uAmbient) * diffuse, uShade);

  // Fill color, times the texture's color when there is one
  vec4 base = uColor * mix(vec4(1.0), texture2D(uTexture, vUV), uUseTexture);

  Surface s;
  s.base = base;
  s.uv = vUV;
  s.normal = n;
  s.position = vWorld;
  s.local = vLocal;
  s.view = normalize(uCamWorld - vWorld);
  s.lightDir = uLight;
  s.diffuse = diffuse;
  s.light = light;
  s.ambient = uAmbient;
  s.depth = length(uCamWorld - vWorld);
  s.time = uTime;
  s.background = uBackground;

  vec4 color = vec4(base.rgb * light, base.a);
${fx.calls}
  color = clamp(color, 0.0, 1.0);
  if (color.a < 0.004) discard; // fully see-through pixels (e.g. a PNG's empty parts) don't hide what's behind
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;
  return { source, uniforms: fx.uniforms };
}

const FACE_UNIFORMS = ["uLight", "uAmbient", "uShade", "uTime", "uBackground", "uCamWorld", "uTexture", "uUseTexture"];

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
    this._start = performance.now();
    this._failed = new Set(); // effect lists whose shader didn't compile (reported once)

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
    this._webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this._meshes = new WeakMap();
    this._buffers = new Set();
    this._textures = new WeakMap(); // image / canvas / video → GL texture
    this._glTextures = new Set();
    this._warned = new WeakSet();
    this._frame = 0;

    this._faces = new Map(); // face programs, one per combination of effects
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
    this._frame++;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const view = {
      ctx,
      background: this._color(ctx, scene.background),
      time: (performance.now() - this._start) / 1000,
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
        const fill = this._color(ctx, mat.fill ?? (mat.texture ? "#ffffff" : scene.color));
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

    // Meshes marked as changed have been sent again
    for (const obj of scene.objects) if (obj.mesh.dirty) obj.mesh.dirty = false;
  }

  /** Frees the graphics card memory. The renderer can't be used afterwards. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const gl = this.gl;
    for (const b of this._buffers) gl.deleteBuffer(b);
    for (const t of this._glTextures) gl.deleteTexture(t);
    this._glTextures.clear();
    this._buffers.clear();
    for (const p of new Set(this._faces.values())) gl.deleteProgram(p.program);
    gl.deleteProgram(this._line.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  _draw(d, view, light, ambient, w, h) {
    const gl = this.gl;
    const isFace = d.kind === "face";
    const effects = isFace ? d.mat.effects ?? [] : null;
    const prog = isFace ? this._faceProgram(effects) : this._line;
    const buf = isFace ? this._faceBuffer(d.geo, d.obj.mesh, d.mat.shade === false ? null : creaseOf(d.mat.smooth)) : d.buf;
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
      gl.uniform1f(u.uTime, view.time);
      gl.uniform4fv(u.uBackground, view.background);
      gl.uniform3fv(u.uCamWorld, view.camPos);
      for (const e of prog.effectUniforms) {
        this._setUniform(view.ctx, u[e.glslName], e.type, effects[e.effect]?.uniforms?.[e.name]);
      }
      if (d.mat.doubleSided) gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, 32, 0);
      if (a.aNormal >= 0) gl.vertexAttribPointer(a.aNormal, 3, gl.FLOAT, false, 32, 12);
      if (a.aUV >= 0) gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, 32, 24);
      const tex = d.mat.texture ? this._texture(d.mat.texture, !!d.mat.pixelated, d.obj.mesh) : null;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uTexture, 0);
      gl.uniform1f(u.uUseTexture, tex ? 1 : 0);
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

  /**
   * The face program for a list of effects, compiled once per combination.
   * A shader that doesn't compile is reported once, and the object is
   * drawn without its effects.
   */
  _faceProgram(effects) {
    const key = effectsKey(effects);
    let p = this._faces.get(key);
    if (p) return p;
    try {
      const fs = faceFS(effects);
      p = program(this.gl, FACE_VS, fs.source, ["aPos", "aNormal", "aUV"],
        [...UNIFORMS, ...FACE_UNIFORMS, ...fs.uniforms.map((u) => u.glslName)]);
      p.effectUniforms = fs.uniforms;
    } catch (err) {
      if (!this._failed.has(key)) {
        this._failed.add(key);
        console.error("Trid: an effect's shader failed to compile, drawing without effects.\n" + err.message);
      }
      p = effects.length ? this._faceProgram([]) : null;
      if (!p) throw err;
    }
    this._faces.set(key, p);
    return p;
  }

  /**
   * The GL texture for an image, canvas or video, uploaded once
   * (canvases and videos: every frame). Null while it isn't ready,
   * or if the mesh has no texture coordinates.
   */
  _texture(src, pixelated, mesh) {
    const gl = this.gl;
    if (!textureReady(src)) return null;
    if (!mesh.faceUVs) {
      if (!this._warned.has(mesh)) {
        this._warned.add(mesh);
        console.warn("Trid: this mesh has no texture coordinates (uvs / faceUVs), so its texture isn't drawn");
      }
      return null;
    }

    let t = this._textures.get(src);
    const live = textureIsLive(src);
    if (!t || live || t.failed) {
      if (t?.failed) return null;
      const { w, h } = textureSize(src);
      if (!t) {
        t = { tex: gl.createTexture(), frame: -1 };
        this._textures.set(src, t);
        this._glTextures.add(t.tex);
      }
      if (t.frame !== this._frame) {
        t.frame = this._frame;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // images go top-down, v goes up
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        } catch (err) {
          // Usually an image from another site without permission (CORS)
          console.warn("Trid: can't use this image as a texture: " + err.message);
          t.failed = true;
          return null;
        } finally {
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        }
        // WebGL 1 can only repeat and mipmap power-of-two sizes
        const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
        const full = this._webgl2 || pot;
        t.mipmaps = full && !live;
        if (t.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
        const wrap = full ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, pixelated ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      pixelated ? (t.mipmaps ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST) : (t.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR));
    return t.tex;
  }

  /** Sends one effect setting to the shader, converting it to its GLSL type. */
  _setUniform(ctx, loc, type, value) {
    const gl = this.gl;
    if (loc == null || value == null) return;
    if (type === "float") gl.uniform1f(loc, Number(value));
    else if (typeof value === "string") gl.uniform4fv(loc, this._color(ctx, value));
    else if (Array.isArray(value)) gl[`uniform${value.length}fv`](loc, value);
    else gl.uniform3f(loc, value.x, value.y, value.z);
  }

  /** Graphics card buffers for a mesh, built once and rebuilt when it changes. */
  _geometry(mesh) {
    let geo = this._meshes.get(mesh);
    const stale = !geo || mesh.dirty || geo.vertices !== mesh.vertices || geo.faceList !== mesh.faces
      || geo.edgeList !== mesh.edges || geo.counts !== countsOf(mesh);
    if (!stale) return geo;

    if (geo) {
      for (const b of [geo.outlines, geo.edges, ...geo.faceBuffers.values()]) this._free(b);
    }
    const v = mesh.vertices;
    const faces = mesh.faces ?? [];

    // Outlines of the faces, each edge once
    const outline = new Set();
    const outlinePairs = [];
    for (const f of faces) {
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
      faceBuffers: new Map(), // one per shading mode, built when first needed
      outlines: this._upload(lineData(v, outlinePairs), 8),
      edges: this._upload(lineData(v, edgeSegments(mesh.edges ?? [])), 8),
    };
    this._meshes.set(mesh, geo);
    return geo;
  }

  /**
   * Triangles of a mesh's faces, each corner with its own position and
   * normal. Flat shading uses the face's normal at every corner; smooth
   * shading uses the corner normals.
   */
  _faceBuffer(geo, mesh, crease) {
    const key = crease ?? "flat";
    let buf = geo.faceBuffers.get(key);
    if (buf) return buf;

    const v = mesh.vertices;
    const faces = mesh.faces ?? [];
    const corners = crease ? cornerNormals(mesh, crease) : null;
    const uvs = mesh.uvs, faceUVs = mesh.faceUVs;
    const tri = [];
    faces.forEach((f, fi) => {
      if (f.length < 3) return;
      let ns;
      if (corners) {
        ns = corners[fi];
      } else {
        const n = newell(f.map((i) => v[i]));
        const len = Math.hypot(n.x, n.y, n.z) || 1;
        const flat = { x: n.x / len, y: n.y / len, z: n.z / len };
        ns = f.map(() => flat);
      }
      const ts = uvs && faceUVs?.[fi];
      for (let k = 1; k < f.length - 1; k++) {
        for (const c of [0, k, k + 1]) {
          const p = v[f[c]], n = ns[c];
          const t = ts ? uvs[ts[c]] : null;
          tri.push(p.x, p.y, p.z, n.x, n.y, n.z, t ? t.u : 0, t ? t.v : 0);
        }
      }
    });

    buf = this._upload(tri, 8);
    geo.faceBuffers.set(key, buf);
    return buf;
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
