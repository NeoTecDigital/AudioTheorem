/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What is selected, drawn: the bar or the group heading that is the selection
 * wears the kit's mark (`is-selected`, `aria-current`), so does its row, and
 * the hint says what the selection can do. The selection is the reader's -
 * the arrows and a press move it - and the model's `selectedId` replaces it
 * when the model changes it. A selected link (a connector) is a selection of
 * its own and clears the item's.
 */
import { markSelected, writeText } from '../dom.js';
import { hintOf } from './hint.js';
import { TL } from './model.js';
import { syncMore } from './more.js';

/** Mark the selection on every bar, heading and row the sheet draws, and write the hint. */
export function paint(tl) {
  const { selectedId } = tl.state;
  for (const node of tl.sheet.querySelectorAll(`.${TL}-bar, .${TL}-group-label`)) {
    markSelected(node, node.getAttribute('data-ui-id') === selectedId);
  }
  for (const row of tl.sheet.querySelectorAll(`.${TL}-row`)) row.classList.toggle('is-current', row.getAttribute('data-row-id') === selectedId);
  syncMore(tl);
  const hint = hintOf(tl);
  writeText(tl.hintText, hint);
  tl.hint.hidden = hint === '';
}

/** Make `id` the selection (null clears it). */
export function select(tl, id) {
  const { state } = tl;
  if (state.selectedId === id) return;
  state.selectedId = id;
  paint(tl);
}
