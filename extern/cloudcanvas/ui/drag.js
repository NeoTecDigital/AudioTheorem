/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The pointer drag the board, calendar, timeline and graph share.
 *
 *   trackDrag(life, list, { selector: '[data-ui-id]', onStart, onMove, onEnd });
 *
 * A mouse or pen press becomes a drag once it travels past `threshold` px; a
 * shorter press stays a click. A touch can become a drag only after it rests
 * for `touchDelay` ms, so a swipe still scrolls the page - and then only once
 * it travels past `touchThreshold` px. A STILL FINGER STARTS NOTHING AND DRAWS
 * NOTHING, however long it rests: the hold is the host's, whose long-press
 * menu opens over the item as it was. From the rest on, the page's scroll is
 * held off (a non-passive `touchmove`), so the travel to come is the drag's.
 * The pointer is captured by the container, so a drag survives its item being
 * re-rendered. Escape, a cancelled pointer or `cancel()` end the drag with
 * `onEnd(null)`; a release ends it with the point, and the click that follows
 * a real drag is swallowed so the item is not also activated.
 */

/** Default travel (px) before a mouse press becomes a drag. */
export const DRAG_START_PX = 4;

/** Default rest (ms) before a touch can become a drag. */
export const TOUCH_DRAG_DELAY_MS = 350;

/**
 * Default travel (px) before a rested touch becomes a drag. More than a mouse
 * is given: a finger held still trembles, and a host that opens a menu on a
 * long press allows it this much drift before it calls the press off.
 */
export const TOUCH_DRAG_START_PX = 10;

function pointOf(event) {
  return { x: event.clientX, y: event.clientY };
}

function travelled(press, event) {
  return Math.hypot(event.clientX - press.x, event.clientY - press.y);
}

function swallowNextClick(life, container) {
  const swallow = (event) => { event.preventDefault(); event.stopPropagation(); };
  container.addEventListener('click', swallow, { capture: true, once: true, signal: life.signal });
  life.later(() => container.removeEventListener('click', swallow, { capture: true }), 0);
}

/** Start the drag. `onStart` gets the press point, so a grab offset is measured where the finger went down. */
function begin(state, container, options) {
  state.dragging = true;
  try { container.setPointerCapture?.(state.press.id); } catch { /* the pointer already ended */ }
  container.classList.add('is-drag-active');
  options.onStart?.(state.press.item, { x: state.press.x, y: state.press.y }, state.press.target);
}

function finish(state, container, options, point) {
  const wasDragging = state.dragging;
  state.cancelTouch?.();
  state.cancelTouch = null;
  state.press = null;
  state.dragging = false;
  container.classList.remove('is-drag-active');
  if (wasDragging) options.onEnd?.(point);
  return wasDragging;
}

/** A press is ready to become a drag at once, unless it is a touch: that one must rest first, and the rest only readies it. */
function press(life, state, container, options, event) {
  if (event.button !== 0 || state.press) return;
  const item = event.target.closest?.(options.selector);
  if (!item || !container.contains(item) || options.canStart?.(item, event) === false) return;
  const touch = event.pointerType === 'touch';
  state.press = { id: event.pointerId, item, target: event.target, x: event.clientX, y: event.clientY, touch, ready: !touch };
  if (touch) state.cancelTouch = life.later(() => { if (state.press) state.press.ready = true; }, options.touchDelay ?? TOUCH_DRAG_DELAY_MS);
}

/** How far a press may travel and still not have moved: a rested finger is given more room than a mouse, or than a finger about to swipe. */
function slopOf(current, options) {
  return current.touch && current.ready ? options.touchThreshold ?? TOUCH_DRAG_START_PX : options.threshold ?? DRAG_START_PX;
}

function move(state, container, options, event) {
  const current = state.press;
  if (!current || event.pointerId !== current.id) return;
  if (state.dragging) { options.onMove?.(pointOf(event)); return; }
  if (travelled(current, event) <= slopOf(current, options)) return;
  // A touch that travels before it has rested is a swipe: the page's, not a drag.
  if (!current.ready) { finish(state, container, options, null); return; }
  begin(state, container, options);
  options.onMove?.(pointOf(event));
}

/**
 * @param {{signal: AbortSignal, later: Function, on: Function}} life the owning control's life
 * @param {HTMLElement} container
 * @param {{selector: string, threshold?: number, touchDelay?: number, touchThreshold?: number,
 *   canStart?: (item: Element, event: PointerEvent) => boolean,
 *   onStart?: (item: Element, point: {x: number, y: number}, pressTarget: Element) => void,
 *   onMove?: (point: {x: number, y: number}) => void,
 *   onEnd?: (point: {x: number, y: number}|null) => void}} options
 * @returns {{cancel(): void, get dragging(): boolean}}
 */
export function trackDrag(life, container, options) {
  const state = { press: null, dragging: false, cancelTouch: null };
  life.on(container, 'pointerdown', (event) => press(life, state, container, options, event));
  life.on(container, 'pointermove', (event) => move(state, container, options, event));
  life.on(container, 'pointerup', (event) => {
    if (state.press?.id !== event.pointerId) return;
    if (finish(state, container, options, pointOf(event))) swallowNextClick(life, container);
  });
  life.on(container, 'pointercancel', (event) => {
    if (state.press?.id === event.pointerId) finish(state, container, options, null);
  });
  // From the rest on: by the time a finger has travelled far enough to be a drag, the page would be scrolling.
  life.on(container, 'touchmove', (event) => { if (state.dragging || (state.press?.touch && state.press.ready)) event.preventDefault(); }, { passive: false });
  life.on(container, 'contextmenu', (event) => { if (state.press?.touch) event.preventDefault(); });
  const doc = container.ownerDocument;
  life.on(doc, 'keydown', (event) => {
    if (event.key === 'Escape' && state.dragging) { event.preventDefault(); finish(state, container, options, null); }
  });
  life.add(() => { state.cancelTouch?.(); state.press = null; state.dragging = false; });
  return {
    cancel() { finish(state, container, options, null); },
    get dragging() { return state.dragging; }
  };
}
