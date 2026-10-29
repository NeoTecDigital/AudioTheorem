/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Calendar arithmetic, pure and local.
 *
 * A calendar is a human artefact: "September" is the local month and 09:00 is
 * nine in the morning where the reader is. Every step here moves the calendar
 * date or the wall clock through `Date`'s local setters, never by adding a
 * fixed number of milliseconds, so a day across a daylight-saving change is
 * still one day. Nothing here formats a string for display: labels are the
 * renderer's locale decision. `dayKey` is the one stable identity.
 */

/** The three grid views, in the order they are offered. */
export const CALENDAR_VIEWS = /* @__PURE__ */ Object.freeze(['month', 'week', 'day']);

/** A `Date` from a Date, an ISO string or `YYYY-MM-DD` (read as local midnight), or null. */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fromDayKey(value);
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Local midnight of the day `date` falls on. */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `n` calendar days later, at the same wall-clock time. */
export function addDays(date, n) {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/** `n` minutes later on the wall clock. */
export function addMinutes(date, n) {
  const out = new Date(date.getTime());
  out.setMinutes(out.getMinutes() + n);
  return out;
}

/** The 1st of the month `n` months from `date`'s month (so 31 Jan + 1 is 1 Feb). */
export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** The 1st of `date`'s month, at local midnight. */
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Local midnight on the first day of `date`'s week; `weekStartsOn` 0 is Sunday. */
export function startOfWeek(date, weekStartsOn = 0) {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() - weekStartsOn + 7) % 7));
}

/** `YYYY-MM-DD` in local time: the stable identity of a day. */
export function dayKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` key, or null for anything that is not a real date. */
export function fromDayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dayKey(date) === key ? date : null;
}

/** Whether two dates fall on the same local day. */
export function sameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

/** Minutes since local midnight. */
export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/** `date`'s day at `minutes` past local midnight. */
export function atMinutes(date, minutes) {
  const out = startOfDay(date);
  out.setMinutes(minutes);
  return out;
}

/** The 42 days (six weeks) a month grid shows around `anchor`. */
export function monthGrid(anchor, weekStartsOn = 0) {
  const first = startOfWeek(startOfMonth(anchor), weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** The days a view shows: 42 for month, 7 for week, 1 for day. */
export function viewDays(view, anchor, weekStartsOn = 0) {
  if (view === 'month') return monthGrid(anchor, weekStartsOn);
  if (view === 'week') {
    const first = startOfWeek(anchor, weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }
  return [startOfDay(anchor)];
}

/** The anchor one period earlier (`delta` -1) or later (+1). */
export function shiftAnchor(view, anchor, delta) {
  if (view === 'month') return addMonths(anchor, delta);
  return addDays(startOfDay(anchor), delta * (view === 'week' ? 7 : 1));
}

/** Whether a span `[start, end)` touches the local day `day`. */
export function touchesDay(start, end, day) {
  const from = startOfDay(day);
  const to = addDays(from, 1);
  const last = end && end > start ? end : new Date(start.getTime() + 1);
  return start < to && last > from;
}
