/**
 * Trid: a small 3D library for the HTML canvas.
 *
 * Everything the library offers, from one file:
 *
 *   import { Scene, makeShape, OrbitCamera } from "trid3d";        // with npm
 *   import { Scene, makeShape, OrbitCamera } from "./trid/index.js"; // with the folder
 *
 * The individual modules can still be imported directly.
 */

// Scene
export { Scene } from "./scene.js";
export { worldObjects, worldMatrix, worldPosition, ancestors, forEachPlaced } from "./sceneGraph.js";

// Shapes and meshes
export { makeShape, scaleMesh, lathe, extrude, triangulate } from "./render/shapes.js";
export { cloneMesh, transformMesh, displaceMesh, mergeMeshes, meshBounds } from "./render/meshUtils.js";

// Renderers
export { CanvasRenderer, DEFAULT_LIGHT, DEFAULT_AMBIENT, materialsOf } from "./render/canvasRenderer.js";
export { WebGLRenderer, DEFAULT_FAR } from "./render/webglRenderer.js";

// Effects
export {
  toon, rim, edgeGlow, unlit, gradient, fog,
  buildEffects, effectsKey, uniformType, SURFACE_GLSL,
} from "./render/effects.js";

// Procedural textures
export { makeTexture, texturePixels, colorBytes, TEXTURE_STYLES } from "./render/proceduralTextures.js";

// Texture mapping
export { computeUVs, mapUVs, uvsFor, uvTransform, applyUVTransform, mappingOf, mappingKey, MAPPINGS } from "./render/uvMapping.js";

// Normals (smooth shading)
export { cornerNormals, creaseOf, newell, DEFAULT_CREASE } from "./render/normals.js";

// Loading files
export { parseOBJ, loadOBJ, loadMaterials, readOBJFile, pickOBJFile, fitMesh } from "./loaders/obj.js";
export { parseMTL } from "./loaders/mtl.js";
export { loadTexture, textureReady, textureSize, textureIsLive, updateTexture, textureVersion } from "./loaders/texture.js";

// Exporting
export { exportOBJ } from "./export/obj.js";
export { exportMTL, objMaterials, exportModel, textureToBlob } from "./export/mtl.js";
export { screenshot, record, download } from "./export/capture.js";

// Tools
export {
  OrbitCamera, FlyCamera, DragObject, HoverHighlight, FpsMeter, ObjUploader,
  ViewGizmo, TransformGizmo,
  ToolManager, pick, pickHit, screenBounds, worldPerPixel,
} from "./tools/index.js";

// Drawing and the frame loop
export { clear, point, line, drawWireframe, drawInstance, edgeSegments, wireEdges } from "./render/draw.js";
export { loop } from "./render/loop.js";
export { parseColor } from "./render/color.js";

// Math
export {
  localToWorld, worldToCamera, cameraToScreen, worldToScreen,
  cameraForward, cameraRight, cameraUp, clipNear,
  scale, translate, rotateX, rotateY, rotateZ, rotateXYZ,
  DEFAULT_FOV, DEFAULT_NEAR,
} from "./math/transform.js";
export { project, screen } from "./math/projection.js";
export { matFromEuler, eulerFromMat, matFromAxisAngle, mulMat, mulVec, applyTransformOp } from "./math/rotation.js";
export {
  identityMat4, mat4FromTransform, mulMat4, invertMat4, determinantMat4,
  transformPoint, transformDirection, normalMatrix, transformNormal, transformOpToLocal,
} from "./math/matrix.js";

// Random numbers and noise
export { rng, noise2, noise3, fbm2, fbm3 } from "./math/noise.js";
