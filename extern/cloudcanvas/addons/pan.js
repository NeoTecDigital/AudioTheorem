/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * pan: a root's camera gestures. A drag on empty canvas pans, the wheel pans or
 * zooms, and two fingers pinch.
 *
 *   blit.use({ pan });           // then <div id="app" data-pan>, or app.set({ pan: true })
 *   const off = pan(blit('#app'));
 *
 * A press on a blit is the blit's - its own traits move it - and never a pan.
 * The gesture is written as functions over a state record `g` and an env
 * (`host`, `camera`, `wake`, `target`), and the trait wires them to native
 * events. `installPan` takes the record `g` lives in (`state`) and the press
 * claimer (`target.press(event)`: the element a press belongs to instead, or
 * null). `opts.wheel: false` leaves the wheel to the page.
 *
 * Under a 3D camera a drag keeps the grabbed canvas point under the pointer, and
 * a wheel or pinch zoom the point under the cursor or midpoint.
 *
 * Pointer capture is deferred to the drag threshold, so a press that turns out
 * to be a click keeps its native `click`; a press on a control or in selectable
 * text (`TEXT_REGION_FLAG`) never takes the stream at all.
 */
import { createLogger } from '../log.js';
import { schedule } from '../core/frame.js';
import { BLIT_ATTR } from '../core/state.js';
import { PAN_CSS } from '../graphics/css/pan.js';
import { DRAG_THRESHOLD_PX, injectAddonCss, isControlTarget, listen, requireRootOf } from './trait.js';

const logger = /* @__PURE__ */ createLogger('pan');

/* ------------------ WHEEL MATHS (pure) ------------------ */

/** Pixels per line for `deltaMode === 1`. */
export const LINE_HEIGHT_PX = 16;

/** Pixels per page for `deltaMode === 2` when the host has no measured height. */
export const PAGE_HEIGHT_FALLBACK_PX = 800;

/** Largest pixel intent one wheel event may carry, per axis: a misread momentum spike is a wobble, not a teleport. */
export const MAX_WHEEL_DELTA_PX = 160;

/** Zoom gain for a trackpad pinch (ctrl/meta + wheel), per pixel. */
export const PINCH_ZOOM_K = 0.01;

/** Zoom gain for a mouse notch, per pixel: exp(0.0015 * 120) is the ~1.2x per notch users expect. */
export const WHEEL_ZOOM_K = 0.0015;

/** Smallest vertical pixel delta that may be read as a wheel notch. */
export const DISCRETE_WHEEL_MIN_PX = 40;

/** Pixels one `delta` unit represents under a given `deltaMode`. */
export function wheelPixelsPerUnit(deltaMode, hostHeight) {
  if (deltaMode === 1) return LINE_HEIGHT_PX;
  if (deltaMode === 2) return Number(hostHeight) || PAGE_HEIGHT_FALLBACK_PX;
  return 1;
}

function clampWheelDelta(pixels) {
  return Math.min(MAX_WHEEL_DELTA_PX, Math.max(-MAX_WHEEL_DELTA_PX, pixels));
}

/** A wheel event's intent in clamped pixels, on both axes. @returns {{dx: number, dy: number}} */
export function normalizeWheelDeltas(event, hostHeight) {
  const unit = wheelPixelsPerUnit(Number(event.deltaMode) || 0, hostHeight);
  return {
    dx: clampWheelDelta((Number(event.deltaX) || 0) * unit),
    dy: clampWheelDelta((Number(event.deltaY) || 0) * unit)
  };
}

/** Whether an unmodified wheel looks like a mouse notch: any non-pixel mode, or a large whole vertical-only delta. */
export function isDiscreteWheel(event) {
  if ((Number(event.deltaMode) || 0) !== 0) return true;

  const dy = Number(event.deltaY) || 0;
  return (Number(event.deltaX) || 0) === 0
    && Math.abs(dy) >= DISCRETE_WHEEL_MIN_PX
    && Number.isInteger(dy);
}

