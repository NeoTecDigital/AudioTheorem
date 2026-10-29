/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the calendar does with a click, a key or a drag. A move in progress is
 * one record, `state.pending` (`{id, original, times}`), which the renderer
 * draws in place of the event; dropping reports it through `onMove`, and
 * cancelling simply forgets it. N on a day draws a range by keyboard
 * (`./draw.js`); while it is drawn the keys are its own, but those that move
 * the day, which move it here.
 */
import { trackDrag } from '../drag.js';
import { addDays, addMinutes, atMinutes, daysBetween, fromDayKey, minutesOfDay, sameDay, shiftAnchor, startOfWeek, viewDays } from './dates.js';
import { describeEvent, eventById, isAllDayLike } from './model.js';
import { bindMore, pressMore } from './more.js';
import { CAL } from './month.js';
import { isDrawKey } from '../draw-keys.js';
import { bindDraw, drawKey, sayDraw, startDraw } from './draw.js';
import { select } from './hint.js';
import { bindRange } from './range.js';
import { bindResize, resizeKey } from './resize.js';
import { minutesAt } from './time.js';

const CHIP = `.${CAL}-event`;
const DAY = `.${CAL}-day, .${CAL}-day-head`;

function pick(cal, key, start) {
  const date = fromDayKey(key);
  if (!date) return;
  cal.state.focusDate = date;
  cal.callbacks.onPick?.(start ? { date: key, start } : { date: key });
}

function onClick(cal, event) {
  if (cal.state.pending) return;
  const target = event.target;
  if (pressMore(cal, target)) return;
  const chip = target.closest?.(CHIP);
  if (chip) { select(cal, chip.getAttribute('data-ui-id')); cal.callbacks.onActivate?.(chip.getAttribute('data-ui-id')); return; }
  const more = target.closest?.(`.${CAL}-more`);
  if (more && cal.state.views.includes('day')) { cal.navigate('day', fromDayKey(more.getAttribute('data-open-day')), { focus: true }); return; }
  const day = target.closest?.(DAY);
  if (day) { pick(cal, day.getAttribute('data-date')); return; }
  const column = target.closest?.(`.${CAL}-column`);
  if (column && target === column) {
    const minutes = minutesAt(cal, column, event.clientY);
    const key = column.getAttribute('data-date');
    pick(cal, key, minutes === null ? undefined : atMinutes(fromDayKey(key), minutes));
    return;
  }
  const cell = target.closest?.(`.${CAL}-cell, .${CAL}-allday-cell`);
  if (cell && (target === cell || target.classList.contains(`${CAL}-events`))) pick(cal, cell.getAttribute('data-date'));
}

/** The day a day-button key moves focus to, or null for any other key. */
function dayTarget(cal, key) {
  const { view, focusDate, weekStartsOn } = cal.state;
  const steps = view === 'month' ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } : { ArrowLeft: -1, ArrowRight: 1 };
  if (Object.hasOwn(steps, key)) return addDays(focusDate, steps[key]);
  if (key === 'Home') return startOfWeek(focusDate, weekStartsOn);
  if (key === 'End') return addDays(startOfWeek(focusDate, weekStartsOn), 6);
  if (key !== 'PageUp' && key !== 'PageDown') return null;
  const shifted = shiftAnchor(view, focusDate, key === 'PageUp' ? -1 : 1);
  if (view !== 'month') return shifted;
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  return new Date(shifted.getFullYear(), shifted.getMonth(), Math.min(focusDate.getDate(), lastDay));
}

/** Make `date` the focused day - the tab stop, and the day a redraw gives the focus back to - and focus it; a day not on show is navigated to. */
export function focusDay(cal, date) {
  const visible = viewDays(cal.state.view, cal.state.anchor, cal.state.weekStartsOn).some((day) => sameDay(day, date));
  if (!visible) { cal.navigate(cal.state.view, date, { focus: true }); return; }
  cal.state.focusDate = date;
  cal.focusAfter = { day: true };
  cal.render();
}

