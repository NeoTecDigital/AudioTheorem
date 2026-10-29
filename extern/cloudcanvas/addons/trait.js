/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The trait kit: what the built-in add-ons share.
 *
 * A built-in trait is written as a *behaviour* - plain functions over a state
 * record `s` and the blit's handle `b` - and `defineTrait` turns it into the
 * function trait the core runs, `(b, opts, root) => cleanup`, wiring its
 * pointer hooks to native events:
 *
 *   init(options)             the state record's fields
 *   attach(s, b) / detach     start and stop
 *   press(s, b, event, env)   a press the blit owns; truthy arms move/release
 *   move / release            the gesture; `release` without an event is a cancel
 *   mount(s, b, root)         the rest of the wiring (ticks, root passes, CSS); returns its off
 *
 * `env.point(event)` is the press in canvas coordinates.
 */
import { BLIT_ATTR, stateOf } from '../core/state.js';

/** How an add-on puts its CSS chunk in the document: once, and not where the whole sheet is. */
export { injectAddonCss } from '../graphics/styles.js';

/** Pointer travel (px) a press must exceed before it moves anything. */
export const DRAG_THRESHOLD_PX = 3;

/** Largest pointer travel (px) that still counts as a click rather than a drag. */
export const CLICK_TRAVEL_PX = 5;

/** The attribute a real control carries; a press on one is the page's, never a gesture. */
export const CONTROL_ATTR = 'data-cc-control';

/** Everything a press stands down on: the platform's controls and any `data-cc-control`. */
export const CONTROL_SELECTOR = /* @__PURE__ */ [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'label',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  `[${CONTROL_ATTR}]`
].join(', ');

/** Whether a press on `target` belongs to a control. */
export function isControlTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest(CONTROL_SELECTOR));
}

/** A finite coordinate, or null. */
export function coordinate(value) {
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a move is far enough from the press (`s._downX/_downY`) to be a
 * gesture. A press or move with no coordinates passes: the threshold absorbs
 * wobble, it is not a second way to drop a gesture.
 */
export function passedThreshold(s, event) {
  if (s._downX === null || s._downY === null) return true;
  if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return true;
  return Math.hypot(event.clientX - s._downX, event.clientY - s._downY) > DRAG_THRESHOLD_PX;
}

/** The class a selected element carries (`./select.js` owns the selection). */
export const SELECTED_CLASS = 'is-selected';

/**
 * A blit's own title, for a caption or a spoken name: `aria-label`, else the `title` in a widget's
 * contents (`data-<type>` JSON), else `data-title`; '' when it has none.
 */
export function titleOf(element) {
  const label = element.getAttribute('aria-label');
  if (label) return label;
  const type = element.getAttribute('data-type');
  const raw = type ? element.getAttribute(`data-${type}`) : null;
  if (raw && raw.startsWith('{')) {
    try {
      const { title } = JSON.parse(raw);
      if (typeof title === 'string' && title) return title;
    } catch { /* contents that do not parse carry no title */ }
  }
  return element.getAttribute('data-title') ?? '';
}

/** Whether the blit is selected: it carries `is-selected`. */
export function selectedOf(b) {
  return Boolean(b.el && b.el.classList.contains(SELECTED_CLASS));
}

/** Whether `event` landed on `b` itself rather than on a blit nested inside it. */
export function ownsEvent(b, event) {
  const target = event ? event.target : null;
  return Boolean(target && typeof target.closest === 'function' && target.closest(`[${BLIT_ATTR}]`) === b.el);
}

/** The primary pointer's main button: the only press that starts a gesture. */
export function isPrimaryPress(event) {
  return event.isPrimary !== false && event.button === 0;
}

/** Add `listener` for each of `types` on `target`. @returns {() => void} off */
export function listen(target, types, listener, options) {
  for (const type of types) target.addEventListener(type, listener, options);
  return () => { for (const type of types) target.removeEventListener(type, listener, options); };
}

/** The root a root add-on runs on - the one given, else the host's own - or a TypeError naming `name`. */
export function requireRootOf(b, root, name) {
  const found = root ?? stateOf(b.el)?.root;
  if (!found || found.host !== b.el) throw new TypeError(`${name}: expected a root collection, blit('#app')`);
  return found;
}

/** A root's projection: client coordinates to canvas coordinates through its camera. */
export function rootEnv(root) {
  let last = { x: 0, y: 0 };
  return {
    root,
    point(event) {
      const rect = root.host.getBoundingClientRect();
      const camera = root.camera;
      if (!camera.is3d) return { x: (event.clientX - rect.left - camera.x) / camera.scale, y: (event.clientY - rect.top - camera.y) / camera.scale };
      // Above a tilted board's horizon there is no canvas: a gesture holds its last point on the plane.
      last = camera.unproject(event.clientX - rect.left, event.clientY - rect.top, rect) ?? last;
      return last;
    }
  };
}

/**
 * The press, and the move and release that follow it on the window, for one
 * blit. @returns {() => void} off, which also drops a gesture in flight
 */
function wirePointer(s, b, env, behaviour) {
  const onMove = (event) => { if (behaviour.move) behaviour.move(s, b, event, env); };
  const onUp = (event) => {
    stop();
    if (behaviour.release) behaviour.release(s, b, event, env);
  };
  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  const offDown = b.on('pointerdown', (event) => {
    if (!isPrimaryPress(event) || !ownsEvent(b, event)) return;
    if (!behaviour.press(s, b, event, env)) return;
    stop();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
  return () => { offDown(); stop(); };
}

/**
 * A behaviour as a function trait; `extra` adds (or overrides) hooks, so a
 * trait can reuse another's gesture functions and differ in one.
 * @returns {(b: object, opts: any, root: object) => () => void}
 */
export function defineTrait(shared, extra = {}) {
  const behaviour = { ...shared, ...extra };
  const trait = (b, opts, root) => {
    const s = behaviour.init(opts && typeof opts === 'object' ? opts : {});
    if (behaviour.attach) behaviour.attach(s, b);
    const offs = [];
    if (behaviour.press) offs.push(wirePointer(s, b, rootEnv(root), behaviour));
    if (behaviour.mount) offs.push(behaviour.mount(s, b, root));
    return () => {
      for (const off of offs) if (typeof off === 'function') off();
      if (behaviour.detach) behaviour.detach(s, b);
    };
  };
  return trait;
}
