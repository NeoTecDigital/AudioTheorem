/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Where a menu panel goes. A panel is `position: fixed`, so its numbers are
 * the viewport's - and the viewport that counts is the visual one: on a
 * pinched page, or one behind an on-screen keyboard, the window runs past what
 * can be seen, and a menu out there cannot be reached.
 *
 * Geometry only: a panel is measured where it is, moved, and nothing else
 * about it is touched. It has to be on the page (not `hidden`) to have a size.
 */
import { visualBox } from '../dom.js';

/** The least room, in pixels, between a panel and the edge of what can be seen. */
const EDGE = 8;

/**
 * `value` held to `[near, far]`. When the range is empty - the panel is larger
 * than the room - the near end wins, so the panel's start, where its first
 * item is, stays in view.
 */
function fit(value, near, far) {
  return Math.max(near, Math.min(value, far));
}

/**
 * The room for `panel`, and the panel measured in it at its own origin. The
 * panel is first held to that room, so one longer than the viewport scrolls
 * inside itself. Where the origin lands is where the panel's fixed
 * coordinates start, which is not the viewport's corner under an ancestor that
 * moves fixed boxes (a transform, a filter): `put` takes it off again.
 * @returns {{room: object, at: DOMRect}|null} null in a document with no window
 */
function measure(panel) {
  const view = panel.ownerDocument.defaultView;
  if (!view) return null;
  const room = visualBox(view);
  panel.style.maxWidth = `${room.width - 2 * EDGE}px`;
  panel.style.maxHeight = `${room.height - 2 * EDGE}px`;
  panel.style.left = '0px';
  panel.style.top = '0px';
  return { room, at: panel.getBoundingClientRect() };
}

/** Move a measured `panel` so its corner is at client `x`, `y`, pulled back inside the room. */
function put(panel, { room, at }, x, y) {
  const left = fit(x, room.left + EDGE, room.left + room.width - at.width - EDGE);
  const top = fit(y, room.top + EDGE, room.top + room.height - at.height - EDGE);
  panel.style.left = `${left - at.left}px`;
  panel.style.top = `${top - at.top}px`;
}

/**
 * Open `panel` with its corner at `point`, or - with no point - below `anchor`
 * at its near edge; with neither, at the corner of what can be seen.
 * @param {HTMLElement} panel
 * @param {{x: number, y: number}|null|undefined} point client coordinates; one that is not two finite numbers is no point
 * @param {Element|null|undefined} anchor
 */
export function placeAt(panel, point, anchor) {
  const measured = measure(panel);
  if (!measured) return;
  if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
    put(panel, measured, point.x, point.y);
    return;
  }
  const under = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
  put(panel, measured, under?.left ?? 0, under?.bottom ?? 0);
}

/**
 * Open `panel` beside `item`, level with it: past its far edge, or - with no
 * room there and room on the other side - before its near one. With room on
 * neither it overlaps its item, inside the viewport.
 * @param {HTMLElement} panel
 * @param {Element} item
 */
export function placeBeside(panel, item) {
  const measured = measure(panel);
  if (!measured) return;
  const { room, at } = measured;
  const beside = item.getBoundingClientRect();
  const fitsAfter = beside.right + at.width <= room.left + room.width - EDGE;
  const fitsBefore = beside.left - at.width >= room.left + EDGE;
  put(panel, measured, fitsAfter || !fitsBefore ? beside.right : beside.left - at.width, beside.top);
}
