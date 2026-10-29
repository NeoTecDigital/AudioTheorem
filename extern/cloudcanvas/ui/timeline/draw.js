/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Drawing a span by keyboard: what a drag across a row does (`./create.js`),
 * for a reader without a pointer. N on a bar, or on a heading that stands for
 * an item, puts a date cursor on its row - a band of one day, saying it - on
 * the first day after the bar, where a span that follows it would go, or
 * today on a heading. Left and Right move it a day,
 * Up and Down to the row above or below: every row's track, the headings'
 * empty ones among them, a name alone's too. Enter or Space anchors the span
 * on the cursor; the arrows then move its other end, either way, the band
 * saying its days. Enter or Space reports `onCreate({groupId, start, end})` -
 * end exclusive, the row's group - and Escape, Tab, a press on the sheet or
 * the focus leaving it cancel. The focus stays where it was; each step is
 * said, the line under the toolbar says the keys of the step, and the sheet
 * scrolls to keep the cursor in view.
 *
 * The drawing is `state.cursor` (`{key, at, anchor, band}`): its row by a key
 * that finds the row again after a redraw, its days as dates. A redraw - a
 * host's update, a zoom - draws the band again where they are; a row that has
 * gone ends it.
 */
import { addDays, startOfDay } from '../calendar/dates.js';
import { clamp } from '../dom.js';
import { asSentence, cancelOnLeave } from '../draw-keys.js';
import { bandNode, spanOf, writeBand } from './create.js';
import { TL, TIMELINE_SCALES, daysIn } from './model.js';
import { revealDays, revealRow } from './reveal.js';
import { daysWords } from './rows.js';

const TRACK = `.${TL}-track`;
const DAY_MS = 86400000;

/** The name of the group a track's row belongs to: its item's group, or the heading's own words. */
function groupNameOf(tl, track) {
  const row = track.parentElement;
  const id = row?.getAttribute('data-row-id');
  if (id) return tl.byId.get(id)?.group || tl.labels.noGroup;
  const cell = row?.querySelector(`.${TL}-group-cell`);
  return (cell?.querySelector(`.${TL}-group-label`) ?? cell)?.textContent || tl.labels.noGroup;
}

/** Every track the sheet draws, in order, with the key that finds it again: its item, or its heading and which of that name. */
function tracksOf(tl) {
  const seen = new Map();
  return Array.from(tl.sheet.querySelectorAll(TRACK), (track) => {
    const id = track.parentElement?.getAttribute('data-row-id');
    if (id) return { track, key: `item ${id}` };
    const heading = `heading ${track.getAttribute('data-group-id') ?? ''} ${groupNameOf(tl, track)}`;
    seen.set(heading, (seen.get(heading) ?? 0) + 1);
    return { track, key: `${heading} ${seen.get(heading)}` };
  });
}

/** The first day after `item`'s last: the midnight its end is, or the next one; a milestone's next day. */
function dayAfter(item) {
  const end = item.end ?? addDays(startOfDay(item.start), 1);
  return startOfDay(end).getTime() === end.getTime() ? end : addDays(startOfDay(end), 1);
}

/** The day `date` is on, counted from the axis' start, within the axis. */
function dayOf(tl, date) {
  return clamp(Math.round((startOfDay(date).getTime() - tl.domain.start.getTime()) / DAY_MS), 0, daysIn(tl.domain) - 1);
}

/** The words for a span: "Sep 29 to Oct 2, 4 days". */
function spanWords(tl, span) {
  const count = span.days === 1 ? tl.labels.oneDay : tl.labels.days.replace('{count}', String(span.days));
  return `${daysWords(span, (date) => tl.format.format(date))}, ${count}`;
}

/** Draw the band where the cursor is, on its row's track; its span, or null when its row has gone (the drawing then ends). */
export function placeCursor(tl) {
  const cursor = tl.state.cursor;
  const found = cursor && tracksOf(tl).find((one) => one.key === cursor.key);
  if (!found) {
    if (cursor) cancelDraw(tl);
    return null;
  }
  const at = dayOf(tl, cursor.at);
  cursor.at = addDays(tl.domain.start, at);
  const span = spanOf(tl, cursor.anchor ? dayOf(tl, cursor.anchor) : at, at);
  if (cursor.band?.parentElement !== found.track) {
    cursor.band?.remove();
    cursor.band = bandNode(tl, `${TL}-draft is-keyboard`);
    found.track.append(cursor.band);
  }
  writeBand(tl, cursor.band, span);
  return { span, track: found.track };
}

