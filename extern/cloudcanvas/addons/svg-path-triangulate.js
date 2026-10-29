/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Ear clipping for one polygon with holes, the earcut technique (after Mapbox's earcut, ISC): each hole is bridged
 * into the outer ring from its leftmost vertex to a visible outer vertex, then ears are clipped from the one ring
 * left, through a z-order index past 80 vertices so an ear test looks only near the ear. A ring that stalls is
 * filtered, then cured of local crossings, then split along a diagonal, so self-crossing input is covered best
 * effort; every loop is bounded, and all of them share a budget of vertex visits. Plain math: no DOM.
 */

/** Vertex visits one fill may spend; past it the fill keeps the triangles it has. */
export const CLIP_BUDGET = 200000000;

/** Vertices past which ear tests go through the z-order index. */
const HASH_THRESHOLD = 80;

/** A ring vertex: its mesh index, position, ring links and z-order links. */
class Vertex {
  constructor(index, x, y) {
    this.index = index;
    this.x = x;
    this.y = y;
    this.prev = this;
    this.next = this;
    this.z = 0;
    this.prevZ = null;
    this.nextZ = null;
  }
}

/**
 * Triangulate `outer` minus `holes`, pushing mesh indices onto `triangles`: three per triangle, counter-clockwise
 * (y up) wherever the rings are simple. A ring is `{points, area, base}`: x, y pairs, its signed area (positive counter-clockwise, y up) and
 * the mesh index of its first point. `budget` (`{left}`) is spent as vertices are visited.
 */
export function triangulate(outer, holes, triangles, budget = { left: CLIP_BUDGET }) {
  let start = linkRing(outer, true);
  if (!start || start.next === start.prev) return;
  const context = { triangles, budget, grid: null };
  if (holes.length > 0) start = bridgeHoles(holes, start, budget);
  const total = holes.reduce((sum, hole) => sum + hole.points.length / 2, outer.points.length / 2);
  if (total > HASH_THRESHOLD) context.grid = gridOf(outer.points);
  const work = [{ start, pass: 0 }];
  while (work.length > 0 && budget.left > 0) {
    const item = work.pop();
    clipRing(item.start, item.pass, context, work);
  }
}

/** Twice the signed area of p, q, r - negative when they turn counter-clockwise (y up), as the outer ring runs. */
function area(p, q, r) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function equals(p, q) {
  return p.x === q.x && p.y === q.y;
}

/** Whether (px, py) lies in the counter-clockwise triangle a, b, c, edges included. */
function insideTriangle(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py)
    && (ax - px) * (by - py) >= (bx - px) * (ay - py)
    && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

/** A node linked in after `last` (or alone). */
function insertAfter(node, last) {
  if (last) {
    node.next = last.next;
    node.prev = last;
    last.next.prev = node;
    last.next = node;
  }
  return node;
}

function remove(node) {
  node.next.prev = node.prev;
  node.prev.next = node.next;
  if (node.prevZ) node.prevZ.nextZ = node.nextZ;
  if (node.nextZ) node.nextZ.prevZ = node.prevZ;
}

/** A ring as a circular list, counter-clockwise (y up) or clockwise; a closing duplicate is dropped. */
function linkRing({ points, area: signed, base }, counterClockwise) {
  const count = points.length / 2;
  const forward = (signed > 0) === counterClockwise;
  let last = null;
  for (let k = 0; k < count; k += 1) {
    const at = forward ? k : count - 1 - k;
    last = insertAfter(new Vertex(base + at, points[2 * at], points[2 * at + 1]), last);
  }
  if (last && last !== last.next && equals(last, last.next)) {
    remove(last);
    last = last.next;
  }
  return last;
}

/** Drop duplicate and collinear vertices from `start` round to `end`; a vertex of what is left. */
function filterPoints(start, end = start) {
  let p = start;
  let last = end;
  let again;
  do {
    again = false;
    if (equals(p, p.next) || area(p.prev, p, p.next) === 0) {
      remove(p);
      p = last = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== last);
  return last;
}

/** One pass of ear clipping; a ring that stalls moves on to the next remedy. */
function clipRing(start, pass, context, work) {
  if (!start || start.prev === start.next) return;
  if (pass === 0 && context.grid) indexCurve(start, context.grid, context.budget);
  let ear = start;
  let stop = start;
  while (ear.prev !== ear.next && context.budget.left > 0) {
    context.budget.left -= 1;
    const next = ear.next;
    if (context.grid ? isEarHashed(ear, context) : isEar(ear, context.budget)) {
      context.triangles.push(ear.prev.index, ear.index, next.index);
      remove(ear);
      ear = next.next;
      stop = ear;
      continue;
    }
    ear = next;
    if (ear === stop) {
      rescue(ear, pass, context, work);
      return;
    }
  }
}

/** A stalled ring: filtered and retried, then cured of local crossings, then split in two. */
function rescue(ear, pass, context, work) {
  if (pass === 0) work.push({ start: filterPoints(ear), pass: 1 });
  else if (pass === 1) work.push({ start: cureCrossings(filterPoints(ear), context.triangles), pass: 2 });
  else splitRing(ear, context.budget, work);
}

/** The bounds of the triangle a, b, c. */
function boxOf(a, b, c) {
  return [Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y)];
}

/** Whether `p` - a reflex vertex inside the ear a, b, c, not a corner - stops the ear being clipped. */
function blocks(p, a, b, c, box) {
  return p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3] && p !== a && p !== c
    && !equals(p, a) && insideTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && area(p.prev, p, p.next) >= 0;
}

