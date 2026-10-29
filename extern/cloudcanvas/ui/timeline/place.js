/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Where the reader is on the sheet, for a host that keeps it, and across a
 * time with no box.
 *
 * `visibleStart()` says the moment at the left edge of the track and how far
 * the rows are scrolled down; `scrollToDate(date, { top })` puts the sheet
 * there - by date, so it is the same place on an axis that starts elsewhere -
 * and makes the axis reach that date. The ask is done at once on a sheet that
 * is drawn, else at its first draw, and once: the reader's scrolling after it
 * is never fought, and a `focusId` drawn with it is brought into view after it.
 *
 * A SHEET WITH NO BOX IS NOT DRAWN. A browser gives a hidden sheet no width
 * and no scroll offset, and shows it again at its start. So a draw asked for
 * while the sheet has no box waits (`tl.away`), the place the sheet showed is
 * noted at each draw and as the reader scrolls (`tl.held`), and when the box
 * returns the draw is done and that place put back. A document with no layout
 * (no `getClientRects`) is taken to have a box.
 */
import { toDate } from '../calendar/dates.js';
import { dateAt, xOf } from './model.js';
import { reachTo, refit } from './reach.js';

/** Whether the sheet has a box to be drawn in: it is not hidden, nor out of the document. */
export const hasBox = (tl) => typeof tl.sheet.getClientRects !== 'function' || tl.sheet.getClientRects().length > 0;

/** The place the sheet shows now: the moment at the track's left edge and the rows' offset; null before the first draw. */
function placeNow(tl) {
  if (!tl.domain) return null;
  return { date: dateAt(tl.sheet.scrollLeft, tl.domain, tl.domainScale), top: tl.sheet.scrollTop };
}

/** Note the place the sheet shows, while it has a box to show it in. */
export function notePlace(tl) {
  if (tl.domain && hasBox(tl)) tl.held = placeNow(tl);
}

/** An ask not yet done, else the place shown, else - with no box - the place the sheet will show again; null before any. */
export function visibleStart(tl) {
  const place = tl.asked ?? (hasBox(tl) ? placeNow(tl) : tl.held);
  return place && { date: new Date(place.date.getTime()), top: place.top ?? tl.sheet.scrollTop };
}

/** Ask for `date` at the track's left edge and, if given, the rows at `top`. False for what is not a date. */
export function scrollToDate(tl, date, top) {
  const at = toDate(date);
  if (!at) return false;
  tl.asked = { date: at, top: Number.isFinite(top) ? top : null };
  if (tl.domain && !tl.busy()) tl.render();
  return true;
}

/**
 * The place a draw puts back, taken once: an ask, which the axis is made to reach; else, when the sheet had no box, the place
 * it showed before; else null - the sheet keeps the date at its own left edge (`./reach.js`).
 */
export function placeToKeep(tl) {
  const { asked } = tl;
  const held = tl.away ? tl.held : null;
  Object.assign(tl, { asked: null, away: false });
  if (!asked) return held;
  reachTo(tl, asked.date);
  return asked;
}

/** Put the sheet at `place` on the axis just drawn. */
export function putPlace(tl, place) {
  tl.sheet.scrollLeft = Math.max(0, xOf(place.date, tl.domain, tl.state.scale));
  if (place.top !== null) tl.sheet.scrollTop = place.top;
}

/** Draw what waited for the sheet's box, if it has one now. */
function drawIfBack(tl) {
  if (!tl.life.dead && tl.away && hasBox(tl) && !tl.busy()) tl.render();
}

/**
 * A draw asked for while the sheet has no box waits for it: the watch on the box draws it when the box returns, and a look at the
 * next frame draws it if the host showed the sheet again before the browser laid it out without one (which the watch never sees).
 */
export function waitForBox(tl) {
  tl.away = true;
  const frame = tl.doc.defaultView?.requestAnimationFrame;
  if (tl.looking || typeof frame !== 'function') return;
  tl.looking = true;
  frame(() => { tl.looking = false; drawIfBack(tl); });
}

/** A change of the sheet's box: a draw that waited for it is done; the axis covers the new width; the days on screen are said. */
function resized(tl) {
  drawIfBack(tl);
  refit(tl);
  tl.windowMoved();
}

/** Note the place as the reader scrolls, and watch the sheet's box: the one watch of its size (`resized`). */
export function bindPlace(tl) {
  tl.life.on(tl.sheet, 'scroll', () => notePlace(tl));
  const Observer = tl.doc.defaultView?.ResizeObserver;
  if (typeof Observer !== 'function') return;
  const observer = new Observer(() => resized(tl));
  observer.observe(tl.sheet);
  tl.life.add(() => observer.disconnect());
}
