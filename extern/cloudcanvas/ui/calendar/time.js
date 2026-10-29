/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The week and day grids: a head of day buttons, an all-day strip, and a
 * scrolling hour grid whose timed events are placed by minutes and laned
 * side by side when they overlap. Geometry is written as per-element custom
 * properties (`--calendar-top`, `--calendar-length`, `--calendar-lane`,
 * `--calendar-lanes`) through the CSSOM, so the stylesheet sizes an hour once
 * (`--cc-ui-hour-height`) and a strict CSP is never an issue.
 */
import { el } from '../dom.js';
import { dayKey, sameDay } from './dates.js';
import { eventsByDay, isAllDayLike, layoutLanes } from './model.js';
import { CAL, eventChip } from './month.js';

function head(cal, days) {
  const row = el(cal.doc, 'div', { className: `${CAL}-time-head` });
  row.append(el(cal.doc, 'div', { className: `${CAL}-gutter` }));
  for (const day of days) {
    const today = sameDay(day, cal.state.now);
    const button = el(cal.doc, 'button', { className: `${CAL}-day-head`, text: cal.format.dayHead.format(day), attrs: {
      type: 'button', 'data-date': dayKey(day), tabindex: '-1', 'aria-label': cal.format.full.format(day),
      'aria-current': today ? 'date' : null
    } });
    button.classList.toggle('is-today', today);
    row.append(button);
  }
  return row;
}

function allDayStrip(cal, days, byDay) {
  const row = el(cal.doc, 'div', { className: `${CAL}-allday` });
  row.append(el(cal.doc, 'div', { className: `${CAL}-gutter`, text: cal.labels.allDay }));
  for (const day of days) {
    const cell = el(cal.doc, 'div', { className: `${CAL}-allday-cell`, attrs: { 'data-date': dayKey(day) } });
    for (const event of byDay.get(dayKey(day)).filter(isAllDayLike)) cell.append(eventChip(cal, event, { showTime: false }));
    row.append(cell);
  }
  return row;
}

function hourLabels(cal) {
  const column = el(cal.doc, 'div', { className: `${CAL}-hours`, attrs: { 'aria-hidden': 'true' } });
  const base = new Date(2000, 0, 1);
  for (let hour = cal.state.hours.start; hour < cal.state.hours.end; hour += 1) {
    base.setHours(hour, 0, 0, 0);
    column.append(el(cal.doc, 'div', { className: `${CAL}-hour`, text: cal.format.hour.format(base) }));
  }
  return column;
}

function placeChip(cal, chip, slot, lanes) {
  const from = cal.state.hours.start * 60;
  const to = cal.state.hours.end * 60;
  const top = Math.max(0, Math.min(to - from - 15, slot.start - from));
  const length = Math.max(15, Math.min(to, slot.stop) - Math.max(from, slot.start));
  chip.style.setProperty('--calendar-top', String(top));
  chip.style.setProperty('--calendar-length', String(length));
  chip.style.setProperty('--calendar-lane', String(slot.lane));
  chip.style.setProperty('--calendar-lanes', String(lanes));
}

function dayColumn(cal, day, events) {
  const column = el(cal.doc, 'div', { className: `${CAL}-column`, attrs: { 'data-date': dayKey(day) } });
  column.classList.toggle('is-today', sameDay(day, cal.state.now));
  const timed = events.filter((event) => !isAllDayLike(event));
  const { placed, lanes } = layoutLanes(timed);
  for (const slot of placed) {
    const chip = eventChip(cal, slot.event, { showTime: true });
    chip.classList.add(`${CAL}-timed`);
    if (slot.event.movable && typeof cal.callbacks.onMove === 'function') chip.append(el(cal.doc, 'span', { className: `${CAL}-event-handle`, attrs: { 'aria-hidden': 'true' } }));
    placeChip(cal, chip, slot, lanes);
    column.append(chip);
  }
  return column;
}

/**
 * Scroll the hour grid to the morning (or the first event) the first time a
 * view opens; on a re-render of the same view (a drag preview, an update) keep
 * the reader exactly where they were.
 */
function initialScroll(cal, scroller, grid, events, previous) {
  const key = `${cal.state.view}:${dayKey(cal.state.anchor)}`;
  if (cal.scrolledFor === key) {
    if (previous !== null) scroller.scrollTop = previous;
    return;
  }
  cal.scrolledFor = key;
  const hours = cal.state.hours.end - cal.state.hours.start;
  const hourHeight = grid.getBoundingClientRect().height / hours;
  if (!(hourHeight > 0)) return;
  const first = events.find((event) => !isAllDayLike(event));
  const target = Math.max(cal.state.hours.start, first ? first.start.getHours() : 8);
  scroller.scrollTop = (target - cal.state.hours.start) * hourHeight;
}

/**
 * Draw the week or day grid into `cal.body`.
 * @param {object} cal the calendar record
 * @param {Date[]} days the visible days (7 or 1)
 * @param {object[]} events normalised events, pending move applied
 */
export function renderTimeGrid(cal, days, events) {
  const wrap = el(cal.doc, 'div', { className: `${CAL}-time`, attrs: { role: 'group', 'aria-label': cal.title } });
  wrap.style.setProperty('--calendar-days', String(days.length));
  const byDay = eventsByDay(events, days);
  // A tab stop of its own: on a day with no event nothing inside it takes focus, and the hours must still scroll by keyboard.
  const scroller = el(cal.doc, 'div', { className: `${CAL}-scroller`, attrs: { tabindex: '0', role: 'group', 'aria-label': cal.labels.hours } });
  const grid = el(cal.doc, 'div', { className: `${CAL}-time-grid` });
  grid.style.setProperty('--calendar-hours', String(cal.state.hours.end - cal.state.hours.start));
  grid.append(hourLabels(cal), ...days.map((day) => dayColumn(cal, day, byDay.get(dayKey(day)))));
  scroller.append(grid);
  wrap.append(head(cal, days), allDayStrip(cal, days, byDay), scroller);
  const previous = cal.body.querySelector(`.${CAL}-scroller`)?.scrollTop ?? null;
  cal.body.replaceChildren(wrap);
  initialScroll(cal, scroller, grid, events, previous);
}

/**
 * The time (minutes past midnight) a pointer at `clientY` points to in `column`, snapped: to the nearest line; or, with
 * `slot`, to the start of the slot it is in (a slot is one snap long); or, with `edge`, to the nearest line the day's
 * last may be (the end of an event may be midnight, its start may not).
 */
export function minutesAt(cal, column, clientY, { slot = false, edge = false } = {}) {
  const rect = column.getBoundingClientRect();
  const hours = cal.state.hours.end - cal.state.hours.start;
  if (!(rect.height > 0)) return null;
  const raw = cal.state.hours.start * 60 + ((clientY - rect.top) / rect.height) * hours * 60;
  const snap = cal.state.snap;
  const snapped = (slot ? Math.floor(raw / snap) : Math.round(raw / snap)) * snap;
  const last = cal.state.hours.end * 60 - (edge ? 0 : snap);
  return Math.max(cal.state.hours.start * 60, Math.min(last, snapped));
}
