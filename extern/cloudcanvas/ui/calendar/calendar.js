/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Calendar: month, week and day grids with drag (and keyboard) rescheduling.
 *
 *   const calendar = createCalendar(host, {
 *     onNavigate: ({ view, date, start, end }) => load(start, end),
 *     onPick: ({ date, start }) => quickAdd(date, start),
 *     onActivate: (eventId) => open(eventId),
 *     onMove: (eventId, { start, end, allDay }) => reschedule(eventId, start, end)
 *   });
 *   calendar.update({ view: 'month', date: '2026-09-29', events: [{ id: 'a', title: 'Call', start: new Date() }] });
 *
 * The data is plain: `{id, title, start, end?, allDay?, tone?, movable?}`, with
 * dates as `Date`, ISO strings or `YYYY-MM-DD`. The calendar keeps its own view
 * and date between updates; a model `view` or `date` that changes wins. Moves
 * are reported, never applied: the grid shows what the next update says.
 * `selectedId` marks the event a host has selected, on every day it is drawn:
 * for the eye and for assistive technology (`aria-current`). Focus is not moved.
 *
 * THE MENU IS SEEN, NOT ONLY KNOWN. Given `onMenu`, the selected event has a
 * "more" button at its chip's end that asks for the very menu a right-click, the
 * menu key or Shift+F10 asks for (`./more.js`, `../item-more.js`), and every
 * hint line says where the rest is; it is not drawn while an event is in hand.
 *
 * KEYBOARD. Day buttons are one tab stop: arrows move a day (Up/Down a week in
 * the month), Page keys a period, Home/End the week's ends, Enter picks the day.
 * Tab reaches the focused day's events; Enter opens one, Space picks it up,
 * arrows move it (by day, or by `snapMinutes` in the hour grid), Space or Enter
 * drops it and Escape puts it back. The hour grid is a tab stop of its own, so
 * its hours scroll by keyboard. A redraw keeps focus on what held it and scrolls
 * nothing; only the calendar's own keyboard moves bring the view along. N on a
 * day draws a range by keyboard, as a drag across empty slots or days does,
 * and reports it the same way (`onPick`; `./draw.js`). A host that gives the
 * focus back to a day (where a range began, after Escape dropped it) says so
 * with `focusDay(date)`: that day takes the tab stop and the focus, and a
 * redraw keeps it there; a day not on show is navigated to first.
 */
import { button, clamp, createLife, documentOf, el, textNode, writeText } from '../dom.js';
import { injectUiStyles } from '../styles.js';
import { createLiveRegion, say } from '../../addons/announce.js';
import { CONTROL_ATTR } from '../../addons/trait.js';
import { MORE_HELD_WORDS, MORE_WORDS } from '../item-more.js';
import { CALENDAR_VIEWS, addDays, dayKey, sameDay, shiftAnchor, startOfDay, toDate, viewDays } from './dates.js';
import { formattersFor, normalizeEvents, titleFor } from './model.js';
import { CAL, renderMonth } from './month.js';
import { renderTimeGrid } from './time.js';
import { paintDraw } from './draw.js';
import { paint } from './hint.js';
import { bindCalendar, focusDay } from './interact.js';

/** The calendar's default words. */
export const CALENDAR_LABELS = /* @__PURE__ */ Object.freeze({
  previous: 'Previous', next: 'Next', today: 'Today', allDay: 'All day', views: 'View',
  month: 'Month', week: 'Week', day: 'Day', hours: 'Hours', resized: 'Now',
  hintNone: 'Select an event to see what it can do', hintCreate: 'drag across empty slots to add one', hintCreateDays: 'drag across days to add one',
  hintOpen: 'Enter opens', hintMove: 'drag to move', hintResize: 'drag the bottom edge to resize', hintKeys: 'Alt+Shift+Up or Down resizes',
  hintDraw: 'N on a day draws one', hintMore: 'Shift+F10 or right-click for more', hintMoreHeld: MORE_HELD_WORDS, more: MORE_WORDS, hintDrawTime: 'Up and Down move the time · Left and Right the day · Enter or Space starts the range · Escape cancels',
  hintDrawTimeEnd: 'Up and Down set the end · Enter or Space adds the range · Escape cancels',
  hintDrawDays: 'The arrows move the day · Enter or Space starts the range · Escape cancels',
  hintDrawDaysEnd: 'The arrows set the end · Enter or Space adds the range · Escape cancels',
  drawStart: 'Drawing a range: {when}.', drawAnchor: 'Starts {when}.', drawn: 'Range drawn: {range}.', drawCancelled: 'No range drawn.'
});