/** Keep the cursor's day and row on screen. */
function keepInView(tl, track) {
  const perDay = TIMELINE_SCALES[tl.state.scale].perDay;
  const x = dayOf(tl, tl.state.cursor.at) * perDay;
  revealDays(tl, x, x + perDay);
  revealRow(tl, track.parentElement);
}

function end(tl) {
  tl.state.cursor.band?.remove();
  tl.state.cursor = null;
  tl.paint();
}

/** Drop the drawing and say so. */
export function cancelDraw(tl) {
  if (!tl.state.cursor) return;
  end(tl);
  tl.say(tl.labels.drawCancelled);
}

/** N on `face` (a bar, or a heading's button): the cursor on its row. False when the host takes no span or the row has no track. */
export function startDraw(tl, face) {
  if (typeof tl.callbacks.onCreate !== 'function' || tl.busy()) return false;
  const track = face.closest(TRACK) ?? face.closest(`.${TL}-group`)?.querySelector(TRACK);
  const found = track && tracksOf(tl).find((one) => one.track === track);
  if (!found) return false;
  const item = face.closest(TRACK) ? tl.byId.get(face.getAttribute('data-ui-id')) : null;
  const at = item ? dayAfter(item) : startOfDay(tl.state.now);
  tl.state.cursor = { key: found.key, at, anchor: null, band: null };
  placeCursor(tl);
  keepInView(tl, track);
  tl.paint();
  const where = tl.labels.drawStart.replace('{group}', groupNameOf(tl, track)).replace('{date}', tl.format.format(tl.state.cursor.at));
  tl.say(`${where} ${asSentence(tl.labels.hintDrawing)}`);
  return true;
}

/** Draw the cursor again after a step, keep it in view and say where it is: its day, or the span's days; `row`, with the row's group. */
function stepped(tl, { row = false } = {}) {
  const placed = placeCursor(tl);
  if (!placed) return;
  const cursor = tl.state.cursor;
  keepInView(tl, placed.track);
  const what = cursor.anchor ? spanWords(tl, placed.span) : tl.format.format(cursor.at);
  tl.say(row ? `${groupNameOf(tl, placed.track)}: ${what}` : what);
}

function moveRow(tl, step) {
  const cursor = tl.state.cursor;
  const tracks = tracksOf(tl);
  const at = tracks.findIndex((one) => one.key === cursor.key);
  cursor.key = tracks[clamp(at + step, 0, tracks.length - 1)].key;
  stepped(tl, { row: true });
}

/** Enter or Space: anchor the span on the cursor, or - anchored - report it. */
function anchorOrAdd(tl) {
  const cursor = tl.state.cursor;
  if (!cursor.anchor) {
    cursor.anchor = cursor.at;
    placeCursor(tl);
    tl.paint();
    tl.say(`${tl.labels.drawAnchor.replace('{date}', tl.format.format(cursor.at))} ${asSentence(tl.labels.hintSpanning)}`);
    return;
  }
  const placed = placeCursor(tl);
  if (!placed) return;
  const { span, track } = placed;
  const group = groupNameOf(tl, track);
  end(tl);
  tl.callbacks.onCreate({ groupId: track.getAttribute('data-group-id'), start: span.start, end: span.end });
  tl.say(tl.labels.drawn.replace('{range}', daysWords(span, (date) => tl.format.format(date))).replace('{group}', group));
}

/** A key while a span is drawn: all of them are the drawing's, so a bar's own keys do nothing meanwhile. */
export function drawKey(tl, event) {
  const day = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  const row = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  if ((event.key === ' ' || event.key === 'Enter') && event.repeat) { event.preventDefault(); return; }
  if (day !== undefined) { tl.state.cursor.at = addDays(tl.state.cursor.at, day); stepped(tl); }
  else if (row !== undefined) moveRow(tl, row);
  else if (event.key === ' ' || event.key === 'Enter') { tl.spaceTaken = event.key === ' '; anchorOrAdd(tl); }
  else if (event.key === 'Escape' || event.key === 'Tab') cancelDraw(tl);
  else return;
  if (event.key !== 'Tab') event.preventDefault();
}

/** The hint line while a span is drawn, or null when none is. */
export function drawHint(tl) {
  const cursor = tl.state.cursor;
  if (!cursor) return null;
  return cursor.anchor ? tl.labels.hintSpanning : tl.labels.hintDrawing;
}

/** A press on the sheet, or the focus leaving it, cancels a drawing. */
export function bindDraw(tl) {
  cancelOnLeave(tl.life, tl.sheet, { active: () => tl.state.cursor !== null, cancel: () => cancelDraw(tl) });
}
