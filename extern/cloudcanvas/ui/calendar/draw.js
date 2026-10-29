/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Drawing a range by keyboard: what a drag across empty slots or days does
 * (`./range.js`), for a reader without a pointer. N on a day - its heading in
 * the week or the day, its number in the month - starts it on the day that
 * has the focus.
 *
 * IN THE HOURS a cursor of one slot stands in that day's column, at the first
 * slot the grid shows (8:00 while it shows none); Up and Down move it a slot,
 * Left and Right and the other keys of the days move the day as they always
 * do. Enter or Space anchors the range; Up and Down then move its other end,
 * either way, the day staying put, and Enter or Space reports
 * `onPick({date, start, end})`. IN THE MONTH the cursor is the day the focus
 * is on, lit; the arrows move it as they always do; anchored, the days between
 * are lit, and Enter or Space reports them as a drag across days does -
 * `allDay: true`, the end the day after the last.
 *
 * Escape, Tab, a press on the grid or the focus leaving it cancel. Each step
 * is said, the line under the toolbar says the keys of the step, and the hour
 * grid scrolls to keep the cursor in view. The drawing is `state.drawing`; a
 * redraw (a host's update, a day moved to) draws it again (`paintDraw`), and a
 * change between the month and the hours ends it.
 */
import { clamp, el } from '../dom.js';
import { asSentence, cancelOnLeave } from '../draw-keys.js';
import { addDays, atMinutes, dayKey, fromDayKey } from './dates.js';
import { CAL } from './month.js';
import { hintOf, paint } from './hint.js';

/** Where the cursor starts when the hour grid shows no hours to start from: 8:00, as the grid first opens. */
const START_HOUR = 8;

const kindOf = (cal) => (cal.state.view === 'month' ? 'days' : 'time');

/** The slots of the range in hand, in minutes past midnight: `[from, to)`, the anchor's slot and the cursor's both in. */
function slots(cal) {
  const { at, anchor } = cal.state.drawing;
  const from = Math.min(at, anchor ?? at);
  return { from, to: Math.min(cal.state.hours.end * 60, Math.max(at, anchor ?? at) + cal.state.snap) };
}

/** The days of the range in hand, as day keys: the anchor's and the focused day, in order. */
function days(cal) {
  const here = dayKey(cal.state.focusDate);
  return [cal.state.drawing.anchor ?? here, here].sort();
}

/** What the range in hand is, in words: times on a day, or days. */
function words(cal, { day = false } = {}) {
  const { format } = cal;
  if (cal.state.drawing.kind === 'days') {
    const [first, last] = days(cal).map(fromDayKey);
    return first.getTime() === last.getTime() ? format.full.format(first) : `${format.full.format(first)} to ${format.full.format(last)}`;
  }
  const { from, to } = slots(cal);
  const { at, anchor } = cal.state.drawing;
  const time = (minutes) => format.time.format(atMinutes(cal.state.focusDate, minutes));
  const when = anchor === null ? time(at) : `${time(from)} to ${time(to)}`;
  return day ? `${format.full.format(cal.state.focusDate)}, ${when}` : when;
}

/** The first slot the hour grid shows, or 8:00 while it shows none. */
function firstShownSlot(cal) {
  const { hours, snap } = cal.state;
  const scroller = cal.body.querySelector(`.${CAL}-scroller`);
  const height = scroller?.querySelector(`.${CAL}-time-grid`)?.getBoundingClientRect().height ?? 0;
  const minutes = height > 0 ? hours.start * 60 + (scroller.scrollTop / height) * (hours.end - hours.start) * 60 : START_HOUR * 60;
  return clamp(Math.ceil(minutes / snap) * snap, hours.start * 60, hours.end * 60 - snap);
}

/** Scroll the hour grid so the cursor's slot is in view. */
function keepInView(cal) {
  const scroller = cal.body.querySelector(`.${CAL}-scroller`);
  const height = scroller?.querySelector(`.${CAL}-time-grid`)?.getBoundingClientRect().height ?? 0;
  const shown = scroller?.clientHeight || 0;
  if (!(height > 0) || !(shown > 0)) return;
  const perMinute = height / ((cal.state.hours.end - cal.state.hours.start) * 60);
  const top = (cal.state.drawing.at - cal.state.hours.start * 60) * perMinute;
  const bottom = top + cal.state.snap * perMinute;
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  else if (bottom > scroller.scrollTop + shown) scroller.scrollTop = bottom - shown;
}

/** The band of slots down the focused day's column, saying its times. */
function placeBand(cal) {
  cal.drawBand?.remove();
  const key = dayKey(cal.state.focusDate);
  const column = Array.from(cal.body.querySelectorAll(`.${CAL}-column`)).find((node) => node.getAttribute('data-date') === key);
  if (!column) return;
  const { from, to } = slots(cal);
  const band = el(cal.doc, 'div', { className: `${CAL}-draft is-keyboard`, attrs: { 'aria-hidden': 'true' } });
  band.style.setProperty('--calendar-top', String(from - cal.state.hours.start * 60));
  band.style.setProperty('--calendar-length', String(to - from));
  const time = (minutes) => cal.format.time.format(atMinutes(cal.state.focusDate, minutes));
  band.textContent = `${time(from)} – ${time(to)}`;
  column.append(band);
  cal.drawBand = band;
}

/** Light the days of the range, and only them. */
function lightDays(cal, range) {
  const [first, last] = range ?? ['', ''];
  for (const cell of cal.body.querySelectorAll(`.${CAL}-cell`)) {
    const day = cell.getAttribute('data-date');
    cell.classList.toggle('is-range', range !== null && day >= first && day <= last);
  }
}

/** Draw the drawing where it stands: after a redraw, a step or an anchor. A change between the month and the hours ends it. */
export function paintDraw(cal) {
  const drawing = cal.state.drawing;
  if (!drawing) return;
  if (drawing.kind !== kindOf(cal)) { cancelDraw(cal); return; }
  if (drawing.kind === 'days') lightDays(cal, days(cal));
  else placeBand(cal);
}

function end(cal) {
  cal.drawBand?.remove();
  cal.drawBand = null;
  lightDays(cal, null);
  cal.state.drawing = null;
  paint(cal);
}

/** Drop the drawing and say so. */
export function cancelDraw(cal) {
  if (!cal.state.drawing) return;
  end(cal);
  cal.say(cal.labels.drawCancelled);
}

/** N on a day: the cursor on it. False when the host takes no pick. */
export function startDraw(cal, day) {
  if (typeof cal.callbacks.onPick !== 'function' || cal.state.pending || cal.state.creating) return false;
  cal.state.focusDate = fromDayKey(day.getAttribute('data-date')) ?? cal.state.focusDate;
  const kind = kindOf(cal);
  cal.state.drawing = { kind, at: kind === 'time' ? firstShownSlot(cal) : null, anchor: null };
  paintDraw(cal);
  if (kind === 'time') keepInView(cal);
  paint(cal);
  const when = kind === 'time' ? words(cal, { day: true }) : words(cal);
  cal.say(`${cal.labels.drawStart.replace('{when}', when)} ${asSentence(hintOf(cal))}`);
  return true;
}

/** Say where the drawing stands after the day moved under it. */
export function sayDraw(cal) {
  if (cal.state.drawing) cal.say(words(cal, { day: cal.state.drawing.kind === 'time' }));
}

/** Enter or Space: anchor the range on the cursor, or - anchored - report it. */
function anchorOrAdd(cal) {
  const drawing = cal.state.drawing;
  if (drawing.anchor === null) {
    drawing.anchor = drawing.kind === 'time' ? drawing.at : dayKey(cal.state.focusDate);
    paint(cal);
    const start = drawing.kind === 'time' ? cal.format.time.format(atMinutes(cal.state.focusDate, drawing.at)) : words(cal);
    cal.say(`${cal.labels.drawAnchor.replace('{when}', start)} ${asSentence(hintOf(cal))}`);
    return;
  }
  const said = cal.labels.drawn.replace('{range}', words(cal, { day: true }));
  const range = drawing.kind === 'days' ? daysRange(days(cal)) : timeRange(cal);
  end(cal);
  cal.callbacks.onPick(range);
  cal.say(said);
}

const daysRange = ([first, last]) => ({ date: first, start: fromDayKey(first), end: addDays(fromDayKey(last), 1), allDay: true });

function timeRange(cal) {
  const { from, to } = slots(cal);
  return { date: dayKey(cal.state.focusDate), start: atMinutes(cal.state.focusDate, from), end: atMinutes(cal.state.focusDate, to) };
}

/** Up or Down in the hours: the cursor a slot earlier or later, within the grid's hours. */
function stepSlot(cal, step) {
  const { hours, snap } = cal.state;
  cal.state.drawing.at = clamp(cal.state.drawing.at + step * snap, hours.start * 60, hours.end * 60 - snap);
  placeBand(cal);
  keepInView(cal);
  cal.say(words(cal));
}

const DAY_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/**
 * A key while a range is drawn. True when it was the drawing's; false for a key that moves the day, which the day's own
 * keys then take (the drawing follows it). Every other key is the drawing's, so a day's own keys do nothing meanwhile.
 */
export function drawKey(cal, event) {
  const drawing = cal.state.drawing;
  const slot = drawing.kind === 'time' ? { ArrowUp: -1, ArrowDown: 1 }[event.key] : undefined;
  if ((event.key === ' ' || event.key === 'Enter') && event.repeat) { event.preventDefault(); return true; }
  if (slot !== undefined) stepSlot(cal, slot);
  else if (DAY_KEYS.has(event.key)) {
    if (drawing.kind === 'days' || drawing.anchor === null) return false;
  } else if (event.key === ' ' || event.key === 'Enter') { cal.spaceTaken = event.key === ' '; anchorOrAdd(cal); }
  else if (event.key === 'Escape' || event.key === 'Tab') cancelDraw(cal);
  else return true;
  if (event.key !== 'Tab') event.preventDefault();
  return true;
}

/** A press on the grid, or the focus leaving the calendar's body, cancels a drawing. */
export function bindDraw(cal) {
  cancelOnLeave(cal.life, cal.body, { active: () => cal.state.drawing !== null, cancel: () => cancelDraw(cal) });
}
