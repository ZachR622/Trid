import { DEFAULT_FOV, DEFAULT_NEAR } from "../math/transform.js";
import { normalMatrix, determinantMat4 } from "../math/matrix.js";
import { worldObjects } from "../sceneGraph.js";
import { clear, edgeSegments, wireEdges } from "./draw.js";
import { parseColor } from "./color.js";
import { materialsOf } from "./canvasRenderer.js";
import { sceneLights, MAX_LIGHTS } from "./lights.js";
import { FRAME_GLSL, postPasses, activePost, runCanvasPost } from "./post.js";
import { uvsFor, uvTransform, mappingKey } from "./uvMapping.js";
import { newell, cornerNormals, creaseOf } from "./normals.js";
import { SURFACE_GLSL, buildEffects, effectsKey, uniformType } from "./effects.js";
import { textureReady, textureSize, textureIsLive, textureVersion } from "../loaders/texture.js";

/** Farthest distance drawn by the WebGL renderer, unless the camera sets `far`. */
export const DEFAULT_FAR = 1000;

// Trid's transform pipeline, written in GLSL. It matches the objects' world
// matrices, worldToCamera and project() exactly, so tools and picking line up.
const COMMON = `
uniform mat4 uModel; // the object's world matrix (its parents' transforms included)
uniform vec3 uCamPos;
uniform vec2 uCamRot; // yaw, pitch
uniform float uF, uAspect, uNear, uFar;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c); }
vec3 toWorld(vec3 v) { return (uModel * vec4(v, 1.0)).xyz; }
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
uniform mat3 uUVTransform; // textureRepeat, textureOffset, textureRotation
uniform mat3 uNormalMatrix; // keeps normals right on stretched and mirrored objects
${COMMON}
void main() {
  vNormal = uNormalMatrix * aNormal;
  vLocal = aPos;
  vUV = (uUVTransform * vec3(aUV, 1.0)).xy;
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
uniform vec3 uAmbientColor;
uniform float uAmbient;
uniform vec3 uLightDir; // the first directional light, for effects
// Directional and point lights: xyz = direction light comes from (w = 0) or position (w = 1)
uniform vec4 uLightVec[${MAX_LIGHTS}];
// rgb = color × intensity, a = range (0: no fading)
uniform vec4 uLightColor[${MAX_LIGHTS}];
uniform int uLightCount;
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
// The light reaching a point: the same math as lightAt in trid/render/lights.js
vec3 tridLighting(vec3 n, vec3 p) {
  vec3 c = uAmbientColor;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLightVec[i];
    vec3 d = l.xyz;
    float fade = 1.0;
    if (l.w > 0.5) {
      d = l.xyz - p;
      float dist = max(length(d), 1e-6);
      d /= dist;
      float range = uLightColor[i].a;
      if (range > 0.0) {
        float k = clamp(1.0 - (dist * dist) / (range * range), 0.0, 1.0);
        fade = k * k;
      }
    }
    c += uLightColor[i].rgb * max(0.0, dot(n, d)) * fade;
  }
  return c;
}
${fx.code}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 reach = tridLighting(n, vWorld);
  float level = max(reach.r, max(reach.g, reach.b));
  float diffuse = clamp((level - uAmbient) / max(1.0 - uAmbient, 1e-4), 0.0, 1.0);
  float light = mix(1.0, level, uShade);
  vec3 lightColor = mix(vec3(1.0), reach, uShade);

  // Fill color, times the texture's color when there is one
  vec4 base = uColor * mix(vec4(1.0), texture2D(uTexture, vUV), uUseTexture);

  Surface s;
  s.base = base;
  s.uv = vUV;
  s.normal = n;
  s.position = vWorld;
  s.local = vLocal;
  s.view = normalize(uCamWorld - vWorld);
  s.lightDir = uLightDir;
  s.diffuse = diffuse;
  s.light = light;
  s.lightColor = lightColor;
  s.ambient = uAmbient;
  s.depth = length(uCamWorld - vWorld);
  s.time = uTime;
  s.background = uBackground;

  vec4 color = vec4(base.rgb * lightColor, base.a);
${fx.calls}
  color = clamp(color, 0.0, 1.0);
  if (color.a < 0.004) discard; // fully see-through pixels (e.g. a PNG's empty parts) don't hide what's behind
  gl_FragColor = vec4(color.rgb * color.a, color.a);
}
`;
  return { source, uniforms: fx.uniforms };
}

