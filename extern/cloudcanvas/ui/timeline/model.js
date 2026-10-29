/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * The timeline's arithmetic: items checked, the date domain they need, where a
 * date falls in pixels at a scale and which day a pixel falls on, the ticks of
 * the axis, and the day shifts a move or a resize makes. Pure.
 */
import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek, toDate } from '../calendar/dates.js';

/** The timeline's class prefix. */
export const TL = 'cloudcanvas-ui-timeline';

/** Pixels per day at each scale, and the padding (days) either side of the items. */
export const TIMELINE_SCALES = /* @__PURE__ */ Object.freeze({
  day: { perDay: 64, pad: 2 },
  week: { perDay: 20, pad: 7 },
  month: { perDay: 5, pad: 31 }
});

const DAY_MS = 86400000;

/** The tones a status may carry: the kit's meaning tones, and a quiet one for work that has not begun. */
export const STATUS_TONES = /* @__PURE__ */ Object.freeze(['success', 'warning', 'danger', 'muted']);

/** The scales, finest first: one step along them is one notch of zoom. */
export const SCALE_ORDER = /* @__PURE__ */ Object.freeze(['day', 'week', 'month']);

/**
 * An item's group as the label it is headed by, the id it carries and whether it is folded: a bare label carries no
 * id, and `{id, label, collapsed}` is a group that stands for an item, headed by its id when it has no label. An item's
 * own `groupId` names the group of a bare label. Given, the id is a name.
 */
function groupOf(item) {
  const { group } = item;
  if (group === null || typeof group !== 'object') {
    const id = typeof item.groupId === 'string' && item.groupId.trim() !== '' ? item.groupId : null;
    return { group: group ? String(group) : '', groupId: id, collapsed: false };
  }
  const id = group.id ?? null;
  if (id !== null && (typeof id !== 'string' || id.trim() === '')) throw new TypeError(`Timeline item ${item.id} has a group with an invalid id: ${String(id)}`);
  return { group: String(group.label ?? id ?? ''), groupId: id, collapsed: group.collapsed === true };
}

/** A status as its words and its tone: a string is words alone; `{label, tone}` names one of `STATUS_TONES`. */
function statusOf(status) {
  const object = status !== null && typeof status === 'object';
  const label = String((object ? status.label : status) ?? '');
  return { status: label, statusTone: object && STATUS_TONES.includes(status.tone) ? status.tone : '' };
}

/** The ids an item depends on, once each, never itself. */
function dependsOf(item) {
  const ids = Array.isArray(item.depends) ? item.depends.filter((id) => typeof id === 'string' && id !== item.id) : [];
  return [...new Set(ids)];
}

/** One item, checked: a string id, a real start, an end after it or none (a milestone), a group's id a name. */
function normalizeItem(item, id) {
  const start = toDate(item.start);
  if (!start) throw new TypeError(`Timeline item ${id} has no valid start`);
  const end = item.end === undefined || item.end === null ? null : toDate(item.end);
  if (item.end !== undefined && item.end !== null && !end) throw new TypeError(`Timeline item ${id} has an invalid end`);
  const progress = Number.isFinite(item.progress) ? Math.min(1, Math.max(0, item.progress)) : null;
  return { id, title: String(item.title ?? id), start, end: end && end > start && item.milestone !== true ? end : null,
    ...groupOf(item), ...statusOf(item.status), depends: dependsOf(item), tone: item.tone ? String(item.tone) : '', progress, movable: item.movable !== false };
}

/** Every item checked (string ids, unique), in the given order. */
export function normalizeItems(items) {
  if (!Array.isArray(items)) throw new TypeError('Timeline items must be an array');
  const seen = new Set();
  return items.map((item) => {
    const id = item?.id;
    if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) throw new TypeError(`Invalid or duplicate timeline id: ${String(id)}`);
    seen.add(id);
    return normalizeItem(item, id);
  });
}

/** The first and last day the axis covers: every item, today, and the scale's padding. */
export function domainFor(items, scale, now) {
  const { pad } = TIMELINE_SCALES[scale];
  let first = startOfDay(now);
  let last = startOfDay(now);
  for (const item of items) {
    if (item.start < first) first = startOfDay(item.start);
    const end = item.end ?? item.start;
    if (end > last) last = startOfDay(end);
  }
  return { start: addDays(first, -pad), end: addDays(last, pad + 1) };
}

/** How many days the domain covers. */
export function daysIn(domain) {
  return Math.round((domain.end.getTime() - domain.start.getTime()) / DAY_MS);
}

/** Pixel offset of `date` from the domain start. */
export function xOf(date, domain, scale) {
  return ((date.getTime() - domain.start.getTime()) / DAY_MS) * TIMELINE_SCALES[scale].perDay;
}

/** The axis width in pixels. */
export function widthOf(domain, scale) {
  return xOf(domain.end, domain, scale);
}

/** The narrowest a bar is drawn (px): 1.25rem at the browser's default size. A bar that lasts less is drawn this wide, and says so. */
export const MIN_BAR_PX = 20;

/** A bar's left and width, and `clamped` when it is drawn wider than it lasts; a milestone (no end) has width 0. */
export function barOf(item, domain, scale) {
  const left = xOf(item.start, domain, scale);
  if (!item.end) return { left, width: 0, point: true };
  const width = xOf(item.end, domain, scale) - left;
  return width < MIN_BAR_PX ? { left, width: MIN_BAR_PX, point: false, clamped: true } : { left, width, point: false };
}

/** The tick dates for a scale: every day, every week start, or every month start. */
export function tickDates(domain, scale, weekStartsOn = 1) {
  const ticks = [];
  let date = scale === 'month' ? startOfMonth(domain.start) : scale === 'week' ? startOfWeek(domain.start, weekStartsOn) : domain.start;
  while (date < domain.end) {
    if (date >= domain.start) ticks.push(date);
    date = scale === 'month' ? addMonths(date, 1) : addDays(date, scale === 'week' ? 7 : 1);
  }
  return ticks;
}

/**
 * An item's times moved by `days`: both ends (`'move'`), only its end (`'end'`, or `true`) or only its start (`'start'`).
 * An end never moves to or before the start, nor a start to or after the end; a milestone has nothing to resize.
 */
export function shiftItem(times, days, mode = 'move') {
  const how = mode === true ? 'end' : mode === false ? 'move' : mode;
  if (how === 'end') {
    const end = addDays(times.end ?? times.start, days);
    return { start: times.start, end: end > times.start ? end : times.end ?? null };
  }
  if (how === 'start') {
    const start = addDays(times.start, days);
    return times.end && start < times.end ? { start, end: times.end } : { start: times.start, end: times.end ?? null };
  }
  return { start: addDays(times.start, days), end: times.end ? addDays(times.end, days) : null };
}

/** The whole day, counted from the domain's start, that pixel `x` of the track falls on. */
export function dayAt(x, scale) {
  return Math.floor(x / TIMELINE_SCALES[scale].perDay);
}

/** The scale one notch `step` (-1 finer, 1 coarser) from `scale`, or the same one at either end. */
export function stepScale(scale, step) {
  const at = SCALE_ORDER.indexOf(scale) + step;
  return SCALE_ORDER[Math.max(0, Math.min(SCALE_ORDER.length - 1, at))];
}

/** The date `x` pixels along the domain, to the minute (a fraction of a day is a fraction of the day's length). */
export function dateAt(x, domain, scale) {
  return new Date(domain.start.getTime() + (x / TIMELINE_SCALES[scale].perDay) * DAY_MS);
}
