import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dropOnto, attachTo, alignObjects, distributeObjects,
  makeShape, meshBounds, worldMatrix, transformPoint, transformDirection, worldObjects,
} from "../trid/index.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearVec = (a, b, eps = 1e-6) => { near(a.x, b.x, eps); near(a.y, b.y, eps); near(a.z, b.z, eps); };
const box = (w, h, d, pos = {}, rot = {}) => ({
  mesh: makeShape("box", { w, h, d }),
  pos: { x: 0, y: 0, z: 0, ...pos }, rot: { x: 0, y: 0, z: 0, ...rot }, scale: { x: 1, y: 1, z: 1 },
});
const ground = () => box(10, 1, 10, { y: -0.5 }); // top at y = 0

test("dropOnto: a box falls onto the ground and rests on it", () => {
  const crate = box(1, 1, 1, { x: 0.3, y: 5, z: -0.2 });
  const floor = ground();
  const hit = dropOnto(crate, [floor]);
  near(meshBounds(crate).min.y, 0);
  near(hit.distance, 4.5);
  assert.equal(hit.object, floor);
  near(crate.pos.x, 0.3); near(crate.pos.z, -0.2);
  near(hit.point.y, 0);
});

test("dropOnto: onto a sphere, the box rests on its top point", () => {
  const ball = { mesh: makeShape("sphere", { r: 1 }), pos: { x: 0, y: 0, z: 0 } };
  const crate = box(0.5, 0.5, 0.5, { y: 4 });
  dropOnto(crate, ball);
  near(meshBounds(crate).min.y, 1);
});

test("dropOnto: two crossed beams meet ridge to ridge, with no corner near the contact", () => {
  // Both beams have their corners only at their far ends, and are turned 45° so an edge runs along the top / bottom
  const s = 0.2, ridge = (s * Math.SQRT2) / 2;
  const lower = box(4, s, s, {}, { x: Math.PI / 4 });                      // along x, an edge on top
  const upper = box(s, s, 4, { y: 3 }, { z: Math.PI / 4 });                // along z, an edge underneath
  dropOnto(upper, lower);
  near(upper.pos.y, 2 * ridge, 1e-9);
});

test("dropOnto: a box sunk into the table is lifted out and set on top", () => {
  const table = box(2, 0.2, 2, { y: 1 }); // top at 1.1
  const cup = box(0.2, 0.3, 0.2, { y: 1.05 });
  const hit = dropOnto(cup, table);
  near(meshBounds(cup).min.y, 1.1);
  assert.ok(hit.distance < 0);
  // Already resting: doesn't move
  const again = dropOnto(cup, table);
  near(again.distance, 0, 1e-6);
});

test("dropOnto: gap, maxDistance, nothing below, other directions", () => {
  const floor = ground();
  const a = box(1, 1, 1, { y: 3 });
  dropOnto(a, floor, { gap: 0.1 });
  near(meshBounds(a).min.y, 0.1);
  const far = box(1, 1, 1, { y: 30 });
  assert.equal(dropOnto(far, floor, { maxDistance: 5 }), null);
  near(far.pos.y, 30);
  const beside = box(1, 1, 1, { x: 20, y: 3 });
  assert.equal(dropOnto(beside, floor), null);
  // Pushed sideways against a wall
  const wall = box(0.2, 3, 3, { x: 4 });
  const pushed = box(1, 1, 1, { x: 0 });
  dropOnto(pushed, wall, { direction: { x: 2, y: 0, z: 0 } });
  near(meshBounds(pushed).max.x, 3.9);
});

test("dropOnto: works inside turned and scaled groups, and skips itself in a scene", () => {
  const floor = ground();
  const part = box(1, 1, 1, { x: 0.5, y: 2 });
  const group = { pos: { x: 1, y: 3, z: 0 }, rot: { x: 0, y: 0.7, z: 0.2 }, scale: { x: 2, y: 2, z: 2 }, children: [part] };
  const scene = { objects: [floor, group] };
  worldObjects(group);
  dropOnto(part, scene);
  near(meshBounds(part).min.y, 0);
  // The whole group, with the scene as the target (the group isn't its own target)
  group.pos.y += 5;
  dropOnto(group, scene);
  near(meshBounds(group).min.y, 0);
});

test("attachTo: sits the object's base on the nearest surface, its up along the normal", () => {
  const ball = { mesh: makeShape("sphere", { r: 1, rings: 48, segments: 96 }), pos: { x: 0, y: 0, z: 0 } };
  const horn = { mesh: makeShape("cone", { r: 0.1, h: 0.4 }), pos: { x: 1, y: 1, z: 0.3 } };
  const hit = attachTo(horn, ball);
  assert.equal(hit.object, ball);
  // The surface point is close to the sphere, in the direction of where the horn was
  near(Math.hypot(hit.point.x, hit.point.y, hit.point.z), 1, 2e-3);
  const dir = { x: 1, y: 1, z: 0.3 }, l = Math.hypot(1, 1, 0.3);
  nearVec(hit.normal, { x: dir.x / l, y: dir.y / l, z: dir.z / l }, 0.05);
  // Its up is the surface's normal, and its base center is the surface point
  const m = worldMatrix(horn);
  const up = transformDirection(m, { x: 0, y: 1, z: 0 });
  const ul = Math.hypot(up.x, up.y, up.z);
  nearVec({ x: up.x / ul, y: up.y / ul, z: up.z / ul }, hit.normal, 1e-9);
  const b = meshBounds(horn.mesh);
  nearVec(transformPoint(m, { x: b.center.x, y: b.min.y, z: b.center.z }), hit.point, 1e-9);
});

