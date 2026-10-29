/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * select: the blit's selection, mirrored into `is-selected` and announced as a
 * `select` signal whose payload is the new state. An unchanged selection
 * announces nothing; stopping the trait deselects, so it leaves no residue.
 *
 *   blit.use({ select });
 *   app.blit({ select: { selected: true } });
 *
 * A press selects the blit and deselects the root's other selections;
 * a shift-press toggles it alone. `setSelected(b, value)` is the call form.
 */
import { rootOf, stateOf } from '../core/state.js';
import { SELECT_CSS } from '../graphics/css/select.js';
import { SELECTED_CLASS, defineTrait, injectAddonCss, isPrimaryPress, ownsEvent } from './trait.js';

export { SELECTED_CLASS };

/** @type {WeakMap<Element, object>} element -> its running select record */
const RECORDS = /* @__PURE__ */ new WeakMap();

function init(options) {
  return { selected: Boolean(options.selected) };
}

/** Mirror the record's selection into the class list. */
export function syncSelectedClass(s, b) {
  if (b.el && b.el.classList) b.el.classList.toggle(SELECTED_CLASS, s.selected);
}

/**
 * Set the selection, mirror it and announce it. @returns {boolean} false when it was unchanged
 */
export function applySelection(s, b, selected) {
  if (s.selected === selected) return false;
  s.selected = selected;
  syncSelectedClass(s, b);
  b.emit('select', selected);
  return true;
}

/** Select or deselect a blit carrying the trait. @returns {boolean} whether it changed */
export function setSelected(b, selected) {
  const s = RECORDS.get(b.el);
  return s ? applySelection(s, b, Boolean(selected)) : false;
}

/** Deselect every other selected blit under the same root. */
function deselectOthers(b) {
  const root = rootOf(stateOf(b.el));
  if (!root) return;
  for (const element of root.host.querySelectorAll(`.${SELECTED_CLASS}`)) {
    if (element !== b.el && RECORDS.has(element)) setSelected(stateOf(element).handle, false);
  }
}

/** The wiring: the chunk, the record findable, and a press selects. */
function mount(s, b) {
  injectAddonCss('select', SELECT_CSS);
  RECORDS.set(b.el, s);
  // A blit born selected says so, so a trait that shows on selection (handles, a grip) catches up.
  if (s.selected) b.emit('select', true);
  const off = b.on('pointerdown', (event) => {
    if (!isPrimaryPress(event) || !ownsEvent(b, event)) return;
    if (event.shiftKey) {
      applySelection(s, b, !s.selected);
      return;
    }
    deselectOthers(b);
    applySelection(s, b, true);
  });
  return () => {
    off();
    RECORDS.delete(b.el);
  };
}

export const select = /* @__PURE__ */ defineTrait({
  init,
  attach: syncSelectedClass,
  detach: (s, b) => applySelection(s, b, false),
  mount
});
