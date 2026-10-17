import { Scene } from "./simple3d/scene.js";
import { makeShape } from "./simple3d/render/shapes.js";

// Colors
const BG = "#141414"
const FG1 = "#E9806E"
const FG2 = "#7ae96eff"

const scene = new Scene(document.getElementById("canvas"), {
    width: 1920/2,
    height: 1080/2,
    background: BG,
    camera: { z: -1 },
})

const shape1 = scene.add({
    mesh: makeShape("sphere", { r: 0.5, rings: 8, segments: 12 }),
    pos: { x: -0.6, y: 0, z: 0 },
    scale: { x: 0.5, y: 0.5, z: 0.5 },
    color: FG1,
})

const shape2 = scene.add({
    mesh: makeShape("cube", { size: 0.5 }),
    pos: { x:  0.6, y: 0, z: 0 },
    scale: { x: 0.5, y: 1.5, z: 0.5 },
    color: FG2,
})

scene.start((dt) => {
    shape1.rot.y += Math.PI*dt/4;
    shape2.rot.y -= Math.PI*dt/2;
    shape2.rot.x -= Math.PI*dt/3;
})
