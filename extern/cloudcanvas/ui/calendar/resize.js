/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Resizing an event from its bottom edge in the week and day grids. A drag of
 * the handle on the edge puts the end on the snapped line under the pointer
 * (never before a snap after the start, never past the day's last line), and
 * Alt+Shift+Down or Up lengthens or shortens it by a snap. The result is a
 * move whose end changed, so it is reported through `onMove(id, {start, end,
 * allDay})` like any other; nothing is applied. An event that is held,
 * all-day, over midnight or in the month has no edge to drag, and a host that
 * takes no `onMove` gets neither handle nor keys.
 */
import { trackDrag } from '../drag.js';
import { atMinutes, dayKey, minutesOfDay, startOfDay } from './dates.js';
import { describeEvent, endOf, eventById, isAllDayLike } from './model.js';
import { CAL } from './month.js';
import { minutesAt } from './time.js';

export const EDGE = `.${CAL}-event-handle`;
const CHIP = `.${CAL}-event`;

/** Whether `event` has an end to move in the grid on show: timed, within a day, movable, and the host takes moves. */
export function resizable(cal, event) {
  return Boolean(event) && event.movable && cal.state.view !== 'month' && !isAllDayLike(event) && typeof cal.callbacks.onMove === 'function';
}

/** `event`'s end moved to `minutes` past its midnight: at least a snap after its start, at most the grid's last line; the model's own end when that is where it was. */
function endAt(cal, event, minutes) {
  const least = minutesOfDay(event.start) + cal.state.snap;
  const end = atMinutes(event.start, Math.min(cal.state.hours.end * 60, Math.max(minutes, least)));
  return end.getTime() === endOf(event).getTime() ? event.end : end;
}

function startResize(cal, handle) {
  const event = eventById(cal, handle.closest(CHIP).getAttribute('data-ui-id'));
  if (!resizable(cal, event)) return false;
  const times = { start: event.start, end: event.end, allDay: event.allDay };
  cal.state.pending = { id: event.id, keyboard: false, mode: 'resize', original: times, times, offset: 0 };
  return true;
}

function moveEdge(cal, point) {
  const { pending } = cal.state;
  const event = eventById(cal, pending.id);
  const column = cal.body.querySelector(`.${CAL}-column[data-date="${dayKey(event.start)}"]`);
  const minutes = column ? minutesAt(cal, column, point.y, { edge: true }) : null;
  if (minutes === null) return;
  const end = endAt(cal, event, minutes);
  if ((end?.getTime() ?? null) === (pending.times.end?.getTime() ?? null)) return;
  pending.times = { ...pending.times, end };
  cal.render();
}

function finishResize(cal, drop) {
  const { pending } = cal.state;
  cal.state.pending = null;
  const changed = (pending.times.end?.getTime() ?? null) !== (pending.original.end?.getTime() ?? null);
  if (drop && changed) {
    cal.callbacks.onMove(pending.id, { ...pending.times });
    cal.say(`${cal.labels.resized} ${describeEvent({ ...eventById(cal, pending.id), ...pending.times }, cal.format)}.`);
  }
  cal.render();
}

/** Alt+Shift+Down or Up on a focused event: its end a snap later or earlier, reported at once. Returns whether the key was this one's. */
export function resizeKey(cal, chip, event) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  const item = eventById(cal, chip.getAttribute('data-ui-id'));
  if (!event.altKey || !event.shiftKey || step === undefined || !resizable(cal, item)) return false;
  event.preventDefault();
  const current = Math.round((endOf(item) - startOfDay(item.start)) / 60000);
  const end = endAt(cal, item, current + step * cal.state.snap);
  if (!end || end.getTime() === endOf(item).getTime()) return true;
  const times = { start: item.start, end, allDay: item.allDay };
  cal.callbacks.onMove(item.id, times);
  cal.say(`${cal.labels.resized} ${describeEvent({ ...item, ...times }, cal.format)}.`);
  return true;
}

/** Wire the drag of an event's bottom edge. */
export function bindResize(cal) {
  trackDrag(cal.life, cal.body, {
    selector: EDGE,
    canStart: () => !cal.state.pending,
    onStart(handle) { startResize(cal, handle); },
    onMove(point) { if (cal.state.pending?.mode === 'resize') moveEdge(cal, point); },
    onEnd(point) { if (cal.state.pending?.mode === 'resize') finishResize(cal, point !== null); }
  });
}
