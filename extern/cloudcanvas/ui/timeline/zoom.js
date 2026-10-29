/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * Zooming between the three scales. Ctrl and the wheel (a trackpad's pinch is
 * the same wheel with Ctrl) add up to a step when they reach a notch, and a
 * pause forgets what has not; two fingers moving apart or together are a step
 * each time they have travelled half as far again. Either way the date under
 * the pointer - or between the fingers - stays under it, and the new scale is
 * reported (`onScale`). The scale buttons are the toolbar's own: the day at the
 * middle of the window stays at the middle.
 */
import { normalizeWheelDeltas } from '../../addons/pan.js';
import { widthNow } from './gutter.js';
import { dateAt, stepScale, xOf } from './model.js';

/** Wheel pixels (Ctrl held) that are one step of zoom. */
const NOTCH_PX = 50;
/** A rest (ms) after which the pixels of a half-made step are forgotten. */
const PAUSE_MS = 300;
/** How much farther apart (or nearer) two fingers go for one step. */
const PINCH_RATIO = 1.5;

/**
 * The date `offset` px along the sheet from its left edge - at the track's visible edge when that is over the gutter - and
 * what it takes to put it back there.
 */
function anchorOf(tl, offset) {
  const { sheet } = tl;
  const gutter = widthNow(tl);
  const at = Math.max(gutter, offset);
  return { date: dateAt(at + sheet.scrollLeft - gutter, tl.domain, tl.state.scale), gutter, offset: at };
}

/** The date at the pointer's place on the track. */
const anchorAt = (tl, clientX) => anchorOf(tl, clientX - tl.sheet.getBoundingClientRect().left);

/** The date at the middle of the track the sheet shows: what a change made by a button keeps where it is. */
const anchorMiddle = (tl) => anchorOf(tl, widthNow(tl) + Math.max(0, (tl.sheet.clientWidth || 0) - widthNow(tl)) / 2);

/** Scroll the sheet so the anchor's date stands at its place again, on the scale now drawn. */
function restore(tl, anchor) {
  const x = xOf(anchor.date, tl.domain, tl.state.scale);
  tl.sheet.scrollLeft = Math.max(0, anchor.gutter + x - anchor.offset);
}

/** Draw at scale `next` with the date of `anchor` kept where it stood, and report the scale. */
function rescale(tl, next, anchor) {
  tl.state.scale = next;
  tl.render();
  restore(tl, anchor);
  tl.windowMoved();
  tl.callbacks.onScale?.(next);
}

/** One step of zoom (-1 finer, 1 coarser) about `clientX`; nothing at either end, and nothing while a gesture is in hand. */
function zoomBy(tl, step, clientX) {
  const next = stepScale(tl.state.scale, step);
  if (next === tl.state.scale || tl.busy()) return;
  rescale(tl, next, anchorAt(tl, clientX));
}

function bindWheel(tl) {
  let pixels = 0;
  let forget = () => {};
  tl.life.on(tl.sheet, 'wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    pixels += normalizeWheelDeltas(event, tl.sheet.getBoundingClientRect().height).dy;
    forget();
    if (Math.abs(pixels) >= NOTCH_PX) {
      const step = pixels < 0 ? -1 : 1;
      pixels = 0;
      zoomBy(tl, step, event.clientX);
      return;
    }
    forget = tl.life.later(() => { pixels = 0; }, PAUSE_MS);
  }, { passive: false });
}

const apart = (points) => Math.abs(points[0].x - points[1].x);
const middle = (points) => (points[0].x + points[1].x) / 2;

function bindPinch(tl) {
  const touches = new Map();
  let start = 0;
  tl.life.on(tl.sheet, 'pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX });
    if (touches.size === 2) start = Math.max(1, apart([...touches.values()]));
  });
  tl.life.on(tl.sheet, 'pointermove', (event) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX });
    if (touches.size !== 2) return;
    const points = [...touches.values()];
    const ratio = Math.max(1, apart(points)) / start;
    if (ratio < PINCH_RATIO && ratio > 1 / PINCH_RATIO) return;
    start = Math.max(1, apart(points));
    zoomBy(tl, ratio >= PINCH_RATIO ? -1 : 1, middle(points));
  });
  const end = (event) => touches.delete(event.pointerId);
  tl.life.on(tl.sheet, 'pointerup', end);
  tl.life.on(tl.sheet, 'pointercancel', end);
}

/** Wire the wheel, two fingers and the toolbar's buttons: a button keeps the day at the middle of the window, a gesture the day under it. */
export function bindZoom(tl) {
  tl.setScale = (scale) => rescale(tl, scale, anchorMiddle(tl));
  bindWheel(tl);
  bindPinch(tl);
}
