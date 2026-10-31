import {
  Scene, lathe, cloneMesh, makeLattice, latticePoints, latticeMesh, latticeCage, WebGLRenderer, OrbitCamera,
} from "./trid/index.js";

// Columns with many rows (a lattice only moves vertices, so it needs plenty): round, and square
const rows = (r) => Array.from({ length: 31 }, (_, i) => ({ r, y: -0.45 + (i / 30) * 0.9 }));
const column = lathe(rows(0.2), { segments: 48, capBottom: true, capTop: true });
const square = lathe(rows(0.2), { segments: 4, capBottom: true, capTop: true });

// A vase: the top layer wider, the middle pinched ("cardinal": the shape passes through the points)
const vaseLattice = makeLattice(column, { div: { x: 3, y: 4, z: 3 }, padding: 0.02 });
for (const p of latticePoints(vaseLattice, { y: -1 })) { p.x *= 1.6; p.z *= 1.6; }
for (const p of latticePoints(vaseLattice, { y: 1 })) { p.x *= 0.55; p.z *= 0.55; }
const vase = latticeMesh(cloneMesh(column), vaseLattice, { interpolation: "cardinal" });

// A creature-ish lean: the upper layers pushed forward and to the side, one corner pulled out
const leanLattice = makeLattice(column, { div: 3, padding: 0.02 });
for (const p of latticePoints(leanLattice, { y: 2 })) { p.x += 0.18; p.z -= 0.1; }
for (const p of latticePoints(leanLattice, { y: 1 })) p.x += 0.06;
latticePoints(leanLattice, { x: 0, y: 0, z: 0 })[0].x -= 0.25;
const lean = latticeMesh(cloneMesh(column), leanLattice);

// Live: the top layer of a square column turns back and forth, and the mesh follows every frame
const twistLattice = makeLattice(square, { div: 3, padding: 0.02 });
const rest = twistLattice.points.map((p) => ({ ...p }));
const twist = { mesh: cloneMesh(square) };

export default function (canvas) {
  const scene = new Scene(canvas, {
    width: 800, height: 340, camera: { fov: 0.6 }, color: "#8ab4f8",
    renderer: WebGLRenderer.isSupported() ? new WebGLRenderer() : undefined,
  });
  const shapes = [vase, lean, null];
  const lattices = [vaseLattice, leanLattice, twistLattice];
  let twistCage;
  ["#E9806E", "#98c379", "#e5c07b"].forEach((fill, i) => {
    const pos = { x: (i - 1) * 1.05, y: 0, z: 0 };
    const obj = i === 2 ? twist : { mesh: shapes[i] };
    scene.add(Object.assign(obj, { pos, material: { fill, smooth: i < 2 } }));
    const cage = scene.add({ mesh: latticeCage(lattices[i]), pos }); // the cage, as lines
    if (i === 2) twistCage = cage;
  });
  scene.use(new OrbitCamera({ distance: 3.6, pitch: -0.3 }));

  const top = latticePoints(twistLattice, { y: -1 });
  scene.start((dt, time) => {
    // Turn the top layer from its rest places, then apply to a fresh copy
    const a = Math.sin(time * 1.2) * 0.9;
    top.forEach((p) => {
      const r = rest[twistLattice.points.indexOf(p)];
      p.x = r.x * Math.cos(a) - r.z * Math.sin(a);
      p.z = r.x * Math.sin(a) + r.z * Math.cos(a);
    });
    twist.mesh = latticeMesh(cloneMesh(square), twistLattice);
    twistCage.mesh.dirty = true; // the cage's points moved
  });
  return () => scene.destroy();
}
