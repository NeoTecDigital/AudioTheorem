/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Unit geometry for the mesh add-on: a box, a plane and a sphere centred on the origin, one unit across, as
 * interleaved `[x, y, z, nx, ny, nz]` vertices (`MESH_STRIDE`, `./gpu-scene.js`) and triangle indices. A mesh
 * blit scales one to its box and depth.
 */

/** A unit box: four vertices per face so each face has its own normal. */
export function boxGeometry() {
  const faces = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
  ];
  const vertices = [];
  const indices = [];
  faces.forEach(([n, u, v], face) => {
    for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      vertices.push(n[0] / 2 + u[0] * a + v[0] * b, n[1] / 2 + u[1] * a + v[1] * b, n[2] / 2 + u[2] * a + v[2] * b, ...n);
    }
    const o = face * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { vertices: Float32Array.from(vertices), indices: Uint16Array.from(indices) };
}

/** A unit plane facing the viewer (+z). */
export function planeGeometry() {
  return {
    vertices: Float32Array.of(-0.5, -0.5, 0, 0, 0, 1, 0.5, -0.5, 0, 0, 0, 1, 0.5, 0.5, 0, 0, 0, 1, -0.5, 0.5, 0, 0, 0, 1),
    indices: Uint16Array.of(0, 1, 2, 0, 2, 3)
  };
}

/** A unit sphere of `rings` x `segments` quads (clamped to 3..64). */
export function sphereGeometry(rings = 16, segments = 24) {
  const r = Math.min(64, Math.max(3, Math.floor(rings)));
  const s = Math.min(64, Math.max(3, Math.floor(segments)));
  const vertices = [];
  const indices = [];
  for (let i = 0; i <= r; i += 1) {
    const phi = (i / r) * Math.PI;
    for (let j = 0; j <= s; j += 1) {
      const theta = (j / s) * Math.PI * 2;
      const n = [Math.sin(phi) * Math.cos(theta), -Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
      vertices.push(n[0] / 2, n[1] / 2, n[2] / 2, ...n);
    }
  }
  for (let i = 0; i < r; i += 1) {
    for (let j = 0; j < s; j += 1) {
      const a = i * (s + 1) + j;
      const b = a + s + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { vertices: Float32Array.from(vertices), indices: Uint16Array.from(indices) };
}
