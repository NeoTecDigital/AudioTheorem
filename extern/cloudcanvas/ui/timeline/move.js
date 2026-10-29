/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Moving a bar. A move in progress is `state.pending`
 * (`{id, keyboard, mode, original, times, days, domain}`): `mode` is `move`
 * (both ends), `start` or `end` (one end), and the axis is frozen at its
 * `domain` while it lasts, so the bar moves under the pointer rather than the
 * axis moving under the bar. Every move snaps to whole days, keeps the time of
 * day, and is reported through `onChange(id, {start, end})` - end exclusive -
 * never applied. By pointer: a drag on the bar, or on one of its end handles;
 * held near an edge of the sheet, the sheet scrolls and the bar follows the
 * days that pass under the pointer (`./edge.js`). By keyboard: Space picks the bar up, the arrows move it a day (Shift
 * resizes its end), Space or Enter drops it, Escape puts it back.
 */
import { trackDrag } from '../drag.js';
import { TL, TIMELINE_SCALES, shiftItem } from './model.js';

export const BAR = `.${TL}-bar`;
const HANDLE_END = `.${TL}-handle`;
const HANDLE_START = `.${TL}-handle-start`;

/** Every bar the sheet draws, in the order drawn. */
export function bars(tl) {
  return Array.from(tl.sheet.querySelectorAll(BAR));
}

export function itemById(tl, id) {
  return tl.state.items.find((item) => item.id === id) ?? null;
}

/** Which part of the bar a press took hold of: its body, or a handle at one end. */
function modeOf(target) {
  if (target?.closest?.(HANDLE_START)) return 'start';
  return target?.closest?.(HANDLE_END) ? 'end' : 'move';
}

function startMove(tl, id, { keyboard, mode }) {
  const item = itemById(tl, id);
  if (!item?.movable) return false;
  const original = { start: item.start, end: item.end };
  tl.state.pending = { id, keyboard, mode, original, times: original, days: 0, domain: tl.domain };
  if (keyboard) tl.say(tl.labels.pickedUp.replace('{title}', item.title));
  return true;
}

const sameTime = (a, b) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

function finishMove(tl, drop) {
  const pending = tl.state.pending;
  tl.state.pending = null;
  tl.focusAfter = pending.keyboard;
  const moved = !sameTime(pending.times.start, pending.original.start) || !sameTime(pending.times.end, pending.original.end);
  if (drop && moved) {
    tl.callbacks.onChange?.(pending.id, { ...pending.times });
    tl.say(`${tl.labels.moved}: ${tl.describe({ ...itemById(tl, pending.id), ...pending.times })}.`);
  } else if (pending.keyboard) {
    tl.say(drop ? tl.labels.notMoved : tl.labels.cancelled);
  }
  tl.render();
}

function stepMove(tl, days, mode) {
  const pending = tl.state.pending;
  pending.times = shiftItem(pending.times, days, mode);
  tl.focusAfter = true;
  tl.render();
  tl.say(tl.describe({ ...itemById(tl, pending.id), ...pending.times }));
}

/** A key while a bar is picked up. Returns whether it was the move's. */
export function pickupKey(tl, event) {
  if (event.repeat && (event.key === ' ' || event.key === 'Enter')) return true;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') stepMove(tl, event.key === 'ArrowRight' ? 1 : -1, event.shiftKey ? 'end' : 'move');
  else if (event.key === ' ' || event.key === 'Enter') finishMove(tl, true);
  else if (event.key === 'Escape' || event.key === 'Tab') finishMove(tl, false);
  else return false;
  if (event.key !== 'Tab') event.preventDefault();
  return true;
}

/** Pick `bar` up for the keyboard; false when it cannot be moved. */
export function pickUp(tl, bar) {
  if (!startMove(tl, bar.getAttribute('data-ui-id'), { keyboard: true, mode: 'move' })) return false;
  tl.focusAfter = true;
  tl.render();
  return true;
}

/** Report `times` for `id` at once (a key that moves or resizes by a day): the host applies it. */
export function reportChange(tl, id, times) {
  tl.callbacks.onChange?.(id, times);
  tl.say(`${tl.labels.moved}: ${tl.describe({ ...itemById(tl, id), ...times })}.`);
}

/** The bar in hand, at the days the pointer has travelled since the press - and the sheet has scrolled under it. */
function dragTo(tl, point) {
  const pending = tl.state.pending;
  if (!pending) return;
  const travel = point.x - pending.originX + tl.sheet.scrollLeft - pending.originScroll;
  const days = Math.round(travel / TIMELINE_SCALES[tl.state.scale].perDay);
  if (days === pending.days) return;
  pending.days = days;
  pending.times = shiftItem(pending.original, days, pending.mode);
  tl.render();
}

/** Wire the pointer's drag of a bar, and of the handle at its end. */
export function bindMove(tl) {
  const follow = (point) => dragTo(tl, point);
  trackDrag(tl.life, tl.sheet, {
    selector: `${BAR}[data-movable]`,
    canStart: () => !tl.state.pending,
    onStart(bar, point, pressTarget) {
      if (!startMove(tl, bar.getAttribute('data-ui-id'), { keyboard: false, mode: modeOf(pressTarget) })) return;
      Object.assign(tl.state.pending, { originX: point.x, originScroll: tl.sheet.scrollLeft });
    },
    onMove(point) {
      follow(point);
      if (tl.state.pending) tl.edge.follow(point, follow);
    },
    onEnd(point) {
      tl.edge.stop();
      if (tl.state.pending) finishMove(tl, point !== null);
    }
  });
}
