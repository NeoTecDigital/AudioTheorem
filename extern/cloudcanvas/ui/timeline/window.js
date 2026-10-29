/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The days on screen, for the reader and for a host that fetches what it draws: `onWindow({from, to})`
 * is given the first and the last day (day keys, both of them on screen) the
 * sheet shows right of its gutter. It is said once the sheet has been drawn
 * and again whenever a scroll, a zoom, a change of scale, a resize, a new
 * gutter or new items move those days - about 150ms after the moving has
 * settled, and only when the days are not the ones last said.
 *
 * The same days are the range the toolbar says, written at once - a scroll, a
 * zoom, a change of scale, a resize, a new gutter, a redraw - for every host.
 *
 * A sheet with no width (hidden, or a test DOM without layout) shows no day and
 * says nothing, and the range is empty; the first width it is given is the
 * first report. A host that took no `onWindow` has no report scheduled.
 */
import { dayKey } from '../calendar/dates.js';
import { writeText } from '../dom.js';
import { widthNow } from './gutter.js';
import { dateAt } from './model.js';

/** How long (ms) the days must stand still before they are said. */
export const WINDOW_SETTLE_MS = 150;

/** The first and the last day the sheet shows now, as dates, or null while it has no width or has not been drawn. */
function shownDays(tl) {
  const { sheet, domain, state } = tl;
  const room = (sheet.clientWidth || 0) - widthNow(tl);
  if (!domain || room <= 0) return null;
  const left = Math.max(0, sheet.scrollLeft);
  return { from: dateAt(left, domain, state.scale), to: dateAt(left + room - 1, domain, state.scale) };
}

/** The days the sheet shows now, as `{from, to}` day keys, or null while it has no width or has not been drawn. */
export function windowOf(tl) {
  const shown = shownDays(tl);
  return shown && { from: dayKey(shown.from), to: dayKey(shown.to) };
}

/** Write the days the sheet shows as the toolbar's range: "Sep 21 – Oct 17", or nothing while it shows none. */
function writeRange(tl) {
  const shown = shownDays(tl);
  writeText(tl.rangeText, shown ? `${tl.format.format(shown.from)} – ${tl.format.format(shown.to)}` : '');
}

/** Say the window to the host when it is not the one last said. */
function say(tl, said) {
  const next = windowOf(tl);
  if (next === null || (said.last && said.last.from === next.from && said.last.to === next.to)) return;
  said.last = next;
  tl.callbacks.onWindow(next);
}

/**
 * Wire the range and `onWindow`. Gives the timeline `tl.windowMoved()`, which a redraw, a zoom, a resize and a new gutter call
 * to say the days may have moved; a scroll is heard here.
 */
export function bindWindow(tl) {
  const said = { last: null, cancel: () => {} };
  const reports = typeof tl.callbacks.onWindow === 'function';
  tl.windowMoved = () => {
    writeRange(tl);
    if (!reports) return;
    said.cancel();
    said.cancel = tl.life.later(() => say(tl, said), said.last === null ? 0 : WINDOW_SETTLE_MS);
  };
  tl.life.on(tl.sheet, 'scroll', () => tl.windowMoved());
}
