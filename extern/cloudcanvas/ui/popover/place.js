/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Where a popover goes. A popover is `position: fixed`, so its numbers are the viewport's - the visual one, which a
 * pinch or an on-screen keyboard makes smaller than the window. It stands under its anchor at the anchor's start
 * edge, or over it when there is no room below; it shifts to stay inside the screen and is held to the screen's
 * width; and it keeps off the rectangles a host named, by taking the side that does not cover them.
 *
 * `choosePlace` is the arithmetic and needs no layout; `placePopover` measures the element, asks it, and writes
 * where it goes. All coordinates are the client's.
 */
import { clamp, visualBox } from '../dom.js';

/** The least room, in pixels, between a popover and the edge of what can be seen, and between it and its anchor. */
export const EDGE = 8;
export const GAP = 4;

/** Less room than this, on the side that keeps clear of what is avoided, is not a place for a popover: it is squeezed to nothing. */
const MIN_USABLE = 80;

/** A box as `{left, top, right, bottom}`, from an element, from that shape, or from `{x, y, width, height}`; null for anything else or one with no area. */
export function rectOf(source) {
  const box = typeof source?.getBoundingClientRect === 'function' ? source.getBoundingClientRect() : source;
  if (!box || typeof box !== 'object') return null;
  const left = Number.isFinite(box.left) ? box.left : box.x;
  const top = Number.isFinite(box.top) ? box.top : box.y;
  const right = Number.isFinite(box.right) ? box.right : left + box.width;
  const bottom = Number.isFinite(box.bottom) ? box.bottom : top + box.height;
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

/** The boxes to keep off, from one source or a list of them, those with no area dropped. */
export function avoidRects(avoid) {
  return [avoid].flat().map(rectOf).filter(Boolean);
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The boxes of `avoid` that stand in the columns from `left` to `right`: the ones a popover there can be in the way of. */
const inColumns = (avoid, left, right) => avoid.filter((rect) => rect.left < right && left < rect.right);

/**
 * The line a popover of `height` begins at, going `down` or up from `line`: moved to a gap past each box in its way,
 * the nearest to the anchor first, so two boxes one under the other are both passed.
 */
function passed(line, { down, height, avoid }) {
  const nearest = [...avoid].sort((a, b) => (down ? a.top - b.top : b.bottom - a.bottom));
  return nearest.reduce((edge, rect) => {
    const covered = down ? rect.bottom > edge && rect.top < edge + height : rect.top < edge && rect.bottom > edge - height;
    if (!covered) return edge;
    return down ? rect.bottom + GAP : rect.top - GAP;
  }, line);
}

/**
 * The popover as it would stand on `side` of the anchor: its box, the room it has there, and whether it fits and keeps
 * clear. `past` moves it from the anchor to the far side of what it would cover there, to stand past it.
 */
function candidate(side, { anchor, size, inner, avoid }, past = false) {
  const width = Math.min(size.width, inner.right - inner.left);
  const left = clamp(anchor.left, inner.left, inner.right - width);
  const down = side === 'bottom';
  const line = down ? anchor.bottom + GAP : anchor.top - GAP;
  const edge = past ? passed(line, { down, height: size.height, avoid: inColumns(avoid, left, left + width) }) : line;
  const near = down ? Math.max(edge, inner.top) : Math.min(edge, inner.bottom);
  const space = Math.max(0, down ? inner.bottom - near : near - inner.top);
  const height = Math.min(size.height, space);
  const top = down ? Math.min(near, inner.bottom - height) : near - height;
  const box = { left, top, right: left + width, bottom: top + height };
  return { side, left, top, width, height, maxWidth: inner.right - inner.left, maxHeight: space, space, fits: size.height <= space, clear: !avoid.some((rect) => overlaps(box, rect)) };
}

/** The first of the best: the one with the most room, the wished side winning a tie. */
const roomiest = (candidates) => candidates.reduce((best, next) => (next.space > (best?.space ?? -1) ? next : best), null);

/** Of one set of places: the first where it fits and keeps clear, else the roomiest that keeps clear and has room to be read. */
const wellPlaced = (places) => places.find((place) => place.clear && place.fits)
  ?? roomiest(places.filter((place) => place.clear && place.space >= MIN_USABLE));

/**
 * Choose where a popover of `size` stands by `anchor`. It takes, in turn: a side where it fits and keeps clear of
 * everything in `avoid`, or the roomiest that keeps clear and has room to be read; failing both, the same of the places
 * past what is in the way on each side (an anchor with the strip it must not cover right under it, and no room over
 * it, has the room under the strip); then the first side where it fits, covering what it must; the roomiest side.
 * @param {{anchor: object, size: {width: number, height: number}, room: {left: number, top: number, width: number, height: number},
 *   avoid?: object[], prefer?: 'bottom'|'top'}} request boxes are `{left, top, right, bottom}`; `room` is the visual viewport
 * @returns {{side: 'bottom'|'top', left: number, top: number, width: number, height: number, maxWidth: number, maxHeight: number}}
 */
export function choosePlace({ anchor, size, room, avoid = [], prefer = 'bottom' }) {
  const inner = { left: room.left + EDGE, top: room.top + EDGE, right: room.left + room.width - EDGE, bottom: room.top + room.height - EDGE };
  const sides = prefer === 'top' ? ['top', 'bottom'] : ['bottom', 'top'];
  const context = { anchor, size, inner, avoid };
  const options = sides.map((side) => candidate(side, context));
  const beyond = avoid.length > 0 ? sides.map((side) => candidate(side, context, true)) : [];
  return wellPlaced(options) ?? wellPlaced(beyond) ?? options.find((option) => option.fits) ?? roomiest(options);
}

/**
 * Put `root` by `anchor`: measure it at the screen's largest, choose, and write where it goes and the most it may
 * grow to. It has to be on the page (not `hidden`) to have a size. A popover whose fixed box starts somewhere other
 * than the viewport's corner (an ancestor with a transform) is moved by what that offset is.
 * @param {HTMLElement} root
 * @param {Element} anchor
 * @param {{avoid?: unknown, prefer?: 'bottom'|'top'}} [options]
 * @returns {{side: string}|null} null in a document with no window
 */
export function placePopover(root, anchor, { avoid, prefer = 'bottom' } = {}) {
  const view = root.ownerDocument.defaultView;
  if (!view) return null;
  const room = visualBox(view);
  root.style.maxWidth = `${Math.max(0, room.width - 2 * EDGE)}px`;
  root.style.maxHeight = `${Math.max(0, room.height - 2 * EDGE)}px`;
  root.style.left = '0px';
  root.style.top = '0px';
  const origin = root.getBoundingClientRect();
  const beside = anchor.getBoundingClientRect();
  const placed = choosePlace({ anchor: { left: beside.left, top: beside.top, right: beside.right, bottom: beside.bottom },
    size: { width: origin.width, height: origin.height }, room, avoid: avoidRects(avoid), prefer });
  root.style.maxWidth = `${placed.maxWidth}px`;
  root.style.maxHeight = `${placed.maxHeight}px`;
  root.style.left = `${placed.left - origin.left}px`;
  root.style.top = `${placed.top - origin.top}px`;
  root.setAttribute('data-side', placed.side);
  return placed;
}
