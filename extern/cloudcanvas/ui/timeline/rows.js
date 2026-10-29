/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * What the timeline draws: the axis, the rows and, in each row, the bar or the
 * milestone with its title. The rows are a `treegrid`: a group's heading is a
 * row of level 1, an item's row is a row of level 2 under it (level 1 when it
 * has no group), the bar a button in the row's track cell, named by its title,
 * its dates, its status and its progress. The row's label in the gutter and a
 * title drawn beside a bar are the bar's name again, for the eye alone.
 *
 * A TITLE IS ALWAYS DRAWN. Inside the bar when the bar is wide enough to hold
 * some of it (it then ends in an ellipsis), else beside it, as a milestone's
 * is. Either way the full title is in the bar's name and its tooltip.
 *
 * A FOLDED GROUP DRAWS A SUMMARY on its heading's row: a bar from the earliest
 * start of its items to their latest end, within the axis, titled with the
 * group's name and how many it holds. It is a part of the group's item (a
 * press opens it, as the heading does) for the eye alone - the heading says
 * the same - and it is no empty row: a drag that starts on it makes no span.
 * A press or a menu on it says so to the host (`{ summary: true }`,
 * `./interact.js`), since its id is the item's own.
 */
import { addDays, startOfDay } from '../calendar/dates.js';
import { el } from '../dom.js';
import { gutterHandle } from './gutter.js';
import { MIN_BAR_PX, TL, barOf, tickDates, xOf } from './model.js';

/** A bar narrower than this (px) draws its title beside it: inside, nothing of it would read. */
export const INSIDE_MIN_PX = 56;

/**
 * The days a bar covers, as a reader counts them: the first day, and the last when it is another. A bar's end is
 * exclusive - the midnight after its last day - so an end at midnight is the day before, and an end during a day is
 * that day.
 */
export function daysWords({ start, end }, date) {
  const midnight = startOfDay(end);
  const last = end.getTime() === midnight.getTime() ? addDays(end, -1) : midnight;
  return last > startOfDay(start) ? `${date(start)} to ${date(last)}` : date(start);
}

/** How a bar reads to a screen reader, and what its tooltip says: title, dates, that it is drawn wider than it lasts, status, progress. */
export function describeItem(tl, item) {
  const date = (value) => tl.format.format(value);
  const when = item.end ? daysWords(item, date) : `${date(item.start)}, ${tl.labels.milestone}`;
  const clamped = item.end && barOf(item, tl.domain, tl.state.scale).clamped ? `, ${tl.labels.clamped}` : '';
  const status = item.status ? `, ${item.status}` : '';
  const done = item.progress === null ? '' : `, ${Math.round(item.progress * 100)}% ${tl.labels.done}`;
  const needs = item.depends.filter((id) => tl.byId.has(id)).map((id) => tl.byId.get(id).title);
  return `${item.title}, ${when}${clamped}${status}${done}${needs.length ? `, ${tl.labels.dependsOn} ${needs.join(', ')}` : ''}`;
}

function writeGeometry(node, geometry) {
  node.style.setProperty('--timeline-x', `${geometry.left}px`);
  node.style.setProperty('--timeline-w', `${geometry.width}px`);
}

function barNode(tl, item, geometry, inside) {
  const { doc } = tl;
  const name = describeItem(tl, item);
  const node = el(doc, 'button', { className: `${TL}-bar`, attrs: { type: 'button', tabindex: '-1', 'data-ui-id': item.id, title: name,
    'aria-label': name, 'data-tone': item.tone || null, 'data-status-tone': item.statusTone || null, 'data-movable': item.movable ? 'true' : null } });
  node.classList.toggle('is-point', geometry.point);
  node.classList.toggle('is-short', !geometry.point && !inside);
  node.classList.toggle('is-grabbed', tl.state.pending?.id === item.id);
  writeGeometry(node, geometry);
  if (item.progress !== null) node.style.setProperty('--timeline-progress', String(item.progress));
  if (inside) node.append(el(doc, 'span', { className: `${TL}-bar-title`, text: item.title }));
  if (item.movable && !geometry.point) {
    for (const name of ['handle-start', 'handle']) node.append(el(doc, 'span', { className: `${TL}-${name}`, attrs: { 'aria-hidden': 'true' } }));
  }
  return node;
}

