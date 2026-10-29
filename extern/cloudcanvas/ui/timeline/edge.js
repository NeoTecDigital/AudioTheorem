/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * A drag held near an edge of the sheet scrolls it, so a span being made, a
 * bar being moved and an end being resized carry on past what the sheet
 * shows. The edges are the track's: 48px in from the gutter and from the
 * sheet's right side (over the gutter is as far in as the left edge goes).
 * The deeper the pointer is in an edge, the farther the sheet goes each frame;
 * for a reader who asked for less motion it jumps by whole days, a step every
 * quarter of a second, the same however deep. After each scroll the drag is
 * told the pointer again (`follow`), so what is in hand follows the days that
 * pass under the still pointer. It stops when the pointer leaves the edge,
 * the axis has no more to show, or the drag ends (`stop`): let go, Escape, a
 * cancelled pointer.
 */
import { prefersReducedMotion } from '../../addons/motion.js';
import { clamp } from '../dom.js';
import { widthNow } from './gutter.js';
import { TIMELINE_SCALES } from './model.js';
import { maxScrollLeft } from './reveal.js';

/** How far (px) in from either side of the track an edge reaches. */
export const EDGE_PX = 48;
/** A frame (ms), and the most a frame scrolls (px), deep in an edge. */
const FRAME_MS = 16;
const FRAME_MAX_PX = 24;
/** For less motion: a step every so often (ms), of whole days at least this wide (px). */
const STEP_MS = 250;
const STEP_PX = 64;

/** How deep `x` is in an edge: up to -1 in the left one, up to 1 in the right one, 0 clear of both. */
function depthAt(tl, x) {
  const { sheet } = tl;
  const left = sheet.getBoundingClientRect().left + widthNow(tl);
  const right = sheet.getBoundingClientRect().left + (sheet.clientWidth || 0);
  if (!(right - left > 2 * EDGE_PX)) return 0;
  if (x < left + EDGE_PX) return -Math.min(1, (left + EDGE_PX - x) / EDGE_PX);
  return x > right - EDGE_PX ? Math.min(1, (x - right + EDGE_PX) / EDGE_PX) : 0;
}

/** The px one step scrolls at `depth`: a share of a frame's most, or - for less motion - whole days. */
function stepAt(tl, depth, reduced) {
  if (!reduced) return Math.sign(depth) * Math.max(1, Math.round(FRAME_MAX_PX * Math.abs(depth)));
  const { perDay } = TIMELINE_SCALES[tl.state.scale];
  return Math.sign(depth) * perDay * Math.max(1, Math.round(STEP_PX / perDay));
}

/** Give the timeline `tl.edge`: `follow(point, onScroll)` on each move of a drag, `stop()` when it ends. */
export function bindEdge(tl) {
  const run = { point: null, onScroll: null, cancel: null };
  const pace = () => (prefersReducedMotion() ? STEP_MS : FRAME_MS);
  const tick = () => {
    run.cancel = null;
    const depth = run.point ? depthAt(tl, run.point.x) : 0;
    if (depth === 0) return;
    const before = tl.sheet.scrollLeft;
    tl.sheet.scrollLeft = clamp(before + stepAt(tl, depth, prefersReducedMotion()), 0, maxScrollLeft(tl));
    if (tl.sheet.scrollLeft === before) return;
    run.onScroll(run.point);
    tl.windowMoved();
    run.cancel = tl.life.later(tick, pace());
  };
  tl.edge = {
    follow(point, onScroll) {
      Object.assign(run, { point, onScroll });
      if (run.cancel === null && depthAt(tl, point.x) !== 0) run.cancel = tl.life.later(tick, pace());
    },
    stop() {
      run.cancel?.();
      Object.assign(run, { point: null, onScroll: null, cancel: null });
    }
  };
}
