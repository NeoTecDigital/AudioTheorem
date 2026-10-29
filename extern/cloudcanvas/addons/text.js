/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * text: text on the GPU, crisp at any zoom. The `text` trait - `{value, font, color, align, padding, lineHeight}` -
 * rasterises the text with Canvas2D, word-wrapped to the blit's box, into a texture at the device pixel ratio times
 * the camera's zoom rounded up to a power of two (so zooming re-rasters only when it crosses one), and makes that
 * the blit's GPU content. The element keeps the text itself (in a span of the trait's own), styled the same, so
 * screen readers and search see it, and without a GPU it is simply what shows.
 *
 *   blit.use({ text });
 *   app.blit({ x: 40, y: 40, w: 240, h: 60, port: 'gpu', text: { value: 'Hello', font: '600 20px system-ui' } });
 */
import { safeColor } from '../graphics/primitives/primitives.js';
import { createLogger } from '../log.js';
import { gpuContent } from './gpu.js';

const logger = /* @__PURE__ */ createLogger('text');

/** The font a text blit uses when it names none. */
export const TEXT_FONT = '16px system-ui, sans-serif';

/** The largest raster side, in device pixels; past it the zoom factor is held down. */
export const MAX_RASTER = 4096;

/** @type {WeakMap<object, Set<object>>} root -> its text blits' records, re-rastered by one read pass */
const TEXTS = /* @__PURE__ */ new WeakMap();

/** The zoom rounded up to a power of two, between 1/4 and 8: the raster changes only when this does. */
export function zoomBucket(scale) {
  return 2 ** Math.min(3, Math.max(-2, Math.ceil(Math.log2(Math.max(Number(scale) || 1, 1e-3)))));
}

/** Greedy word wrap of `value` to `width` px with `measure`; hard line breaks kept. */
export function wrapLines(value, width, measure) {
  const lines = [];
  for (const paragraph of String(value).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (line && word.trim() && measure(next) > width) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = next;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Draw a record's text into its canvas at `factor` device pixels per CSS pixel. */
function raster(record, factor) {
  const { b, o, canvas } = record;
  const { w, h } = b.size;
  const scale = Math.min(factor, MAX_RASTER / Math.max(w, h, 1));
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    logger.warn('no 2D canvas here; the text shows in the DOM only');
    return;
  }
  const padding = Number(o.padding) || 0;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = o.font || TEXT_FONT;
  ctx.fillStyle = safeColor(o.color, '#000');
  ctx.textBaseline = 'top';
  ctx.textAlign = o.align === 'center' || o.align === 'right' ? o.align : 'left';
  const x = ctx.textAlign === 'center' ? w / 2 : (ctx.textAlign === 'right' ? w - padding : padding);
  const size = parseFloat(/(\d*\.?\d+)px/.exec(ctx.font)?.[1]) || 16;
  const step = (Number(o.lineHeight) || 1.25) * size;
  wrapLines(o.value, w - padding * 2, (line) => ctx.measureText(line).width)
    .forEach((line, i) => ctx.fillText(line, x, padding + i * step));
}

/** Re-raster a record when its size, text or zoom bucket changed; the GPU gets the new version. */
function refresh(record, root) {
  const { w, h } = record.b.size;
  const factor = (globalThis.devicePixelRatio || 1) * zoomBucket(root.camera.scale);
  const key = `${w}x${h}@${factor}`;
  if (key === record.key) return;
  record.key = key;
  raster(record, factor);
  gpuContent(record.b, { texture: record.canvas, version: (record.version += 1) });
}

/** The root's pass: every text blit checked before the GPU draws. */
function textsOf(root) {
  let texts = TEXTS.get(root);
  if (texts) return texts;
  texts = new Set();
  root.hooks.read.add(() => { for (const record of texts) refresh(record, root); });
  TEXTS.set(root, texts);
  return texts;
}

/** Marks the span the trait writes its text into. */
export const TEXT_ATTR = 'data-blit-text';

/**
 * The trait. A `value` is written into a span of the trait's own (the element's other content - handles, a grip,
 * an svg - is never touched), styled like the raster; without one the element's own text is drawn as it is.
 * @returns {() => void} cleanup: the GPU content and the span go
 */
export function text(b, opts, root) {
  const o = opts && typeof opts === 'object' ? { ...opts } : {};
  let span = null;
  if (o.value !== undefined) {
    span = document.createElement('span');
    span.setAttribute(TEXT_ATTR, '');
    span.textContent = String(o.value);
    Object.assign(span.style, {
      display: 'block', boxSizing: 'border-box', width: '100%', height: '100%',
      font: o.font || TEXT_FONT, color: safeColor(o.color, '#000'), whiteSpace: 'pre-wrap',
      textAlign: o.align || '', padding: o.padding ? `${Number(o.padding) || 0}px` : ''
    });
    b.el.prepend(span);
  }
  o.value = String(o.value ?? b.el.textContent ?? '');
  const record = { b, o, canvas: document.createElement('canvas'), key: '', version: 0 };
  const texts = root ? textsOf(root) : null;
  texts?.add(record);
  if (root) refresh(record, root);
  return () => {
    texts?.delete(record);
    gpuContent(b, null);
    span?.remove();
  };
}