/** Scale multiplier for `deltaPx` of zoom intent: exponential, so `f(d) * f(-d)` is exactly 1. */
export function wheelZoomFactor(deltaPx, gain) {
  return Math.exp(-deltaPx * gain);
}

/** The attribute a scrolling region inside the canvas opts into native wheel scrolling with. */
export const SCROLL_REGION_SELECTOR = '[data-cc-scroll]';

/** The opted-in scrolling region an event landed in, or null. */
export function scrollRegionFor(event) {
  const target = event ? event.target : null;
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(SCROLL_REGION_SELECTOR);
}

/* ------------------ PINCH MATHS (pure) ------------------ */

/** Separation and midpoint of the first two pointers. @returns {{dist, midX, midY}|null} */
export function pinchStateFrom(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const [a, b] = points;
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
}

/* ------------------ STATE AND ENV ------------------ */

/** Set on a `pointerdown` inside selectable text: the press places a caret, so it keeps its native stream. */
export const TEXT_REGION_FLAG = '_ccTextRegion';

/**
 * Seed the gesture fields on `g`: the live pointers, the pan, the pinch, and the
 * armed capture (`{pointerId, x, y, declined}` from press to threshold).
 */
export function initPanState(g = {}) {
  g.isPanning = false;
  g.lastPointer = { x: 0, y: 0 };
  g.activePointers = new Map();
  g.pinch = null;
  g._pendingCapture = null;
  return g;
}

/** The env the gesture runs in: the host, the root's camera, a wake, and the press claimer. */
export function panEnv(host, root, target) {
  return { host, camera: root.camera, wake: () => schedule(root), target };
}

/** The core's claimer: a press on a nested blit is that blit's. */
function blitTarget(host) {
  return {
    press(event) {
      const hit = event.target && typeof event.target.closest === 'function'
        ? event.target.closest(`[${BLIT_ATTR}]`) : null;
      return hit && hit !== host ? hit : null;
    }
  };
}

function points(g) {
  return Array.from(g.activePointers.values());
}

/* ------------------ POINTER CAPTURE ------------------ */

/**
 * Take (`method` `setPointerCapture`) or hand back (`releasePointerCapture`) one
 * pointer's stream; best-effort, since a browser throws for a stale id and the
 * window listeners deliver the gesture regardless. @returns {boolean} done
 */
function pointerCapture(host, pointerId, method) {
  if (!host || pointerId === undefined || typeof host[method] !== 'function') return false;
  try {
    const held = typeof host.hasPointerCapture !== 'function' || host.hasPointerCapture(pointerId);
    if (method === 'releasePointerCapture' && !held) return false;
    host[method](pointerId);
    return true;
  } catch (error) {
    logger.debug(`${method}(${pointerId}) refused`, error);
    return false;
  }
}

/** Arm the capture decision without taking it; a press on a control or in selectable text declines for good. */
export function armCapture(g, event) {
  g._pendingCapture = {
    pointerId: event.pointerId,
    x: Number(event.clientX),
    y: Number(event.clientY),
    declined: isControlTarget(event ? event.target : null) || event[TEXT_REGION_FLAG] === true
  };
  return g._pendingCapture;
}

/** Take the deferred capture once this move passes the drag threshold; one-shot either way. */
export function takeDeferredCapture(g, event, host) {
  const pending = g._pendingCapture;
  if (!pending || pending.declined || pending.pointerId !== event.pointerId) return false;

  const travel = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
  // NaN travel (no coordinates) is not proof of a drag.
  if (!(travel > DRAG_THRESHOLD_PX)) return false;

  g._pendingCapture = null;
  return pointerCapture(host, event.pointerId, 'setPointerCapture');
}

/* ------------------ PINCH ------------------ */

