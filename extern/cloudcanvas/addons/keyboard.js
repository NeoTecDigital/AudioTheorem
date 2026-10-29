/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * keyboard: the root as one tab stop, with roving focus among its blits.
 *
 *   blit.use({ keyboard });      // then <div id="app" data-keyboard>
 *   const off = keyboard(blit('#app'), { label: 'Project board' });   // `tabStop: false`: no tab stop
 *
 * The host gets `tabindex="0"` and, because it now gives every key back,
 * `role="application"` with its role description and name - only while this
 * add-on is on, and never over an author's own value. The composite-widget model:
 *
 *   - host stage: arrows pan (Shift x4), `+`/`-` zoom about the centre, `0`
 *     re-frames, Enter steps into the blits, Escape steps the root out, Home
 *     drops it.
 *   - blit stage: arrows rove in reading order (top to bottom, then left to
 *     right, wrapping), Enter emits `action` on the blit, Space emits `action`
 *     and counts as handled only when a listener prevents its default, Escape
 *     returns to the host. A roved-to blit is brought into view at its scale.
 *
 * Keys a text field, control, <summary> or contenteditable owns are never taken.
 * Dispatch runs over root hooks; installKeyboard also accepts explicit hooks.
 */
import { schedule } from '../core/frame.js';
import { BLIT_ATTR, stateOf } from '../core/state.js';
import { listen, requireRootOf } from './trait.js';

/** Camera pan per arrow press, in screen pixels; Shift multiplies it. */
export const PAN_STEP_PX = 40;
export const PAN_SHIFT_MULTIPLIER = 4;

/** Zoom ratio per `+` / `-`: one mouse-wheel notch. */
export const ZOOM_STEP = 1.2;

/** Clearance kept around a roved-to blit, and the length of the pan that reveals it (ms). */
export const VISIBILITY_MARGIN_PX = 24;
export const ENSURE_VISIBLE_MS = 200;

/** The host's accessible role, what it calls itself, and its name when nobody gives one. */
export const HOST_ROLE = 'application';
export const HOST_ROLEDESCRIPTION = 'canvas';
export const DEFAULT_HOST_LABEL = 'Interactive canvas';

/** Deep-freeze a key table. */
function table(entries) {
  for (const value of Object.values(entries)) {
    if (value && typeof value === 'object') table(value);
  }
  return Object.freeze(entries);
}

/**
 * The key table, by `KeyboardEvent.key`: `host` while the host holds focus,
 * `blit` while a blit does. A key absent from the map keeps its default.
 */
export const KEY_BINDINGS = /* @__PURE__ */ table({
  host: {
    ArrowLeft: { action: 'pan', dx: -1, dy: 0 },
    ArrowRight: { action: 'pan', dx: 1, dy: 0 },
    ArrowUp: { action: 'pan', dx: 0, dy: -1 },
    ArrowDown: { action: 'pan', dx: 0, dy: 1 },
    '+': { action: 'zoom', direction: 1 },
    '=': { action: 'zoom', direction: 1 },
    '-': { action: 'zoom', direction: -1 },
    _: { action: 'zoom', direction: -1 },
    0: { action: 'reset' },
    Enter: { action: 'enter-blits' },
    Escape: { action: 'back' },
    Home: { action: 'unfocus' }
  },
  blit: {
    ArrowDown: { action: 'step', delta: 1 },
    ArrowRight: { action: 'step', delta: 1 },
    ArrowUp: { action: 'step', delta: -1 },
    ArrowLeft: { action: 'step', delta: -1 },
    Enter: { action: 'focus' },
    ' ': { action: 'act' },
    Escape: { action: 'exit' }
  }
});

/**
 * Elements that own their own keys: the platform gives each a keyboard
 * behaviour, and a key defaulted away here would take it. A `<summary>` is one:
 * Enter and Space open and close its `<details>`.
 */
const KEY_OWNING_TAGS = /* @__PURE__ */ new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON', 'SUMMARY']);

function ownsItsKeys(target) {
  if (!target || typeof target !== 'object') return false;
  return target.isContentEditable === true || KEY_OWNING_TAGS.has(target.tagName);
}

/* ------------------ ARIA ------------------ */

/**
 * Write the host's application identity where the author has not.
 * @returns {string[]} the attributes written, for `removeAttributes` to take back
 */