/** The title of a milestone or of a bar too short to hold it: drawn beside it, a part that stands for the item. */
function outsideTitle(tl, item, geometry) {
  const node = el(tl.doc, 'span', { className: `${TL}-outside`, text: item.title, attrs: { 'aria-hidden': 'true', 'data-ui-for': item.id } });
  node.classList.toggle('is-point', geometry.point);
  writeGeometry(node, geometry);
  return node;
}

/** A bar narrower than this (px) is narrower than two 44px targets: under a finger its link handle is there only while its item is selected or focused. */
export const NARROW_PX = 88;

/** The handle a link is dragged from, beside the bar's right edge; it stands for no item, so a press on it opens nothing. */
function linkHandle(tl, item, geometry) {
  const node = el(tl.doc, 'span', { className: `${TL}-link`, attrs: { 'aria-hidden': 'true', 'data-link-from': item.id, title: tl.labels.link } });
  node.classList.toggle('is-point', geometry.point);
  node.classList.toggle('is-narrow', geometry.width < NARROW_PX);
  writeGeometry(node, geometry);
  return node;
}

function trackNode(tl, item) {
  const track = el(tl.doc, 'div', { className: `${TL}-track`, attrs: { role: 'gridcell', 'data-group-id': item.groupId } });
  const geometry = barOf(item, tl.domain, tl.state.scale);
  const inside = !geometry.point && geometry.width >= INSIDE_MIN_PX;
  track.append(barNode(tl, item, geometry, inside));
  if (typeof tl.callbacks.onLink === 'function') track.append(linkHandle(tl, item, geometry));
  if (!inside) track.append(outsideTitle(tl, item, geometry));
  return track;
}

/** A row: the item's title in the gutter, and its bar on the track. */
function rowNode(tl, item) {
  const level = item.group ? 2 : 1;
  const row = el(tl.doc, 'div', { className: `${TL}-row`, attrs: { role: 'row', 'aria-level': level, 'data-row-id': item.id } });
  row.append(el(tl.doc, 'div', { className: `${TL}-label`, text: item.title, attrs: { 'aria-hidden': 'true', 'data-ui-for': item.id, title: item.title } }),
    trackNode(tl, item));
  return row;
}

/** The chevron that folds a group, drawn when the host takes `onToggleGroup`; `order` puts it first, the label stays first for the keys. */
function foldToggle(tl, item) {
  const word = item.collapsed ? tl.labels.expand : tl.labels.collapse;
  return el(tl.doc, 'button', { className: `${TL}-group-toggle`, attrs: { type: 'button', tabindex: '-1', 'data-group-id': item.groupId,
    'aria-expanded': String(!item.collapsed), 'aria-label': word.replace('{group}', item.group), title: word.replace('{group}', item.group) } });
}

/** How many items a folded group holds, beside its name. */
function foldCount(tl, item) {
  const count = tl.state.items.filter((other) => other.groupId === item.groupId).length;
  return el(tl.doc, 'span', { className: `${TL}-group-count`, text: count, attrs: { title: tl.labels.hidden.replace('{count}', String(count)) } });
}

/** The items under `item`'s heading: its group's, by id; a group that is a name alone, by that name. */
function membersOf(tl, item) {
  return tl.state.items.filter((other) => other.groupId === item.groupId && (item.groupId !== null || other.group === item.group));
}

/**
 * Where `item`'s group stands on the axis: from its items' earliest start to their latest end (a milestone's end is its
 * start), within the axis, never narrower than a bar is drawn; and how many items it holds.
 */
export function groupSpan(tl, item) {
  const members = membersOf(tl, item);
  const start = new Date(Math.max(tl.domain.start, Math.min(...members.map((one) => one.start))));
  const end = new Date(Math.min(tl.domain.end, Math.max(...members.map((one) => one.end ?? one.start))));
  const left = xOf(start, tl.domain, tl.state.scale);
  return { left, width: Math.max(MIN_BAR_PX, xOf(end, tl.domain, tl.state.scale) - left), count: members.length };
}

