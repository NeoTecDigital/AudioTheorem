/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * drag: a press, past a 3px threshold, moves the blit with the pointer.
 *
 *   blit.use({ drag });
 *   app.blit({ x: 100, y: 100, drag: true });
 *
 * Two signals, both keyed on the threshold rather than the press, so a click is
 * silent: `drag:start` `{x, y}`, the position left from, and `drag:end`
 * `{x, y, cancelled}`, the one come to rest at (`cancelled` when the gesture was
 * taken away rather than released). The blit carries `is-dragging` while
 * pressed. A press on a control (`isControlTarget`) is the page's and never drags.
 *
 * A press in the blit's own selectable text (`data-selectable-text`) places a
 * caret instead, except on a `[data-drag-handle]` (a card header). And a grip
 * at the corner - the one thing left to grab on a chromeless control whose
 * whole surface is the page's - which the drag chunk shows while the blit is
 * selected and chromeless (`data-chrome="false"`), so a later `chrome` write
 * shows or hides it with no restart. `{handle: true}` shows it on any selected
 * blit; `{handle: false}` adds none.
 */
import { DRAG_CSS } from '../graphics/css/drag.js';
import { coordinate, defineTrait, injectAddonCss, isControlTarget, passedThreshold } from './trait.js';

/** The grip a chromeless blit is dragged by. */
export const GRAB_HANDLE_CLASS = 'cloudcanvas-grab-handle';

/** Set to `always` on a grip `{handle: true}` asked for: shown on any selected blit, chromeless or not. */
export const GRAB_HANDLE_MODE_ATTR = 'data-cc-grab';

/** Where a press in selectable text still drags. */
export const DRAG_HANDLE_ATTR = 'data-drag-handle';

/** The class the element carries while a drag press is live. */
export const DRAGGING_CLASS = 'is-dragging';

/** A fresh drag record: the press, and whether it has become a drag. */
function init(options = {}) {
  return {
    dragging: false, dragOffset: { x: 0, y: 0 }, _downX: null, _downY: null, _translating: false, handle: typeof options.handle === 'boolean' ? options.handle : null
  };
}

/**
 * Arm a drag, unless the press landed on a control. The offset is measured at
 * the press, so once the threshold is crossed the blit follows the pointer
 * exactly, travel already spent included.
 * @returns {boolean} whether a drag was armed
 */
export function pressDrag(s, b, event, env) {
  if (isControlTarget(event ? event.target : null)) return false;

  s.dragging = true;
  s._translating = false;
  s._downX = coordinate(event?.clientX);
  s._downY = coordinate(event?.clientY);
  if (b.el && b.el.classList) b.el.classList.add(DRAGGING_CLASS);

  const at = env.point(event);
  s.dragOffset = { x: at.x - b.x, y: at.y - b.y };
  return true;
}

/** Follow the pointer once it has gone somewhere; the first such move announces `drag:start`. */
export function moveDrag(s, b, event, env) {
  if (!s.dragging) return;
  if (!s._translating && !passedThreshold(s, event)) return;

  if (!s._translating) {
    s._translating = true;
    b.emit('drag:start', { x: b.x, y: b.y });
  }
  const at = env.point(event);
  b.set({ x: at.x - s.dragOffset.x, y: at.y - s.dragOffset.y });
}

/** End the press. @returns {boolean} whether it had become a drag */
export function releaseDrag(s, b) {
  const translated = s._translating;
  s._downX = null;
  s._downY = null;
  s._translating = false;

  if (s.dragging) {
    s.dragging = false;
    if (b.el && b.el.classList) b.el.classList.remove(DRAGGING_CLASS);
  }
  return translated;
}

/** Announce where the drag came to rest; no event is the cancellation convention. */
export function endDrag(b, event) {
  b.emit('drag:end', { x: b.x, y: b.y, cancelled: event === undefined });
  return true;
}

/** `releaseDrag` then, for a real drag, `endDrag`. @returns {boolean} whether `drag:end` was announced */
function release(s, b, event) {
  return releaseDrag(s, b) ? endDrag(b, event) : false;
}

/** Whether a press on `target` belongs to `b`'s selectable text, which keeps it for the caret. */
export function isTextRegion(b, target) {
  const text = target?.closest?.('[data-selectable-text]');
  return text === b.el && text.getAttribute('data-selectable-text') !== 'false' && !target.closest(`[${DRAG_HANDLE_ATTR}]`);
}

/** The chunk, and the grip unless `{handle: false}`: its visibility is the chunk's, and it goes with the trait. */
function mount(s, b) {
  injectAddonCss('drag', DRAG_CSS);
  if (s.handle === false) return undefined;
  const grip = document.createElement('div');
  grip.className = GRAB_HANDLE_CLASS;
  grip.setAttribute('aria-hidden', 'true');
  if (s.handle === true) grip.setAttribute(GRAB_HANDLE_MODE_ATTR, 'always');
  b.el.appendChild(grip);
  return () => grip.remove();
}

export const drag = /* @__PURE__ */ defineTrait({
  init,
  press: (s, b, event, env) => !isTextRegion(b, event?.target) && pressDrag(s, b, event, env),
  move: moveDrag,
  release,
  detach: (s, b) => release(s, b),
  mount
});