export function applyApplicationRole(host, label = DEFAULT_HOST_LABEL) {
  const written = [];
  const wanted = [['role', HOST_ROLE], ['aria-roledescription', HOST_ROLEDESCRIPTION], ['aria-label', label]];
  for (const [name, value] of wanted) {
    if (!host || typeof host.setAttribute !== 'function' || host.hasAttribute?.(name)) continue;
    host.setAttribute(name, value);
    written.push(name);
  }
  return written;
}

/** Take back the attributes one binding wrote, and nothing else. */
export function removeAttributes(element, names) {
  for (const name of names ?? []) element.removeAttribute(name);
}

/* ------------------ DISPATCH ------------------ */

/** The env the dispatch runs in: the host, the root's camera and box, a wake, and the hooks. */
export function keyboardEnv(host, root, hooks) {
  return { host, root, camera: root.camera, wake: () => schedule(root), ...hooks };
}

/** Route one keydown to the camera or the roving order. @returns {boolean} handled (and defaulted away) */
export function handleKey(k, event, env) {
  if (!event || ownsItsKeys(event.target)) return false;

  const target = env.targetOf(event);
  const binding = (target ? KEY_BINDINGS.blit : KEY_BINDINGS.host)[event.key];
  if (!binding) return false;

  const handled = target ? applyTargetBinding(k, binding, target, event, env) : applyHostBinding(k, binding, event, env);
  if (handled && typeof event.preventDefault === 'function') event.preventDefault();
  return handled;
}

function applyHostBinding(k, binding, event, env) {
  const { camera, actions } = env;
  if (binding.action === 'pan') {
    const step = PAN_STEP_PX * (event.shiftKey === true ? PAN_SHIFT_MULTIPLIER : 1);
    camera.panBy(binding.dx * step, binding.dy * step);
  } else if (binding.action === 'zoom') {
    const rect = env.root.hostRect;
    camera.zoomAt(binding.direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, rect.width / 2, rect.height / 2, rect);
  } else if (binding.action === 'enter-blits') {
    return enterNavigation(k, env);
  } else if (typeof actions[binding.action] === 'function') {
    actions[binding.action]();
  } else {
    return false;
  }
  env.wake();
  return true;
}

function applyTargetBinding(k, binding, target, event, env) {
  switch (binding.action) {
    case 'step':
      return stepTo(k, target, binding.delta, env);
    case 'focus':
      env.actions.focus(target);
      return true;
    case 'act':
      // Consumed by this blit: it goes no further, so no ancestor runs a second affordance.
      if (!env.actions.act(target, event)) return false;
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      return true;
    case 'exit':
      return exitNavigation(k, env);
    default:
      return false;
  }
}

/* ------------------ ROVING ------------------ */

/** Top to bottom, then left to right; ids break exact ties. @param {{target, bounds, id}[]} entries */
export function sortReadingOrder(entries) {
  entries.sort((a, b) => {
    if (a.bounds.minY !== b.bounds.minY) return a.bounds.minY - b.bounds.minY;
    if (a.bounds.minX !== b.bounds.minX) return a.bounds.minX - b.bounds.minX;
    return a.id < b.id ? -1 : 1;
  });
  return entries.map((entry) => entry.target);
}

/** Step into the blits: the focused one if it is reachable, else the first. @returns {boolean} one took focus */
export function enterNavigation(k, env) {
  const order = refreshOrder(k, env);
  if (order.length === 0) return false;
  const current = env.current();
  return focusTarget(k, current && order.includes(current) ? current : order[0], env);
}

/** Hand focus back to the host. */
export function exitNavigation(k, env) {
  k.current = null;
  if (!env.host || typeof env.host.focus !== 'function') return false;
  env.host.focus({ preventScroll: true });
  return true;
}

function stepTo(k, target, delta, env) {
  // A target the cached order misses (clicked into, or the graph changed) refreshes it.
  const order = k.order?.includes(target) ? k.order : refreshOrder(k, env);
  if (order.length === 0) return false;
  const index = order.indexOf(target);
  return focusTarget(k, index < 0 ? order[0] : order[(index + delta + order.length) % order.length], env);
}

function refreshOrder(k, env) {
  k.order = env.order();
  return k.order;
}

/** Focus a target's element without scrolling the page, and bring it into view. */
function focusTarget(k, target, env) {
  const element = target ? env.elementOf(target) : null;
  if (!element || typeof element.focus !== 'function') return false;
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
    k.tabbed?.add(element);
  }
  element.focus({ preventScroll: true });
  k.current = target;
  reveal(env, env.boundsOf(target));
  return true;
}

