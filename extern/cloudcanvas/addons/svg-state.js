/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * svgState: discrete and parametric SVG vector states on a blit - one `<path>`
 * in a perspective wrapper, morphed between named states by CSS transitions
 * (GPU composited), with a 3D orientation on the `<svg>`.
 *
 *   blit.use({ svgState });
 *   const b = app.blit({ svgState: { states: { idle: {d: '...'}, hot: {d: '...'} } } });
 *   transitionState(svgStateOf(b), b, 'hot');
 *
 * Options: `states` (name -> `{d fill stroke strokeWidth strokeDasharray
 * strokeDashoffset opacity transform filter bloom}`; a circle by default),
 * `initialState`, `viewBox` ('0 0 200 200'), `perspective` (800), `rx ry rz
 * depth`, `duration` (350ms), `easing`, `normalizeSegments` (0: paths kept as
 * written; N: resampled to N segments by the vectorizer, so any two morph).
 * Signals: `svg:statechange` `{from, to, state}`, `svg:transitionend` `{state}`.
 * The element carries `MOVING_CLASS` while a transition runs.
 */
import { h } from '../graphics/primitives/element.js';
import { normalizePathTopology } from '../graphics/vectorizer.js';
import { SVG_STATE_CSS } from '../graphics/css/svg-state.js';
import { MOVING_CLASS, prefersReducedMotion } from './motion.js';
import { defineTrait, injectAddonCss } from './trait.js';

export const SVG_STATE_WRAPPER_CLASS = 'cloudcanvas-svg-state-wrapper';
export const SVG_STATE_HOST_CLASS = 'cloudcanvas-svg-state-host';
export const SVG_STATE_PATH_CLASS = 'cloudcanvas-svg-state-path';

/** Default transition duration, in milliseconds. */
export const DEFAULT_TRANSITION_DURATION = 350;

/** Default transition easing. */
export const DEFAULT_TRANSITION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

const DEFAULT_FILL = 'var(--cc-surface-2, rgba(56, 189, 248, 0.15))';
const DEFAULT_STROKE = 'var(--cc-accent, #38bdf8)';

/** @type {WeakMap<Element, object>} element -> its running record */
const RECORDS = /* @__PURE__ */ new WeakMap();

/** The svg-state record running on a blit, or undefined. */
export function svgStateOf(b) {
  return RECORDS.get(b.el);
}

/* ------------------ STATE ------------------ */

function init(options) {
  const s = {
    viewBox: options.viewBox || '0 0 200 200',
    perspective: Number(options.perspective) || 800,
    rx: Number(options.rx) || 0,
    ry: Number(options.ry) || 0,
    rz: Number(options.rz) || 0,
    depth: Number(options.depth) || 0,
    duration: typeof options.duration === 'number' ? options.duration : DEFAULT_TRANSITION_DURATION,
    easing: options.easing || DEFAULT_TRANSITION_EASING,
    normalizeSegments: typeof options.normalizeSegments === 'number' ? options.normalizeSegments : 0,
    bindVector: typeof options.bindVector === 'number' ? options.bindVector : null,
    /** @type {Map<string, object>} state name -> normalised definition */
    states: new Map(),
    currentState: undefined,
    bindings: null
  };
  const raw = options.states && typeof options.states === 'object' ? options.states : {};
  for (const [key, state] of Object.entries(raw)) s.states.set(key, normalizeStateDef(s, state));
  if (s.states.size === 0) s.states.set('default', defaultState(s));

  const keys = Array.from(s.states.keys());
  s.currentState = options.initialState && s.states.has(options.initialState) ? options.initialState : keys[0];
  return s;
}

/** The baseline circle a record with no states starts from. */
function defaultState(s) {
  const d = s.normalizeSegments > 0
    ? normalizePathTopology('', s.normalizeSegments, { cx: 100, cy: 100, defaultRadius: 50 })
    : 'M 100 50 A 50 50 0 1 0 100 150 A 50 50 0 1 0 100 50 Z';
  return { d, fill: DEFAULT_FILL, stroke: DEFAULT_STROKE, strokeWidth: 2, transform: 'none' };
}

/** A state definition with every key filled, its path pre-aligned when asked. */
export function normalizeStateDef(s, state) {
  if (!state || typeof state !== 'object') return { d: '', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };

  let d = state.d || '';
  if (s.normalizeSegments > 0 && d) d = normalizePathTopology(d, s.normalizeSegments, { cx: 100, cy: 100 });
  return {
    d,
    fill: state.fill !== undefined ? state.fill : DEFAULT_FILL,
    stroke: state.stroke !== undefined ? state.stroke : DEFAULT_STROKE,
    strokeWidth: state.strokeWidth !== undefined ? state.strokeWidth : 2,
    strokeDasharray: state.strokeDasharray || 'none',
    strokeDashoffset: state.strokeDashoffset !== undefined ? state.strokeDashoffset : 0,
    opacity: state.opacity !== undefined ? state.opacity : 1,
    transform: state.transform || 'none',
    filter: state.filter || '',
    bloom: state.bloom !== undefined ? state.bloom : false
  };
}

/* ------------------ DOM ------------------ */

