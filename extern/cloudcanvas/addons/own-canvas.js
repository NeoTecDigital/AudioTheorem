/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * own-canvas: a blit you draw yourself. `ownCanvas(b, draw)` puts a `<canvas>` filling the blit, sized to its box
 * at the device pixel ratio, and calls `draw(ctx, {w, h, ratio})` with the context already scaled to CSS pixels -
 * now, whenever the box changes size, and on `redraw(b)`. On a `gpu` root the canvas is the blit's texture,
 * re-uploaded after each draw; without one the canvas itself shows. Removing the blit - or an ancestor - ends
 * it, like `off()`.
 *
 *   const off = ownCanvas(chart, (ctx, { w, h }) => { ctx.fillRect(0, h / 2, w, 1); });
 *   redraw(chart);   // after the data changes
 */
import { isWithin, rootOf, stateOf } from '../core/state.js';
import { createLogger } from '../log.js';
import { gpuContent } from './gpu.js';

const logger = /* @__PURE__ */ createLogger('own-canvas');

/** Marks the canvas `ownCanvas` put in a blit. */
export const OWN_CANVAS_ATTR = 'data-blit-canvas';

/** @type {WeakMap<object, object>} blit state -> its drawing record */
const DRAWN = /* @__PURE__ */ new WeakMap();

/** @type {WeakMap<object, Set<object>>} root -> its records, re-sized by one read pass */
const SIZED = /* @__PURE__ */ new WeakMap();

/** Draw a record now: backing store to the box at the ratio, the context scaled, the texture re-sent. */
function paint(record) {
  const { b, canvas, draw } = record;
  const { w, h } = b.size;
  const ratio = globalThis.devicePixelRatio || 1;
  record.key = `${w}x${h}@${ratio}`;
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    try {
      draw(ctx, { w, h, ratio });
    } catch (error) {
      logger.error('a draw function threw', error);
    }
  }
  record.version += 1;
  gpuContent(b, { texture: canvas, version: record.version });
}

/** The root's pass: a record whose box changed size draws again. */
function sizedOf(root) {
  let sized = SIZED.get(root);
  if (sized) return sized;
  sized = new Set();
  root.hooks.read.add(() => {
    for (const record of Array.from(sized)) {
      // Gone with an ancestor (no `remove` of its own fired): let go.
      if (!isWithin(root.host, record.b.el)) {
        record.off();
        continue;
      }
      const { w, h } = record.b.size;
      if (record.key !== `${w}x${h}@${globalThis.devicePixelRatio || 1}`) paint(record);
    }
  });
  SIZED.set(root, sized);
  return sized;
}

/**
 * Draw a blit yourself. A second call replaces the first.
 * @param {object} b the blit
 * @param {(ctx: CanvasRenderingContext2D, size: {w: number, h: number, ratio: number}) => void} draw
 * @returns {() => void} off: the canvas and the GPU content go
 */
export function ownCanvas(b, draw) {
  if (typeof draw !== 'function') throw new TypeError('ownCanvas: draw must be a function');
  const state = stateOf(b.el);
  if (!state) throw new TypeError('ownCanvas: not a blit');
  DRAWN.get(state)?.off();

  const canvas = document.createElement('canvas');
  canvas.setAttribute(OWN_CANVAS_ATTR, '');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  b.el.appendChild(canvas);
  const root = rootOf(state);
  const record = { b, canvas, draw, key: '', version: 0, root };
  const sized = root ? sizedOf(root) : null;
  sized?.add(record);
  let offRemove = null;
  record.off = () => {
    offRemove?.();
    sized?.delete(record);
    DRAWN.delete(state);
    canvas.remove();
    gpuContent(b, null);
  };
  // A removed blit lets go of its canvas and draw function, `off()` called or not.
  offRemove = b.on('remove', (event) => { if (event.target === b.el) record.off(); });
  DRAWN.set(state, record);
  paint(record);
  return record.off;
}

/** Call a blit's draw function again (its data changed). @returns {boolean} whether it has one */
export function redraw(b) {
  const record = DRAWN.get(stateOf(b.el));
  if (record?.root && !isWithin(record.root.host, b.el)) record.off();
  else if (record) paint(record);
  return Boolean(record) && DRAWN.has(stateOf(b.el));
}
