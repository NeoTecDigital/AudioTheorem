/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * place: where a blit goes, and what is under a point.
 *
 *   spot(app, { width: 200, height: 120 })   a free top-left corner on the canvas
 *   spot(card, { width: 80, height: 40 })    ...or card-local, inside its scope
 *   move(b, card)                            nest b in card, keeping its global position
 *   hit(app, { clientX, clientY })           the deepest blit under a point
 *
 * `spot` is a deterministic ring spiral around an anchor - the same scene and
 * request always answer the same point. Rings
 * enumerate candidates nearest-first, and the samples per ring grow with the
 * radius, so the angular resolution stays about constant.
 */
import { blit } from '../core/blit.js';
import { BLIT_ATTR, boundsOf, isWithin, rootOf, scopeContainerOf, sizeOf, stateOf } from '../core/state.js';
import { findBlit, heldRootOf } from '../core/root.js';

/** Rings tried before the search gives up, at radius `k * step`. */
const MAX_RINGS = 12;

/** Samples on ring `k`: `BASE_SAMPLES + SAMPLES_PER_RING * k`. */
const BASE_SAMPLES = 8;
const SAMPLES_PER_RING = 4;

/** Ring spacing as a fraction of the box's longest side; below 1, so rings overlap and no gap is skipped. */
const STEP_RATIO = 0.75;

