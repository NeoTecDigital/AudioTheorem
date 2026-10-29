/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Motion: the add-on that animates the core camera.
 *
 * `MotionCamera` extends the core's snapping `Camera` with eased moves
 * (`animateTo`, stepped by `update`), an animated `fit`, the reduced-motion
 * rule and the screen <-> canvas projection. `motion(b)` gives a root one, so
 * its `view()` flies. `MOVING_CLASS` is the one compositor-hint class any
 * add-on grants an element while it is in motion.
 */
import { Camera } from '../core/camera.js';
import { schedule } from '../core/frame.js';
import { rootOf, stateOf } from '../core/state.js';
import { createLogger } from '../log.js';

const logger = /* @__PURE__ */ createLogger('motion');

/**
 * Named easing curves for `options.easing`: normalised time `t` (0..1) to
 * eased progress (0..1).
 * @type {Readonly<Record<string, (t: number) => number>>}
 */
export const EASINGS = /* @__PURE__ */ Object.freeze({
  linear: (t) => t,
  'ease-out-cubic': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
});

/** Curve applied when no easing is supplied, or when an unknown name is given. */
export const DEFAULT_EASING = 'ease-out-cubic';

/** Class an element carries while its transform is actually changing. */
export const MOVING_CLASS = 'cc-moving';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** A function is used as-is, a name is looked up; unknown names never throw. */
function resolveEasing(easing) {
  if (typeof easing === 'function') return easing;
  return Object.hasOwn(EASINGS, easing) ? EASINGS[easing] : EASINGS[DEFAULT_EASING];
}

/**
 * Zoom in log space, so equal slices of progress are equal ratios of
 * magnification (1 -> 4 passes 2 at the midpoint); linear for a non-positive scale.
 */
function interpolateScale(from, to, ease) {
  if (from === to) return to;
  if (from <= 0 || to <= 0) return from + (to - from) * ease;
  return from * Math.pow(to / from, ease);
}

/** The reduced-motion query, read on first use and kept live; null until then. */
let reducedMotion = null;

function readReducedMotion() {
  const state = { matches: false, query: null, onChange: null };
  if (typeof globalThis.matchMedia !== 'function') return state;
  try {
    state.query = globalThis.matchMedia(REDUCED_MOTION_QUERY);
  } catch (error) {
    // The environment has matchMedia but cannot parse the query.
    logger.debug(`matchMedia rejected "${REDUCED_MOTION_QUERY}"`, error);
    return state;
  }
  const query = state.query;
  if (!query) return state;

  state.matches = Boolean(query.matches);
  state.onChange = (event) => {
    state.matches = Boolean(event && 'matches' in event ? event.matches : query.matches);
  };
  if (typeof query.addEventListener === 'function') query.addEventListener('change', state.onChange);
  else if (typeof query.addListener === 'function') query.addListener(state.onChange); // Legacy Safari.
  return state;
}

/**
 * Whether the user asked the platform to reduce motion; `false` wherever
 * `matchMedia` is absent.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  reducedMotion ??= readReducedMotion();
  return reducedMotion.matches;
}

/** Drop the cached query and its listener, so the next call re-reads. Test seam only. */
export function _resetReducedMotionForTests() {
  const state = reducedMotion;
  reducedMotion = null;
  if (!state || !state.onChange) return;
  const { query, onChange } = state;
  if (typeof query.removeEventListener === 'function') query.removeEventListener('change', onChange);
  else if (typeof query.removeListener === 'function') query.removeListener(onChange);
}

export class MotionCamera extends Camera {
  constructor(options) {
    super(options);
    /** The in-flight eased move, or null. */
    this.animation = null;
    /**
     * Owner wake hook, fired whenever the camera is moved programmatically.
     * `motion()` points it at the root's `schedule`, so a fit or a
     * flight started on the camera directly still wakes an idle loop.
     * @type {(() => void)|null}
     */
    this.onWake = null;
  }

  /** Fire the owner wake hook, if one is set. */
  _wake() {
    if (typeof this.onWake === 'function') this.onWake();
  }