const FACE_UNIFORMS = ["uUVTransform", "uNormalMatrix", "uAmbientColor", "uAmbient", "uLightDir", "uLightVec", "uLightColor", "uLightCount", "uShade", "uTime", "uBackground", "uCamWorld", "uTexture", "uUseTexture"];

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

const UNIFORMS = ["uModel", "uCamPos", "uCamRot", "uF", "uAspect", "uNear", "uFar", "uColor"];

// Post effects: one big triangle covering the screen
const POST_VS = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** Fragment shader for one pass of a post effect (see trid/render/post.js). */
function postFS(glsl, uniforms) {
  const decls = uniforms.map((u) => `uniform ${u.type} ${u.name};`).join("\n");
  return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uSize;
uniform vec2 uTexel;
uniform float uTime;
uniform vec4 uBackground;
varying vec2 vUV;
${FRAME_GLSL}
${decls}
${glsl}
void main() {
  Frame f;
  f.uv = vUV;
  f.size = uSize;
  f.texel = uTexel;
  f.time = uTime;
  f.background = uBackground;
  gl_FragColor = clamp(post(frame(vUV), f), 0.0, 1.0);
}
`;
}

const POST_UNIFORMS = ["uFrame", "uSource", "uSize", "uTexel", "uTime", "uBackground"];
const COPY_GLSL = "vec4 post(vec4 color, Frame f) { return color; }";

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
 * Textures are sent once too (videos every frame): after redrawing a canvas,
 * call `updateTexture(canvas)`.
 *
 * Post effects (`scene.post`, see trid/render/post.js) run on the graphics
 * card too: the scene is drawn into a texture, then each pass draws the
 * next picture from it.
 *
 * Meshes and textures that haven't been drawn for `releaseAfter` frames
 * are freed from the graphics card, so replacing them (`obj.mesh = newMesh`)
 * doesn't fill its memory. They're sent again if they come back.
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
   * @param {number} [opts.releaseAfter=300] - Free meshes and textures not drawn for this many frames
   *   (about 5 s at 60 fps). `Infinity` keeps everything until `dispose()`
   * @throws {Error} If WebGL isn't available (check `WebGLRenderer.isSupported()` first)
   */
  constructor({ antialias = true, releaseAfter = 300 } = {}) {
    /** Frames a mesh or texture can go undrawn before it's freed (Infinity: never). */
    this.releaseAfter = releaseAfter;
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
    // Last frame each mesh / texture source was drawn, to free the ones no longer used
    this._meshUse = new Map();
    this._textureUse = new Map();
    this._warned = new WeakSet();
    this._frame = 0;

    this._faces = new Map(); // face programs, one per combination of effects
    this._line = program(gl, LINE_VS, LINE_FS, ["aA", "aB", "aCorner"], [...UNIFORMS, "uRes", "uWidth"]);
    this._posts = new Map(); // post effect pass programs, one per pass code
    this._post = null; // render targets for post effects, made when first needed

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

    // Post effects: the ones with GLSL run here, canvas-only ones after the copy
    const post = activePost(scene.post);
    const gpuPost = post.filter((e) => postPasses(e).length);
    const background = this._color(ctx, scene.background ?? "transparent");
    if (gpuPost.length) {
      // Into a texture, on the scene's background so effects see the whole picture
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._sceneTarget(w, h));
      const [r, g, b, a] = background;
      gl.clearColor(r * a, g * a, b * a, a);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
    }
    gl.viewport(0, 0, w, h);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const view = {
      ctx,
      background,
      time: (performance.now() - this._start) / 1000,
      camPos: [camera.x ?? 0, camera.y ?? 0, camera.z ?? 0],
      camRot: [camera.yaw ?? 0, camera.pitch ?? 0],
      f: 1 / Math.tan((camera.fov ?? DEFAULT_FOV) / 2),
      aspect: w / h,
      near: camera.near ?? DEFAULT_NEAR,
      far: camera.far ?? DEFAULT_FAR,
    };
    const lights = this._lights(scene, ctx);

    // Opaque things first; see-through ones after, without writing depth
    const opaque = [], clear2 = [];
    // Every object with a mesh, groups' children included, with its world matrix
    const drawn = worldObjects(scene).filter((o) => o.mesh);
    for (const obj of drawn) {
      const geo = this._geometry(obj.mesh);
      const lineColor = this._color(ctx, obj.color ?? scene.color);
      const lineWidth = obj.lineWidth ?? scene.lineWidth;
      const mats = materialsOf(obj);

      if (mats) {
        // Normals turn with the object; a mirrored one has its faces' winding reversed
        const place = { normals: normalMatrix(obj.world), mirrored: determinantMat4(obj.world) < 0 };
        // One draw per group of faces sharing a material (mesh.faceMaterials)
        const groups = geo.groups.map((g) => {
          const k = g.index >= 0 && g.index < mats.length && mats[g.index] ? g.index : 0;
          return { ...g, mat: mats[k] };
        });
        for (const g of groups) {
          const fill = this._color(ctx, g.mat.fill ?? (g.mat.texture ? "#ffffff" : scene.color));
          (fill[3] < 1 ? clear2 : opaque).push({ kind: "face", obj, geo, color: fill, mat: g.mat, first: g.first, count: g.count, place });
        }
        const lines = (buf) => (lineColor[3] < 1 ? clear2 : opaque).push({ kind: "line", obj, buf, color: lineColor, width: lineWidth });
        if (groups.every((g) => g.mat.wireframe)) lines(this._lineBuffer(geo, "outlines", () => outlinePairs(geo.faceList ?? [])));
        else for (const g of groups) if (g.mat.wireframe) lines(this._outlineBuffer(geo, obj.mesh, g));
      } else {
        (lineColor[3] < 1 ? clear2 : opaque).push({
          kind: "line", obj, color: lineColor, width: lineWidth,
          buf: this._lineBuffer(geo, "edges", () => edgeSegments(wireEdges(obj.mesh))),
        });
      }
    }

    for (const d of opaque) this._draw(d, view, lights, w, h);
    gl.depthMask(false);
    for (const d of clear2) this._draw(d, view, lights, w, h);

    if (gpuPost.length) this._runPost(gpuPost, view, w, h);

    ctx.drawImage(this.canvas, 0, 0);
    runCanvasPost(scene, post.filter((e) => !postPasses(e).length), this._start);

    // Meshes marked as changed have been sent again
    for (const obj of drawn) if (obj.mesh.dirty) obj.mesh.dirty = false;

    if (this._frame % 60 === 0) this._sweep();
  }

  /**
   * What the renderer keeps on the graphics card right now.
   *
   * @returns {{ meshes:number, buffers:number, textures:number }}
   */
  get memory() {
    return { meshes: this._meshUse.size, buffers: this._buffers.size, textures: this._glTextures.size };
  }

  /**
   * Frees a mesh's buffers or a texture's image on the graphics card now,
   * instead of waiting for `releaseAfter`. If it's drawn again, it's sent again.
   *
   * @param {Object} item - A mesh, or a texture source (image, canvas, video)
   */
  release(item) {
    if (!item || this._disposed) return;
    const geo = this._meshes.get(item);
    if (geo) {
      for (const b of buffersOf(geo)) this._free(b);
      this._meshes.delete(item);
    }
    this._meshUse.delete(item);
    const t = this._textures.get(item);
    if (t) {
      this.gl.deleteTexture(t.tex);
      this._glTextures.delete(t.tex);
      this._textures.delete(item);
    }
    this._textureUse.delete(item);
  }

  /** Frees what hasn't been drawn for `releaseAfter` frames. */
  _sweep() {
    if (!(this.releaseAfter < Infinity)) return;
    const oldest = this._frame - this.releaseAfter;
    for (const [item, frame] of this._meshUse) if (frame < oldest) this.release(item);
    for (const [item, frame] of this._textureUse) if (frame < oldest) this.release(item);
    // Post effect pictures of a size no longer used (after a resize, or effects removed)
    if (this._post) {
      const keep = [];
      for (const t of this._post.pool) {
        if (t.used < this._frame - 60) this._freeTarget(t);
        else keep.push(t);
      }
      this._post.pool = keep;
      if (this._post.used < this._frame - 60) this._freePost();
    }
  }

  // --- Post effects ---

  /**
   * The framebuffer the scene is drawn into when there are post effects:
   * multisampled on WebGL 2 (copied into a texture by `_runPost`), else
   * straight into a texture.
   */
  _sceneTarget(w, h) {
    const gl = this.gl;
    let P = this._post;
    if (P && (P.w !== w || P.h !== h)) {
      this._freePost();
      P = null;
    }
    if (!P) {
      P = this._post = { w, h, pool: [], used: this._frame };
      P.scene = this._makeTarget(w, h, true);
      if (this._webgl2 && this._options.antialias) {
        const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
        if (samples > 1) {
          const fb = gl.createFramebuffer();
          const color = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, color);
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
          const depth = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) P.msaa = { fb, color, depth };
          else {
            gl.deleteFramebuffer(fb);
            gl.deleteRenderbuffer(color);
            gl.deleteRenderbuffer(depth);
          }
          gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        }
      }
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      P.quad = quad;
    }
    P.used = this._frame;
    return P.msaa ? P.msaa.fb : P.scene.fb;
  }

  /** A texture to draw into, `w` × `h`, with a depth buffer when `depth`. */
  _makeTarget(w, h, depth = false) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fb, tex, depth: rb, w, h, used: this._frame };
  }

  _freeTarget(t) {
    const gl = this.gl;
    gl.deleteFramebuffer(t.fb);
    gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }

  /** Frees every post effect render target. */
  _freePost() {
    const P = this._post;
    if (!P) return;
    const gl = this.gl;
    this._freeTarget(P.scene);
    for (const t of P.pool) this._freeTarget(t);
    if (P.msaa) {
      gl.deleteFramebuffer(P.msaa.fb);
      gl.deleteRenderbuffer(P.msaa.color);
      gl.deleteRenderbuffer(P.msaa.depth);
    }
    gl.deleteBuffer(P.quad);
    this._post = null;
  }

  /** A pool picture of a size that isn't one of `busy`. */
  _poolTarget(w, h, busy) {
    const P = this._post;
    let t = P.pool.find((x) => x.w === w && x.h === h && !busy.includes(x));
    if (!t) {
      t = this._makeTarget(w, h);
      P.pool.push(t);
    }
    t.used = this._frame;
    return t;
  }

  /** The program for one pass's code, compiled once. Null if it doesn't compile (reported once). */
  _postProgram(glsl, uniforms) {
    const list = Object.entries(uniforms ?? {})
      .map(([name, value]) => ({ name, type: uniformType(value) }))
      .filter((u) => u.type);
    const key = glsl + "|" + list.map((u) => u.name + ":" + u.type).join(",");
    if (this._posts.has(key)) return this._posts.get(key);
    let p = null;
    try {
      p = program(this.gl, POST_VS, postFS(glsl, list), ["aPos"], [...POST_UNIFORMS, ...list.map((u) => u.name)]);
      p.list = list;
    } catch (err) {
      console.error("Trid: a post effect's shader failed to compile, skipping it.\n" + err.message);
    }
    this._posts.set(key, p);
    return p;
  }

  /**
   * Runs the post effects on the scene's picture, then draws the result on
   * the WebGL canvas.
   */
  _runPost(effects, view, w, h) {
    const gl = this.gl;
    const P = this._post;
    // Multisampled drawing: resolve it into the scene's texture
    if (P.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, P.msaa.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, P.scene.fb);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.quad);

    const pass = (prog, input, source, target, tw, th, uniforms) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, tw, th);
      gl.useProgram(prog.program);
      const u = prog.uniforms;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input.tex);
      gl.uniform1i(u.uFrame, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, source.tex);
      gl.uniform1i(u.uSource, 1);
      gl.uniform2f(u.uSize, tw, th);
      gl.uniform2f(u.uTexel, 1 / input.w, 1 / input.h);
      gl.uniform1f(u.uTime, view.time);
      gl.uniform4fv(u.uBackground, view.background);
      for (const x of prog.list) this._setUniform(view.ctx, u[x.name], x.type, uniforms?.[x.name]);
      const a = prog.attributes.aPos;
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(a);
    };

    let source = P.scene; // the picture the current effect starts from
    for (const e of effects) {
      let prev = source;
      for (const ps of postPasses(e)) {
        const prog = this._postProgram(ps.glsl, e.uniforms);
        if (!prog) continue;
        const tw = Math.max(1, Math.round(w * ps.scale)), th = Math.max(1, Math.round(h * ps.scale));
        const target = this._poolTarget(tw, th, [source, prev]);
        pass(prog, prev, source, target, tw, th, e.uniforms);
        prev = target;
      }
      source = prev;
    }

    // Onto the canvas
    pass(this._postProgram(COPY_GLSL, {}), source, source, null, w, h, {});

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
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
    this._meshUse.clear();
    this._textureUse.clear();
    for (const p of new Set(this._faces.values())) gl.deleteProgram(p.program);
    for (const p of this._posts.values()) if (p) gl.deleteProgram(p.program);
    gl.deleteProgram(this._line.program);
    this._freePost();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /** The scene's lights, packed for the face shader's uniforms. */
  _lights(scene, ctx) {
    const L = sceneLights(scene, (css) => this._color(ctx, css));
    const vec = new Float32Array(MAX_LIGHTS * 4), color = new Float32Array(MAX_LIGHTS * 4);
    L.lights.forEach((l, i) => {
      const p = l.point ? l.pos : l.dir;
      vec.set([p.x, p.y, p.z, l.point ? 1 : 0], i * 4);
      color.set([l.color[0], l.color[1], l.color[2], l.range], i * 4);
    });
    return {
      vec, color, count: L.lights.length,
      ambient: L.ambient, ambientLevel: L.ambientLevel,
      dir: [L.mainDir.x, L.mainDir.y, L.mainDir.z],
    };
  }

  _draw(d, view, lights, w, h) {
    const gl = this.gl;
    const isFace = d.kind === "face";
    const effects = isFace ? d.mat.effects ?? [] : null;
    const prog = isFace ? this._faceProgram(effects) : this._line;
    const buf = isFace
      ? this._faceBuffer(d.geo, d.obj.mesh, d.mat.shade === false ? null : creaseOf(d.mat.smooth), d.mat.mapping)
      : d.buf;
    const first = d.first ?? 0, count = d.count ?? buf.count;
    if (!count) return;

    gl.useProgram(prog.program);
    const u = prog.uniforms;
    gl.uniformMatrix4fv(u.uModel, false, d.obj.world);
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
      const m = uvTransform(d.mat) ?? [1, 0, 0, 1, 0, 0];
      gl.uniformMatrix3fv(u.uUVTransform, false, [m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
      gl.uniformMatrix3fv(u.uNormalMatrix, false, d.place.normals);
      gl.frontFace(d.place.mirrored ? gl.CCW : gl.CW);
      gl.uniform3fv(u.uAmbientColor, lights.ambient);
      gl.uniform1f(u.uAmbient, lights.ambientLevel);
      gl.uniform3fv(u.uLightDir, lights.dir);
      gl.uniform4fv(u.uLightVec, lights.vec);
      gl.uniform4fv(u.uLightColor, lights.color);
      gl.uniform1i(u.uLightCount, lights.count);
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
      const tex = d.mat.texture
        ? this._texture(d.mat.texture, d.mat, d.obj.mesh, !!uvsFor(d.obj.mesh, d.mat.mapping).faceUVs)
        : null;
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
    gl.drawArrays(gl.TRIANGLES, first, count);
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
  _texture(src, mat, mesh, hasUVs) {
    const gl = this.gl;
    const pixelated = !!mat.pixelated;
    if (!textureReady(src)) return null;
    if (!hasUVs) {
      if (!this._warned.has(mesh)) {
        this._warned.add(mesh);
        console.warn("Trid: this mesh has no texture coordinates (uvs / faceUVs), so its texture isn't drawn. Set material.mapping to make some.");
      }
      return null;
    }

    let t = this._textures.get(src);
    const live = textureIsLive(src, mat);
    const version = textureVersion(src);
    this._textureUse.set(src, this._frame);
    // Sent once, then again after updateTexture(src), or every frame when live
    if (!t || live || t.version !== version || t.failed) {
      if (t?.failed) return null;
      let { w, h } = textureSize(src);
      if (!t) {
        t = { tex: gl.createTexture(), frame: -1, version: -1 };
        this._textures.set(src, t);
        this._glTextures.add(t.tex);
      }
      if (t.frame !== this._frame) {
        const changed = t.version !== version;
        t.frame = this._frame;
        t.version = version;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        // Bigger than the graphics card allows: upload a smaller copy
        let pixels = src;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (w > max || h > max) {
          const k = max / Math.max(w, h);
          if (!t.small || live || changed) t.small = shrink(src, Math.floor(w * k), Math.floor(h * k), t.small);
          if (!t.warned) {
            t.warned = true;
            console.warn(`Trid: a ${w} × ${h} texture is bigger than this graphics card allows (${max}), so it's drawn at ${t.small.width} × ${t.small.height}`);
          }
          pixels = t.small;
          w = t.small.width;
          h = t.small.height;
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // images go top-down, v goes up
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
    this._meshUse.set(mesh, this._frame);
    let geo = this._meshes.get(mesh);
    const stale = !geo || mesh.dirty || geo.vertices !== mesh.vertices || geo.faceList !== mesh.faces
      || geo.edgeList !== mesh.edges || geo.faceMats !== mesh.faceMaterials || geo.counts !== countsOf(mesh);
    if (!stale) return geo;

    if (geo) for (const b of buffersOf(geo)) this._free(b);
    const faces = mesh.faces ?? [];

    // Faces grouped by material index, in the order the face buffers store them
    const byIndex = new Map();
    faces.forEach((f, fi) => {
      if (f.length < 3) return;
      const k = mesh.faceMaterials?.[fi] ?? 0;
      if (!byIndex.has(k)) byIndex.set(k, []);
      byIndex.get(k).push(fi);
    });
    const groups = [];
    let first = 0;
    for (const k of [...byIndex.keys()].sort((a, b) => a - b)) {
      const list = byIndex.get(k);
      const count = list.reduce((n, fi) => n + (faces[fi].length - 2) * 3, 0);
      groups.push({ index: k, faces: list, first, count });
      first += count;
    }

    geo = {
      vertices: mesh.vertices,
      faceList: mesh.faces,
      edgeList: mesh.edges,
      faceMats: mesh.faceMaterials,
      counts: countsOf(mesh),
      groups,
      groupOutlines: new Map(), // outlines of one group, when only some materials have `wireframe`
      faceBuffers: new Map(), // one per shading mode and mapping, built when first needed
      lines: new Map(), // "outlines" and "edges", built when first drawn (they're big on big models)
    };
    this._meshes.set(mesh, geo);
    return geo;
  }

  /** A line buffer of the mesh, built the first time it's drawn. */
  _lineBuffer(geo, name, pairs) {
    let buf = geo.lines.get(name);
    if (!buf) {
      buf = this._upload(lineData(geo.vertices, pairs()), 8);
      geo.lines.set(name, buf);
    }
    return buf;
  }

  /** Outlines of one group of faces (see `_geometry`), built when first needed. */
  _outlineBuffer(geo, mesh, group) {
    let buf = geo.groupOutlines.get(group.index);
    if (!buf) {
      const faces = mesh.faces ?? [];
      buf = this._upload(lineData(mesh.vertices, outlinePairs(group.faces.map((fi) => faces[fi]))), 8);
      geo.groupOutlines.set(group.index, buf);
    }
    return buf;
  }

  /**
   * Triangles of a mesh's faces, each corner with its own position,
   * normal and texture coordinate, grouped by material (`geo.groups`).
   * Flat shading uses the face's normal at every corner; smooth shading
   * uses the corner normals. `mapping` picks the texture coordinates.
   */
  _faceBuffer(geo, mesh, crease, mapping) {
    const key = (crease ?? "flat") + "|" + mappingKey(mapping);
    let buf = geo.faceBuffers.get(key);
    if (buf) return buf;

    const v = mesh.vertices;
    const faces = mesh.faces ?? [];
    const corners = crease ? cornerNormals(mesh, crease) : null;
    const { uvs, faceUVs } = uvsFor(mesh, mapping);
    const total = geo.groups.reduce((n, g) => n + g.count, 0);
    const tri = new Float32Array(total * 8);
    let o = 0;
    for (const fi of geo.groups.flatMap((g) => g.faces)) {
      const f = faces[fi];
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
          tri[o++] = p.x; tri[o++] = p.y; tri[o++] = p.z;
          tri[o++] = n.x; tri[o++] = n.y; tri[o++] = n.z;
          tri[o++] = t ? t.u : 0; tri[o++] = t ? t.v : 0;
        }
      }
    }

    buf = this._upload(tri, 8);
    geo.faceBuffers.set(key, buf);
    return buf;
  }

  _upload(data, floatsPerVertex) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
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