test("attachTo: offset sinks it in, at picks the spot, align: false keeps the turn, anchor origin", () => {
  const wall = box(0.2, 4, 4, { x: 2 });
  const plaque = box(0.5, 0.5, 0.05, { x: 0, y: 0.5, z: 0 });
  const hit = attachTo(plaque, wall, { at: { x: 0, y: 1, z: 0.5 }, axis: "-z", offset: 0.01 });
  // The wall's near side faces -x: the plaque's back (-z) side goes toward the wall... its local -z follows the normal
  nearVec(hit.normal, { x: -1, y: 0, z: 0 });
  nearVec(hit.point, { x: 1.9, y: 1, z: 0.5 });
  const back = transformDirection(worldMatrix(plaque), { x: 0, y: 0, z: -1 });
  nearVec(back, { x: -1, y: 0, z: 0 }, 1e-9);
  // Its +z side (the far side from the base along -z) sits 0.01 off the wall
  near(meshBounds(plaque).min.x, 1.9 - 0.01 - 0.05, 1e-9);

  const peg = box(0.1, 0.1, 0.1, { x: 0, y: 0, z: 0 }, { y: 0.3 });
  attachTo(peg, wall, { align: false, anchor: "origin", offset: -0.02 });
  near(peg.rot.y, 0.3);
  nearVec(peg.pos, { x: 1.92, y: 0, z: 0 });
  assert.equal(attachTo(peg, [], {}), null);
  assert.throws(() => attachTo(peg, wall, { axis: "w" }), /Unknown axis/);
});

test("attachTo: inside a group, the object lands where asked in the world", () => {
  const ball = { mesh: makeShape("sphere", { r: 1 }), pos: { x: 0, y: 0, z: 0 } };
  const ear = box(0.1, 0.3, 0.1);
  const head = { pos: { x: 0.2, y: -0.3, z: 0 }, rot: { x: 0.4, y: 1, z: 0 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, children: [ear] };
  worldObjects(head);
  const hit = attachTo(ear, ball, { at: { x: 0, y: 3, z: 0 } });
  const m = worldMatrix(ear);
  const b = meshBounds(ear.mesh);
  nearVec(transformPoint(m, { x: b.center.x, y: b.min.y, z: b.center.z }), hit.point, 1e-9);
  const up = transformDirection(m, { x: 0, y: 1, z: 0 });
  const ul = Math.hypot(up.x, up.y, up.z);
  nearVec({ x: up.x / ul, y: up.y / ul, z: up.z / ul }, hit.normal, 1e-9);
});

test("alignObjects: bottoms level, centers on a reference, several axes", () => {
  const a = box(1, 1, 1, { y: 2 }), b = box(1, 2, 1, { x: 3, y: -1 }), c = box(1, 1, 1, { x: 6, y: 5 });
  alignObjects([a, b, c], { axis: "y", to: "min" });
  for (const o of [a, b, c]) near(meshBounds(o).min.y, -2);
  const table = box(4, 0.2, 2, { x: 10, y: 1, z: 3 });
  alignObjects([a, b], { axis: ["x", "z"], to: "center", reference: table });
  for (const o of [a, b]) { near(meshBounds(o).center.x, 10); near(meshBounds(o).center.z, 3); }
  alignObjects([c], { axis: "y", to: "max", reference: 7 });
  near(meshBounds(c).max.y, 7);
});

test("distributeObjects: equal spaces between the ends, or a fixed gap", () => {
  const items = [box(1, 1, 1, { x: 0 }), box(2, 1, 1, { x: 1 }), box(1, 1, 1, { x: 1.5 }), box(1, 1, 1, { x: 10 })];
  distributeObjects(items, { axis: "x" });
  const boxes = items.map(meshBounds).sort((p, q) => p.min.x - q.min.x);
  near(boxes[0].min.x, -0.5); near(boxes[3].max.x, 10.5);
  const spaces = [1, 2, 3].map((i) => boxes[i].min.x - boxes[i - 1].max.x);
  near(spaces[0], spaces[1]); near(spaces[1], spaces[2]);
  distributeObjects(items, { axis: "x", gap: 0 });
  const touching = items.map(meshBounds).sort((p, q) => p.min.x - q.min.x);
  for (let i = 1; i < 4; i++) near(touching[i].min.x, touching[i - 1].max.x);
  near(touching[0].min.x, -0.5);
});