function toolbar(cal) {
  const { doc, labels, life } = cal;
  const bar = el(doc, 'div', { className: `${CAL}-toolbar` });
  const nav = el(doc, 'div', { className: `${CAL}-nav` });
  nav.append(
    button(doc, { className: `${CAL}-prev`, label: '‹', ariaLabel: labels.previous, signal: life.signal, onClick: () => cal.shift(-1) }),
    button(doc, { className: `${CAL}-today`, label: labels.today, signal: life.signal, onClick: () => cal.navigate(cal.state.view, startOfDay(new Date()), { focus: false }) }),
    button(doc, { className: `${CAL}-next`, label: '›', ariaLabel: labels.next, signal: life.signal, onClick: () => cal.shift(1) }));
  const title = el(doc, 'h2', { className: `${CAL}-title`, attrs: { 'aria-live': 'polite' } });
  cal.titleText = textNode(doc, title);
  cal.viewGroup = el(doc, 'div', { className: `${CAL}-views`, attrs: { role: 'group', 'aria-label': labels.views } });
  bar.append(nav, title, cal.viewGroup);
  return bar;
}

/**
 * The view buttons stand while the set of views does, and only their words and pressed state are rewritten, so the one
 * just activated keeps focus. A new set is drawn afresh; the button of the view that held focus gets it back, unscrolled.
 */
function writeViews(cal) {
  const { views } = cal.state;
  const group = cal.viewGroup;
  const stands = Array.from(group.children, (node) => node.getAttribute('data-view')).join() === views.join();
  const held = !stands && group.contains(cal.doc.activeElement) ? cal.doc.activeElement.getAttribute('data-view') : null;
  if (!stands) {
    group.replaceChildren(...views.map((view) => button(cal.doc, {
      className: `${CAL}-view`, label: '', signal: cal.life.signal, attrs: { 'data-view': view },
      onClick: () => cal.navigate(view, cal.state.focusDate, { focus: false })
    })));
  }
  for (const node of group.children) {
    const view = node.getAttribute('data-view');
    writeText(node.firstChild, cal.labels[view] ?? view);
    node.setAttribute('aria-pressed', String(view === cal.state.view));
    if (view === held) node.focus({ preventScroll: true });
  }
}

/** One tab stop on the focused day; that day's events and "+N" are reachable by Tab. */
function writeTabStops(cal) {
  const key = dayKey(cal.state.focusDate);
  const days = Array.from(cal.body.querySelectorAll(`.${CAL}-day, .${CAL}-day-head`));
  const target = days.find((node) => node.getAttribute('data-date') === key) ?? days.find((node) => !node.closest('.is-outside')) ?? days[0];
  for (const node of days) node.setAttribute('tabindex', node === target ? '0' : '-1');
  const focusKey = target?.getAttribute('data-date');
  for (const node of cal.body.querySelectorAll(`.${CAL}-event, .${CAL}-more`)) {
    node.setAttribute('tabindex', node.closest('[data-date]')?.getAttribute('data-date') === focusKey ? '0' : '-1');
  }
}

/**
 * What holds focus in the body, as `restoreFocus` reads it, marked `keep`: nobody asked for it to move, so returning it
 * must scroll nothing. Null for anything else, and for focus outside.
 */
function heldFocus(cal) {
  const held = cal.doc.activeElement;
  if (!held || !cal.body.contains(held)) return null;
  if (held.matches(`.${CAL}-event`)) return { eventId: held.getAttribute('data-ui-id'), keep: true };
  if (held.matches(`.${CAL}-day, .${CAL}-day-head`)) return { day: true, keep: true };
  return held.matches(`.${CAL}-scroller`) ? { scroller: true, keep: true } : null;
}

