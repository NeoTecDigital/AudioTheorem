/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the timeline does with a click or a key. A press on a bar, on the label
 * beside it or on a heading that stands for an item opens that item: each says
 * which item it belongs to (`itemIdOf`). A folded group's summary bar is the
 * exception that says so: it stands for the group's item, so its id is the
 * item's, and its press and menu go to the host with `{ summary: true }` after
 * what they always carried (`onActivate(id, { summary: true })`,
 * `onMenu(id, point, { summary: true })`); anything else's call is as it was.
 * The moves are `./move.js`, the keys
 * `./keys.js`, a span drawn by keyboard `./draw.js`, the scroll at the sheet's
 * edges `./edge.js`, the gutter `./gutter.js`.
 */
import { itemIdOf, itemNodeOf } from '../dom.js';
import { setTabStop } from '../roving.js';
import { bindCreate } from './create.js';
import { bindDraw } from './draw.js';
import { bindEdge } from './edge.js';
import { bindGutter } from './gutter.js';
import { TL } from './model.js';
import { bindKeys } from './keys.js';
import { bindLinks } from './links.js';
import { pressMore } from './more.js';
import { BAR, bars, bindMove } from './move.js';
import { bindPlace } from './place.js';
import { bindReach } from './reach.js';
import { select } from './select.js';
import { bindWindow } from './window.js';
import { bindZoom } from './zoom.js';

/**
 * One tab stop among the bars - where the keys placed it, else on the selected bar, else on the first - and the focus the
 * draw owes (`tl.focusAfter`): `true` is the timeline's own (a pick-up, a step, a drop), a plain focus() the view
 * follows; `'keep'` returns a focus the draw found on a bar, and scrolls nothing.
 */
function writeTabStops(tl) {
  const nodes = bars(tl);
  const barOf = (id) => nodes.find((node) => node.getAttribute('data-ui-id') === id);
  const current = barOf(tl.state.focusId) ?? barOf(tl.state.selectedId) ?? nodes[0] ?? null;
  tl.state.focusId = current?.getAttribute('data-ui-id') ?? null;
  setTabStop(nodes, current);
  if (tl.focusAfter && current) current.focus(tl.focusAfter === 'keep' ? { preventScroll: true } : undefined);
  tl.focusAfter = false;
}

/** The descriptor a press or a menu on a folded group's summary bar carries after its other arguments. */
const SUMMARY = Object.freeze({ summary: true });
const isSummary = (part) => part.classList.contains(`${TL}-summary`);

function onClick(tl, event) {
  if (pressMore(tl, event.target)) return;
  const toggle = event.target.closest?.(`.${TL}-group-toggle`);
  if (toggle) { tl.fold(toggle.getAttribute('data-group-id'), toggle.getAttribute('aria-expanded') === 'true'); return; }
  const part = itemNodeOf(event.target, tl.sheet);
  if (!part || tl.state.pending) return;
  const id = itemIdOf(part);
  select(tl, id);
  if (isSummary(part)) tl.callbacks.onActivate?.(id, SUMMARY);
  else tl.callbacks.onActivate?.(id);
}

function onFocusIn(tl, event) {
  const face = event.target.closest?.(`${BAR}, .${TL}-group-label`);
  if (!face || tl.state.pending || tl.drawing) return;
  const id = face.getAttribute('data-ui-id');
  if (face.matches(BAR)) tl.state.focusId = id;
  select(tl, id);
}

/** A right-click on an item - its bar, its title, its heading, a folded group's summary bar - asks for its menu, at the pointer. */
function onContextMenu(tl, event) {
  const part = itemNodeOf(event.target, tl.sheet);
  if (!part || typeof tl.callbacks.onMenu !== 'function') return;
  event.preventDefault();
  const point = { x: event.clientX, y: event.clientY };
  if (isSummary(part)) tl.callbacks.onMenu(itemIdOf(part), point, SUMMARY);
  else tl.callbacks.onMenu(itemIdOf(part), point);
}

/** Wire clicks, keys and drags on the timeline sheet. */
export function bindTimeline(tl) {
  tl.writeTabStops = () => writeTabStops(tl);
  tl.fold = (groupId, collapsed) => tl.callbacks.onToggleGroup?.(groupId, collapsed);
  tl.life.on(tl.sheet, 'click', (event) => onClick(tl, event));
  tl.life.on(tl.sheet, 'contextmenu', (event) => onContextMenu(tl, event));
  tl.life.on(tl.sheet, 'focusin', (event) => onFocusIn(tl, event));
  bindDraw(tl);
  bindEdge(tl);
  bindKeys(tl);
  bindMove(tl);
  bindCreate(tl);
  bindLinks(tl);
  bindGutter(tl);
  bindZoom(tl);
  bindReach(tl);
  bindPlace(tl);
  bindWindow(tl);
}