/** A second finger turns a pan into a pinch: the pan ends, both contacts are captured. */
export function beginPinch(g, env) {
  g.isPanning = false;
  for (const pointerId of g.activePointers.keys()) pointerCapture(env.host, pointerId, 'setPointerCapture');
  g._pendingCapture = null;
  g.pinch = pinchStateFrom(points(g));
  return g.pinch;
}

/** One pinch step: zoom by the change in separation about the previous midpoint, then follow the midpoint. */
export function updatePinch(g, env) {
  const previous = g.pinch;
  const next = pinchStateFrom(points(g));
  if (!next) {
    g.pinch = null;
    return false;
  }

  const hostRect = env.host.getBoundingClientRect();
  if (previous.dist > 0 && next.dist > 0) {
    env.camera.zoomAt(next.dist / previous.dist, previous.midX - hostRect.left, previous.midY - hostRect.top, hostRect);
  }
  dragCamera(env, { x: previous.midX, y: previous.midY }, { x: next.midX, y: next.midY });
  env.wake();
  g.pinch = next;
  return true;
}

/** A finger left a pinch: two remain, re-seed; one remains, degrade to a pan from it. @returns {boolean} absorbed */
export function endPinch(g) {
  if (g.activePointers.size >= 2) {
    g.pinch = pinchStateFrom(points(g));
    return true;
  }
  g.pinch = null;
  const [survivor] = points(g);
  if (!survivor) return false;

  g.lastPointer = { x: survivor.x, y: survivor.y };
  g.isPanning = true;
  return true;
}

/* ------------------ THE GESTURE ------------------ */

/**
 * Pan so the canvas point under client point `from` comes under `to`: the screen delta when flat; under a 3D
 * camera both are unprojected through it, and a point above the horizon moves nothing. @returns {boolean} moved
 */
export function dragCamera(env, from, to) {
  const camera = env.camera;
  if (!camera.is3d) {
    camera.panBy(to.x - from.x, to.y - from.y);
    return true;
  }
  const rect = env.host.getBoundingClientRect();
  const grabbed = camera.unproject(from.x - rect.left, from.y - rect.top, rect);
  const under = camera.unproject(to.x - rect.left, to.y - rect.top, rect);
  if (!grabbed || !under) return false;
  camera.panBy(camera.scale * (under.x - grabbed.x), camera.scale * (under.y - grabbed.y));
  return true;
}

/** Whether a pan or a pinch is running. */
export function isPanActive(g) {
  return Boolean(g.isPanning || g.pinch);
}

/** Abandon every gesture and forget every pointer, as a `pointercancel` for all of them. */
export function cancelPan(g) {
  g.pinch = null;
  g.isPanning = false;
  g.activePointers.clear();
  g._pendingCapture = null;
  return true;
}

/**
 * Begin a pan or a pinch, unless the claimer takes the press. A gesture starts
 * on the primary pointer's main button; touch's second finger (non-primary by
 * definition) is admitted only while exactly one pointer is down.
 * @returns the element that claimed the press, or null
 */
export function panPress(g, event, env) {
  const second = event.button === 0 && g.activePointers.size === 1;
  if (!(event.isPrimary === true && event.button === 0) && !second) return null;

  armCapture(g, event);
  g.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (g.activePointers.size >= 2) {
    beginPinch(g, env);
    return null;
  }

  const claim = env.target?.press?.(event);
  if (claim) return claim;
  if (env.noPress) return null; // `press: false`: the background is chrome, not a plane
  g.isPanning = true;
  g.lastPointer = { x: event.clientX, y: event.clientY };
  return null;
}