/** Whether `ear` is convex with no vertex of the ring inside it. */
function isEar(ear, budget) {
  const a = ear.prev;
  const c = ear.next;
  if (area(a, ear, c) >= 0) return false;
  const box = boxOf(a, ear, c);
  for (let p = c.next; p !== a; p = p.next) {
    budget.left -= 1;
    if (blocks(p, a, ear, c, box)) return false;
  }
  return true;
}

/** `isEar` through the z-order index: only vertices whose z falls in the ear's box are looked at. */
function isEarHashed(ear, { grid, budget }) {
  const a = ear.prev;
  const c = ear.next;
  if (area(a, ear, c) >= 0) return false;
  const box = boxOf(a, ear, c);
  const minZ = zOrder(box[0], box[1], grid);
  const maxZ = zOrder(box[2], box[3], grid);
  for (let p = ear.prevZ; p && p.z >= minZ; p = p.prevZ) {
    budget.left -= 1;
    if (blocks(p, a, ear, c, box)) return false;
  }
  for (let p = ear.nextZ; p && p.z <= maxZ; p = p.nextZ) {
    budget.left -= 1;
    if (blocks(p, a, ear, c, box)) return false;
  }
  return true;
}

/** Clip `a, p, p.next, b` where edges a-p and p.next-b cross: one triangle, two vertices gone. */
function cureCrossings(start, triangles) {
  let p = start;
  let stop = start;
  do {
    const a = p.prev;
    const b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.index, p.index, b.index);
      remove(p);
      remove(p.next);
      p = stop = b;
    }
    p = p.next;
  } while (p !== stop);
  return filterPoints(p);
}

/** Split a stalled ring along a valid diagonal; each half starts again from the first pass. */
function splitRing(start, budget, work) {
  let a = start;
  do {
    const b = diagonalFrom(a, budget);
    if (b) {
      const c = splitPolygon(a, b);
      work.push({ start: filterPoints(a, a.next), pass: 0 }, { start: filterPoints(c, c.next), pass: 0 });
      return;
    }
    a = a.next;
  } while (a !== start && budget.left > 0);
}

/** A vertex `a` may be joined to by a diagonal inside the ring, or null. */
function diagonalFrom(a, budget) {
  for (let b = a.next.next; b !== a.prev && budget.left > 0; b = b.next) {
    if (a.index !== b.index && isValidDiagonal(a, b, budget)) return b;
  }
  return null;
}