function restoreFocus(cal) {
  const want = cal.focusAfter;
  cal.focusAfter = null;
  if (!want) return;
  // A kept focus returns without scrolling. The calendar's own (a pick-up, a move, a day) is a plain focus(): the view follows it.
  const options = want.keep ? { preventScroll: true } : undefined;
  if (want.scroller) { cal.body.querySelector(`.${CAL}-scroller`)?.focus(options); return; }
  const selector = want.eventId ? `.${CAL}-event` : `.${CAL}-day, .${CAL}-day-head`;
  const match = Array.from(cal.body.querySelectorAll(selector)).find((node) => (want.eventId
    ? node.getAttribute('data-ui-id') === want.eventId : node.getAttribute('data-date') === dayKey(cal.state.focusDate)));
  if (match) { match.setAttribute('tabindex', '0'); match.focus(options); }
}

function render(cal) {
  const { state } = cal;
  // Every node is redrawn: a draw that names no focus of its own (a host update, a pointer drag) keeps it on what held it.
  if (cal.focusAfter === null) cal.focusAfter = heldFocus(cal);
  const heldMore = cal.more !== undefined && cal.doc.activeElement === cal.more;
  const days = viewDays(state.view, state.anchor, state.weekStartsOn);
  if (!days.some((day) => sameDay(day, state.focusDate))) state.focusDate = startOfDay(state.view === 'month' ? state.anchor : days[0]);
  cal.title = titleFor(state.view, days, cal.format);
  writeText(cal.titleText, cal.title);
  writeViews(cal);
  const pending = state.pending;
  const events = pending ? state.events.map((event) => (event.id === pending.id ? { ...event, ...pending.times } : event)) : state.events;
  cal.root.setAttribute('data-view', state.view);
  if (state.view === 'month') renderMonth(cal, days, events);
  else renderTimeGrid(cal, days, events);
  paintDraw(cal);
  writeTabStops(cal);
  cal.drawing = true;
  restoreFocus(cal);
  cal.drawing = false;
  paint(cal);
  if (heldMore) cal.more.focus({ preventScroll: true });
  return days;
}

function applyModel(cal, model) {
  const { state } = cal;
  state.views = (Array.isArray(model.views) ? model.views : CALENDAR_VIEWS).filter((view) => CALENDAR_VIEWS.includes(view));
  if (state.views.length === 0) throw new TypeError('Calendar needs at least one of month, week, day');
  if (model.view !== cal.last.view && state.views.includes(model.view)) state.view = model.view;
  if (!state.views.includes(state.view)) state.view = state.views[0];
  const date = model.date === undefined ? null : toDate(model.date);
  if (model.date !== undefined && !date) throw new TypeError(`Calendar date is not a date: ${String(model.date)}`);
  if (date && dayKey(date) !== cal.last.date) {
    state.anchor = startOfDay(date);
    state.focusDate = state.anchor;
  }
  cal.last = { view: model.view, date: date ? dayKey(date) : cal.last.date, selectedId: cal.last.selectedId };
  state.events = normalizeEvents(model.events ?? []);
  const selectedId = model.selectedId ?? null;
  if (selectedId !== cal.last.selectedId) { cal.last.selectedId = selectedId; state.selectedId = selectedId; }
  state.weekStartsOn = Number.isInteger(model.weekStartsOn) ? ((model.weekStartsOn % 7) + 7) % 7 : 0;
  state.now = toDate(model.now) ?? new Date();
  state.snap = Number.isInteger(model.snapMinutes) && model.snapMinutes > 0 && model.snapMinutes <= 240 ? model.snapMinutes : 15;
  const start = Number.isInteger(model.hours?.start) ? clamp(model.hours.start, 0, 23) : 0;
  const end = Number.isInteger(model.hours?.end) ? clamp(model.hours.end, 1, 24) : 24;
  state.hours = end > start ? { start, end } : { start: 0, end: 24 };
  if (model.locale !== state.locale || !cal.format) { state.locale = model.locale; cal.format = formattersFor(model.locale); }
  cal.root.setAttribute('aria-label', String(model.label ?? 'Calendar'));
}

