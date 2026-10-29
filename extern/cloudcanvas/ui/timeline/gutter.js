/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The gutter - the column of titles at the timeline's left - is the reader's
 * to size: a separator on the axis' corner is dragged, or focused and moved
 * with the arrows (Shift for a bigger step, Home and End for the ends). The
 * width is written on the root (`--timeline-gutter`) at once and reported
 * when it settles (`onGutter(px)`), and the model's `gutter` restores it.
 * Nothing is redrawn, so a handle in hand stays in hand.
 */
import { clamp, el } from '../dom.js';
import { trackDrag } from '../drag.js';
import { TL } from './model.js';

export const GUTTER_MIN = 64;
export const GUTTER_MAX = 480;
const GUTTER_STEP = 16;
const GUTTER_STEP_BIG = 64;
/** What the stylesheet gives the gutter when nobody has sized it: 10rem. */
const GUTTER_DEFAULT = 160;
/** The room the tracks keep when the sheet is narrower than the gutter's largest width. */
const TRACK_MIN = 96;

const HANDLE = `.${TL}-gutter-handle`;

/** The widest the gutter may be: its own limit, and what leaves the tracks some room. */
function limitOf(tl) {
  const room = tl.sheet.clientWidth > 0 ? tl.sheet.clientWidth - TRACK_MIN : GUTTER_MAX;
  return Math.max(GUTTER_MIN, Math.min(GUTTER_MAX, room));
}

/** The gutter's width now: what was set, else what the corner measures, else the stylesheet's. */
export function widthNow(tl) {
  if (tl.state.gutter !== null) return tl.state.gutter;
  const measured = tl.gutterNode?.parentElement?.getBoundingClientRect().width ?? 0;
  return measured > 0 ? measured : GUTTER_DEFAULT;
}

function writeHandle(tl) {
  const node = tl.gutterNode;
  if (!node) return;
  node.setAttribute('aria-valuenow', String(Math.round(widthNow(tl))));
  node.setAttribute('aria-valuemax', String(Math.round(limitOf(tl))));
}

/** Show width `px` (kept within the limits) on the root and the separator; the width shown. */
export function applyGutter(tl, px) {
  const width = Math.round(clamp(px, GUTTER_MIN, limitOf(tl)));
  tl.state.gutter = width;
  tl.root.style.setProperty('--timeline-gutter', `${width}px`);
  writeHandle(tl);
  tl.windowMoved?.();
  return width;
}

/** The separator, drawn on the axis' corner each time the sheet is. */
export function gutterHandle(tl) {
  const handle = el(tl.doc, 'div', { className: `${TL}-gutter-handle`, attrs: { role: 'separator', 'aria-orientation': 'vertical',
    tabindex: '0', 'aria-label': tl.labels.gutter, 'aria-valuemin': GUTTER_MIN, title: tl.labels.gutter } });
  tl.gutterNode = handle;
  tl.root.setAttribute('data-can-gutter', '');
  writeHandle(tl);
  return handle;
}

function onKey(tl, event) {
  const handle = event.target.closest?.(HANDLE);
  if (!handle) return;
  const step = event.shiftKey ? GUTTER_STEP_BIG : GUTTER_STEP;
  const to = { ArrowLeft: widthNow(tl) - step, ArrowRight: widthNow(tl) + step, Home: GUTTER_MIN, End: limitOf(tl) }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  const before = widthNow(tl);
  const width = applyGutter(tl, to);
  if (width !== Math.round(before)) tl.callbacks.onGutter?.(width);
}

/** Wire the separator's drag and keys. */
export function bindGutter(tl) {
  let origin = null;
  trackDrag(tl.life, tl.sheet, {
    selector: HANDLE,
    onStart(handle, point) { origin = { x: point.x, width: widthNow(tl) }; handle.classList.add('is-grabbed'); },
    onMove(point) { if (origin) applyGutter(tl, origin.width + point.x - origin.x); },
    onEnd(point) {
      tl.gutterNode?.classList.remove('is-grabbed');
      if (point === null && origin) applyGutter(tl, origin.width);
      else if (origin) tl.callbacks.onGutter?.(widthNow(tl));
      origin = null;
    }
  });
  tl.life.on(tl.sheet, 'keydown', (event) => onKey(tl, event));
}
