/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * resize: edge and corner handles that change the blit's box.
 *
 *   blit.use({ resize });
 *   app.blit({ w: 200, h: 100, resize: { directions: ['e', 's', 'se'] } });
 *
 * The twin of `./drag.js` over a different quantity: the same press, threshold
 * and announce-at-the-threshold shape. Every handle carries `data-cc-control`,
 * so a drag stands down on it. Handles show while the blit is selected (or
 * always, with `alwaysVisibleHandles`), through the `hidden` property.
 *
 * Options: `directions` (a subset of `RESIZE_DIRECTIONS`, all eight by default;
 * an unknown one throws), `minWidth`/`minHeight` (`MIN_RESIZE`),
 * `maxWidth`/`maxHeight` (unbounded, never below the floor), `alwaysVisibleHandles`.
 * Signals: `resize:start` `{width, height, direction}`, `resize:end`
 * `{width, height, cancelled}`. The element carries `is-resizing` while sizing.
 */
import { RESIZE_CSS } from '../graphics/css/resize.js';
import { CONTROL_ATTR, coordinate, defineTrait, injectAddonCss, passedThreshold, selectedOf } from './trait.js';

/** Every edge and corner a box can be resized from. */
export const RESIZE_DIRECTIONS = /* @__PURE__ */ Object.freeze(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

/** Names a handle's direction, and is how the trait recognises its own handles. */
export const RESIZE_HANDLE_ATTR = 'data-cc-resize-handle';

/** Class every handle carries; the stylesheet's only hook. */
export const RESIZE_HANDLE_CLASS = 'cloudcanvas-resize-handle';

/** Class the element carries while a resize is changing its box. */
export const RESIZING_CLASS = 'is-resizing';

/** Smallest box a resize may leave, unless the caller says otherwise. */
export const MIN_RESIZE = /* @__PURE__ */ Object.freeze({ width: 40, height: 24 });

/**
 * Which edges each direction moves, a unit step per axis: `+1` the far edge
 * follows the pointer, `-1` the near edge does (the origin moves to hold the far
 * edge still), `0` not in play. One table drives the handles and the arithmetic.
 */
const DIRECTION_AXES = /* @__PURE__ */ Object.freeze({
  n: /* @__PURE__ */ Object.freeze({ x: 0, y: -1 }),
  s: /* @__PURE__ */ Object.freeze({ x: 0, y: 1 }),
  e: /* @__PURE__ */ Object.freeze({ x: 1, y: 0 }),
  w: /* @__PURE__ */ Object.freeze({ x: -1, y: 0 }),
  ne: /* @__PURE__ */ Object.freeze({ x: 1, y: -1 }),
  nw: /* @__PURE__ */ Object.freeze({ x: -1, y: -1 }),
  se: /* @__PURE__ */ Object.freeze({ x: 1, y: 1 }),
  sw: /* @__PURE__ */ Object.freeze({ x: -1, y: 1 })
});

/* ------------------ STATE ------------------ */

function init(options) {
  const minWidth = lowerBound(options.minWidth, MIN_RESIZE.width);
  const minHeight = lowerBound(options.minHeight, MIN_RESIZE.height);
  return {
    directions: normalizeDirections(options.directions),
    minWidth,
    minHeight,
    maxWidth: upperBound(options.maxWidth, minWidth),
    maxHeight: upperBound(options.maxHeight, minHeight),
    alwaysVisibleHandles: Boolean(options.alwaysVisibleHandles),
    /** @type {Map<string, Element>} direction -> handle */
    handles: new Map(),
    resizing: false,
    _downX: null,
    _downY: null,
    _sizing: false,
    _origin: null,
    _downCanvas: null,
    _direction: null,
    // The box last applied, and whether the end reports it (a blit's measured size lags a frame).
    _applied: null,
    _reportApplied: false,
    _onSelect: null,
    _offSelect: null
  };
}

/* ------------------ LIFECYCLE ------------------ */

/** Build the handles and follow the `select` signal, so nothing polls. */
function attach(s, b) {
  buildHandles(s, b);
  syncHandles(s, b);
  s._onSelect = () => syncHandles(s, b);
  s._offSelect = b.on('select', s._onSelect);
}

/** End a live gesture, drop the listener and take the handles out: no residue. */
function detach(s, b) {
  release(s, b);
  if (s._offSelect) s._offSelect();
  s._onSelect = null;
  s._offSelect = null;
  for (const handle of s.handles.values()) handle.remove();
  s.handles.clear();
}

/**
 * One handle per direction, a direct child of the element: never the content
 * a renderer rebuilds, never the scope well that holds the children.
 * @returns {number} how many handles there are now
 */
export function buildHandles(s, b) {
  if (!b.el || typeof document === 'undefined') return 0;
  for (const direction of s.directions) {
    if (s.handles.has(direction)) continue;
    const handle = document.createElement('div');
    handle.className = RESIZE_HANDLE_CLASS;
    handle.setAttribute(RESIZE_HANDLE_ATTR, direction);
    handle.setAttribute(CONTROL_ATTR, 'resize');
    // Chrome, not content: eight unlabelled divs in the accessibility tree are noise.
    handle.setAttribute('aria-hidden', 'true');
    handle.hidden = true;
    b.el.appendChild(handle);
    s.handles.set(direction, handle);
  }
  return s.handles.size;
}

/** Selected-only by default; always while a gesture is live or `alwaysVisibleHandles`. */
export function handlesVisible(s, b) {
  if (s.alwaysVisibleHandles || s.resizing) return true;
  return Boolean(b && selectedOf(b));
}

/** Mirror `handlesVisible` onto every handle. @returns {boolean} whether they show */
export function syncHandles(s, b) {
  const visible = handlesVisible(s, b);
  for (const handle of s.handles.values()) handle.hidden = !visible;
  return visible;
}

/* ------------------ GESTURE ------------------ */

/** The canvas point of an event, or null without coordinates or a projection. */
function canvasPoint(env, event) {
  if (!env || !Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return null;
  return env.point(event);
}

/**
 * Arm a resize if the press landed on one of this record's own handles. The
 * origin box is taken at the press, so the box never lags the pointer.
 * @returns {boolean} whether a resize was armed
 */
export function press(s, b, event, env) {
  const direction = directionFor(s, event);
  if (!direction) return false;

  s.resizing = true;
  s._sizing = false;
  s._direction = direction;
  s._downX = coordinate(event?.clientX);
  s._downY = coordinate(event?.clientY);
  s._downCanvas = canvasPoint(env, event);
  const { w, h } = b.size;
  s._origin = { x: b.x, y: b.y, width: w, height: h };
  if (b.el && b.el.classList) b.el.classList.add(RESIZING_CLASS);
  return true;
}

/** Follow the pointer past the threshold; the first such move announces `resize:start`. */
export function move(s, b, event, env) {
  if (!s.resizing) return;
  if (!s._sizing && !passedThreshold(s, event)) return;

  if (!s._sizing) {
    s._sizing = true;
    b.emit('resize:start', { width: s._origin.width, height: s._origin.height, direction: s._direction });
  }
  const point = canvasPoint(env, event);
  if (!point || !s._downCanvas) return;
  s._applied = applyBox(b, boxFor(s, point.x - s._downCanvas.x, point.y - s._downCanvas.y));
}

/** End the gesture. @returns {boolean} true when `resize:end` was announced */
export function release(s, b, event) {
  const resized = s._sizing;
  s._downX = null;
  s._downY = null;
  s._downCanvas = null;
  s._sizing = false;

  if (s.resizing) {
    s.resizing = false;
    s._direction = null;
    if (b.el && b.el.classList) b.el.classList.remove(RESIZING_CLASS);
    syncHandles(s, b);
  }
  s._origin = null;
  const applied = s._applied;
  s._applied = null;

  if (!resized) return false;
  const { w, h } = s._reportApplied && applied ? { w: applied.width, h: applied.height } : b.size;
  b.emit('resize:end', { width: w, height: h, cancelled: event === undefined });
  return true;
}

/** The direction of this record's own handle under the event, or null (a nested blit's is not ours). */
export function directionFor(s, event) {
  const target = event ? event.target : null;
  if (!target || typeof target.closest !== 'function') return null;
  const handle = target.closest(`[${RESIZE_HANDLE_ATTR}]`);
  if (!handle) return null;
  const direction = handle.getAttribute(RESIZE_HANDLE_ATTR);
  return s.handles.get(direction) === handle ? direction : null;
}

/** The box a canvas delta asks for, clamped, with the far edges held still. */
function boxFor(s, dx, dy) {
  const axes = DIRECTION_AXES[s._direction];
  const origin = s._origin;
  const horizontal = resolveAxis(axes.x, origin.width, dx, s.minWidth, s.maxWidth, origin.x);
  const vertical = resolveAxis(axes.y, origin.height, dy, s.minHeight, s.maxHeight, origin.y);
  return { x: horizontal.origin, y: vertical.origin, width: horizontal.size, height: vertical.size };
}

/** Move the box only when its origin moved; then size it. */
function applyBox(b, box) {
  if (box.x !== b.x || box.y !== b.y) b.set({ x: box.x, y: box.y });
  b.set({ w: box.width, h: box.height });
  return box;
}

/* ------------------ PURE HELPERS ------------------ */

/** One axis: the new extent and where the box starts; a near-edge drag moves the origin. */
function resolveAxis(axis, start, delta, min, max, origin) {
  if (axis === 0) return { size: start, origin };
  const size = Math.min(Math.max(start + axis * delta, min), max);
  return { size, origin: axis < 0 ? origin + (start - size) : origin };
}

/** The declared directions, or all eight; a typo throws rather than silently resizing less. */
function normalizeDirections(value) {
  if (value === undefined || value === null) return [...RESIZE_DIRECTIONS];
  if (!Array.isArray(value)) {
    throw new TypeError('ResizableTrait: `directions` must be an array of direction strings');
  }
  const chosen = [];
  for (const direction of value) {
    if (DIRECTION_AXES[direction] === undefined) {
      throw new Error(`ResizableTrait: unknown resize direction "${direction}"`);
    }
    if (!chosen.includes(direction)) chosen.push(direction);
  }
  if (chosen.length === 0) throw new Error('ResizableTrait: `directions` cannot be empty');
  return chosen;
}

/** A positive finite floor, or the stated default. */
function lowerBound(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** A ceiling, never below its floor; unbounded by default. */
function upperBound(value, lower) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(number, lower) : Infinity;
}

/**
 * The end reports the box the gesture applied: a blit's size in force is the
 * last measured one, a frame behind a declared change.
 */
export const resize = /* @__PURE__ */ defineTrait({
  init,
  attach,
  detach,
  press,
  move,
  release,
  mount: (s) => {
    s._reportApplied = true;
    injectAddonCss('resize', RESIZE_CSS);
  }
});