/** Build the wrapper, `<svg>` and `<path>` inside `content`, and draw the current state. */
export function mountSvgState(s, b, content) {
  const path = h('path', { class: SVG_STATE_PATH_CLASS, 'vector-effect': 'non-scaling-stroke' });
  const defs = h('defs', {});
  const svg = h('svg', { class: SVG_STATE_HOST_CLASS, viewBox: s.viewBox, preserveAspectRatio: 'xMidYMid meet' }, [defs, path]);
  const wrapper = h('div', {
    class: SVG_STATE_WRAPPER_CLASS,
    style: `perspective: ${s.perspective}px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: visible;`
  }, [svg]);
  content.appendChild(wrapper);

  const onTransitionEnd = () => {
    clearHint(b);
    b.emit('svg:transitionend', { state: s.currentState });
  };
  path.addEventListener('transitionend', onTransitionEnd);
  s.bindings = { wrapper, svg, defs, path, cleanupTimer: null, _onTransitionEnd: onTransitionEnd };

  applyState(s, b, s.currentState, true);
  setOrientation(s, { rx: s.rx, ry: s.ry, rz: s.rz, depth: s.depth });
  return s.bindings;
}

/** Take the DOM and the listener back out. */
export function unmountSvgState(s, b) {
  const bindings = s.bindings;
  if (!bindings) return;
  if (bindings.cleanupTimer) clearTimeout(bindings.cleanupTimer);
  bindings.cleanupTimer = null;
  bindings.path.removeEventListener('transitionend', bindings._onTransitionEnd);
  bindings.wrapper.remove();
  clearHint(b);
  s.bindings = null;
}

/** Set the 3D orientation (any subset of `rx ry rz depth`) and write it onto the `<svg>`. */
export function setOrientation(s, { rx, ry, rz, depth } = {}) {
  if (rx !== undefined) s.rx = Number(rx) || 0;
  if (ry !== undefined) s.ry = Number(ry) || 0;
  if (rz !== undefined) s.rz = Number(rz) || 0;
  if (depth !== undefined) s.depth = Number(depth) || 0;
  if (!s.bindings || !s.bindings.svg) return;
  s.bindings.svg.style.transform = `translateZ(${s.depth}px) rotateX(${s.rx}deg) rotateY(${s.ry}deg) rotateZ(${s.rz}deg)`;
}

/**
 * Move to a named state, transitioned unless `immediate` (or reduced motion),
 * and announce `svg:statechange`. @returns {boolean} false for an unknown state
 */
export function transitionState(s, b, name, options = {}) {
  if (!s.states.has(name)) return false;
  const from = s.currentState;
  s.currentState = name;
  applyState(s, b, name, options.immediate || prefersReducedMotion(), options);
  b.emit('svg:statechange', { from, to: name, state: s.states.get(name) });
  return true;
}

/** Morph the path to raw path data, resampled when the record normalises. */
export function applyContour(s, b, pathData, options = {}) {
  if (!s.bindings || !s.bindings.path) return;
  const d = s.normalizeSegments > 0 ? normalizePathTopology(pathData, s.normalizeSegments, { cx: 100, cy: 100 }) : pathData;
  if (!(options.immediate || prefersReducedMotion())) grantHint(b);
  s.bindings.path.setAttribute('d', d);
  s.bindings.path.style.d = `path("${d}")`;
}

/** A state's presentation onto the path, with the transition (and its hint) unless immediate. */
function applyState(s, b, name, immediate = false, options = {}) {
  const state = s.states.get(name);
  if (!s.bindings || !s.bindings.path || !state) return;
  const path = s.bindings.path;
  if (immediate) {
    path.style.transition = 'none';
    clearHint(b);
  } else {
    startTransition(s, b, path, options);
  }
  if (state.d) {
    path.setAttribute('d', state.d);
    // The CSS `d` property is what the compositor interpolates.
    path.style.d = `path("${state.d}")`;
  }
  path.setAttribute('fill', state.fill);
  path.setAttribute('stroke', state.stroke);
  path.setAttribute('stroke-width', String(state.strokeWidth));
  path.setAttribute('stroke-dasharray', state.strokeDasharray);
  path.setAttribute('stroke-dashoffset', String(state.strokeDashoffset));
  path.setAttribute('opacity', String(state.opacity));
  path.style.transform = state.transform && state.transform !== 'none' ? state.transform : '';
  path.style.filter = filterOf(state);
}

/** Arm the CSS transition and the hint, with a fallback in case `transitionend` never fires. */
function startTransition(s, b, path, options) {
  const duration = typeof options.duration === 'number' ? options.duration : s.duration;
  const easing = options.easing || s.easing;
  path.style.transition = `d ${duration}ms ${easing}, transform ${duration}ms ${easing}, fill ${duration}ms ease, stroke ${duration}ms ease, stroke-width ${duration}ms ease, filter ${duration}ms ease`;
  grantHint(b);

  const bindings = s.bindings;
  if (bindings.cleanupTimer) clearTimeout(bindings.cleanupTimer);
  bindings.cleanupTimer = setTimeout(() => {
    clearHint(b);
    bindings.cleanupTimer = null;
  }, duration + 80);
}

/** The state's filter, with its bloom glow appended. */
function filterOf(state) {
  if (!state.bloom) return state.filter || '';
  const intensity = typeof state.bloom === 'number' ? state.bloom : 1;
  const bloom = `drop-shadow(0 0 ${4 * intensity}px ${state.stroke}) drop-shadow(0 0 ${12 * intensity}px ${state.fill})`;
  return state.filter ? `${state.filter} ${bloom}` : bloom;
}

/** The compositor-layer hint, granted for a transition and retired after it (no VRAM held). */
function grantHint(b) {
  if (b.el && b.el.classList) b.el.classList.add(MOVING_CLASS);
}

function clearHint(b) {
  if (b.el && b.el.classList) b.el.classList.remove(MOVING_CLASS);
}

export const svgState = /* @__PURE__ */ defineTrait({
  init,
  attach: (s, b) => mountSvgState(s, b, b.el),
  detach: unmountSvgState,
  mount: (s, b) => {
    injectAddonCss('svg-state', SVG_STATE_CSS);
    RECORDS.set(b.el, s);
    return () => RECORDS.delete(b.el);
  }
});