/** Keep a moving event on screen: page the view when its day leaves it. */
function follow(cal, date) {
  const visible = viewDays(cal.state.view, cal.state.anchor, cal.state.weekStartsOn).some((day) => sameDay(day, date));
  cal.focusAfter = { eventId: cal.state.pending.id };
  if (visible) { cal.render(); return; }
  cal.navigate(cal.state.view, date, { focus: false });
  cal.focusAfter = null;
}

function shiftTimes(times, { days = 0, minutes = 0 }) {
  const move = (date) => (date ? addMinutes(addDays(date, days), minutes) : null);
  return { ...times, start: move(times.start), end: move(times.end) };
}

function startGrab(cal, chip, keyboard) {
  const event = eventById(cal, chip.getAttribute('data-ui-id'));
  if (!event?.movable) return false;
  const times = { start: event.start, end: event.end, allDay: event.allDay };
  cal.state.pending = { id: event.id, keyboard, original: times, times, offset: 0 };
  if (keyboard) cal.say(`Picked up ${event.title}. Arrow keys move it, Space drops it, Escape cancels.`);
  return true;
}

function finishGrab(cal, drop) {
  const pending = cal.state.pending;
  cal.state.pending = null;
  cal.focusAfter = pending.keyboard ? { eventId: pending.id } : null;
  const moved = pending.times.start.getTime() !== pending.original.start.getTime();
  if (drop && moved) {
    cal.callbacks.onMove?.(pending.id, { ...pending.times });
    cal.say(`Moved to ${describeEvent({ ...eventById(cal, pending.id), ...pending.times }, cal.format)}.`);
  } else if (pending.keyboard) {
    cal.say(drop ? 'Not moved.' : 'Move cancelled.');
  }
  cal.render();
}

function grabKey(cal, event) {
  const pending = cal.state.pending;
  const timed = cal.state.view !== 'month' && !isAllDayLike({ ...eventById(cal, pending.id), ...pending.times });
  const vertical = cal.state.view === 'month' ? { days: 7 } : timed ? { minutes: cal.state.snap } : null;
  const moves = { ArrowLeft: { days: -1 }, ArrowRight: { days: 1 } };
  if (vertical) {
    moves.ArrowDown = vertical;
    moves.ArrowUp = { days: -(vertical.days ?? 0), minutes: -(vertical.minutes ?? 0) };
  }
  if (event.key === ' ' || event.key === 'Enter') finishGrab(cal, true);
  else if (event.key === 'Escape' || event.key === 'Tab') finishGrab(cal, false);
  else if (Object.hasOwn(moves, event.key)) {
    pending.times = shiftTimes(pending.times, moves[event.key]);
    follow(cal, pending.times.start);
    cal.say(describeEvent({ ...eventById(cal, pending.id), ...pending.times }, cal.format));
  } else return;
  if (event.key !== 'Tab') event.preventDefault();
}

function onKeyDown(cal, event) {
  if (event.repeat && (event.key === ' ' || event.key === 'Enter') && event.target.closest?.(CHIP)) { event.preventDefault(); return; }
  if (cal.state.pending?.keyboard) { grabKey(cal, event); return; }
  if (cal.state.drawing && drawKey(cal, event)) return;
  const chip = event.target.closest?.(CHIP);
  if (chip && (resizeKey(cal, chip, event) || menuKey(cal, chip, event))) return;
  if (chip && event.key === ' ') {
    event.preventDefault();
    if (startGrab(cal, chip, true)) { cal.focusAfter = { eventId: cal.state.pending.id }; cal.render(); }
    else cal.say('This event cannot be moved.');
    return;
  }
  const day = event.target.closest?.(DAY);
  if (!day) return;
  if (!cal.state.drawing && isDrawKey(event) && startDraw(cal, day)) { event.preventDefault(); return; }
  cal.state.focusDate = fromDayKey(day.getAttribute('data-date')) ?? cal.state.focusDate;
  const target = dayTarget(cal, event.key);
  if (!target) return;
  event.preventDefault();
  focusDay(cal, target);
  sayDraw(cal);
}

