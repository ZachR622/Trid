# Rays, inside and distance

Questions about a mesh's surface, asked in code: where a ray first meets it, whether a point is inside it, and how far a point is from it. Use them to stick eyes and buttons onto a curved body, drop things onto terrain, scatter rocks or grass on a surface, check line of sight, or find parts hidden inside others.

```js
import {
  meshQuery, raycastMesh, pointInMesh, distanceToMesh, closestPointOnMesh, isClosed, raycastScene, clearQueryCache,
} from "./trid/index.js";
```

<Demo src="query" hint="dots shot at a rock land on its surface · a ray found with raycastScene · grid points inside a ring — drag to orbit" />

<<< @/demos/query.js

## `meshQuery(mesh)`

Prepares a mesh for many questions. It splits the faces into triangles and builds a BVH (boxes inside boxes), so each question only looks at the few triangles near it: a ray on a 16,000-triangle body takes a few microseconds instead of a third of a millisecond. Preparing costs about as much as one slow question (a few tens of milliseconds for 16,000 triangles), so keep the query while you ask.

```js
const q = meshQuery(head);
const hit = q.raycast(from, { x: 0, y: 0, z: 1 });  // first hit, or null
q.contains(p);                                       // inside? (closed meshes)
q.distance(p);                                       // to the surface
q.closest(p);                                        // the nearest point, with its normal
```

A query is a **snapshot**: it copies the triangles when it's made, so changing the mesh afterwards doesn't change its answers. Make a new one after editing. Everything is in the mesh's own space (`mesh.vertices`); for objects placed in a scene, see [`raycastScene`](#raycastscene-scene-origin-direction-opts).

| Method | Returns |
| --- | --- |
| `raycast(origin, direction, { maxDistance, side })` | The first hit, or `null`. `direction` can be any length but zero. `side`: `"both"` (default), `"front"` (only faces hit from outside) or `"back"` (only from inside) |
| `contains(p)` | Whether the point is inside. Only meaningful for a closed mesh (see `isClosed`) |
| `closest(p, { maxDistance })` | The nearest point of the surface, or `null` when nothing is within `maxDistance` |
| `distance(p, maxDistance?)` | The distance to the surface; `Infinity` when nothing is within `maxDistance` (a limit makes it faster) |
| `triangleCount`, `bounds` | How many triangles, and the mesh's box `{ min, max }` |

A hit (and `closest`) has:

| Field | Meaning |
| --- | --- |
| `point` | Where it is |
| `normal` | Unit normal of the face, pointing **out** of the mesh, whichever side the ray came from |
| `distance` | From the ray's origin (or from `p` for `closest`) |
| `face` | Index in `mesh.faces` |
| `front` | `true` when the ray met the face from outside (not on `closest`) |
| `triangle`, `barycentric` | The 3 vertex indices of the triangle (faces with more corners are fans from their first corner, like [`pickHit`](../api#pickhit)) and their weights at the point |

To put something on a surface, shoot a ray at it and use the point and the normal:

```js
const hit = q.raycast({ x: 0.2, y: 0.3, z: 2 }, { x: 0, y: 0, z: -1 }, { side: "front" });
if (hit) eye.pos = { x: hit.point.x + hit.normal.x * 0.01, y: hit.point.y + hit.normal.y * 0.01, z: hit.point.z + hit.normal.z * 0.01 };
```

Rays start just past their origin, so a ray starting on the surface doesn't hit the face it starts on.

`contains` sends rays in a few fixed, odd directions and counts the faces each one crosses: an odd count is inside. Rays that pass too close to an edge or a corner are ignored, and the answer is what most of the remaining rays say, so points lined up with edges get the right answer. On a mesh with holes, the answer depends on the direction and means little.

## One-off questions

`raycastMesh(mesh, origin, direction, opts?)`, `pointInMesh(mesh, p)`, `distanceToMesh(mesh, p, maxDistance?)` and `closestPointOnMesh(mesh, p, opts?)` are the same as calling `meshQuery(mesh)` and asking once. Each one prepares the mesh again, so for more than a couple of questions on the same mesh, keep a `meshQuery`.

## `isClosed(mesh)`

Whether the mesh is closed (watertight): every edge is shared by exactly two faces. Edges are matched by vertex position, so unwelded meshes and texture seams count as closed. Only a closed mesh has an inside. The built-in cube, box, sphere, cylinder, cone and torus are closed, and so are `blobMesh` results; a plane isn't. For more detail, [`validateMesh`](./cleanup#validatemesh-mesh) lists the open edges.

## `raycastScene(scene, origin, direction, opts?)`

The first object a ray meets in a scene, in **world space**: the 3D version of [`pickHit`](../api#pickhit). Each object's position, rotation, scale and groups are taken into account, so the point, normal and distance are where things are drawn (normals stay outward on stretched and mirrored objects).

```js
// What's below the player?
const ground = raycastScene(scene, player.pos, { x: 0, y: -1, z: 0 }, { filter: (o) => o !== player });
if (ground) player.pos.y = ground.point.y;
```

`scene` is a `Scene` or a list of objects. The options are `maxDistance` and `side` (as for `raycast`, in world units), `filter(obj)` to skip objects, and `objects` to look only at some objects and their children. Hidden objects, objects with `pickable: false` (or inside a group with it), and objects without faces (wireframes) are skipped.

The hit has the fields above, in the world, plus `object` (the object with the mesh hit), `path` (`[part, group, ..., root]`) and `local` (the point in the mesh's own space).

Each mesh is prepared the first time a ray reaches it, and kept until the mesh changes: new `vertices` or `faces` arrays, a different number of them, or `mesh.dirty` set. Moving objects costs nothing. If you change a mesh's vertices in place and a renderer has already cleared `dirty` (it does after each frame), call `clearQueryCache(mesh)`.
