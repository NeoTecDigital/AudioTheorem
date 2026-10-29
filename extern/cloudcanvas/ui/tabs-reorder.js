/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Moving a tab along its strip (`./tabs.js` owns the strip; this is the part
 * that answers a drag and the two keys, and `./css/tabs.js` is how a move is
 * drawn).
 *
 * THE KIT MOVES NOTHING. A move is reported - `onReorder(id, beforeId)`, the
 * tab it would land before, or null for the end - and the caller answers with
 * the model in its new order. A strip given no `onReorder` has no part of
 * this: its tabs are not picked up and its keys are the ones it always had.
 *
 * BY POINTER. A press on a tab that travels becomes a drag (`./drag.js`: a
 * touch only once it has rested and then travels, so a swipe still scrolls the
 * strip and a still hold is the host's, for its menu). The tab's row
 * is marked `is-dragging`, and the row it would land before carries
 * `data-drop="before"` - the last row `data-drop="after"`, for the end. A drop
 * where the tab already stands is no move: nothing is marked and nothing is
 * reported. Escape puts it back.
 *
 * BY KEYS. Alt+ArrowLeft and Alt+ArrowRight on a tab report the nearest place
 * on that side. Both are taken whether or not there is one, so at the end of a
 * strip Alt+ArrowLeft does not become the browser's "back".
 *
 * A PINNED TAB DOES NOT MOVE, AND NOTHING LANDS BEFORE ONE. A place before a
 * pinned tab is no place: a drop there lands after it, and the keys pass it or
 * stop at it.
 */
import { trackDrag } from './drag.js';

const CLASS = 'cloudcanvas-ui-tabs';
const ROW = `.${CLASS}-item`;

/** The keys that move a tab, and the side each moves it to. */
const SIDES = /* @__PURE__ */ Object.freeze({ ArrowLeft: -1, ArrowRight: 1 });

/**
 * Where a move of the tab `id` to the place `wanted` comes to. A place is a
 * position among all the items, 0 for the start to `items.length` for the end;
 * one before a pinned tab slides on to the first that is not.
 * @param {Array<{id: string, pinned?: boolean}>} items
 * @param {string} id
 * @param {number} wanted
 * @returns {string|null|undefined} the id it lands before, null for the end, or
 *   undefined when it is no move: the tab is pinned, is gone, or stands there already
 */
export function landingOf(items, id, wanted) {
  const from = items.findIndex((item) => item.id === id);
  if (from === -1 || items[from].pinned === true) return undefined;
  let at = Math.max(0, Math.min(wanted, items.length));
  while (at < items.length && items[at].pinned === true) at += 1;
  if (at === from || at === from + 1) return undefined;
  return at < items.length ? items[at].id : null;
}

/** The place one step to `side` of the tab at `from`: to the left, the nearest that is not before a pinned tab. */
function placeBeside(items, from, side) {
  if (side > 0) return from + 2;
  for (let at = from - 1; at >= 0; at -= 1) if (items[at].pinned !== true) return at;
  return from;
}

/** The place under the pointer at client `x`: before the first row whose middle is still ahead of it. */
function placeAt(root, x) {
  const rows = Array.from(root.querySelectorAll(ROW));
  const ahead = rows.findIndex((row) => {
    const box = row.getBoundingClientRect();
    return x < box.left + box.width / 2;
  });
  return ahead === -1 ? rows.length : ahead;
}

/** Take every mark of a landing place off the strip. */
function unmark(root) {
  for (const row of root.querySelectorAll('[data-drop]')) row.removeAttribute('data-drop');
}

/** Show where the tab being dragged would land with the pointer at client `x`, or nothing where that is no move. */
function mark(root, state, id, x) {
  unmark(root);
  const before = landingOf(state.items, id, placeAt(root, x));
  if (before === undefined) return;
  const rows = Array.from(root.querySelectorAll(ROW));
  const row = before === null ? rows.at(-1) : rows[state.items.findIndex((item) => item.id === before)];
  row?.setAttribute('data-drop', before === null ? 'after' : 'before');
}

/** Follow a drag of a tab: mark its row and its landing place, and report the move when it is let go on one. */
function bindDrag(life, root, state, onReorder) {
  let held = null;
  const end = (point) => {
    const { id, row } = held;
    held = null;
    row.classList.remove('is-dragging');
    unmark(root);
    const before = point ? landingOf(state.items, id, placeAt(root, point.x)) : undefined;
    if (before !== undefined) onReorder(id, before);
  };
  trackDrag(life, root, {
    selector: '[role="tab"]',
    canStart: (tab) => !tab.disabled && tab.getAttribute('data-pinned') !== 'true',
    onStart(tab) {
      held = { id: tab.getAttribute('data-ui-id'), row: tab.closest(ROW) };
      held.row.classList.add('is-dragging');
    },
    onMove: (point) => mark(root, state, held.id, point.x),
    onEnd: end
  });
}

/**
 * Reordering for one strip, or none of it when the strip was given no
 * `onReorder`.
 * @param {{on: Function, add: Function, later: Function, signal: AbortSignal}} life the strip's own
 * @param {HTMLElement} root the strip
 * @param {{items: Array<{id: string, pinned?: boolean}>}} state the strip's, read when a move is made
 * @param {{onReorder?: (id: string, beforeId: string|null) => void}} callbacks
 * @returns {{key(event: KeyboardEvent, id: string): boolean}} `key` answers a keydown on the tab `id`, and says
 *   whether the key was a move's - made or not - and so not the strip's to rove with
 */
export function createReorder(life, root, state, callbacks) {
  const onReorder = callbacks.onReorder;
  if (typeof onReorder !== 'function') return { key: () => false };
  root.setAttribute('data-reorder', 'true');
  bindDrag(life, root, state, onReorder);
  return {
    key(event, id) {
      const side = event.altKey ? SIDES[event.key] : undefined;
      if (side === undefined) return false;
      const from = state.items.findIndex((item) => item.id === id);
      const before = from === -1 ? undefined : landingOf(state.items, id, placeBeside(state.items, from, side));
      if (before !== undefined) onReorder(id, before);
      return true;
    }
  };
}