function createRecord(host, callbacks, labels) {
  const doc = documentOf(host);
  const life = createLife();
  // A control (`data-cc-control`): the canvas under the page leaves this view's drags to it, so a host marks nothing.
  const root = el(doc, 'div', { className: CAL, attrs: { role: 'region', [CONTROL_ATTR]: true } });
  const today = startOfDay(new Date());
  const cal = { doc, life, root, callbacks, labels: { ...CALENDAR_LABELS, ...labels }, format: null, last: {}, focusAfter: null,
    state: { view: 'month', anchor: today, focusDate: today, events: [], views: [...CALENDAR_VIEWS], pending: null, creating: null, drawing: null, selectedId: null } };
  root.append(toolbar(cal));
  cal.hint = el(doc, 'p', { className: `${CAL}-hint` });
  cal.hintText = textNode(doc, cal.hint);
  root.append(cal.hint);
  cal.body = el(doc, 'div', { className: `${CAL}-body` });
  root.append(cal.body);
  cal.region = createLiveRegion(root);
  cal.say = (text) => say(cal.region, text);
  cal.render = () => render(cal);
  return cal;
}

/** A change of the body's width gives the selected chip's button or takes it, so the selection is painted again (its button and its hint). */
function watchWidth(cal) {
  const Observer = cal.doc.defaultView?.ResizeObserver;
  if (typeof Observer !== 'function') return;
  const observer = new Observer(() => { if (!cal.life.dead && !cal.pressing && !cal.state.pending && !cal.state.creating) paint(cal); });
  observer.observe(cal.body);
  cal.life.add(() => observer.disconnect());
}

/**
 * @param {HTMLElement} host
 * @param {{onNavigate?: Function, onPick?: Function, onActivate?: Function, onMove?: Function,
 *   labels?: Partial<typeof CALENDAR_LABELS>}} [callbacks]
 * @returns {{update(model: {view?: string, views?: string[], date?: Date|string, now?: Date|string, locale?: string,
 *   weekStartsOn?: number, snapMinutes?: number, hours?: {start: number, end: number}, selectedId?: string|null,
 *   events?: Array<{id: string, title?: string, start: Date|string, end?: Date|string, allDay?: boolean, tone?: string,
 *   movable?: boolean}>}): void, focusDay(date: Date|string): boolean, destroy(): void}}
 */
export function createCalendar(host, callbacks = {}) {
  const cal = createRecord(host, callbacks, callbacks.labels);
  injectUiStyles(cal.doc);
  cal.navigate = (view, date, { focus }) => {
    cal.state.view = view;
    cal.state.anchor = startOfDay(date);
    cal.state.focusDate = startOfDay(date);
    if (focus) cal.focusAfter = { day: true };
    const days = cal.render();
    callbacks.onNavigate?.({ view, date: dayKey(cal.state.anchor), start: days[0], end: addDays(days[days.length - 1], 1) });
  };
  cal.shift = (delta) => cal.navigate(cal.state.view, shiftAnchor(cal.state.view, cal.state.anchor, delta), { focus: false });
  bindCalendar(cal);
  watchWidth(cal);
  host.append(cal.root);
  return {
    update(model = {}) {
      if (cal.life.dead) return;
      applyModel(cal, model);
      if (!cal.state.pending && !cal.state.creating) cal.render();
    },
    /**
     * Make `date` the day the calendar keeps - its one tab stop, and the day a redraw gives the focus back to - and focus it; a
     * day not on show is navigated to first (`onNavigate`). False for what is not a date, and while an event is in hand.
     */
    focusDay(date) {
      const day = toDate(date);
      if (cal.life.dead || !day || cal.state.pending || cal.state.creating) return false;
      focusDay(cal, startOfDay(day));
      return true;
    },
    destroy() {
      if (cal.life.destroy()) cal.root.remove();
    }
  };
}