  // A direct move cancels an eased one.
  panBy(dx, dy) { this.stopAnimation(); super.panBy(dx, dy); this._wake(); }
  panTo(x, y) { this.stopAnimation(); super.panTo(x, y); this._wake(); }
  setZoom(scale) { this.stopAnimation(); super.setZoom(scale); this._wake(); }
  zoomAt(factor, focalX, focalY, hostRect) { this.stopAnimation(); super.zoomAt(factor, focalX, focalY, hostRect); this._wake(); }

  /**
   * Frame a box: fly there, or jump with `{immediate: true}`. Adds `duration`
   * (400 ms) and `easing` to the core's `padding` and `maxZoom`.
   * @returns {{x: number, y: number, scale: number}} the resolved camera
   */
  fit(bounds, hostRect, options = {}) {
    if (options.immediate) {
      const target = super.fit(bounds, hostRect, options);
      this.stopAnimation();
      this._wake();
      return target;
    }
    const target = this.fitTarget(bounds, hostRect, options);
    const duration = options.duration !== undefined ? Number(options.duration) : 400;
    this.animateTo(target.x, target.y, target.scale, { duration, easing: options.easing });
    return target;
  }

  /**
   * Ease to a camera. The one choke point for every animated move, so reduced
   * motion applies uniformly: the camera jumps and `onComplete` fires at once.
   * @param {object} [options] `duration` (400 ms), `easing`, `onComplete`
   */
  animateTo(targetX, targetY, targetScale, options = {}) {
    const onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    if (prefersReducedMotion()) {
      this.animation = null;
      this.x = Number(targetX);
      this.y = Number(targetY);
      this.scale = Number(targetScale);
      if (onComplete) onComplete();
      this._wake();
      return;
    }
    this.animation = {
      startX: this.x,
      startY: this.y,
      startScale: this.scale,
      targetX,
      targetY,
      targetScale,
      duration: options.duration || 400,
      easing: resolveEasing(options.easing),
      elapsed: 0,
      onComplete
    };
    this._wake();
  }

  stopAnimation() {
    this.animation = null;
  }

  get isAnimating() {
    return Boolean(this.animation);
  }

  /** Advance the eased move by `dtMs`, landing exactly on the target at the end. */
  update(dtMs = 16) {
    const animation = this.animation;
    if (!animation) return;

    animation.elapsed += dtMs;
    const t = Math.min(1, animation.elapsed / animation.duration);
    if (t >= 1) {
      this.x = animation.targetX;
      this.y = animation.targetY;
      this.scale = animation.targetScale;
      this.animation = null;
      if (animation.onComplete) animation.onComplete();
      return;
    }

    const ease = animation.easing(t);
    this.x = animation.startX + (animation.targetX - animation.startX) * ease;
    this.y = animation.startY + (animation.targetY - animation.startY) * ease;
    this.scale = interpolateScale(animation.startScale, animation.targetScale, ease);
  }

  /** Screen (client) coordinates to canvas coordinates; null above a tilted board's horizon. */
  screenToCanvas(screenX, screenY, hostRect = {}) {
    const [left, top] = [hostRect.left || 0, hostRect.top || 0];
    if (this.is3d) return this.unproject(screenX - left, screenY - top, hostRect);
    return { x: (screenX - left - this.x) / this.scale, y: (screenY - top - this.y) / this.scale };
  }

  /** Canvas coordinates to screen (client) coordinates, through the tilt and perspective when there is one; null
   * for a point behind the viewer. */
  canvasToScreen(canvasX, canvasY, hostRect = {}) {
    const [left, top] = [hostRect.left || 0, hostRect.top || 0];
    if (this.is3d) {
      const at = this.project(canvasX, canvasY, hostRect);
      return at && { x: at.x + left, y: at.y + top };
    }
    return { x: canvasX * this.scale + this.x + left, y: canvasY * this.scale + this.y + top };
  }
}

/**
 * Give `b`'s root a `MotionCamera` at the current view, so its `view()` flies
 * unless `{immediate: true}`. A root that has one keeps it.
 * @param {import('../core/blit.js').Blit} b any blit under the root
 * @returns {MotionCamera}
 */
export function motion(b) {
  const root = rootOf(stateOf(b.el));
  if (!root) throw new TypeError('motion: a potential blit has no root');
  if (!(root.camera instanceof MotionCamera)) root.camera = new MotionCamera(root.camera);
  // A flight started on the camera directly wakes the root's loop, as `view()` does.
  root.camera.onWake = () => schedule(root);
  return root.camera;
}
