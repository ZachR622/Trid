import { clear, drawInstance } from "./simple3d/render/draw.js";
import { makeShape } from "./simple3d/render/shapes.js";

// Colors
const BG = "#141414"
const FG1 = "#E9806E"
const FG2 = "#7ae96eff"

// Variables
let canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

canvas.width = 800
canvas.height = 800

// Camera sits 1 unit back from the origin, looking down +Z
let camera = { z: -1 };

const shape1 = {
    mesh: makeShape("sphere", { r: 0.5, rings: 8, segments: 12 }),
    pos: { x: -0.6, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
    scale: { x: 0.5, y: 0.5, z: 0.5 },
}

const shape2 = {
    mesh: makeShape("cube", { size: 0.5 }),
    pos: { x:  0.6, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0 },
    scale: { x: 0.5, y: 1.5, z: 0.5 },
}

let last = performance.now();

function frame(now){
    // Real elapsed time in seconds, capped so a hidden tab doesn't cause a big jump
    const dt = Math.min(Math.max(now - last, 0) / 1000, 0.1);
    last = now;

    shape1.rot.y += Math.PI*dt/4;
    shape2.rot.y -= Math.PI*dt/2;
    shape2.rot.x -= Math.PI*dt/3;
    clear(ctx, canvas.width, canvas.height, BG);

    draw(shape1, FG1);
    draw(shape2, FG2);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(shape, color){
    drawInstance(ctx, shape, camera, canvas.width, canvas.height, color);
}