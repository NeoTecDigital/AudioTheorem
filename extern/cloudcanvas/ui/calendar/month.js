/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The month grid: six weeks of day cells, each with its day button and up to
 * three event chips, then a "+N more" that opens the day. An ARIA grid of
 * rows and gridcells, drawn fresh on every render from the calendar record.
 */
import { el, markSelected } from '../dom.js';
import { dayKey, sameDay } from './dates.js';
import { describeEvent, eventsByDay, isAllDayLike } from './model.js';

export const CAL = 'cloudcanvas-ui-calendar';

/** Chips a month cell shows before "+N more". */
const MONTH_CHIPS = 3;

/** One event chip; the grids share it. */
export function eventChip(cal, event, { showTime }) {
  const { doc, format } = cal;
  const name = describeEvent(event, format);
  const chip = el(doc, 'button', { className: `${CAL}-event`, attrs: {
    type: 'button', 'data-ui-id': event.id, 'aria-label': name, title: name, tabindex: '-1',
    'data-tone': event.tone || null, 'data-movable': event.movable ? 'true' : null
  } });
  if (showTime && !isAllDayLike(event)) chip.append(el(doc, 'span', { className: `${CAL}-event-time`, text: format.time.format(event.start) }));
  chip.append(el(doc, 'span', { className: `${CAL}-event-title`, text: event.title }));
  if (cal.state.pending?.id === event.id) chip.classList.add('is-grabbed');
  markSelected(chip, event.id === cal.state.selectedId);
  return chip;
}

function weekdayRow(cal, days) {
  const row = el(cal.doc, 'div', { className: `${CAL}-weekdays`, attrs: { role: 'row' } });
  for (const day of days.slice(0, 7)) {
    row.append(el(cal.doc, 'div', { className: `${CAL}-weekday`, text: cal.format.weekday.format(day),
      attrs: { role: 'columnheader', 'aria-label': cal.format.weekdayLong.format(day) } }));
  }
  return row;
}

function dayCell(cal, day, events) {
  const { doc, state, format } = cal;
  const key = dayKey(day);
  const cell = el(doc, 'div', { className: `${CAL}-cell`, attrs: { role: 'gridcell', 'data-date': key } });
  cell.classList.toggle('is-outside', day.getMonth() !== state.anchor.getMonth());
  cell.classList.toggle('is-today', sameDay(day, state.now));
  const count = events.length ? `, ${events.length} event${events.length === 1 ? '' : 's'}` : '';
  cell.append(el(doc, 'button', { className: `${CAL}-day`, text: format.dayNumber.format(day), attrs: {
    type: 'button', 'data-date': key, tabindex: '-1', 'aria-label': `${format.full.format(day)}${count}`,
    'aria-current': sameDay(day, state.now) ? 'date' : null
  } }));
  const list = el(doc, 'div', { className: `${CAL}-events` });
  for (const event of events.slice(0, MONTH_CHIPS)) list.append(eventChip(cal, event, { showTime: true }));
  if (events.length > MONTH_CHIPS) {
    list.append(el(doc, 'button', { className: `${CAL}-more`, text: `+${events.length - MONTH_CHIPS}`, attrs: {
      type: 'button', 'data-open-day': key, tabindex: '-1', 'aria-label': `Show all ${events.length} events on ${format.full.format(day)}`
    } }));
  }
  cell.append(list);
  return cell;
}

/**
 * Draw the month into `cal.body`.
 * @param {object} cal the calendar record
 * @param {Date[]} days the 42 visible days
 * @param {object[]} events normalised events, pending move applied
 */
export function renderMonth(cal, days, events) {
  const grid = el(cal.doc, 'div', { className: `${CAL}-month`, attrs: { role: 'grid', 'aria-label': cal.title } });
  grid.append(weekdayRow(cal, days));
  const byDay = eventsByDay(events, days);
  for (let week = 0; week < 6; week += 1) {
    const row = el(cal.doc, 'div', { className: `${CAL}-week`, attrs: { role: 'row' } });
    for (const day of days.slice(week * 7, week * 7 + 7)) row.append(dayCell(cal, day, byDay.get(dayKey(day))));
    grid.append(row);
  }
  cal.body.replaceChildren(grid);
}
