/**
 * Type definitions for Trid (trid3d).
 *
 * Hand-written to match trid/index.js. When a public function or
 * option changes in the JavaScript, update it here too.
 */

// ---------------------------------------------------------------------------
// Basic types
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface UV {
  u: number;
  v: number;
}

/** [r, g, b, a]. Range depends on where it comes from (see each function). */
export type RGBA = [number, number, number, number];

/**
 * Camera. Every field is optional and falls back to its default.
 * The camera looks down +Z when yaw and pitch are 0.
 */
export interface Camera {
  /** Position on X (default 0) */
  x?: number;
  /** Position on Y (default 0) */
  y?: number;
  /** Position on Z (default 0) */
  z?: number;
  /** Turn around Y in radians, > 0 turns right (default 0) */
  yaw?: number;
  /** Tilt around X in radians, > 0 looks up (default 0) */
  pitch?: number;
  /** Vertical field of view in radians (default Math.PI / 2) */
  fov?: number;
  /** Near plane distance; closer geometry is clipped (default 0.01) */
  near?: number;
  /** Far distance; farther geometry isn't drawn. WebGL renderer only (default 1000) */
  far?: number;
}

/**
 * A mesh: vertices plus the lines (`edges`) and/or polygons (`faces`) between them.
 *
 * An edge with 2 indices is a single segment; with 3 or more it's a closed loop.
 * Faces are clockwise as seen from their front.
 * Without `edges`, an object with no material draws the outline of each face.
 */
export interface Mesh {
  vertices: Vec3[];
  edges?: number[][];
  faces?: number[][];
  /** Per-corner normals, used by smooth shading */
  normals?: Vec3[];
  /** For each face, the index into `normals` of each corner (null: none for that face) */
  faceNormals?: (number[] | null)[];
  /** Texture coordinates */
  uvs?: UV[];
  /** For each face, the index into `uvs` of each corner (null: none for that face) */
  faceUVs?: (number[] | null)[];
  /**
   * For each face, which entry of the object's material list it uses
   * (when `material` is a list). Built-in cubes and boxes number their sides 0 to 5.
   */
  faceMaterials?: number[];
  /** Set after changing the mesh in place so renderers rebuild their caches */
  dirty?: boolean;
}

/** Transform of a mesh instance. */
export interface Transform {
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
}

/** Anything a texture can be: an image, canvas, video or bitmap. */
export type TextureSource = CanvasImageSource;

/** How an object's faces look. Objects without one are drawn as wireframes. */
export interface Material {
  /** A name: `exportOBJ` / `exportMTL` write it as the material's name (`usemtl` / `newmtl`) */
  name?: string;
  /** Face color, any CSS color (default: the scene's color, or white with a texture) */
  fill?: string;
  /** Darken faces that turn away from the light (default true) */
  shade?: boolean;
  /** Also draw the face outlines, with the object's `color` and `lineWidth` (default false) */
  wireframe?: boolean;
  /** Also draw faces seen from behind (default false) */
  doubleSided?: boolean;
  /**
   * Blend the light across faces so curved shapes look round.
   * `true` keeps edges sharper than 60° hard; a number sets that angle.
   */
  smooth?: boolean | number;
  /** Image drawn on the faces (needs texture coordinates). `fill` tints it. */
  texture?: TextureSource;
  /**
   * Read the texture again every frame (default: only videos). For a canvas redrawn every
   * frame; for one redrawn now and then, call `updateTexture(canvas)` instead.
   */
  liveTexture?: boolean;
  /** Keep texture pixels sharp instead of smoothing them (default false) */
  pixelated?: boolean;
  /** Effects applied in order, like `[toon(), rim()]` */
  effects?: Effect[];
  /** Where texture coordinates come from: the mesh's own ("uv", default) or made from its shape */
  mapping?: Mapping;
  /** How many times the texture repeats across (default 1) */
  textureRepeat?: number | UV;
  /** Moves the texture; 1 is its whole width or height */
  textureOffset?: UV;
  /** Turns the texture around its center, in radians */
  textureRotation?: number;
}

/** Ways to make texture coordinates from a mesh's shape. */
export type MappingType = "uv" | "planar" | "box" | "sphere" | "cylinder";

/**
 * A texture mapping: a type, or a type with an axis. `axis` is the projection
 * direction for "planar" (default "z") and the wrap axis for "sphere" and "cylinder" (default "y").
 */
export type Mapping = MappingType | { type: MappingType; axis?: "x" | "y" | "z" };

/**
 * What you pass to `scene.add`. Missing transform fields get defaults.
 * Give it `children` to make a group (and leave out `mesh` for a group that only holds them).
 */
export interface SceneObjectInput {
  /** What's drawn. Leave it out for a group that only holds `children` */
  mesh?: Mesh;
  pos?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
  /** Objects placed relative to this one: they move, turn and scale with it. Read every frame */
  children?: SceneObjectInput[];
  /** Set to false to hide this object and everything under it (default true) */
  visible?: boolean;
  /** A name, used by `exportOBJ` and handy for finding objects */
  name?: string;
  /** Wireframe color (default: the scene's color) */
  color?: string;
  /** Wireframe width (default: the scene's lineWidth) */
  lineWidth?: number;
  /** Draw faces instead of only lines. A list gives each group of faces its own (see `Mesh.faceMaterials`) */
  material?: Material | Material[];
  /** Set to false to make `DragObject` ignore this object */
  draggable?: boolean;
  /** Set to false to make `HoverHighlight` ignore this object */
  hoverable?: boolean;
  /** Set to false so `pick` / `pickHit` never find this object or its children (helpers like a grid) */
  pickable?: boolean;
}

/**
 * An object in a scene, after `scene.add` filled in its transform.
 * Extra fields you add (like `{ mesh, name: "box" }`) are kept in the type.
 */