/** Continue the gesture: the pinch or the pan. @returns {boolean} handled */
export function panMove(g, event, env) {
  const tracked = g.activePointers.get(event.pointerId);
  if (tracked) {
    tracked.x = event.clientX;
    tracked.y = event.clientY;
  }
  // A pinch is driven only by its own pointers; anything else is a hover.
  if (g.pinch) return tracked ? updatePinch(g, env) : false;
  if (tracked && isPanActive(g)) takeDeferredCapture(g, event, env.host);
  if (!g.isPanning) return false;

  const at = { x: event.clientX, y: event.clientY };
  // Above a tilted board's horizon the pan waits on its last point on the plane, so the grab resumes on return.
  if (dragCamera(env, g.lastPointer, at)) g.lastPointer = at;
  env.wake();
  return true;
}

/** End whatever gesture this pointer was part of. @returns {boolean} whether it ended a pan */
export function panRelease(g, event, env) {
  pointerCapture(env.host, event ? event.pointerId : undefined, 'releasePointerCapture');
  if (event && event.pointerId !== undefined) g.activePointers.delete(event.pointerId);
  g._pendingCapture = null;

  if (g.pinch && endPinch(g)) return false;
  const panned = g.isPanning;
  g.isPanning = false;
  return panned;
}

/** A secondary click mid-gesture cancels it and is swallowed. @returns {boolean} whether it was */
export function panContextMenu(g, event) {
  if (!isPanActive(g)) return false;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  cancelPan(g);
  return true;
}

/**
 * Zoom or pan from one wheel: ctrl/meta is a trackpad pinch and zooms at the
 * pointer, a discrete notch zooms with the gentler gain, anything else pans
 * against the scroll. Inside an opted-in scroll region an unmodified wheel is
 * the region's and left alone; elsewhere the host owns the wheel.
 */
export function panWheel(event, env) {
  const zoomModifier = Boolean(event.ctrlKey || event.metaKey);
  if (!zoomModifier && scrollRegionFor(event)) return false;

  event.preventDefault();
  if (!env.host) return false;

  const hostRect = env.host.getBoundingClientRect();
  const { dx, dy } = normalizeWheelDeltas(event, hostRect.height);
  if (dx === 0 && dy === 0) return false;

  if (dy !== 0 && (zoomModifier || isDiscreteWheel(event))) {
    const factor = wheelZoomFactor(dy, zoomModifier ? PINCH_ZOOM_K : WHEEL_ZOOM_K);
    env.camera.zoomAt(factor, event.clientX - hostRect.left, event.clientY - hostRect.top, hostRect);
  } else {
    env.camera.panBy(-dx, -dy);
  }
  env.wake();
  return true;
}

/* ------------------ THE TRAIT ------------------ */

/**
 * Install the gesture on `host`: press on the host, move and release on the
 * window (a gesture that leaves the box is still that gesture), the wheel
 * `passive: false`, and a mid-gesture right-click swallowed.
 * @returns {() => void} off, which also drops a gesture in flight it owns
 */
export function installPan(host, root, options) {
  const g = options.state ?? initPanState();
  const env = panEnv(host, root, options.target);
  env.noPress = options.press === false;
  const offs = [
    listen(host, ['pointerdown'], (event) => panPress(g, event, env)),
    listen(window, ['pointermove'], (event) => panMove(g, event, env)),
    listen(window, ['pointerup', 'pointercancel'], (event) => panRelease(g, event, env)),
    listen(host, ['contextmenu'], (event) => panContextMenu(g, event))
  ];
  if (options.wheel !== false) offs.push(listen(host, ['wheel'], (event) => panWheel(event, env), { passive: false }));
  return () => {
    for (const off of offs) off();
    if (!options.state) cancelPan(g);
  };
}

/** The root trait; `opts.wheel: false` leaves the wheel to the page, `opts.press: false` the background press. @returns {() => void} off */
export function pan(b, opts, root) {
  const o = opts && typeof opts === 'object' ? opts : {};
  injectAddonCss('pan', PAN_CSS);
  return installPan(b.el, requireRootOf(b, root, 'pan'), { wheel: o.wheel !== false, press: o.press !== false, target: blitTarget(b.el) });
}
