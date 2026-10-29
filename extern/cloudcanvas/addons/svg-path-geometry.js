/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * SVG path geometry: path data as GPU triangle meshes. `pathGeometry(d)` fills and strokes a path as MESH_STRIDE
 * vertices (`x, y, z, nx, ny, nz`; flat, so z = 0 and the normal is (0, 0, 1)) and indexed triangles, in path
 * units - the add-on maps a viewBox onto the blit's box. The fill nests each ring under the smallest ring holding
 * it, winds the rings down that tree under the fill rule, and ear-clips every filled ring with its direct children
 * as holes (`./svg-path-triangulate.js`); the stroke is a quad per segment with a bevel or miter triangle at each
 * join. Plain math: no DOM, no GPU.
 */
import { MESH_STRIDE } from './gpu-scene.js';
import { flattenPath } from './svg-path-parse.js';
import { CLIP_BUDGET, triangulate } from './svg-path-triangulate.js';

export { PATH_LIMIT, POINT_LIMIT, flattenPath, parsePath } from './svg-path-parse.js';

/** SVG's default miter limit: a miter longer than this many stroke widths falls back to a bevel. */
const MITER_LIMIT = 4;

/** The most vertices Uint16 indices serve: index 0xffff stays free (WebGL2's primitive restart index). */
const UINT16_VERTICES = 65535;

/** Vertices of one ring sampled to decide whether it lies inside another. */
const CONTAINMENT_SAMPLES = 16;

/** How far off one line, relative to a ring's size, a point must lie for the ring to hold any area. */
const COLLINEAR = 1e-12;

const FILL_RULES = /* @__PURE__ */ new Set(['nonzero', 'evenodd']);
const JOINS = /* @__PURE__ */ new Set(['bevel', 'miter']);
const CAPS = /* @__PURE__ */ new Set(['butt', 'square']);

/** A geometry with nothing in it. */
function emptyGeometry() {
  return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
}

/** Flat x, y pairs and triangle indices as a mesh; no triangles, the empty geometry. A coordinate past 32-bit
 * float range (a stroke far out) throws a TypeError rather than reach the GPU as an infinity. */
function meshOf(coords, indices) {
  if (indices.length === 0) return emptyGeometry();
  const count = coords.length / 2;
  const vertices = new Float32Array(count * MESH_STRIDE);
  for (let k = 0; k < count; k += 1) {
    vertices[k * MESH_STRIDE] = coords[2 * k];
    vertices[k * MESH_STRIDE + 1] = coords[2 * k + 1];
    vertices[k * MESH_STRIDE + 5] = 1;
    if (!Number.isFinite(vertices[k * MESH_STRIDE] + vertices[k * MESH_STRIDE + 1])) {
      throw new TypeError('svg-path: geometry out of 32-bit float range');
    }
  }
  return { vertices, indices: (count <= UINT16_VERTICES ? Uint16Array : Uint32Array).from(indices) };
}

function listOf(subpaths) {
  if (!Array.isArray(subpaths)) throw new TypeError('svg-path: subpaths must be an array of {points, closed}');
  return subpaths;
}

/** A subpath's points, checked: flat x, y pairs of finite numbers. */
function pointsOf(subpath) {
  const points = subpath?.points;
  if (!points || typeof points.length !== 'number' || points.length % 2 !== 0) {
    throw new TypeError('svg-path: a subpath needs its points as flat x, y pairs');
  }
  for (let k = 0; k < points.length; k += 1) {
    if (!Number.isFinite(points[k])) throw new TypeError('svg-path: a subpath point is not a finite number');
  }
  return points;
}

/** Points with consecutive duplicates dropped - and, for a ring, a last point repeating the first. */
function distinct(points, ring) {
  const out = [];
  for (let k = 0; k < points.length; k += 2) {
    const n = out.length;
    if (n === 0 || points[k] !== out[n - 2] || points[k + 1] !== out[n - 1]) out.push(points[k], points[k + 1]);
  }
  const n = out.length;
  if (ring && n > 2 && out[0] === out[n - 2] && out[1] === out[n - 1]) out.length = n - 2;
  return out;
}