/** Whether a-b lies inside the ring, crosses no edge, and makes no sectors facing the wrong way. */
function isValidDiagonal(a, b, budget) {
  if (a.next.index === b.index || a.prev.index === b.index || crossesRing(a, b, budget)) return false;
  const visible = locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)
    && (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0);
  return visible || (equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** For collinear p, q, r: whether q lies on the segment p-r. */
function onSegment(p, q, r) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x)
    && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

/** Whether segments p1-q1 and p2-q2 meet, touching included. */
function intersects(p1, q1, p2, q2) {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(p1, p2, q1)) || (o2 === 0 && onSegment(p1, q2, q1))
    || (o3 === 0 && onSegment(p2, p1, q2)) || (o4 === 0 && onSegment(p2, q1, q2));
}

/** Whether the diagonal a-b crosses an edge of the ring that does not end at a or b. */
function crossesRing(a, b, budget) {
  let p = a;
  do {
    budget.left -= 1;
    const touches = p.index === a.index || p.next.index === a.index || p.index === b.index || p.next.index === b.index;
    if (!touches && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

/** Whether the diagonal a-b leaves a into the ring's inside. */
function locallyInside(a, b) {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

/** Whether the midpoint of a-b is inside the ring (crossing count). */
function middleInside(a, b) {
  const px = (a.x + b.x) / 2;
  const py = (a.y + b.y) / 2;
  let inside = false;
  let p = a;
  do {
    const q = p.next;
    const crosses = (p.y > py) !== (q.y > py) && q.y !== p.y;
    if (crosses && px < ((q.x - p.x) * (py - p.y)) / (q.y - p.y) + p.x) inside = !inside;
    p = q;
  } while (p !== a);
  return inside;
}

/**
 * Join a and b: on one ring it splits the ring in two, from a hole to the outer ring it merges them. Both ends are
 * doubled, so each ring keeps its own links; returns b's copy, a vertex of the second ring.
 */
function splitPolygon(a, b) {
  const a2 = new Vertex(a.index, a.x, a.y);
  const b2 = new Vertex(b.index, b.x, b.y);
  const an = a.next;
  const bp = b.prev;
  a.next = b;
  b.prev = a;
  a2.next = an;
  an.prev = a2;
  b2.next = a2;
  a2.prev = b2;
  bp.next = b2;
  b2.prev = bp;
  return b2;
}

/** Each hole, by its leftmost vertex from left to right, bridged into the outer ring. */
function bridgeHoles(holes, start, budget) {
  const leftmost = [];
  for (const hole of holes) {
    const list = linkRing(hole, false);
    if (list) leftmost.push(leftmostOf(list));
  }
  leftmost.sort((p, q) => p.x - q.x || p.y - q.y);
  let outer = start;
  for (const hole of leftmost) {
    const bridge = findBridge(hole, outer, budget);
    if (!bridge) continue;
    const reverse = splitPolygon(bridge, hole);
    filterPoints(reverse, reverse.next);
    outer = filterPoints(bridge, bridge.next);
  }
  return outer;
}

function leftmostOf(start) {
  let p = start;
  let best = start;
  do {
    if (p.x < best.x || (p.x === best.x && p.y < best.y)) best = p;
    p = p.next;
  } while (p !== start);
  return best;
}

/** The outer vertex a hole's leftmost vertex bridges to: where a leftward ray lands, refined for visibility. */
function findBridge(hole, outer, budget) {
  const hit = rayHit(hole, outer, budget);
  if (!hit || hit.x === hole.x) return hit && hit.node;
  return nearestVisible(hole, hit.node, hit.x, budget);
}

/** The first outer edge a leftward ray from `hole` crosses: its left end, and the x where it crosses. */
function rayHit(hole, outer, budget) {
  if (equals(hole, outer)) return { node: outer, x: hole.x };
  let hit = null;
  let p = outer;
  do {
    budget.left -= 1;
    const q = p.next;
    if (equals(hole, q)) return { node: q, x: hole.x };
    const x = hole.y <= p.y && hole.y >= q.y && q.y !== p.y ? p.x + ((hole.y - p.y) * (q.x - p.x)) / (q.y - p.y) : NaN;
    if (x <= hole.x && (!hit || x > hit.x)) {
      hit = { node: p.x < q.x ? p : q, x };
      if (x === hole.x) return hit;
    }
    p = q;
  } while (p !== outer);
  return hit;
}

/**
 * The ray's end `m` may be hidden: the outer vertices inside the triangle (hole, crossing, m) are candidates, and
 * the one at the smallest angle to the ray that the hole can see wins.
 */
function nearestVisible(hole, m, crossingX, budget) {
  let best = m;
  let tanMin = Infinity;
  let p = m;
  do {
    budget.left -= 1;
    const tan = bridgeTangent(p, hole, m, crossingX);
    if (tan <= tanMin && locallyInside(p, hole) && (tan < tanMin || breaksTie(p, best))) {
      best = p;
      tanMin = tan;
    }
    p = p.next;
  } while (p !== m);
  return best;
}

/** At an equal angle, the vertex further right wins; at the same x, the one whose sector holds the other's. */
function breaksTie(p, best) {
  return p.x > best.x || (p.x === best.x && sectorContainsSector(best, p));
}

/** The tangent of p's angle to the ray when p lies in the triangle (hole, crossing, m), else NaN. */
function bridgeTangent(p, hole, m, crossingX) {
  const [hx, hy] = [hole.x, hole.y];
  if (!(hx >= p.x && p.x >= m.x && hx !== p.x)) return NaN;
  const inside = hy < m.y
    ? insideTriangle(hx, hy, m.x, m.y, crossingX, hy, p.x, p.y)
    : insideTriangle(crossingX, hy, m.x, m.y, hx, hy, p.x, p.y);
  return inside ? Math.abs(hy - p.y) / (hx - p.x) : NaN;
}

/** Whether the sector at m contains the sector at p (the two at one point). */
function sectorContainsSector(m, p) {
  return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

/** The z-order grid over a ring's bounds: 15 bits a side. */
function gridOf(points) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < points.length; k += 2) {
    [minX, maxX] = [Math.min(minX, points[k]), Math.max(maxX, points[k])];
    [minY, maxY] = [Math.min(minY, points[k + 1]), Math.max(maxY, points[k + 1])];
  }
  const size = Math.max(maxX - minX, maxY - minY);
  return size > 0 ? { minX, minY, scale: 32767 / size } : null;
}

/** A coordinate's 15 bits spread to the even bit positions. */
function spread(value) {
  let v = (value | (value << 8)) & 0x00ff00ff;
  v = (v | (v << 4)) & 0x0f0f0f0f;
  v = (v | (v << 2)) & 0x33333333;
  return (v | (v << 1)) & 0x55555555;
}

/** A point's z-order (Morton) code on the grid, clamped to it. */
function zOrder(x, y, grid) {
  const cell = (v, min) => Math.min(32767, Math.max(0, Math.floor((v - min) * grid.scale)));
  return spread(cell(x, grid.minX)) | (spread(cell(y, grid.minY)) << 1);
}

/** Link a ring's vertices by z-order. */
function indexCurve(start, grid, budget) {
  const nodes = [];
  let p = start;
  do {
    p.z = zOrder(p.x, p.y, grid);
    nodes.push(p);
    p = p.next;
  } while (p !== start);
  budget.left -= nodes.length;
  nodes.sort((u, v) => u.z - v.z);
  for (let k = 0; k < nodes.length; k += 1) {
    nodes[k].prevZ = k > 0 ? nodes[k - 1] : null;
    nodes[k].nextZ = k + 1 < nodes.length ? nodes[k + 1] : null;
  }
}
