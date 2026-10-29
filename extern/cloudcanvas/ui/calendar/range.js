/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Making a range by dragging across empty slots. Down a column of the week
 * or day, a band of slots follows the pointer from the slot pressed to the
 * one under it, either way round and a slot at least; the release reports
 * `onPick({date, start, end})`. Across the days of the month - or of the
 * all-day strip - the days from the one pressed to the one under the pointer
 * are lit, and the release reports them as an all-day range:
 * `onPick({date, start, end, allDay: true})`, the end the day after the last.
 * Escape drops it. A click is still the single pick, `onPick({date, start})`.
 * While a range is drawn a host's update waits: the grid is drawn again when
 * the drag ends. Nothing is made by the kit.
 */
import { el } from '../dom.js';
import { trackDrag } from '../drag.js';
import { addDays, atMinutes, dayKey, fromDayKey } from './dates.js';
import { CAL } from './month.js';
import { minutesAt } from './time.js';

const COLUMN = `.${CAL}-column`;
const CELL = `.${CAL}-cell, .${CAL}-allday-cell`;

/** Whether a press at `target` is on the empty ground of `item`: the column or the cell itself, or a month cell's room for events. */
function empty(item, target) {
  return target === item || (item.matches(CELL) && target.classList.contains(`${CAL}-events`));
}

function startSpan(cal, column, point) {
  const from = minutesAt(cal, column, point.y, { slot: true });
  if (from === null) return null;
  const band = el(cal.doc, 'div', { className: `${CAL}-draft`, attrs: { 'aria-hidden': 'true' } });
  column.append(band);
  return { kind: 'time', column, band, from, date: column.getAttribute('data-date'), range: null };
}

function drawSpan(cal, creating, point) {
  const here = minutesAt(cal, creating.column, point.y, { slot: true });
  if (here === null) return;
  const start = Math.min(creating.from, here);
  const end = Math.min(cal.state.hours.end * 60, Math.max(creating.from, here) + cal.state.snap);
  const { band } = creating;
  band.style.setProperty('--calendar-top', String(start - cal.state.hours.start * 60));
  band.style.setProperty('--calendar-length', String(end - start));
  const day = fromDayKey(creating.date);
  band.textContent = `${cal.format.time.format(atMinutes(day, start))} – ${cal.format.time.format(atMinutes(day, end))}`;
  creating.range = { date: creating.date, start: atMinutes(day, start), end: atMinutes(day, end) };
}

function startDays(cal, cell) {
  const key = cell.getAttribute('data-date');
  return { kind: 'days', from: key, range: null, lit: [] };
}

/** Light the days from `a` to `b` (day keys, either order) and say them as the range. */
function drawDays(cal, creating, point) {
  const key = cal.doc.elementFromPoint?.(point.x, point.y)?.closest?.('[data-date]')?.getAttribute('data-date') ?? creating.from;
  const [first, last] = [creating.from, key].sort();
  for (const node of cal.body.querySelectorAll(`${CELL}`)) {
    const day = node.getAttribute('data-date');
    node.classList.toggle('is-range', day >= first && day <= last);
  }
  creating.range = { date: first, start: fromDayKey(first), end: addDays(fromDayKey(last), 1), allDay: true };
}

function endRange(cal, point) {
  const creating = cal.state.creating;
  cal.state.creating = null;
  creating.band?.remove();
  for (const node of cal.body.querySelectorAll('.is-range')) node.classList.remove('is-range');
  if (point !== null && creating.range) cal.callbacks.onPick({ ...creating.range });
  cal.render();
}

/** Wire the drag across empty slots and days. */
export function bindRange(cal) {
  trackDrag(cal.life, cal.body, {
    selector: `${COLUMN}, ${CELL}`,
    canStart: (item, event) => typeof cal.callbacks.onPick === 'function' && !cal.state.pending && empty(item, event.target),
    onStart(item, point) { cal.state.creating = item.matches(COLUMN) ? startSpan(cal, item, point) : startDays(cal, item); },
    onMove(point) {
      const creating = cal.state.creating;
      if (!creating) return;
      if (creating.kind === 'time') drawSpan(cal, creating, point);
      else drawDays(cal, creating, point);
    },
    onEnd(point) { if (cal.state.creating) endRange(cal, point); }
  });
}