/** The defaults: a card-sized box and its clearance. */
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 120;
const DEFAULT_MARGIN = 24;

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value, fallback) {
  const parsed = numberOr(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

/** A request's box: `width`, `height` (a degenerate one falls back to the card) and `margin`. */
export function boxOf(options = {}) {
  return {
    width: positive(options.width, DEFAULT_WIDTH),
    height: positive(options.height, DEFAULT_HEIGHT),
    margin: Math.max(0, numberOr(options.margin, DEFAULT_MARGIN))
  };
}

/** An explicit `{x, y}` anchor as numbers, or null when it names no point. */
export function explicitAnchor(anchor) {
  if (!anchor || !Number.isFinite(Number(anchor.x)) || !Number.isFinite(Number(anchor.y))) return null;
  return { x: Number(anchor.x), y: Number(anchor.y) };
}

/** A box record `{minX, minY, maxX, maxY, centerX, centerY}` from a corner and a size. */
export function boxAt(x, y, w, h) {
  return { minX: x, minY: y, maxX: x + w, maxY: y + h, centerX: x + w / 2, centerY: y + h / 2 };
}

/** AABB intersection, inclusive on every edge. */
export function overlaps(bounds, minX, minY, maxX, maxY) {
  return bounds.minX <= maxX && bounds.maxX >= minX && bounds.minY <= maxY && bounds.maxY >= minY;
}

/** An occupancy function over a snapshot of boxes: the boxes a query rectangle touches. */
export function occupancyOf(boxes) {
  return (minX, minY, maxX, maxY) => boxes.filter((bounds) => overlaps(bounds, minX, minY, maxX, maxY));
}

/** The mean centre of some boxes, or null when there are none. */
export function centroidOf(boxes) {
  if (!boxes || boxes.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const bounds of boxes) {
    x += bounds.centerX;
    y += bounds.centerY;
  }
  return { x: x / boxes.length, y: y / boxes.length };
}

/** The top-left corner of a box centred on `point`. */
function corner(point, box) {
  return { x: point.x - box.width / 2, y: point.y - box.height / 2 };
}

/** Whether a candidate box, grown by its margin, touches nothing. */
function isFree(occupancy, topLeft, box) {
  const { margin } = box;
  return occupancy(topLeft.x - margin, topLeft.y - margin,
    topLeft.x + box.width + margin, topLeft.y + box.height + margin).length === 0;
}

/** One ring anticlockwise from angle zero: the first free candidate, or the last one tried. */
function searchRing(occupancy, centre, ring, step, box) {
  const radius = ring * step;
  const samples = BASE_SAMPLES + SAMPLES_PER_RING * ring;
  let candidate = null;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    candidate = corner({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius }, box);
    if (isFree(occupancy, candidate, box)) return { candidate, free: true };
  }
  return { candidate, free: false };
}

/**
 * The ring spiral: the first free top-left corner for `box` nearest `centre`.
 * Everything occupied gives the last candidate - a real point beats none.
 * @param {(minX: number, minY: number, maxX: number, maxY: number) => Array} occupancy
 * @returns {{x: number, y: number}}
 */
export function spiral(occupancy, centre, box) {
  let candidate = corner(centre, box);
  if (isFree(occupancy, candidate, box)) return candidate;
  const step = Math.max(box.width, box.height) * STEP_RATIO + box.margin;
  for (let ring = 1; ring <= MAX_RINGS; ring += 1) {
    const found = searchRing(occupancy, centre, ring, step, box);
    candidate = found.candidate;
    if (found.free) return candidate;
  }
  return candidate;
}

/* ------------------ ON BLITS ------------------ */

/** The handle a `near` names - a blit or an id in the root - or null. */
function blitNamed(root, target) {
  if (!target) return null;
  const element = typeof target === 'string' ? findBlit(root, target) : target.el ?? target;
  return element && stateOf(element) ? blit(element) : null;
}

/** A box that takes up space: a zero-area blit (never measured, nothing declared) occupies none. */
function spaceOf(x, y, state) {
  const { w, h } = sizeOf(state);
  return w > 0 && h > 0 ? boxAt(x, y, w, h) : null;
}

/** Canvas space: every blit on the plane, by its global box; the anchor defaults to the view's centre. */
function canvasSearch(root, options, box) {
  const boxes = Array.from(root.plane.querySelectorAll(`[${BLIT_ATTR}]`), stateOf)
    .map((state) => state && spaceOf(boundsOf(state).x, boundsOf(state).y, state))
    .filter(Boolean);
  const near = blitNamed(root, options.near);
  const bounds = near?.bounds;
  const { x, y, scale } = root.camera;
  const centre = explicitAnchor(options.anchor)
    ?? (bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : null)
    ?? { x: (root.hostRect.width / 2 - x) / scale, y: (root.hostRect.height / 2 - y) / scale };
  return spiral(occupancyOf(boxes), centre, box);
}

/** Scope space: the blit's direct children, local; the anchor defaults to their centroid, else one margin in. */
function scopeSearch(root, b, options, box) {
  const boxes = b.blits.map((child) => spaceOf(child.x, child.y, stateOf(child.el))).filter(Boolean);
  const near = blitNamed(root, options.near);
  const nearBox = near ? spaceOf(near.x, near.y, stateOf(near.el)) : null;
  const centre = explicitAnchor(options.anchor)
    ?? (nearBox ? { x: nearBox.centerX, y: nearBox.centerY } : null)
    ?? centroidOf(boxes)
    ?? { x: box.margin + box.width / 2, y: box.margin + box.height / 2 };
  return spiral(occupancyOf(boxes), centre, box);
}

/**
 * A free top-left corner for a box of `width` x `height` (200 x 120), `margin`
 * (24) clear of what is there: in canvas space on a root collection, local
 * inside a blit's scope. `near` (a blit or id) and `anchor` (`{x, y}`, same
 * space) say where to start; an explicit anchor wins.
 * @returns {{x: number, y: number}}
 */
export function spot(b, options = {}) {
  const state = stateOf(b.el);
  const root = state?.root ?? (state && rootOf(state));
  if (!root) throw new TypeError('spot: a potential blit has no root');
  const box = boxOf(options);
  return state.root ? canvasSearch(root, options, box) : scopeSearch(root, b, options, box);
}

/**
 * Nest `b` in `parent`'s scope (a root collection or null: its plane), at global
 * `position` (`{x, y}`, default: where it is now), so it does not jump. Its
 * element, traits and listeners stay the same objects.
 * @returns {object|null} `b`, or null when `parent` is `b` or inside it
 * @throws {TypeError} when `b` or `parent` is in no root, or in another one
 */
export function move(b, parent, position = {}) {
  const root = heldRootOf(b.el);
  if (!root || b.el === root.host) throw new TypeError('move: expected a blit in a root');
  const target = parent ? stateOf(parent.el ?? parent) : stateOf(root.host);
  if (!target || heldRootOf(target.el) !== root) throw new TypeError('move: the parent is not in this root');
  if (target.el === b.el || isWithin(b.el, target.el)) return null;

  const bounds = b.bounds;
  const x = Number.isFinite(position.x) ? position.x : bounds.x;
  const y = Number.isFinite(position.y) ? position.y : bounds.y;
  const container = target.root ? root.plane : scopeContainerOf(target.el);
  if (b.el.parentNode !== container) container.appendChild(b.el);
  const origin = scopeOriginOf(target);
  return b.set({ x: x - origin.x, y: y - origin.y });
}

/**
 * The global point a blit's direct child's local (0, 0) lands at: its global
 * corner plus its scope container's offset, read now (the offset of a scope that
 * just filled is settled before a drop is converted against it).
 */
export function scopeOriginOf(state) {
  if (state.root) return { x: 0, y: 0 };
  const scope = scopeContainerOf(state.el);
  if (scope !== state.el) {
    state.sx = Number(scope.offsetLeft) || 0;
    state.sy = Number(scope.offsetTop) || 0;
  }
  const { x, y } = boundsOf(state);
  return { x: x + state.sx, y: y + state.sy };
}

/**
 * The element stack under a client point, topmost first: `elementsFromPoint`,
 * else (no layout, as under happy-dom) the point's own `target`.
 * @param {{clientX?: number, clientY?: number, target?: EventTarget}} point
 */
export function elementsAt(point) {
  const { clientX: x, clientY: y } = point;
  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function'
    && Number.isFinite(x) && Number.isFinite(y)) {
    const stack = document.elementsFromPoint(x, y);
    if (stack && stack.length) return stack;
  }
  return point.target ? [point.target] : [];
}

/**
 * The deepest blit of root collection `app` under a point (an event, or any
 * `{clientX, clientY, target}`), skipping `ignore` and everything inside it.
 * @returns {object|null} the blit, or null over empty canvas
 */
export function hit(app, point, options = {}) {
  const root = stateOf(app.el)?.root;
  if (!root) throw new TypeError("hit: expected a root collection, blit('#app')");
  const ignored = options.ignore ? options.ignore.el ?? options.ignore : null;
  for (const node of elementsAt(point ?? {})) {
    const element = typeof node?.closest === 'function' ? node.closest(`[${BLIT_ATTR}]`) : null;
    if (!element || element === root.host || !root.host.contains(element)) continue;
    if (ignored && (element === ignored || isWithin(ignored, element))) continue;
    return blit(element);
  }
  return null;
}