/** `[minX, minY, maxX, maxY]` of flat x, y pairs. */
function boundsOf(points) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < points.length; k += 2) {
    box[0] = Math.min(box[0], points[k]);
    box[1] = Math.min(box[1], points[k + 1]);
    box[2] = Math.max(box[2], points[k]);
    box[3] = Math.max(box[3], points[k + 1]);
  }
  return box;
}

/** A ring's signed area (shoelace): positive counter-clockwise with y up, so clockwise on screen. */
function signedArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    sum += points[j] * points[i + 1] - points[i] * points[j + 1];
  }
  return sum / 2;
}

/** Whether every point lies on the line from the first to the farthest: a ring that holds no area. */
function isCollinear(points) {
  const [x0, y0] = [points[0], points[1]];
  let far = 2;
  let farthest = 0;
  for (let k = 2; k < points.length; k += 2) {
    const d = (points[k] - x0) ** 2 + (points[k + 1] - y0) ** 2;
    if (d > farthest) [far, farthest] = [k, d];
  }
  const [dx, dy] = [points[far] - x0, points[far + 1] - y0];
  for (let k = 2; k < points.length; k += 2) {
    if (Math.abs(dx * (points[k + 1] - y0) - dy * (points[k] - x0)) > COLLINEAR * farthest) return false;
  }
  return true;
}

/** A subpath as a fill ring - closed, whatever its flag (SVG fills open subpaths as if closed) - or null. */
function ringOf(subpath) {
  const points = Float64Array.from(distinct(pointsOf(subpath), true));
  if (points.length < 6 || isCollinear(points)) return null;
  return { points, box: boundsOf(points), area: signedArea(points), base: -1, parent: null, children: [], winding: 0 };
}

/** Whether (x, y) lies on the segment a-b. */
function onEdge(ax, ay, bx, by, x, y) {
  return (bx - ax) * (y - ay) === (by - ay) * (x - ax)
    && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by);
}

/** Where (x, y) lies against a ring: 1 inside, -1 outside, 0 on its boundary (crossing count). */
function pointSide(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];
    if (onEdge(xi, yi, xj, yj, x, y)) return 0;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 1 : -1;
}

/** Whether ring `inner` lies inside ring `outer`: the first of its sampled vertices off outer's boundary decides;
 * a ring lying wholly on the other's boundary counts as inside. */
function ringContains(outer, inner) {
  const count = inner.length / 2;
  const stride = Math.max(1, Math.floor(count / CONTAINMENT_SAMPLES));
  for (let k = 0; k < count; k += stride) {
    const side = pointSide(outer, inner[2 * k], inner[2 * k + 1]);
    if (side !== 0) return side > 0;
  }
  return true;
}