export type SceneObject<T extends SceneObjectInput = SceneObjectInput> = T & Transform & {
  /** The group it's a child of, or null at the top. Kept up to date by the scene (not enumerable) */
  parent: SceneObject | null;
  /** World matrix from the last frame: parents' transforms × its own (not enumerable). See `worldMatrix` */
  world: Mat4;
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** Anything that can draw a scene. */
export interface Renderer {
  render(scene: Scene): void;
  dispose?(): void;
}

export interface SceneOptions {
  /** Sets canvas.width (keeps the current one if omitted) */
  width?: number;
  /** Sets canvas.height (keeps the current one if omitted) */
  height?: number;
  /** Clear color (default "#141414") */
  background?: string;
  /** Default wireframe color (default "#ffffff") */
  color?: string;
  /** Default wireframe width (default 3) */
  lineWidth?: number;
  /** Camera (default { z: -1 }) */
  camera?: Camera;
  /** Direction light comes from (default: above, left and in front). Ignored when `lights` is given */
  light?: Vec3;
  /**
   * Brightness of faces turned away from the light, 0..1 (default 0.25).
   * The directional light gets `1 - ambient`. Ignored when `lights` is given
   */
  ambient?: number;
  /** Every light, instead of `light` and `ambient` */
  lights?: Light[];
  /** Post effects run on the picture, in order (default none) */
  post?: PostEffect[];
  /** What draws the scene (default: a new CanvasRenderer) */
  renderer?: Renderer;
}

/** Holds a canvas, a camera and a list of objects, and draws them. */
export class Scene {
  constructor(canvas: HTMLCanvasElement, opts?: SceneOptions);

  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  background: string;
  color: string;
  lineWidth: number;
  camera: Camera;
  /** Every light. Edit it freely; it's read every frame */
  lights: Light[];
  /** Post effects, run in order on the picture before tools draw */
  post: PostEffect[];
  /**
   * Shortcut for the first directional light's direction (null if there's none).
   * Setting it when there's none adds one.
   */
  light: Vec3 | null;
  /**
   * Shortcut for the first ambient light's intensity (0 if there's none).
   * Setting it when there's none adds one; the directional light keeps its intensity.
   */
  ambient: number;
  renderer: Renderer;
  objects: SceneObject[];
  tools: ToolManager;

  /** Adds an object, filling in missing transform fields. Returns the same object. */
  add<T extends SceneObjectInput>(obj: T): SceneObject<T>;
  /** Removes an object. Does nothing if it isn't in the scene. */
  remove(obj: SceneObjectInput): void;
  /** Adds a tool. Returns the same tool. */
  use<T extends Tool>(tool: T): T;
  /** Removes a tool. Does nothing if it isn't in the scene. */
  unuse(tool: Tool): void;
  /** Draws every object once, then lets tools draw on top. */
  render(): void;
  /** Starts the frame loop (restarts it if already running). */
  start(update?: (dt: number, time: number, scene: Scene) => void): this;
  /** Stops the frame loop. The last frame stays on the canvas. */
  stop(): void;
  /** Draws a new frame and returns it as an image file. The page's canvas doesn't change. */
  screenshot(opts?: ScreenshotOptions): Promise<Blob>;
  /** Starts recording the canvas as a video. */
  record(opts?: RecordOptions): Recording;
  /** Stops the loop, removes every tool and frees the renderer's resources. */
  destroy(): void;
  /** Whether the frame loop is running. */
  readonly running: boolean;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface ShapeOptions {
  /** Cube size, or plane width (default 0.5 cube, 1 plane) */
  size?: number;
  /** Box width (default 0.6) */
  w?: number;
  /** Box height (default 0.6), or cylinder / cone height (default 0.8) */
  h?: number;
  /** Box depth (default 0.6) */
  d?: number;
  /** Radius: sphere (0.45), cylinder (0.3), cone base (0.35) */
  r?: number;
  /** Sphere latitude bands (default 12) */
  rings?: number;
  /** Points around: sphere (24), cylinder / cone (32), torus (48) */
  segments?: number;
  /** Cone top radius: 0 = pointed, > 0 = tapered cylinder (default 0) */
  rTop?: number;
  /** Torus: distance from the center to the middle of the tube (default 0.35) */
  R?: number;
  /** Torus tube radius (default 0.12) */
  tube?: number;
  /** Torus points around the tube (default 20) */
  tubeSegments?: number;
  /** Plane cells per side (default 8) */
  div?: number;
  /** Plane: lifts each vertex, for terrain */
  height?: (x: number, z: number) => number;
}

export type ShapeKind = "cube" | "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane";

/**
 * Creates a built-in mesh (with edges, faces and texture coordinates), centered
 * on the origin. Cylinders, cones and tori stand along Y; the plane lies in XZ facing +Y.
 */
export function makeShape(kind: ShapeKind, opts?: ShapeOptions): Mesh;

/** A point of a `lathe` profile: distance from the Y axis and height. */
export interface ProfilePoint {
  r: number;
  y: number;
}

export interface LatheOptions {
  /** Points around the axis (default 32) */
  segments?: number;
  /** Close the bottom with a flat cap (default false) */
  capBottom?: boolean;
  /** Close the top with a flat cap (default false) */
  capTop?: boolean;
  /** The profile's last point joins its first, for torus-like shapes (default false) */
  closed?: boolean;
}

/**
 * Spins a profile around the Y axis (vases, bottles, columns, chess pieces).
 * Walk the profile so the outside is on its right: bottom to top for a vase.
 */
export function lathe(profile: ProfilePoint[], opts?: LatheOptions): Mesh;

/** A 2D point (x right, y up). */
export interface Point2 {
  x: number;
  y: number;
}

/**
 * Turns a flat outline in the XY plane into a solid `depth` thick along Z
 * (default 0.2), centered on the origin. Either direction, concave is fine, no holes.
 */
export interface ExtrudeOptions {
  /** How much the edges between sides and front / back are cut, up to half the depth (default 0) */
  bevel?: number;
  /** Steps around a bevel: 1 = flat chamfer, more = rounded (default 1) */
  bevelSegments?: number;
  /** Size of the back compared to the front, around the outline's middle (default 1) */
  taper?: number;
}

export function extrude(outline: Point2[], depth?: number, opts?: ExtrudeOptions): Mesh;

/** Cuts a counter-clockwise polygon into counter-clockwise triangles (ear clipping). */
export function triangulate(pts: Point2[]): number[][];

/** Scales a mesh's vertices in place. Returns the same mesh. */
export function scaleMesh<M extends { vertices: Vec3[] }>(mesh: M, sx?: number, sy?: number, sz?: number): M;

/** A transform to bake into a mesh; parts left out change nothing. A scene object fits. */
export interface MeshTransform {
  pos?: Partial<Vec3>;
  rot?: Partial<Vec3>;
  scale?: Partial<Vec3>;
}

/** Deep copy of a mesh (vertices, edges, faces, UVs, normals, materials). */
export function cloneMesh<M extends Mesh>(mesh: M): M;

/**
 * Bakes a transform into a mesh's vertices, in place (scale, rotate X→Y→Z, move).
 * Normals turn with it; a mirroring scale reverses the faces. Returns the same mesh.
 */
export function transformMesh<M extends Mesh>(mesh: M, transform: MeshTransform): M;

/**
 * Moves every vertex to `fn(vertex, index)`, in place. Removes the mesh's own normals
 * (they no longer fit), so the renderers compute new ones. Returns the same mesh.
 */
export function displaceMesh<M extends Mesh>(mesh: M, fn: (v: Vec3, index: number) => Vec3): M;

export interface MergeOptions {
  /** Faces of the i-th mesh use material i (default false: keep each mesh's faceMaterials) */
  materialPerMesh?: boolean;
}

/**
 * Joins meshes into a new one, keeping faces, edges, UVs, normals and materials.
 * Scene objects in the list are merged where they stand (transform baked in).
 */
export function mergeMeshes(items: (Mesh | SceneObjectInput)[], opts?: MergeOptions): Mesh;

/** A box around some geometry. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

/**
 * The box around a mesh, a scene object, a list of them or a Scene (objects measured
 * where they stand). Null when there are no vertices.
 */
export function meshBounds(input: Mesh | SceneObjectInput | (Mesh | SceneObjectInput)[] | Scene): Bounds | null;

export type GridPlane = "xz" | "xy" | "yz";

/** A square grid of lines centered on the origin, as a line-only mesh. */
export function gridMesh(opts?: { size?: number; divisions?: number; plane?: GridPlane }): Mesh;

export interface GridHelperOptions {
  /** Width of the whole grid (default 4) */
  size?: number;
  /** Cells along each side (default 40) */
  divisions?: number;
  /** A major line every this many cells, 0 for none (default 10) */
  major?: number;
  /** The plane it lies in (default "xz", a floor) */
  plane?: GridPlane;
  /** Minor lines (default "rgba(255, 255, 255, 0.12)") */
  color?: string;
  /** Major lines (default "rgba(255, 255, 255, 0.25)") */
  majorColor?: string;
  /** Draw the axes through the origin (default true), or their colors like `{ x: "#f00" }` */
  axes?: boolean | { x?: string; y?: string; z?: string };
  /** Fade toward the edge (default true); a number is where the fade starts (0 = center, 1 = edge) */
  fade?: boolean | number;
  /** Line width in pixels (default 1) */
  lineWidth?: number;
}

/** A floor grid with major lines, colored axes and a fade: a group to `scene.add`, never picked. */
export function gridHelper(opts?: GridHelperOptions): SceneObjectInput & { pickable: false; children: SceneObjectInput[] };

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

/** Light from everywhere: lights every side of every face the same. */
export interface AmbientLight {
  type: "ambient";
  /** Any CSS color (default white) */
  color?: string;
  /** Multiplies the color (default 1) */
  intensity?: number;
  /** Set to false to turn it off without removing it */
  enabled?: boolean;
}

/** Light from far away in one direction, like the sun. */
export interface DirectionalLight {
  type: "directional";
  /** Direction light comes from (any length) */
  direction: Vec3;
  color?: string;
  intensity?: number;
  enabled?: boolean;
}

/** Light from a point, like a bulb. */
export interface PointLight {
  type: "point";
  /** World position */
  position: Vec3;
  color?: string;
  intensity?: number;
  /** Fades out smoothly and reaches nothing past this distance (default: no fading) */
  range?: number;
  enabled?: boolean;
}

export type Light = AmbientLight | DirectionalLight | PointLight;

/** Most directional + point lights the renderers use; extra ones are ignored. */
export const MAX_LIGHTS: number;

/** The default lights: ambient at `ambient`, white directional from `direction` at `1 - ambient`. */
export function defaultLights(direction?: Vec3, ambient?: number): Light[];

/** A scene's lights ready for shading (used by the renderers). */
export interface SceneLights {
  /** Summed ambient color [r, g, b] */
  ambient: [number, number, number];
  /** Brightest channel of `ambient` */
  ambientLevel: number;
  lights: { point: boolean; dir: Vec3 | null; pos: Vec3 | null; color: [number, number, number]; range: number }[];
  /** Unit direction of the first directional light */
  mainDir: Vec3;
}

/** A scene's lights, colors parsed and multiplied by intensity, directions unit length. */
export function sceneLights(
  scene: { lights?: Light[]; light?: Vec3 | null; ambient?: number },
  rgba: (css: string) => number[],
): SceneLights;

/** The light reaching a point, [r, g, b] (can go above 1). */
export function lightAt(lights: SceneLights, normal: Vec3, position: Vec3): [number, number, number];

/** Brightness (brightest channel) and diffuse share (0..1) of a light color. */
export function lightLevels(color: number[], ambientLevel: number): { light: number; diffuse: number };

/** How much of a point light reaches `dist` away (1 up close, 0 at `range`; range 0 = no fading). */
export function rangeFade(dist: number, range: number): number;

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/** Direction light comes from when the scene doesn't set one. */
export const DEFAULT_LIGHT: Readonly<Vec3>;
/** How bright a face turned fully away from the light still is (0..1). */
export const DEFAULT_AMBIENT: number;
/** Default far distance (WebGL renderer). */
export const DEFAULT_FAR: number;

/** An object's materials as a list, or null when it's a wireframe. */
export function materialsOf(obj: { material?: Material | Material[] }): Material[] | null;

export interface CanvasRendererOptions {
  /**
   * Split faces bigger than this fraction of their mesh's size (like 0.05)
   * into smaller triangles, so they sort better. Off by default (null).
   */
  maxFaceSize?: number | null;
}

/** Draws a scene with the canvas 2D context (painter's algorithm). */
export class CanvasRenderer implements Renderer {
  constructor(opts?: CanvasRendererOptions);
  maxFaceSize: number | null;
  render(scene: Scene): void;
}

export interface WebGLRendererOptions {
  /** Smooth edges (default true) */
  antialias?: boolean;
  /** Free meshes and textures not drawn for this many frames (default 300, about 5 s). Infinity: never */
  releaseAfter?: number;
}

/** Draws a scene with WebGL and a depth buffer. */
export class WebGLRenderer implements Renderer {
  /** Whether this browser can create a WebGL context. */
  static isSupported(): boolean;
  /** @throws If WebGL isn't available */
  constructor(opts?: WebGLRendererOptions);
  /** The hidden canvas WebGL draws on. */
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** Frames a mesh or texture can go undrawn before it's freed (Infinity: never). */
  releaseAfter: number;
  /** What's on the graphics card right now. */
  readonly memory: { meshes: number; buffers: number; textures: number };
  render(scene: Scene): void;
  /** Frees a mesh's buffers or a texture now; it's sent again if drawn again. */
  release(item: Mesh | TextureSource): void;
  /** Frees the graphics card memory. The renderer can't be used afterwards. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Values an effect uniform can hold. */
export type UniformValue = number | boolean | string | number[] | Vec3;

/**
 * What an effect knows about the point being drawn.
 * Colors are [r, g, b, a] from 0 to 1.
 */
export interface Surface {
  /** The material's fill color, times the texture's color */
  base: RGBA;
  /** Texture coordinates (0, 0 when the mesh has none) */
  uv: UV;
  /** Unit normal, in world space, facing the camera's side */
  normal: Vec3;
  /** World position */
  position: Vec3;
  /** Position in the mesh's own space */
  local: Vec3;
  /** Unit direction from the point to the camera */
  view: Vec3;
  /** Unit direction the scene's first directional light comes from */
  lightDir: Vec3;
  /** How much of the light comes from the lights rather than the ambient, 0..1 (one light: how much the point faces it) */
  diffuse: number;
  /** Brightness Trid used (brightest channel of `lightColor`): ambient + (1 - ambient) × diffuse with the default lights */
  light: number;
  /** The light reaching the point, [r, g, b] (every light added up; can go above 1). Trid's color is `base × lightColor` */
  lightColor: [number, number, number];
  /** The scene's ambient level (brightest channel) */
  ambient: number;
  /** Distance to the camera */
  depth: number;
  /** Seconds since the renderer started */
  time: number;
  /** The scene's background color */
  background: RGBA;
  /** Canvas renderer only: turns a uniform value (CSS color, array, vector) into RGBA 0..1 */
  rgba(value: UniformValue): RGBA;
}

/** A small shader that changes how a material looks. */
export interface Effect<U extends Record<string, UniformValue> = Record<string, UniformValue>> {
  name?: string;
  /** GLSL defining `vec4 effect(vec4 color, Surface s)` (WebGL renderer) */
  glsl?: string;
  /** Run once per face by the canvas renderer */
  canvas?(color: RGBA, s: Surface, uniforms: U): number[];
  /** Settings read every frame, like `{ uPower: 2 }` */
  uniforms?: U;
}

/** Cartoon look: the light comes in a few hard steps. */
export function toon(opts?: { steps?: number }): Effect<{ uSteps: number }>;

/** A glow along the edges, where the surface turns away from the camera. */
export function rim(opts?: { color?: string; power?: number; strength?: number }): Effect<{
  uRimColor: string;
  uPower: number;
  uStrength: number;
}>;

/** A glow along the border of each face (WebGL only). */
export function edgeGlow(opts?: { color?: string; width?: number; strength?: number }): Effect<{
  uGlowColor: string;
  uWidth: number;
  uStrength: number;
}>;

/** Ignores the light: shows the fill color everywhere. */
export function unlit(): Effect<{}>;

export interface GradientOptions {
  /** Color at `min` (default "#E9806E") */
  from?: string;
  /** Color at `max` (default "#8ab4f8") */
  to?: string;
  /** Direction of the change (default "y") */
  axis?: "x" | "y" | "z";
  /** Where `from` is fully reached (default -0.5) */
  min?: number;
  /** Where `to` is fully reached (default 0.5) */
  max?: number;
  /** Measure in the mesh's own space or in the world (default "local") */
  space?: "local" | "world";
  /** Keep the shading from the light (default true) */
  lit?: boolean;
}

/** Color that changes along an axis. */
export function gradient(opts?: GradientOptions): Effect<{
  uFrom: string;
  uTo: string;
  uMin: number;
  uMax: number;
  uLit: boolean;
}>;

/** Fades objects into a color with distance. */
export function fog(opts?: { near?: number; far?: number; color?: string }): Effect<{
  uNearFog: number;
  uFarFog: number;
  uFogColor: string;
  uOwnColor: boolean;
}>;

/** Joins a material's effects into GLSL (used by the renderers). */
export function buildEffects(effects: Effect[]): {
  code: string;
  calls: string;
  uniforms: { effect: number; name: string; glslName: string; type: string }[];
};

/** A key that's the same for effect lists that compile to the same shader. */
export function effectsKey(effects: Effect[]): string;

/** GLSL type of a uniform value, or null if it can't be one. */
export function uniformType(value: unknown): "float" | "vec2" | "vec3" | "vec4" | null;

/** The GLSL declaration of `Surface`, shared by every effect. */
export const SURFACE_GLSL: string;

// ---------------------------------------------------------------------------
// Post effects
// ---------------------------------------------------------------------------

/** What a post effect's `canvas` function knows about the picture. */
export interface PostFrame {
  width: number;
  height: number;
  /** Seconds since the renderer started */
  time: number;
  /** The scene's background color */
  background: RGBA;
  /** The canvas being changed */
  canvas: HTMLCanvasElement;
  /** Turns a uniform value (CSS color, array) into RGBA 0..1 */
  rgba(value: UniformValue): RGBA;
}

/** One pass of a post effect. */
export interface PostPass {
  /** GLSL defining `vec4 post(vec4 color, Frame f)` */
  glsl: string;
  /** Size of this pass's picture, relative to the canvas (default 1) */
  scale?: number;
}

/** A shader run on the whole picture after the scene is drawn. */
export interface PostEffect<U extends Record<string, UniformValue> = Record<string, UniformValue>> {
  name?: string;
  /** GLSL defining `vec4 post(vec4 color, Frame f)`: one pass (WebGL renderer) */
  glsl?: string;
  /** Instead of `glsl`: passes run in order (each can read the last with `frame(uv)`, the start with `source(uv)`) */
  passes?: PostPass[];
  /** Changes the 2D canvas directly: used by the canvas renderer (and by WebGL for effects without GLSL) */
  canvas?(ctx: CanvasRenderingContext2D, frame: PostFrame, uniforms: U): void;
  /** Settings read every frame */
  uniforms?: U;
  /** Set to false to turn it off without removing it */
  enabled?: boolean;
}

/** Darkens the corners of the picture. */
export function vignette(opts?: { strength?: number; radius?: number; softness?: number; color?: string }): PostEffect<{
  uStrength: number;
  uRadius: number;
  uSoftness: number;
  uColor: string;
}>;

/** Glow around the bright parts. */
export function bloom(opts?: { threshold?: number; strength?: number; radius?: number }): PostEffect<{
  uThreshold: number;
  uStrength: number;
  uRadius: number;
}>;

/** Brightness, contrast, saturation and a tint, in that order. */
export function grade(opts?: { brightness?: number; contrast?: number; saturation?: number; tint?: string }): PostEffect<{
  uBrightness: number;
  uContrast: number;
  uSaturation: number;
  uTint: string;
}>;

/** Film grain: random noise over the picture. */
export function grain(opts?: { amount?: number; size?: number; animated?: boolean }): PostEffect<{
  uAmount: number;
  uGrain: number;
  uAnimated: boolean;
}>;

/** A post effect's passes (empty when it only has a canvas version). */
export function postPasses(effect: PostEffect): { glsl: string; scale: number }[];

/** The effects of a list that are on. */
export function activePost(list: PostEffect[] | undefined): PostEffect[];

/** Runs post effects' `canvas` functions on a scene's canvas (used by the renderers). */
export function runCanvasPost(scene: Scene, list: PostEffect[] | undefined, start: number): void;

/** The GLSL declaration of `Frame` and the `frame` / `source` helpers. */
export const FRAME_GLSL: string;

// ---------------------------------------------------------------------------
// Texture mapping
// ---------------------------------------------------------------------------

/** Texture coordinates for every face corner. */
export interface MeshUVs {
  uvs: UV[];
  faceUVs: number[][];
}

/** The mapping types. */
export const MAPPINGS: readonly MappingType[];

/** Texture coordinates made from a mesh's shape. The mesh isn't changed. */
export function computeUVs(mesh: Mesh, mapping: Mapping): MeshUVs;

/** Replaces a mesh's texture coordinates with ones made from its shape, in place. */
export function mapUVs<M extends Mesh>(mesh: M, mapping: Mapping): M & MeshUVs;

/** The texture coordinates a renderer uses for a mesh and mapping (cached). */
export function uvsFor(mesh: Mesh, mapping?: Mapping): { uvs?: UV[]; faceUVs?: (number[] | null)[] };

/** A material's repeat, offset and rotation as [a, b, c, d, e, f], or null when they change nothing. */
export function uvTransform(material: Material): [number, number, number, number, number, number] | null;

/** Applies a `uvTransform` matrix to one texture coordinate. */
export function applyUVTransform(m: number[] | null, uv: UV): UV;
export function applyUVTransform(m: number[] | null, uv: UV | null): UV | null;

/** A mapping as `{ type, axis }`. Throws for an unknown type or axis. */
export function mappingOf(mapping?: Mapping): { type: MappingType; axis?: "x" | "y" | "z" };

/** A short string naming a mapping, for caches ("" for "uv"). */
export function mappingKey(mapping?: Mapping): string;

// ---------------------------------------------------------------------------
// Normals
// ---------------------------------------------------------------------------

/** Default crease angle (degrees) for `smooth: true`. */
export const DEFAULT_CREASE: number;

/** For each face, one unit normal per corner (smooth shading). */
export function cornerNormals(mesh: Mesh, crease?: number): Vec3[][];

/** The `smooth` material setting as a crease angle, or null for flat shading. */
export function creaseOf(smooth: boolean | number | undefined): number | null;

/** Normal of a polygon (Newell's method). Not normalized. */
export function newell(pts: Vec3[]): Vec3;

// ---------------------------------------------------------------------------
// Loading files
// ---------------------------------------------------------------------------

/** A mesh loaded from an OBJ file. Always has faces. */
export interface ObjMesh extends Mesh {
  faces: number[][];
  /** Material names from `usemtl` lines, in the order they first appear */
  materialNames?: string[];
  /** The .mtl file the OBJ names (`mtllib`) */
  mtllib?: string;
  /** With `loadOBJ(url, { materials: true })`: one material per `materialNames` entry, from the .mtl file */
  materials?: Material[];
}

export interface ObjOptions {
  /** Center the model and scale it so its largest side is this long */
  fit?: number;
  /** `loadOBJ` only: also load the .mtl file and its textures into `mesh.materials` (default false) */
  materials?: boolean;
}

/** A material from an MTL file. */
export interface MtlMaterial {
  name: string;
  /** "#rrggbb" from `Kd`, or "rgba(...)" when see-through */
  fill?: string;
  /** From `d` / `Tr`, 0 to 1 */
  opacity?: number;
  /** The texture's file name (`map_Kd`), relative to the .mtl file */
  textureFile?: string;
}
/** Parses the text of an MTL file: materials by name. */
export function parseMTL(text: string): Record<string, MtlMaterial>;
/** The materials of a parsed OBJ from its .mtl file (one per `materialNames` entry), textures loaded. */
export function loadMaterials(mesh: ObjMesh, base: URL | string): Promise<Material[]>;

/** Parses the text of an OBJ file. */
export function parseOBJ(text: string, opts?: ObjOptions): ObjMesh;
/** Downloads an OBJ file and parses it. */
export function loadOBJ(url: string, opts?: ObjOptions): Promise<ObjMesh>;
/** Parses an OBJ `File` or `Blob`. */
export function readOBJFile(file: Blob, opts?: ObjOptions): Promise<ObjMesh>;
/** Opens the file dialog for .obj files. Call it from a user action. */
export function pickOBJFile(): Promise<File | null>;
/** Centers a mesh and scales it so its largest side is `size`. In place. */
export function fitMesh<M extends { vertices: Vec3[] }>(mesh: M, size?: number): M;

/** Loads an image to use as a texture. */
export function loadTexture(url: string): Promise<HTMLImageElement>;
/** Whether a texture source has pixels to draw yet. */
export function textureReady(src: TextureSource | null | undefined): boolean;
/** Pixel size of a texture source. */
export function textureSize(src: TextureSource): { w: number; h: number };
/** Whether a texture is read again every frame: videos, or any source whose material has `liveTexture: true`. */
export function textureIsLive(src: TextureSource, material?: { liveTexture?: boolean }): boolean;
/**
 * Tells the renderers a texture changed (call it after drawing on a canvas used as a texture):
 * it's read again once, on the next frame. Canvases are otherwise read only once.
 */
export function updateTexture(src: TextureSource): void;
/** How many times `updateTexture` was called for a source (0 when never). */
export function textureVersion(src: TextureSource): number;

// ---------------------------------------------------------------------------
// Exporting
// ---------------------------------------------------------------------------

export interface ExportOBJOptions {
  /**
   * Write texture coordinates (default true). For an object whose material has a
   * `mapping` or texture repeat/offset/rotation, the coordinates it's drawn with are written.
   */
  uvs?: boolean;
  /** Write the mesh's normals when it has them (default true) */
  normals?: boolean;
  /** Write edges that aren't the side of a face as lines (default true) */
  lines?: boolean;
  /** Decimals kept in numbers (default 6) */
  precision?: number;
  /** Comment at the top of the file; "" for none (default "Exported by Trid") */
  header?: string;
  /** Link this .mtl file and name every material (the names `exportMTL` writes) */
  mtllib?: string;
}

/** A material description for `exportMTL`. */
export interface MtlDescription {
  name: string;
  fill?: string;
  opacity?: number;
  /** Texture file name */
  texture?: string;
}

/** The materials an export names, with each texture's file name. */
export function objMaterials(
  input: OBJExportable | OBJExportable[] | Scene,
  opts?: { textureFile?: (name: string, texture: TextureSource) => string },
): { name: string; material: Material | null; texture: TextureSource | null; file: string | null }[];
/** Writes an MTL file: for what `exportOBJ` takes (same names), or for plain descriptions. */
export function exportMTL(
  input: OBJExportable | OBJExportable[] | Scene | MtlDescription[],
  opts?: { textureFile?: (name: string, texture: TextureSource) => string; header?: string },
): string;
/** A texture image as a PNG (or other) file. */
export function textureToBlob(src: TextureSource, type?: string): Promise<Blob>;
/** Every file of a model: name.obj, name.mtl and one PNG per texture. */
export function exportModel(
  input: OBJExportable | OBJExportable[] | Scene,
  opts?: { name?: string; obj?: ExportOBJOptions },
): Promise<{ name: string; data: string | Blob }[]>;

/** Something exportOBJ can write: a mesh, or an object placed in a scene. */
export type OBJExportable = Mesh | (SceneObjectInput & Partial<Transform> & { name?: string });

/**
 * Writes meshes as the text of an OBJ file. Objects are written where they are
 * in the scene; a list or a Scene gives one `o` per object.
 */
export function exportOBJ(input: OBJExportable | OBJExportable[] | Scene, opts?: ExportOBJOptions): string;

export interface ScreenshotOptions {
  /** "image/png" (default), "image/jpeg" or "image/webp" */
  type?: string;
  /** For JPEG and WebP, from 0 to 1 (default 0.92) */
  quality?: number;
  /** Image width in pixels (default: the canvas's) */
  width?: number;
  /** Image height in pixels (default: the canvas's) */
  height?: number;
  /** Include what tools draw on top (default true) */
  tools?: boolean;
}

export interface RecordOptions {
  /** Frames per second (default 60) */
  fps?: number;
  /** Video format, like "video/webm" (default: the best one the browser has) */
  type?: string;
  /** Quality: higher is sharper and bigger (default 8,000,000) */
  bitsPerSecond?: number;
  /** Stop by itself after this many seconds */
  duration?: number;
}

/** A video being recorded. */
export interface Recording {
  /** The video format being recorded */
  readonly type: string;
  /** Whether it's still recording */
  readonly recording: boolean;
  /** Resolves with the video once recording stops */
  readonly done: Promise<Blob>;
  /** Stops recording; resolves with the video */
  stop(): Promise<Blob>;
}

/** Draws a new frame of a scene and returns it as an image file. */
export function screenshot(scene: Scene, opts?: ScreenshotOptions): Promise<Blob>;

/** Records a scene's canvas as a video. Throws if the browser can't. */
export function record(scene: Scene, opts?: RecordOptions): Recording;

/** Saves a file or text in the browser's downloads. */
export function download(data: Blob | string | Promise<Blob | string>, filename: string): Promise<void>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolPointerEvent {
  /** Pointer X in canvas pixels */
  x: number;
  /** Pointer Y in canvas pixels */
  y: number;
  /** X movement since the last event */
  dx: number;
  /** Y movement since the last event */
  dy: number;
  /** Button that changed (0 left, 1 middle, 2 right) */
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** The DOM event */
  original: PointerEvent;
}

export interface ToolWheelEvent {
  /** Pointer X in canvas pixels */
  x: number;
  /** Pointer Y in canvas pixels */
  y: number;
  /** Scroll amount (> 0 scrolls down) */
  deltaY: number;
  /** The DOM event */
  original: WheelEvent;
}

/** Something that plugs into a Scene. Every method is optional. */
export interface Tool {
  attach?(scene: Scene): void;
  detach?(scene: Scene): void;
  /** Return true to take the drag */
  pointerDown?(e: ToolPointerEvent, scene: Scene): boolean | void;
  pointerMove?(e: ToolPointerEvent, scene: Scene): void;
  pointerUp?(e: ToolPointerEvent, scene: Scene): void;
  pointerLeave?(scene: Scene): void;
  /** Return true to use the scroll */
  wheel?(e: ToolWheelEvent, scene: Scene): boolean | void;
  update?(dt: number, scene: Scene): void;
  draw?(ctx: CanvasRenderingContext2D, scene: Scene): void;
  /** Disable the right-click menu on the canvas */
  blockContextMenu?: boolean;
}

/** Keeps a scene's tools and sends them canvas pointer events. */
export class ToolManager {
  constructor(scene: Scene);
  scene: Scene;
  list: Tool[];
  add(tool: Tool): void;
  remove(tool: Tool): void;
  clear(): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface OrbitCameraOptions {
  /** Point to orbit around (default origin) */
  target?: Vec3;
  /** Distance to the target (default: the camera's current distance) */
  distance?: number;
  /** Starting yaw (default: the camera's yaw) */
  yaw?: number;
  /** Starting pitch (default: the camera's pitch) */
  pitch?: number;
  /** Radians per dragged pixel (default 0.005) */
  rotateSpeed?: number;
  /** Zoom amount per scroll unit (default 0.001) */
  zoomSpeed?: number;
  /** Closest zoom (default 0.1) */
  minDistance?: number;
  /** Farthest zoom (default 100) */
  maxDistance?: number;
  /** Allow orbiting (default true) */
  rotate?: boolean;
  /** Allow panning (default true) */
  pan?: boolean;
  /** Allow zooming (default true) */
  zoom?: boolean;
  /** Turn around the target on its own, paused while dragging (default false) */
  autoRotate?: boolean;
  /** Auto-rotate speed in radians per second; negative turns the other way (default 0.5) */
  autoRotateSpeed?: number;
  /** Seconds to wait after a drag before auto-rotating again (default 0) */
  autoRotateDelay?: number;
}

/** Mouse camera controls that turn around a target point. */
export class OrbitCamera implements Tool {
  constructor(opts?: OrbitCameraOptions);
  target: Vec3;
  /** Set once the tool is attached */
  distance: number;
  /** Set once the tool is attached */
  yaw: number;
  /** Set once the tool is attached */
  pitch: number;
  rotateSpeed: number;
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;
  rotate: boolean;
  pan: boolean;
  zoom: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  autoRotateDelay: number;
  blockContextMenu: boolean;
  /** Places the camera from the target, distance, yaw and pitch. */
  apply(camera: Camera): void;
  /** Restarts the auto-rotate wait, as if the user had just dragged (for tools that turn the camera). */
  holdAutoRotate(): void;
  attach(scene: Scene): void;
  pointerDown(e: ToolPointerEvent): boolean;
  pointerMove(e: ToolPointerEvent, scene: Scene): void;
  pointerUp(): void;
  wheel(e: ToolWheelEvent, scene: Scene): boolean;
  update(dt: number, scene: Scene): void;
}

export interface FlyCameraOptions {
  /** Units per second (default 1) */
  speed?: number;
  /** Speed multiplier while Shift is held (default 3) */
  fastMultiplier?: number;
  /** Radians per second with the arrow keys (default 1.5) */
  turnSpeed?: number;
  /** Radians per dragged pixel (default 0.005) */
  lookSpeed?: number;
}

/** Keyboard + mouse camera that flies freely through the scene. */
export class FlyCamera implements Tool {
  constructor(opts?: FlyCameraOptions);
  speed: number;
  fastMultiplier: number;
  turnSpeed: number;
  lookSpeed: number;
  attach(): void;
  detach(): void;
  pointerDown(e: ToolPointerEvent): boolean;
  pointerMove(e: ToolPointerEvent, scene: Scene): void;
  update(dt: number, scene: Scene): void;
}

export interface DragObjectOptions {
  /** Mouse button that drags (default 0, left) */
  button?: number;
  /** Which objects can be dragged (default: those without `draggable: false`) */
  filter?: (obj: SceneObject) => boolean;
  /** Pick by triangles instead of bounding boxes (default false, see `pickHit`) */
  exact?: boolean;
  /** Drag the top-level object (the whole group) of what was clicked (default false) */
  root?: boolean;
  /** Called when an object is picked */
  onPick?: (obj: SceneObject) => void;
  /** Called each time the object moves */
  onMove?: (obj: SceneObject) => void;
  /** Called when the object is released */
  onDrop?: (obj: SceneObject) => void;
}

/** Click an object to pick it, then drag to move it. */
export class DragObject implements Tool {
  constructor(opts?: DragObjectOptions);
  button: number;
  filter: (obj: SceneObject) => boolean;
  exact: boolean;
  root: boolean;
  onPick?: (obj: SceneObject) => void;
  onMove?: (obj: SceneObject) => void;
  onDrop?: (obj: SceneObject) => void;
  /** The object being dragged, or null. */
  dragging: SceneObject | null;
  pointerDown(e: ToolPointerEvent, scene: Scene): boolean;
  pointerMove(e: ToolPointerEvent, scene: Scene): void;
  pointerUp(): void;
  detach(): void;
}

export interface HoverHighlightOptions {
  /** Highlight color (default "#ffffff") */
  color?: string;
  /** Which objects can be highlighted (default: those without `hoverable: false`) */
  filter?: (obj: SceneObject) => boolean;
  /** Pick by triangles instead of bounding boxes (default false, see `pickHit`) */
  exact?: boolean;
  /** Called when the hovered object changes */
  onChange?: (obj: SceneObject | null) => void;
}

/** Changes an object's color while the pointer is over it. */
export class HoverHighlight implements Tool {
  constructor(opts?: HoverHighlightOptions);
  color: string;
  filter: (obj: SceneObject) => boolean;
  exact: boolean;
  onChange?: (obj: SceneObject | null) => void;
  /** The object under the pointer, or null. */
  hovered: SceneObject | null;
  pointerMove(e: ToolPointerEvent, scene: Scene): void;
  pointerLeave(): void;
  detach(): void;
}

export interface FpsMeterOptions {
  /** Text color (default "#ffffff") */
  color?: string;
  /** CSS font (default "14px monospace") */
  font?: string;
  /** Where to draw it (default "top-left") */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Seconds between refreshes (default 0.5) */
  interval?: number;
}

/** Draws the frames per second in a corner of the canvas. */
export class FpsMeter implements Tool {
  constructor(opts?: FpsMeterOptions);
  color: string;
  font: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  interval: number;
  /** Last measured frames per second. */
  fps: number;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
}

export interface ObjUploaderOptions {
  /** Size of the model's largest side; null keeps the file's units (default 1) */
  fit?: number | null;
  /** Color of loaded models (default: the scene's color) */
  color?: string;
  /** Remove the previously loaded model first (default true) */
  replace?: boolean;
  /** Text shown while nothing is loaded; "" for none */
  hint?: string;
  /** Called with the object after it's added */
  onLoad?: (obj: SceneObject, file: File, scene: Scene) => void;
  /** Called when a file can't be read */
  onError?: (err: Error, file: File) => void;
}

/** Lets the user load .obj files into the scene (drag and drop, or `open()`). */
export class ObjUploader implements Tool {
  constructor(opts?: ObjUploaderOptions);
  fit: number | null;
  color?: string;
  replace: boolean;
  hint: string;
  onLoad?: (obj: SceneObject, file: File, scene: Scene) => void;
  onError: (err: Error, file: File) => void;
  /** The last object this tool added, or null. */
  object: SceneObject | null;
  /** Shows the file dialog and loads the chosen file. Call it from a user action. */
  open(): Promise<SceneObject | null>;
  /** Loads a .obj file into the scene. */
  load(file: Blob): Promise<SceneObject | null>;
  attach(scene: Scene): void;
  detach(scene: Scene): void;
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
}

export interface ViewGizmoOptions {
  /** Camera controls to turn (default: the scene's first OrbitCamera). Without one, it only shows the axes */
  orbit?: OrbitCamera;
  /** Where it sits (default "top-right") */
  corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  /** Radius in CSS pixels (default 42) */
  size?: number;
  /** Distance from the canvas corner in CSS pixels (default 14) */
  margin?: number | { x: number; y: number };
  /** Seconds the camera takes to turn to a clicked axis (default 0.35) */
  duration?: number;
}

/**
 * The X, Y, Z axes in a corner, turning with the camera; click one to look along it.
 * Add it after the OrbitCamera.
 */
export class ViewGizmo implements Tool {
  constructor(opts?: ViewGizmoOptions);
  orbit: OrbitCamera | null;
  corner: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  size: number;
  margin: { x: number; y: number };
  duration: number;
  /** Hide or show the gizmo without removing the tool. */
  visible: boolean;
  /** Whether a canvas pixel is on the gizmo (as last drawn). */
  contains(x: number, y: number): boolean;
  /** Turns the camera smoothly to look at its target from `dir` ({ x: 0, y: 1, z: 0 }: from above). */
  lookAlong(dir: Vec3): void;
  attach(scene: Scene): void;
  detach(): void;
  pointerDown(e: ToolPointerEvent): boolean;
  update(dt: number, scene: Scene): void;
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
}

export type TransformMode = "move" | "rotate" | "scale";

/** A move, rotate or scale in world space, as `TransformGizmo` reports it. */
export type TransformOp =
  | { mode: "move"; delta: Vec3 }
  /** A right-handed turn of `angle` radians around the unit `axis`, about `center` */
  | { mode: "rotate"; axis: Vec3; angle: number; center: Vec3 }
  /** `factor` about `center`: uniform when `axis` is null, otherwise along that unit axis */
  | { mode: "scale"; axis: Vec3 | null; factor: number; center: Vec3 };

export interface TransformGizmoOptions {
  /** Default "move" */
  mode?: TransformMode;
  /** Objects it edits (default none) */
  targets?: SceneObject[];
  /** Handle length in CSS pixels (default 70) */
  size?: number;
  /** Change the targets' transforms while dragging (default true) */
  apply?: boolean;
  /** Where the handles sit and what rotate / scale go around (default "bounds") */
  pivot?: GizmoPivot;
  /** A handle was grabbed */
  onGrab?: (targets: SceneObject[]) => void;
  /** While dragging: the operation since the grab */
  onChange?: (op: TransformOp, targets: SceneObject[]) => void;
  /** On release: the whole operation */
  onDrop?: (op: TransformOp, targets: SceneObject[]) => void;
}

/**
 * Where a `TransformGizmo` puts its handles and turns / scales around:
 * - `"bounds"`: the middle of the targets' bounding box
 * - `"origin"`: the targets' origins in the world (averaged)
 * - a world point (moved along when the gizmo moves the targets)
 * - a function asked every frame
 */
export type GizmoPivot = "bounds" | "origin" | Vec3 | ((targets: SceneObject[]) => Vec3 | null);

/**
 * Move arrows, rotate rings or scale handles on one or more objects, around a
 * pivot (default: the middle of their bounding box). Add it after the camera tool.
 */
export class TransformGizmo implements Tool {
  constructor(opts?: TransformGizmoOptions);
  mode: TransformMode;
  targets: SceneObject[];
  size: number;
  apply: boolean;
  pivot: GizmoPivot;
  onGrab?: (targets: SceneObject[]) => void;
  onChange?: (op: TransformOp, targets: SceneObject[]) => void;
  onDrop?: (op: TransformOp, targets: SceneObject[]) => void;
  /** Hide the handles (and ignore clicks) without removing the tool. */
  visible: boolean;
  /** True while a handle is being dragged. */
  readonly dragging: boolean;
  /** The pivot in world space, or null when there are no targets. */
  center(): Vec3 | null;
  draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
  pointerDown(e: ToolPointerEvent, scene: Scene): boolean;
  pointerMove(e: ToolPointerEvent, scene: Scene): void;
  pointerUp(): void;
  pointerLeave(scene: Scene): void;
  detach(scene: Scene): void;
}

export interface ScreenBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Finds the object under a canvas pixel (by screen bounding box). */
export function pick(
  scene: Scene,
  x: number,
  y: number,
  opts?: { filter?: (obj: SceneObject) => boolean; padding?: number; exact?: boolean },
): SceneObject | null;

/** What `pickHit` found. */
export interface PickHit {
  object: SceneObject;
  /** Index in `mesh.faces`, or -1 for a line of a wireframe */
  face: number;
  /** Distance in front of the camera */
  depth: number;
  /** The object, then its groups up to the top: `[part, group, ..., root]` */
  path: SceneObject[];
  /** Where the hit is, in the world */
  point: Vec3;
  /** Where the hit is, in the mesh's own space */
  local: Vec3;
  /** The 3 vertex indices of the triangle hit (polygons are fans from their first corner); null for a line */
  triangle: [number, number, number] | null;
  /** Weights of those vertices at the hit (they add up to 1); null for a line */
  barycentric: [number, number, number] | null;
  /** Unit normal of the face hit, in the world, on its front side; null for a line */
  normal: Vec3 | null;
  /** Texture coordinates at the hit (the material's mapping, before repeat / offset / rotation); null without any */
  uv: UV | null;
  /** Where the texture is read: `uv` with the material's repeat, offset and rotation; null without texture coordinates */
  textureUV: UV | null;
}

/** Whether picking can find an object (not when it or a group above it has `pickable: false`). */
export function isPickable(obj: SceneObjectInput & { parent?: SceneObjectInput | null }): boolean;

/**
 * Exact picking: the nearest object whose triangles (or, without faces, lines
 * within `padding` pixels) are under a canvas pixel.
 */
export function pickHit(
  scene: Scene,
  x: number,
  y: number,
  opts?: { filter?: (obj: SceneObject) => boolean; padding?: number; objects?: SceneObject[] },
): PickHit | null;

/** Screen-space bounding box of an object, or null if it's all behind the camera. */
export function screenBounds(scene: Scene, obj: SceneObject): ScreenBox | null;

/** World units one canvas pixel covers at a distance from the camera. */
export function worldPerPixel(scene: Scene, depth: number): number;

// ---------------------------------------------------------------------------
// Drawing and the frame loop
// ---------------------------------------------------------------------------

/** Fills the whole canvas with a color. */
export function clear(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void;
/** Draws a square point centered at a screen position. */
export function point(ctx: CanvasRenderingContext2D, p: Vec2, color: string, size?: number): void;
/** Draws a line between two screen points. */
export function line(ctx: CanvasRenderingContext2D, p1: Vec2, p2: Vec2, color: string, width?: number): void;
/** Draws edges between already-projected screen points. */
export function drawWireframe(
  ctx: CanvasRenderingContext2D,
  points2: Vec2[],
  edges: number[][],
  color: string,
  width?: number,
): void;
/** Draws a mesh instance as a wireframe. */
export function drawInstance(
  ctx: CanvasRenderingContext2D,
  inst: { mesh: Mesh } & Transform,
  camera: Camera,
  w: number,
  h: number,
  color: string,
  lineWidth?: number,
  /** World matrix to place it with (e.g. `obj.world` inside a group); default: its own transform */
  world?: Mat4,
): void;
/** Turns edge definitions into pairs of vertex indices. */
export function edgeSegments(edges?: number[][]): Generator<[number, number]>;
/** The lines a wireframe draws for a mesh: its `edges`, or its face outlines when it has none. */
export function wireEdges(mesh: { edges?: number[][]; faces?: number[][] }): number[][];

/** Runs `update` every animation frame. Returns a function that stops it. */
export function loop(update: (dt: number, time: number) => void, opts?: { maxDt?: number }): () => void;

/** Turns any CSS color into [r, g, b, a] (r, g, b in 0..255, a in 0..1). */
export function parseColor(ctx: CanvasRenderingContext2D, color: string): RGBA;

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/** Default vertical field of view (90°). */
export const DEFAULT_FOV: number;
/** Default near plane distance. */
export const DEFAULT_NEAR: number;

export function localToWorld(v: Vec3, inst: Transform): Vec3;
export function worldToCamera(pWorld: Vec3, camera: Camera): Vec3;
export function cameraToScreen(pCam: Vec3, camera: Camera, w: number, h: number): Vec2;
export function worldToScreen(pWorld: Vec3, camera: Camera, w: number, h: number): Vec2;
export function cameraForward(camera: Camera): Vec3;
export function cameraRight(camera: Camera): Vec3;
export function cameraUp(camera: Camera): Vec3;
/** Clips a camera-space segment against the near plane. Null if fully behind. */
export function clipNear(a: Vec3, b: Vec3, near: number): [Vec3, Vec3] | null;
export function scale(p: Vec3, sx: number, sy: number, sz: number): Vec3;
export function translate(p: Vec3, dx: number, dy: number, dz: number): Vec3;
export function rotateX(p: Vec3, angle: number): Vec3;
export function rotateY(p: Vec3, angle: number): Vec3;
export function rotateZ(p: Vec3, angle: number): Vec3;
/** Rotates around X, then Y, then Z. */
export function rotateXYZ(p: Vec3, rot: Vec3): Vec3;
/** Perspective projection to normalized coordinates (-1..1). */
export function project(p: Vec3, fov?: number, aspect?: number): Vec2;
/** Normalized coordinates to canvas pixels. */
export function screen(p: Vec2, w: number, h: number): Vec2;

// ---------------------------------------------------------------------------
// Rotations
// ---------------------------------------------------------------------------

/** 3×3 matrix, row-major (m[row][col]), applied as M · v. */
export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

/** The matrix `rotateXYZ(p, rot)` applies. */
export function matFromEuler(rot: Vec3): Mat3;
/** Angles for `rotateXYZ` (an object's `rot`) from a rotation matrix; the inverse of `matFromEuler`. */
export function eulerFromMat(m: Mat3): Vec3;
/** A right-handed turn of `angle` radians around a unit `axis`. */
export function matFromAxisAngle(axis: Vec3, angle: number): Mat3;
/** Matrix product a · b (b is applied first). */
export function mulMat(a: Mat3, b: Mat3): Mat3;
/** m · v */
export function mulVec(m: Mat3, v: Vec3): Vec3;
/** Applies a world-space move / rotate / scale to a transform and returns the new one. */
export function applyTransformOp(t: Transform, op: TransformOp): Transform;

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

export type TextureStyle = "noise" | "marble" | "wood" | "bricks" | "checker" | "bark" | "spots" | "stripes" | "solid";
/** The built-in styles of `makeTexture`. */
export const TEXTURE_STYLES: TextureStyle[];

export interface MakeTextureOptions {
  /** Width and height in pixels (default 256) */
  size?: number;
  /** [first, second]: hex, rgb() / rgba(), CSS names or [r, g, b, a?] (default: suits the style) */
  colors?: (string | number[])[];
  /** How many times the pattern repeats across, a whole number (default 4) */
  scale?: number;
  /** Another whole number gives another texture of the same style (default 0) */
  seed?: number;
  /** Fine speckles on top, 0 to 1 (default 0) */
  grain?: number;
  /** Paint into this canvas instead of a new one (calls `updateTexture` for you) */
  canvas?: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * Paints a seamless procedural texture on a canvas. `style` is a built-in style, or
 * `(u, v) => t` (0: first color, 1: second).
 */
export function makeTexture(
  style?: TextureStyle | ((u: number, v: number) => number),
  opts?: MakeTextureOptions,
): HTMLCanvasElement | OffscreenCanvas;
/** The pixels of a procedural texture (RGBA, top row first), without a canvas. */
export function texturePixels(
  style?: TextureStyle | ((u: number, v: number) => number),
  opts?: Omit<MakeTextureOptions, "canvas">,
): { width: number; height: number; data: Uint8ClampedArray };
/** [r, g, b, a] (0..255, a 0..1) from a color string or array. */
export function colorBytes(color: string | number[]): [number, number, number, number];

// ---------------------------------------------------------------------------
// Groups (scene graph)
// ---------------------------------------------------------------------------

/**
 * Every visible object of a scene (or of objects and their subtrees), parents first,
 * with `parent` and `world` set. Groups without a mesh are included.
 */
export function worldObjects(input: Scene | SceneObjectInput | SceneObjectInput[]): SceneObject[];
/** An object's world matrix right now, from its transform and its parents'. */
export function worldMatrix(obj: SceneObjectInput): Mat4;
/** Where an object's origin is in the world right now. */
export function worldPosition(obj: SceneObjectInput): Vec3;
/** The chain from an object up to the top: `[obj, parent, ..., root]`. */
export function ancestors(obj: SceneObject): SceneObject[];
/**
 * Calls `fn(obj, world, parent)` for every visible object under some roots, parents first,
 * without changing anything. `baseOf(root)` is the matrix a root goes under (null: none).
 */
export function forEachPlaced(
  roots: SceneObjectInput[],
  baseOf: (root: SceneObjectInput) => Mat4 | null,
  fn: (obj: SceneObjectInput, world: Mat4, parent: SceneObjectInput | null) => void,
): void;

// ---------------------------------------------------------------------------
// Matrices
// ---------------------------------------------------------------------------

/** 4×4 transform matrix, 16 numbers in column-major order (`m[col * 4 + row]`), like WebGL. */
export type Mat4 = number[];

/** The identity matrix. */
export function identityMat4(): Mat4;
/** The matrix of a transform: scale, rotate X → Y → Z, then move. */
export function mat4FromTransform(t: MeshTransform): Mat4;
/** a · b (b applied first): a child's world matrix is `mulMat4(parentWorld, childLocal)`. */
export function mulMat4(a: Mat4, b: Mat4): Mat4;
/** Inverse of a transform matrix (identity if it flattens space). */
export function invertMat4(m: Mat4): Mat4;
/** Determinant of the 3×3 part: < 0 when the matrix mirrors. */
export function determinantMat4(m: Mat4): number;
/** A point through a matrix. */
export function transformPoint(m: Mat4, p: Vec3): Vec3;
/** A direction or offset through a matrix (not moved). */
export function transformDirection(m: Mat4, v: Vec3): Vec3;
/** The 3×3 normal matrix (inverse transpose), column-major. */
export function normalMatrix(m: Mat4): number[];
/** A normal through a normal matrix, unit length. */
export function transformNormal(nm: number[], n: Vec3): Vec3;
/** A world-space `TransformOp` in a parent's space, for objects inside groups. */
export function transformOpToLocal(op: TransformOp, parentWorld: Mat4): TransformOp;

// ---------------------------------------------------------------------------
// Random numbers and noise
// ---------------------------------------------------------------------------

/** A seeded random generator (mulberry32): each call returns the next number in [0, 1). */
export function rng(seed?: number): () => number;

export interface NoiseOptions {
  /** Whole number; another seed gives other noise (default 0) */
  seed?: number;
  /** Repeat every this many units, a whole number, for seamless textures (default 0: never) */
  period?: number;
}

export interface FbmOptions extends NoiseOptions {
  /** Layers of detail (default 5) */
  octaves?: number;
  /** Strength of each layer compared to the one before (default 0.5) */
  gain?: number;
}

/** Smooth 2D value noise in [0, 1). */
export function noise2(x: number, y: number, opts?: NoiseOptions): number;
/** Smooth 3D value noise in [0, 1). */
export function noise3(x: number, y: number, z: number, opts?: NoiseOptions): number;
/** Fractal 2D noise: octaves of noise2, each twice as fine. About [0, 1), averaging 0.5. */
export function fbm2(x: number, y: number, opts?: FbmOptions): number;
/** Fractal 3D noise: octaves of noise3, each twice as fine. About [0, 1), averaging 0.5. */
export function fbm3(x: number, y: number, z: number, opts?: FbmOptions): number;

// Modeling: curves

export interface SplineOptions {
  /** Points made between two control points (default 8) */
  segments?: number;
  /** The last point joins the first (a loop); the result doesn't repeat the first point (default false) */
  closed?: boolean;
  /** 0 = uniform, 0.5 = centripetal: no loops or overshoot (default), 1 = chordal */
  alpha?: number;
  /** 0 = smooth (default), 1 = straight lines between the points */
  tension?: number;
  /** Instead of `segments`: this many points in all, evenly spaced by length */
  count?: number;
  /** Instead of `segments`: points about this far apart, evenly spaced */
  spacing?: number;
}

/**
 * A smooth curve through `points` (Catmull-Rom: it passes through every
 * point). Works with 2D, 3D and lathe `{ r, y }` points: every number field
 * of the first point is a coordinate, and the result has the same fields.
 */
export function spline<P extends Point2 | Vec3 | ProfilePoint>(points: P[], opts?: SplineOptions): P[];

export interface ResampleOptions {
  /** Number of points in all */
  count?: number;
  /** Distance between points (used when `count` isn't given) */
  spacing?: number;
  /** The points form a loop (default false) */
  closed?: boolean;
}

/** Points along a polyline, evenly spaced by length. The ends stay where they are. */
export function resamplePath<P extends Point2 | Vec3 | ProfilePoint>(points: P[], opts?: ResampleOptions): P[];

// Modeling: sweep

/** A size along a path: a number, numbers spread evenly from start to end, or a function of t (0 at the start, 1 at the end). */
export type SizeAlong = number | number[] | ((t: number) => number);

export interface SweepOptions {
  /** The cross-section: x to the path's side, y to its "up" (default: a circle of `radius`) */
  profile?: Point2[];
  /** The profile is a closed outline (default true); false = an open line, for ribbons, leaves and roads */
  profileClosed?: boolean;
  /** Radius of the default circle (default 0.1). Ignored with a `profile` */
  radius?: SizeAlong;
  /** Points around the default circle (default 16) */
  segments?: number;
  /** Size of the section along the path (default 1). 0 at an end closes it into a point */
  scale?: SizeAlong;
  /** Turn of the section from start to end, in radians (default 0). Whole turns on a closed path */
  twist?: number;
  /** The path is a loop: its end joins its start (default false) */
  closed?: boolean;
  /** Close the ends with flat caps (default true; open paths with closed profiles) */
  caps?: boolean;
  /** Keep the section's y pointed this way (roads, rails, frames). Default: carried along the path without spinning */
  up?: Vec3;
  /** Stretch the section at sharp corners so the tube keeps its thickness (default true) */
  miter?: boolean;
}

/**
 * Moves a cross-section along a 3D path: tails, horns, tentacles, handles,
 * pipes, cables, rails. Without `profile`, a round tube of `radius`.
 * Clockwise faces; uvs: u around the section, v along the path.
 */
export function sweep(path: Vec3[], opts?: SweepOptions): Mesh;