/** Every graphics card buffer of a mesh's geometry. */
function buffersOf(geo) {
  return [...geo.lines.values(), ...geo.faceBuffers.values(), ...geo.groupOutlines.values()];
}

/** A short string that changes when a mesh's arrays grow or shrink. */
function countsOf(mesh) {
  return `${mesh.vertices.length}/${mesh.edges?.length ?? 0}/${mesh.faces?.length ?? 0}`;
}

/** A smaller copy of an image, drawn on a canvas (reused when given one). */
function shrink(src, w, h, canvas = document.createElement("canvas")) {
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(src, 0, 0, w, h);
  return canvas;
}

/** Each edge of the faces once, as [a, b] pairs. */
function outlinePairs(faces) {
  const seen = new Set();
  const pairs = [];
  for (const f of faces) {
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length];
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a; // one number per edge
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** Six corners (two triangles) per segment: A, B, then which corner. */
function lineData(v, segments) {
  const pairs = Array.isArray(segments) ? segments : [...segments]; // edgeSegments is a generator
  const out = new Float32Array(pairs.length * 48);
  const corners = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
  let o = 0;
  for (const [i, j] of pairs) {
    const a = v[i], b = v[j];
    for (const [cx, cy] of corners) {
      out[o++] = a.x; out[o++] = a.y; out[o++] = a.z;
      out[o++] = b.x; out[o++] = b.y; out[o++] = b.z;
      out[o++] = cx; out[o++] = cy;
    }
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