/** The bar a folded group draws over its group's days, titled with the group's name and how many items it holds. */
function summaryNode(tl, item) {
  const span = groupSpan(tl, item);
  const words = (span.count === 1 ? tl.labels.summaryOne : tl.labels.summary).replace('{group}', item.group).replace('{count}', String(span.count));
  const node = el(tl.doc, 'span', { className: `${TL}-summary`, attrs: { 'aria-hidden': 'true', title: words, 'data-ui-for': item.groupId } });
  node.append(el(tl.doc, 'span', { className: `${TL}-summary-title`, text: words }));
  writeGeometry(node, span);
  return node;
}

/**
 * The track of a heading row, drawn when the host takes `onCreate` or the group is folded: a span is dragged across
 * it as across any row's, for the group the heading is, folded or not, and a folded group's summary stands on it. It
 * holds no bar, so it is for the pointer alone.
 */
function headingTrack(tl, item) {
  const track = el(tl.doc, 'div', { className: `${TL}-track`, attrs: { role: 'gridcell', 'aria-hidden': 'true', 'data-group-id': item.groupId } });
  if (item.collapsed) track.append(summaryNode(tl, item));
  return track;
}

/** The heading row of `item`'s group: its name, or - for a group that stands for an item - a button that is that item's face. */
function groupNode(tl, item) {
  const row = el(tl.doc, 'div', { className: `${TL}-group`, attrs: { role: 'row', 'aria-level': 1 } });
  const cell = el(tl.doc, 'div', { className: `${TL}-group-cell`, attrs: { role: 'gridcell' } });
  row.append(cell);
  if (typeof tl.callbacks.onCreate === 'function' || item.collapsed) row.append(headingTrack(tl, item));
  if (item.groupId === null) {
    cell.textContent = item.group;
    return row;
  }
  cell.append(el(tl.doc, 'button', { className: `${TL}-group-label`, text: item.group, attrs: { type: 'button', 'data-ui-id': item.groupId } }));
  if (typeof tl.callbacks.onToggleGroup !== 'function') return row;
  row.setAttribute('aria-expanded', String(!item.collapsed));
  cell.append(foldToggle(tl, item));
  if (item.collapsed) cell.append(foldCount(tl, item));
  return row;
}

/** Whether `item` stands under another heading than `last`'s: its name or the item it stands for differs. */
const startsGroup = (item, last) => !last || item.group !== last.group || item.groupId !== last.groupId;

/** The rows, each run of items under one heading headed once: a group met again is headed again. */
export function rowsNode(tl, items) {
  const rows = el(tl.doc, 'div', { className: `${TL}-rows`, attrs: { role: 'treegrid', 'aria-label': tl.root.getAttribute('aria-label') } });
  let last = null;
  for (const item of items) {
    if (startsGroup(item, last) && item.group) rows.append(groupNode(tl, item));
    last = item;
    if (!item.collapsed) rows.append(rowNode(tl, item));
  }
  return rows;
}

/** The date axis. Its ticks are for the eye alone; the corner holds the gutter's separator. */
export function axisNode(tl) {
  const axis = el(tl.doc, 'div', { className: `${TL}-axis` });
  const corner = el(tl.doc, 'div', { className: `${TL}-corner` });
  corner.append(gutterHandle(tl));
  const ticks = el(tl.doc, 'div', { className: `${TL}-ticks`, attrs: { 'aria-hidden': 'true' } });
  const format = tl.tickFormats[tl.state.scale];
  for (const date of tickDates(tl.domain, tl.state.scale)) {
    const tick = el(tl.doc, 'div', { className: `${TL}-tick`, text: format.format(date) });
    tick.style.setProperty('--timeline-x', `${xOf(date, tl.domain, tl.state.scale)}px`);
    ticks.append(tick);
  }
  axis.append(corner, ticks);
  return axis;
}
