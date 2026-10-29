/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The timeline's keys, on a bar and on a heading that stands for an item.
 * While a bar is picked up they are the move's (`./move.js`). Otherwise:
 *
 *   Up, Down, Home, End   the rows, headings among them
 *   Left, Right           the bar before and after in time (a heading: fold, open)
 *   Alt+Left, Alt+Right   move the bar a day; with Shift, resize its end by one
 *   Space                 pick the bar up (a heading: fold or open)
 *   Enter                 open the bar
 *   + or Insert           add to the group (`onAdd(groupId)`)
 *   Delete or Backspace   remove the bar (`onDelete(id)`)
 *   N                     draw a span on the row (`./draw.js`, `onCreate`)
 *   the menu key, Shift+F10   the item's menu, under it (`onMenu(id, {x, y})`)
 *
 * While a span is drawn every key is the drawing's. A verb the host gave no
 * callback for leaves its key alone.
 */
import { setTabStop } from '../roving.js';
import { isDrawKey } from '../draw-keys.js';
import { drawKey, startDraw } from './draw.js';
import { TL, shiftItem } from './model.js';
import { BAR, bars, pickUp, pickupKey, reportChange } from './move.js';
import { select } from './select.js';

const LABEL = `.${TL}-group-label`;

/** The stops of the arrows: the bars and the headings that stand for items, in the order drawn. */
function stops(tl) {
  return Array.from(tl.sheet.querySelectorAll(`${BAR}, ${LABEL}`));
}

/** Give `next` the focus, and the selection; a bar also takes the tab stop. */
function goTo(tl, next) {
  const id = next.getAttribute('data-ui-id');
  if (next.matches(BAR)) {
    tl.state.focusId = id;
    setTabStop(bars(tl), next);
  }
  next.focus();
  select(tl, id);
}

/** Up, Down, Home and End along the rows. */
function walkRows(tl, from, event) {
  const nodes = stops(tl);
  const index = nodes.indexOf(from);
  const to = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: nodes.length - 1 }[event.key];
  if (to === undefined) return false;
  event.preventDefault();
  goTo(tl, nodes[Math.max(0, Math.min(nodes.length - 1, to))]);
  return true;
}

/** Left and Right through time: the bars ordered by their start, the row's order breaking a tie. */
function walkTime(tl, bar, event) {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (step === undefined) return false;
  event.preventDefault();
  const nodes = bars(tl);
  const start = (node) => tl.byId.get(node.getAttribute('data-ui-id')).start.getTime();
  const ordered = [...nodes].sort((a, b) => start(a) - start(b) || nodes.indexOf(a) - nodes.indexOf(b));
  const next = ordered[Math.max(0, Math.min(ordered.length - 1, ordered.indexOf(bar) + step))];
  goTo(tl, next);
  return true;
}

/** Alt and Left or Right: the bar a day earlier or later, or - with Shift - its end. */
function dayKey(tl, bar, event) {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (!event.altKey || step === undefined || typeof tl.callbacks.onChange !== 'function') return false;
  event.preventDefault();
  const item = tl.byId.get(bar.getAttribute('data-ui-id'));
  if (!item.movable) return true;
  const resize = event.shiftKey;
  if (resize && !item.end) return true;
  reportChange(tl, item.id, shiftItem({ start: item.start, end: item.end }, step, resize ? 'end' : 'move'));
  return true;
}

/** The menu key's place: under the item. */
function menuPoint(face) {
  const rect = face.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

/** The call a verb key makes on `face` (a bar or a heading), or null when it is not a verb or the host took none. */
function verbOf(tl, face, event) {
  const cb = tl.callbacks;
  const id = face.getAttribute('data-ui-id');
  const bar = face.matches(BAR);
  const groupId = bar ? tl.byId.get(id).groupId : id;
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) return cb.onMenu ? () => cb.onMenu(id, menuPoint(face)) : null;
  if (event.key === 'Enter') return bar && cb.onActivate ? () => cb.onActivate(id) : null;
  if (event.key === '+' || event.key === 'Insert') return cb.onAdd && groupId !== null ? () => cb.onAdd(groupId) : null;
  if (event.key === 'Delete' || event.key === 'Backspace') return bar && cb.onDelete ? () => cb.onDelete(id) : null;
  return null;
}

/** A key on a heading: Space folds or opens, Left folds an open group and Right opens a folded one. */
function foldKey(tl, face, event) {
  const id = face.getAttribute('data-ui-id');
  const folded = tl.groups.get(id) === true;
  const ask = { ' ': !folded, ArrowLeft: folded ? null : true, ArrowRight: folded ? false : null }[event.key];
  if (ask === undefined || typeof tl.callbacks.onToggleGroup !== 'function') return false;
  event.preventDefault();
  if (ask !== null) tl.fold(id, ask);
  return true;
}

function onFaceKey(tl, face, event) {
  const bar = face.matches(BAR);
  if (!bar && foldKey(tl, face, event)) return;
  if (walkRows(tl, face, event) || (bar && dayKey(tl, face, event))) return;
  if (bar && !event.altKey && walkTime(tl, face, event)) return;
  const verb = verbOf(tl, face, event);
  if (!verb) return;
  event.preventDefault();
  verb();
}

function onKeyDown(tl, event) {
  if (tl.state.cursor) { drawKey(tl, event); return; }
  const face = event.target.closest?.(`${BAR}, ${LABEL}`);
  if (!face) return;
  if (tl.state.pending?.keyboard) { pickupKey(tl, event); return; }
  if (isDrawKey(event) && startDraw(tl, face)) { event.preventDefault(); return; }
  if (event.key === ' ' && face.matches(BAR)) {
    event.preventDefault();
    if (!event.repeat) pickUp(tl, face);
    return;
  }
  onFaceKey(tl, face, event);
}

/** Wire the keys on the timeline's sheet. */
export function bindKeys(tl) {
  tl.life.on(tl.sheet, 'keydown', (event) => onKeyDown(tl, event));
  // A Space a drawing took is no press of the face it was on, whatever that face is.
  tl.life.on(tl.sheet, 'keyup', (event) => {
    const held = event.target.closest?.(`${BAR}, ${LABEL}`);
    if (event.key === ' ' && held && (held.matches(BAR) || tl.callbacks.onToggleGroup || tl.spaceTaken)) event.preventDefault();
    if (event.key === ' ') tl.spaceTaken = false;
  });
}
