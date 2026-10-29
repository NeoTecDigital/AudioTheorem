/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Roving focus: one tab stop per composite control, arrows move within it.
 * Pure index arithmetic plus the one DOM write (`tabindex` 0 on exactly one
 * item), shared by tabs, results, the board, the calendar and the timeline.
 */

/** Keys that step backwards and forwards along each orientation. */
const STEPS = Object.freeze({
  horizontal: { ArrowLeft: -1, ArrowRight: 1 },
  vertical: { ArrowUp: -1, ArrowDown: 1 },
  both: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }
});

/**
 * The index `key` moves to from `index` in a list of `count`, or null when the
 * key is not a navigation key for this orientation.
 * @param {string} key
 * @param {number} index current index (-1 when nothing is current)
 * @param {number} count
 * @param {{orientation?: 'horizontal'|'vertical'|'both', wrap?: boolean}} [options]
 * @returns {number|null}
 */
export function nextIndex(key, index, count, { orientation = 'vertical', wrap = false } = {}) {
  if (count <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = STEPS[orientation]?.[key];
  if (step === undefined) return null;
  const from = index < 0 ? (step > 0 ? -1 : count) : index;
  const to = from + step;
  if (wrap) return (to + count) % count;
  return Math.min(count - 1, Math.max(0, to));
}

/** Give `current` the single tab stop among `nodes`; the rest get `tabindex="-1"`. */
export function setTabStop(nodes, current) {
  for (const node of nodes) node.setAttribute('tabindex', node === current ? '0' : '-1');
}

/** Whether `event` should be left to a text field (typing, caret moves). */
export function isTypingTarget(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}
