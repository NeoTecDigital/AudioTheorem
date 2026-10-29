/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * edit: the edit lock. While a blit is being edited in place, nothing renders
 * into it - a render would take the editor's node, caret, selection and
 * half-typed word with it - and the work is deferred, never dropped.
 *
 *   begin(b, input)   the lock: `data-editing` on, `edit` (payload true) emitted
 *   deferRender(b, f) a renderer's gate: true while locked, keeping `f` as the replay
 *   end(b)            the lock released, the last replay run once, `edit` (false)
 *
 * Idempotent both ways: a second `begin` (focus after pointerdown) changes and
 * announces nothing, an `end` without a lock is a no-op, and an edit nothing
 * tried to render during costs no render. The named trait `edit` arms it: an
 * editor node (input, textarea, select, contenteditable) inside the blit taking
 * focus begins the edit, and focus leaving the blit ends it.
 *
 *   blit.use({ edit });
 *   card.set({ edit: true });
 */

/** The event announcing a lock transition; the payload is the new state. */
export const EDIT_EVENT = 'edit';

/** The attribute mirroring the lock on the element. */
export const EDITING_ATTR = 'data-editing';

/** What takes the caret: the node an armed blit begins an edit on. */
const EDITOR_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** @type {WeakMap<Element, {node: Element|null, replay: Function|null}>} element -> its open edit */
const EDITS = /* @__PURE__ */ new WeakMap();

/** Whether `b` holds the lock. */
export function isEditing(b) {
  return EDITS.has(b.el);
}

/** The node the open edit was begun on, or null. */
export function editNode(b) {
  return EDITS.get(b.el)?.node ?? null;
}

/**
 * Take the lock. @param {Element|null} [node] the node holding the caret
 * @returns {boolean} true when this call opened it
 */
export function begin(b, node = null) {
  if (EDITS.has(b.el)) return false;
  EDITS.set(b.el, { node: node || null, replay: null });
  b.el.setAttribute(EDITING_ATTR, '');
  b.emit(EDIT_EVENT, true);
  return true;
}

/**
 * Release the lock and run the last deferred render, once, if any was deferred.
 * @returns {boolean} true when this call released it
 */
export function end(b) {
  const open = EDITS.get(b.el);
  if (!open) return false;
  EDITS.delete(b.el);
  b.el.removeAttribute(EDITING_ATTR);
  open.replay?.();
  b.emit(EDIT_EVENT, false);
  return true;
}

/**
 * A renderer's gate: whether it must leave `b`'s DOM alone. While locked, `replay`
 * (the render it would have run) is kept, the last one replacing any earlier, so
 * the edit lands on the final state rather than a queue of intermediate ones.
 * @returns {boolean} true when the render must not proceed
 */
export function deferRender(b, replay) {
  const open = EDITS.get(b.el);
  if (!open) return false;
  if (typeof replay === 'function') open.replay = replay;
  return true;
}

/** The named trait: an editor node inside taking focus begins the edit; focus leaving the blit ends it. */
export function edit(b) {
  const onFocusIn = (event) => {
    const target = event.target;
    if (typeof target?.matches === 'function' && target.matches(EDITOR_SELECTOR)) begin(b, target);
  };
  const onFocusOut = (event) => {
    if (!event.relatedTarget || !b.el.contains(event.relatedTarget)) end(b);
  };
  b.el.addEventListener('focusin', onFocusIn);
  b.el.addEventListener('focusout', onFocusOut);
  return () => {
    b.el.removeEventListener('focusin', onFocusIn);
    b.el.removeEventListener('focusout', onFocusOut);
    end(b);
  };
}