/* ------------------ VISIBILITY ------------------ */

/** How far `[min, max]` must move to sit inside `[lo, hi]`; the leading edge wins when it cannot fit. */
function axisCorrection(min, max, lo, hi) {
  if (min >= lo && max <= hi) return 0;
  if (max - min > hi - lo || min < lo) return lo - min;
  return hi - max;
}

/**
 * Pan the least distance that puts a canvas box, plus its margin, inside the
 * host box - at the same scale: roving is not framing. A camera that eases
 * (`animateTo`) eases, inheriting its reduced-motion rule. @returns {boolean} moved
 */
export function reveal(env, bounds) {
  if (!bounds) return false;
  const { camera } = env;
  const rect = env.root.hostRect;
  // One axis: the box on screen, margin included, against the host's edges.
  const axis = (min, max, origin, offset, size) => axisCorrection(
    min * camera.scale + origin + offset - VISIBILITY_MARGIN_PX,
    max * camera.scale + origin + offset + VISIBILITY_MARGIN_PX, origin, origin + (size || 0));
  const dx = axis(bounds.minX, bounds.maxX, rect.left || 0, camera.x, rect.width);
  const dy = axis(bounds.minY, bounds.maxY, rect.top || 0, camera.y, rect.height);
  if (dx === 0 && dy === 0) return false;

  if (typeof camera.animateTo === 'function') {
    camera.animateTo(camera.x + dx, camera.y + dy, camera.scale, { duration: ENSURE_VISIBLE_MS });
  } else {
    camera.panBy(dx, dy);
  }
  env.wake();
  return true;
}

/* ------------------ INSTALL ------------------ */

/**
 * Bind the keyboard to `host`: the tab stop, the role, the listener. `options`:
 * `hooks`, `label`, and `state`, the record the roving state lives in.
 * @returns {() => void} off, taking back exactly what it wrote
 */
export function installKeyboard(host, root, options) {
  const k = Object.assign(options.state ?? {}, { current: null, order: [], tabbed: new Set() });
  k.tabindexAdded = options.tabStop !== false && !host.hasAttribute('tabindex');
  if (k.tabindexAdded) host.setAttribute('tabindex', '0');
  k.aria = applyApplicationRole(host, options.label);

  const env = keyboardEnv(host, root, options.hooks);
  const off = listen(host, ['keydown'], (event) => handleKey(k, event, env));
  return () => {
    off();
    if (k.tabindexAdded) host.removeAttribute('tabindex');
    removeAttributes(host, k.aria);
    for (const element of k.tabbed) element.removeAttribute('tabindex');
  };
}

/** A blit's global box as the `{minX, minY, maxX, maxY}` the roving reads. */
function boxOf(element) {
  const { x, y, w, h } = stateOf(element).handle.bounds;
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

/** The hooks on a core root: its blits rove, Enter and Space emit `action`, the root steps out. */
function blitHooks(b) {
  const host = b.el;
  const emit = (element, key) => stateOf(element).handle.emit('action', { key });
  return {
    targetOf(event) {
      const hit = event.target && typeof event.target.closest === 'function' ? event.target.closest(`[${BLIT_ATTR}]`) : null;
      return hit && hit !== host ? hit : null;
    },
    order: () => sortReadingOrder(Array.from(host.querySelectorAll(`[${BLIT_ATTR}]`))
      .filter((element) => !element.closest('[hidden]'))
      .map((element) => ({ target: element, bounds: boxOf(element), id: element.id }))),
    elementOf: (element) => element,
    boundsOf: boxOf,
    current: () => host.querySelector('.is-focused'),
    actions: {
      focus: (element) => emit(element, 'Enter'),
      act: (element) => emit(element, ' ').defaultPrevented,
      reset: () => b.view(),
      back: () => { if (b.root.el !== host) b.root = b.root.parent; b.view(); },
      unfocus: () => { b.root = null; b.view(); }
    }
  };
}

/** The root trait: `opts.label` names the canvas. @returns {() => void} off */
export function keyboard(b, opts, root) {
  const { label, tabStop } = opts && typeof opts === 'object' ? opts : {};
  return installKeyboard(b.el, requireRootOf(b, root, 'keyboard'), { label, tabStop, hooks: blitHooks(b) });
}
