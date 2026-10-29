/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The status of a settings row: the host's word on the setting - "Saving", "Saved", "Could not save" - in a live
 * region the switch and the select both carry. It is on the page from the first draw, empty, because a region that
 * comes with its words is not reliably read; `role="status"`, polite, and assertive for a `danger` tone. `tone` is
 * success, warning, danger or muted (muted is what any other word means); the sheet draws it as a marker and the words
 * stay the page's own ink.
 */
import { el, textNode, uniqueId, writeText } from './dom.js';

const TONES = /* @__PURE__ */ new Set(['success', 'warning', 'danger', 'muted']);

/**
 * The slot: an empty live region of class `className`, with the text node its words are written into.
 * @returns {{node: HTMLElement, text: Text}}
 */
export function statusSlot(doc, className) {
  const node = el(doc, 'span', { className, attrs: { id: uniqueId(className), role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  return { node, text: textNode(doc, node) };
}

/**
 * Say `status` in `slot`: the tone and how urgently it is read first, so the words arrive into a region already set.
 * @param {{node: HTMLElement, text: Text}} slot from `statusSlot`
 * @param {{text?: string, tone?: 'success'|'warning'|'danger'|'muted'}} [status]
 * @returns {boolean} whether the slot has words now
 */
export function writeStatus(slot, status) {
  const words = String(status?.text ?? '').trim();
  const tone = TONES.has(status?.tone) ? status.tone : 'muted';
  if (words === '') slot.node.removeAttribute('data-tone');
  else slot.node.setAttribute('data-tone', tone);
  slot.node.setAttribute('aria-live', tone === 'danger' && words !== '' ? 'assertive' : 'polite');
  writeText(slot.text, words);
  return words !== '';
}