function boxContains(outer, inner) {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

/** The smallest ring before `order[k]` that holds it: rings are ordered largest first. */
function parentOf(order, k) {
  const ring = order[k];
  for (let j = k - 1; j >= 0; j -= 1) {
    if (boxContains(order[j].box, ring.box) && ringContains(order[j].points, ring.points)) return order[j];
  }
  return null;
}

/**
 * Rings largest first (by bounds, then area), each under the smallest ring holding it, with the winding number
 * just inside it: its parent's, plus one for a counter-clockwise ring (y up), minus one for a clockwise one.
 */
function nestRings(rings) {
  const extent = ({ box }) => (box[2] - box[0]) * (box[3] - box[1]);
  const order = rings.slice().sort((a, b) => extent(b) - extent(a) || Math.abs(b.area) - Math.abs(a.area));
  for (let k = 0; k < order.length; k += 1) {
    const ring = order[k];
    ring.parent = parentOf(order, k);
    if (ring.parent) ring.parent.children.push(ring);
    ring.winding = (ring.parent ? ring.parent.winding : 0) + (ring.area < 0 ? -1 : 1);
  }
  return order;
}

/**
 * The fill of flattened subpaths (`flattenPath`'s `{points, closed}`) as a mesh. The region just inside a ring is
 * filled when its winding number passes the rule - `nonzero`, or `evenodd` - and is triangulated as that ring minus
 * its direct children, so a hole is a nested ring (for `nonzero`, one wound against its parent). Rings that cross
 * themselves or each other are covered best effort; degenerate input gives the empty geometry.
 */
export function fillGeometry(subpaths, fillRule = 'nonzero') {
  if (!FILL_RULES.has(fillRule)) {
    throw new TypeError(`svg-path: fill rule must be 'nonzero' or 'evenodd', not ${String(fillRule)}`);
  }
  const rings = listOf(subpaths).map(ringOf).filter(Boolean);
  const filled = fillRule === 'evenodd' ? (winding) => winding % 2 !== 0 : (winding) => winding !== 0;
  const coords = [];
  const triangles = [];
  const budget = { left: CLIP_BUDGET };
  const place = (ring) => {
    if (ring.base >= 0) return;
    ring.base = coords.length / 2;
    for (const value of ring.points) coords.push(value);
  };
  for (const ring of nestRings(rings)) {
    if (!filled(ring.winding)) continue;
    place(ring);
    ring.children.forEach(place);
    triangulate(ring, ring.children, triangles, budget);
  }
  return meshOf(coords, triangles);
}

/** A segment's quad - corners start + normal, start - normal, end + normal, end - normal - and its direction. */
function segmentQuad(mesh, points, a, b, half) {
  const [ax, ay, bx, by] = [points[2 * a], points[2 * a + 1], points[2 * b], points[2 * b + 1]];
  const length = Math.hypot(bx - ax, by - ay);
  const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
  const [nx, ny] = [-uy * half, ux * half];
  const base = mesh.coords.length / 2;
  mesh.coords.push(ax + nx, ay + ny, ax - nx, ay - ny, bx + nx, by + ny, bx - nx, by - ny);
  mesh.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  return [ux, uy];
}

/** Square caps: an open line's first and last quads pushed out half a width along the line. */
function squareCaps({ mesh, first, dirs, half }, segments) {
  const shift = (vertex, ux, uy) => {
    mesh.coords[2 * vertex] += ux * half;
    mesh.coords[2 * vertex + 1] += uy * half;
  };
  const last = segments - 1;
  const end = first + 4 * last;
  [first, first + 1].forEach((vertex) => shift(vertex, -dirs[0], -dirs[1]));
  [end + 2, end + 3].forEach((vertex) => shift(vertex, dirs[2 * last], dirs[2 * last + 1]));
}

/** The miter point on the outer side (`side`: +1 the + normal, -1 the - normal), or null past MITER_LIMIT. */
function miterPoint(px, py, u0x, u0y, u1x, u1y, side, half) {
  const dot = u0x * u1x + u0y * u1y;
  if (!(Math.sqrt(2 / (1 + dot)) <= MITER_LIMIT)) return null;
  const scale = (side * half) / (1 + dot);
  return [px - (u0y + u1y) * scale, py + (u0x + u1x) * scale];
}

/**
 * The join at point (px, py) between segments `before` and `after`, on the corner's outer side: a bevel triangle
 * between the two quads, or a miter (two triangles) no longer than MITER_LIMIT widths. A straight corner needs none.
 */
function joinAt(line, px, py, before, after) {
  const { mesh, first, dirs, half } = line;
  const [u0x, u0y, u1x, u1y] = [dirs[2 * before], dirs[2 * before + 1], dirs[2 * after], dirs[2 * after + 1]];
  const turn = u0x * u1y - u0y * u1x;
  if (turn === 0) return;
  const outer = turn > 0 ? 1 : 0;
  const outerEnd = first + 4 * before + 2 + outer;
  const outerStart = first + 4 * after + outer;
  const centre = mesh.coords.length / 2;
  mesh.coords.push(px, py);
  const miter = line.join === 'miter' ? miterPoint(px, py, u0x, u0y, u1x, u1y, outer ? -1 : 1, half) : null;
  if (!miter) {
    mesh.indices.push(centre, outerEnd, outerStart);
    return;
  }
  mesh.coords.push(miter[0], miter[1]);
  mesh.indices.push(centre, outerEnd, centre + 1, centre, centre + 1, outerStart);
}

/** One subpath's stroke: a quad per segment, then a join at each inner corner - every corner when closed. */
function strokeLine(mesh, points, closed, half, { join, cap }) {
  const n = points.length / 2;
  const segments = closed ? n : n - 1;
  const line = { mesh, first: mesh.coords.length / 2, dirs: new Float64Array(segments * 2), half, join };
  for (let s = 0; s < segments; s += 1) line.dirs.set(segmentQuad(mesh, points, s, (s + 1) % n, half), 2 * s);
  if (!closed && cap === 'square') squareCaps(line, segments);
  const corners = closed ? n : n - 1;
  for (let j = closed ? 0 : 1; j < corners; j += 1) {
    joinAt(line, points[2 * j], points[2 * j + 1], (j - 1 + segments) % segments, j);
  }
}

/**
 * The stroke of flattened subpaths as a mesh, `width` across: one quad per segment, a `join` ('bevel', or 'miter'
 * with SVG's limit of 4, falling back to a bevel) at each corner, and a closed subpath joins its end to its start;
 * an open one ends in `cap` ('butt', or 'square'). A width of zero or less gives the empty geometry. The quads
 * overlap on the inner side of a corner.
 */
export function strokeGeometry(subpaths, width, { join = 'bevel', cap = 'butt' } = {}) {
  if (typeof width !== 'number' || Number.isNaN(width) || width === Infinity) {
    throw new TypeError('svg-path: stroke width must be a finite number');
  }
  if (!JOINS.has(join)) throw new TypeError(`svg-path: join must be 'bevel' or 'miter', not ${String(join)}`);
  if (!CAPS.has(cap)) throw new TypeError(`svg-path: cap must be 'butt' or 'square', not ${String(cap)}`);
  const lines = listOf(subpaths).map((subpath) => ({ points: pointsOf(subpath), closed: subpath.closed === true }));
  if (width <= 0) return emptyGeometry();
  const mesh = { coords: [], indices: [] };
  for (const { points, closed } of lines) {
    const kept = distinct(points, closed);
    if (kept.length >= 4) strokeLine(mesh, kept, closed, width / 2, { join, cap });
  }
  return meshOf(mesh.coords, mesh.indices);
}

/** The bounds of every flattened point - the path's own, like getBBox(), stroke not included; empty: all zero. */
function pathBounds(subpaths) {
  const box = subpaths.map(({ points }) => boundsOf(points)).reduce((a, b) => [
    Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  return box[0] <= box[2] ? box : [0, 0, 0, 0];
}

/**
 * Path data as meshes: `{fill, stroke, bounds}` - each geometry `{vertices, indices}` or null when not asked for,
 * `bounds` `[minX, minY, maxX, maxY]` of the path's points. `join` and `cap` go to the stroke. Malformed data
 * throws a TypeError; data or points past PATH_LIMIT or POINT_LIMIT, a RangeError.
 */
export function pathGeometry(d, options = {}) {
  const { fill = true, fillRule = 'nonzero', stroke = false, strokeWidth = 1, tolerance = 0.25, join, cap } = options;
  const subpaths = flattenPath(d, tolerance);
  return {
    fill: fill ? fillGeometry(subpaths, fillRule) : null,
    stroke: stroke ? strokeGeometry(subpaths, strokeWidth, { join, cap }) : null,
    bounds: pathBounds(subpaths)
  };
}
