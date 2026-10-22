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
 */
export interface Mesh {
  vertices: Vec3[];
  edges: number[][];
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

/** What you pass to `scene.add`. Missing transform fields get defaults. */
export interface SceneObjectInput {
  mesh: Mesh;
  pos?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
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
}

/**
 * An object in a scene, after `scene.add` filled in its transform.
 * Extra fields you add (like `{ mesh, name: "box" }`) are kept in the type.
 */
export type SceneObject<T extends SceneObjectInput = SceneObjectInput> = T & Transform;

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
  /** Direction light comes from (default: above, left and in front) */
  light?: Vec3;
  /** Brightness of faces turned away from the light, 0..1 (default 0.25) */
  ambient?: number;
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
  light: Vec3;
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
  /** Cube size (default 0.5) */
  size?: number;
  /** Box width (default 0.6) */
  w?: number;
  /** Box height (default 0.6) */
  h?: number;
  /** Box depth (default 0.6) */
  d?: number;
  /** Sphere radius (default 0.45) */
  r?: number;
  /** Sphere latitude bands (default 12) */
  rings?: number;
  /** Sphere points per ring (default 24) */
  segments?: number;
}

export type ShapeKind = "cube" | "box" | "sphere";

/** Creates a built-in mesh (with faces and texture coordinates). */
export function makeShape(kind: ShapeKind, opts?: ShapeOptions): Mesh;

/** Scales a mesh's vertices in place. Returns the same mesh. */
export function scaleMesh<M extends { vertices: Vec3[] }>(mesh: M, sx?: number, sy?: number, sz?: number): M;

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
  render(scene: Scene): void;
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
  /** Unit direction light comes from */
  lightDir: Vec3;
  /** How much the point faces the light (0..1) */
  diffuse: number;
  /** Brightness Trid used: ambient + (1 - ambient) × diffuse */
  light: number;
  /** The scene's ambient level */
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
  /** Material names from `usemtl` lines, when the file uses more than one */
  materialNames?: string[];
}

export interface ObjOptions {
  /** Center the model and scale it so its largest side is this long */
  fit?: number;
}

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
/** Whether a source can change over time (canvas, video). */
export function textureIsLive(src: TextureSource): boolean;

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
}

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
  blockContextMenu: boolean;
  /** Places the camera from the target, distance, yaw and pitch. */
  apply(camera: Camera): void;
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
  /** Called when the hovered object changes */
  onChange?: (obj: SceneObject | null) => void;
}

/** Changes an object's color while the pointer is over it. */
export class HoverHighlight implements Tool {
  constructor(opts?: HoverHighlightOptions);
  color: string;
  filter: (obj: SceneObject) => boolean;
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
  opts?: { filter?: (obj: SceneObject) => boolean; padding?: number },
): SceneObject | null;

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
): void;
/** Turns edge definitions into pairs of vertex indices. */
export function edgeSegments(edges: number[][]): Generator<[number, number]>;

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