/** Where a pointer at `point` would put the event: a day, and a time when over the hour grid. */
function dropTimes(cal, point) {
  const hit = cal.doc.elementFromPoint?.(point.x, point.y);
  const pending = cal.state.pending;
  const dated = hit?.closest?.('[data-date]');
  if (!dated || !cal.body.contains(dated)) return null;
  const date = fromDayKey(dated.getAttribute('data-date'));
  const original = pending.original;
  let start = addDays(original.start, daysBetween(original.start, date));
  const column = hit.closest(`.${CAL}-column`);
  if (column && !isAllDayLike({ ...eventById(cal, pending.id), ...original })) {
    const minutes = minutesAt(cal, column, point.y);
    if (minutes !== null) start = atMinutes(date, Math.max(0, minutes - pending.offset));
  }
  const end = original.end ? new Date(start.getTime() + (original.end - original.start)) : null;
  return { ...original, start, end };
}

function bindDrag(cal) {
  trackDrag(cal.life, cal.body, {
    selector: `${CHIP}[data-movable]`,
    canStart: (chip, event) => !cal.state.pending && !event.target.closest?.(`.${CAL}-event-handle`),
    onStart(chip, point) {
      if (!startGrab(cal, chip, false)) return;
      const column = chip.closest(`.${CAL}-column`);
      const grabbed = column ? minutesAt(cal, column, point.y) : null;
      cal.state.pending.offset = grabbed === null ? 0 : grabbed - minutesOfDay(cal.state.pending.original.start);
      chip.classList.add('is-grabbed');
    },
    onMove(point) {
      const next = cal.state.pending && dropTimes(cal, point);
      if (!next || next.start.getTime() === cal.state.pending.times.start.getTime()) return;
      cal.state.pending.times = next;
      cal.render();
    },
    onEnd(point) {
      if (cal.state.pending) finishGrab(cal, point !== null);
    }
  });
}

/** The menu key and Shift+F10 on an event: its menu, under it. Returns whether the key was this one's. */
function menuKey(cal, chip, event) {
  if (typeof cal.callbacks.onMenu !== 'function' || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return false;
  event.preventDefault();
  const rect = chip.getBoundingClientRect();
  cal.callbacks.onMenu(chip.getAttribute('data-ui-id'), { x: rect.left, y: rect.bottom });
  return true;
}

/** A right-click on an event: its menu, at the pointer; the empty grid keeps the browser's. */
function onContextMenu(cal, event) {
  const chip = event.target.closest?.(CHIP);
  if (!chip || typeof cal.callbacks.onMenu !== 'function') return;
  event.preventDefault();
  cal.callbacks.onMenu(chip.getAttribute('data-ui-id'), { x: event.clientX, y: event.clientY });
}

/** Focus on an event selects it. */
function onFocusIn(cal, event) {
  const chip = event.target.closest?.(CHIP);
  if (chip && !cal.drawing && !cal.state.pending) select(cal, chip.getAttribute('data-ui-id'));
}

/** Wire clicks, keys and drags on the calendar body. */
export function bindCalendar(cal) {
  cal.life.on(cal.body, 'click', (event) => onClick(cal, event));
  cal.life.on(cal.body, 'keydown', (event) => onKeyDown(cal, event));
  cal.life.on(cal.body, 'contextmenu', (event) => onContextMenu(cal, event));
  cal.life.on(cal.body, 'focusin', (event) => onFocusIn(cal, event));
  // A Space a drawing took is no press of the day it was on.
  cal.life.on(cal.body, 'keyup', (event) => {
    if (event.key === ' ' && (event.target.closest?.(CHIP) || cal.spaceTaken)) event.preventDefault();
    if (event.key === ' ') cal.spaceTaken = false;
  });
  bindDraw(cal);
  bindDrag(cal);
  bindResize(cal);
  bindRange(cal);
  bindMore(cal);
}
