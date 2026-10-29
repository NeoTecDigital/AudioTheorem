/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The calendar's model: events checked and normalised once per update, the
 * per-day placement the grids draw, and the locale-aware labels. Pure except
 * for `Intl`, which the caller's `locale` steers.
 */
import { addDays, addMinutes, dayKey, minutesOfDay, startOfDay, toDate, touchesDay } from './dates.js';

/** Minutes a timed event lasts when it has no end. */
export const DEFAULT_EVENT_MINUTES = 60;

/**
 * One event, checked: a string id, a real start, an end after the start (or
 * null), and flags. A bad event is a caller error, not something to hide.
 */
function normalizeEvent(event) {
  const id = event?.id;
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('Calendar event needs a string id');
  const start = toDate(event.start);
  if (!start) throw new TypeError(`Calendar event ${id} has no valid start`);
  const end = event.end === undefined || event.end === null ? null : toDate(event.end);
  if (end === null && event.end !== undefined && event.end !== null) throw new TypeError(`Calendar event ${id} has an invalid end`);
  return {
    id, start, end: end && end > start ? end : null, allDay: event.allDay === true,
    title: String(event.title ?? id), tone: event.tone ? String(event.tone) : '', movable: event.movable !== false
  };
}

/** Every event checked, ids unique, sorted by start. */
export function normalizeEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('Calendar events must be an array');
  const seen = new Set();
  const out = [];
  for (const event of events.map(normalizeEvent)) {
    if (seen.has(event.id)) throw new TypeError(`Duplicate calendar event id: ${event.id}`);
    seen.add(event.id);
    out.push(event);
  }
  return out.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/** The event of `id` in the calendar's model, or null. */
export function eventById(cal, id) {
  return cal.state.events.find((event) => event.id === id) ?? null;
}

/** The event's end, or its implied end: the next midnight for all-day, an hour later for timed. */
export function endOf(event) {
  if (event.end) return event.end;
  return event.allDay ? addDays(startOfDay(event.start), 1) : addMinutes(event.start, DEFAULT_EVENT_MINUTES);
}

/** Whether an event belongs in the all-day strip: flagged, or spanning more than one day. */
export function isAllDayLike(event) {
  return event.allDay || dayKey(event.start) !== dayKey(addMinutes(endOf(event), -1));
}

/** `{dayKey: event[]}` for the given days. */
export function eventsByDay(events, days) {
  const map = new Map(days.map((day) => [dayKey(day), []]));
  for (const event of events) {
    for (const day of days) if (touchesDay(event.start, endOf(event), day)) map.get(dayKey(day)).push(event);
  }
  return map;
}

/**
 * Side-by-side lanes for one day's timed events: each event gets the first
 * lane free at its start; `lanes` is how many the day needed.
 */
export function layoutLanes(events) {
  const ends = [];
  const placed = events.map((event) => {
    const start = minutesOfDay(event.start);
    const stop = Math.max(start + 15, start + (endOf(event) - event.start) / 60000);
    let lane = ends.findIndex((end) => end <= start);
    if (lane === -1) lane = ends.length;
    ends[lane] = stop;
    return { event, lane, start, stop };
  });
  return { placed, lanes: Math.max(1, ends.length) };
}

/** Locale-aware formatters, built once per locale. */
export function formattersFor(locale) {
  const make = (options) => new Intl.DateTimeFormat(locale, options);
  return {
    title: { month: make({ month: 'long', year: 'numeric' }), day: make({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
    weekday: make({ weekday: 'short' }),
    weekdayLong: make({ weekday: 'long' }),
    dayNumber: make({ day: 'numeric' }),
    dayHead: make({ weekday: 'short', day: 'numeric' }),
    full: make({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    time: make({ hour: 'numeric', minute: '2-digit' }),
    hour: make({ hour: 'numeric' })
  };
}

/** The toolbar title for a view and its visible days. */
export function titleFor(view, days, format) {
  if (view === 'day') return format.title.day.format(days[0]);
  if (view === 'month') return format.title.month.format(days[15]);
  const first = days[0];
  const last = days[days.length - 1];
  return format.title.month.formatRange?.(first, last) ?? format.title.month.format(first);
}

/** How an event reads to a screen reader. */
export function describeEvent(event, format) {
  if (isAllDayLike(event)) return `${event.title}, ${format.full.format(event.start)}, all day`;
  return `${event.title}, ${format.full.format(event.start)}, ${format.time.format(event.start)} to ${format.time.format(endOf(event))}`;
}
