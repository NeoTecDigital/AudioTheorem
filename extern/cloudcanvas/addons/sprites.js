/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * sprites: frames cut from sheet images. `sheet(name, {src | image, frames | grid, animations})` names a sheet;
 * the `sprite` trait (`{sheet, frame}` or `{sheet, play}`) shows one frame or plays an animation. A sprite may carry
 * its sheet instead of naming one - `{src, grid | frames, animations, frame | play}` - so a saved board holds all
 * it needs; the same inline sheet is registered once. On a `gpu`
 * root the frame is the blit's GPU content - the sheet is one texture and a frame its uv rect, so every sprite
 * of a sheet draws in one batch - and it is also the element's CSS background, so without a GPU (or without
 * `gpu(app)`) the same sprite shows in the DOM. One ticker per root steps every playing sprite and keeps the
 * loop awake only while one plays; a sprite that stops emits `sprite:end`.
 *
 *   sheet('hero', { src: 'hero.png', grid: { w: 32, h: 32 }, animations: { run: { frames: [0, 1, 2, 3], fps: 12 } } });
 *   blit.use({ sprite });
 *   app.blit({ w: 64, h: 64, port: 'gpu', sprite: { sheet: 'hero', play: 'run' } });
 */
import { FRAME_MS, schedule } from '../core/frame.js';
import { stateOf } from '../core/state.js';
import { safeUrl } from '../graphics/primitives/primitives.js';
import { createLogger } from '../log.js';
import { gpuContent } from './gpu.js';

const logger = /* @__PURE__ */ createLogger('sprites');

/** The most frames a grid may cut from one sheet: every frame is a record kept for the sheet's life. */
export const MAX_SPRITE_FRAMES = 4096;

/** @type {Map<string, object>} name -> the sheet record */
const SHEETS = /* @__PURE__ */ new Map();

/** @type {WeakMap<object, object>} root -> its ticker */
const TICKERS = /* @__PURE__ */ new WeakMap();

/** A string as a CSS `url("...")`: a quote or backslash escaped, a line break as its hex escape. */
function cssUrl(url) {
  const quoted = url.replace(/["\\]/g, '\\$&').replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
  return `url("${quoted}")`;
}

/** A frame rect `[x, y, w, h]` in sheet pixels, or null. */
function rectOf(record, frame) {
  return record.frames.get(String(frame)) ?? null;
}

/** The grid's frames, named 0, 1, 2 ... row by row, once the sheet's size is known. */
function cutGrid(record, grid) {
  const w = Number(grid.w);
  const h = Number(grid.h) || w;
  if (!(w > 0 && h > 0)) throw new TypeError('sheet: grid needs a positive w (and h)');
  const columns = Math.floor(record.width / w);
  const cut = columns * Math.floor(record.height / h);
  if (cut > MAX_SPRITE_FRAMES && !(Number(grid.count) <= MAX_SPRITE_FRAMES)) {
    logger.warn(`a ${w}x${h} grid cuts ${cut} frames; the first ${MAX_SPRITE_FRAMES} are kept`);
  }
  const count = Math.min(Number(grid.count) || Infinity, cut, MAX_SPRITE_FRAMES);
  for (let i = 0; i < count; i += 1) record.frames.set(String(i), [(i % columns) * w, Math.floor(i / columns) * h, w, h]);
}

/**
 * Name a sheet, or (without a definition) look one up.
 * @param {string} name
 * @param {{src?: string, image?: object, frames?: Record<string, number[]>, grid?: {w: number, h?: number,
 *   count?: number}, animations?: Record<string, {frames: Array<string|number>, fps?: number, loop?: boolean}>}} [definition]
 *   `src` (http(s), relative or a data: image) is loaded CORS-anonymous; `image` is any decoded image, canvas or
 *   ImageBitmap (it has no CSS fallback unless `src` names it too)
 * @returns {{ready: Promise<void>, width: number, height: number}|null} null when looking up an unknown name
 */
export function sheet(name, definition) {
  if (typeof name !== 'string' || !name) throw new TypeError('sheet: name must be a non-empty string');
  if (definition === undefined) return SHEETS.get(name) ?? null;
  const url = definition.src === undefined ? '' : safeUrl(definition.src);
  if (definition.src !== undefined && !url) throw new TypeError(`sheet: "${String(definition.src)}" is not a safe image URL`);
  let image = definition.image;
  if (!image && url) {
    image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
  }
  if (!image) throw new TypeError('sheet: needs a src or an image');

  const record = {
    image, url, width: 0, height: 0, loaded: false, animations: definition.animations ?? {},
    frames: new Map(Object.entries(definition.frames ?? {}))
  };
  const decoded = typeof image.decode === 'function' && !image.complete ? image.decode() : Promise.resolve();
  record.ready = decoded.then(() => {
    record.width = image.naturalWidth || image.width || 0;
    record.height = image.naturalHeight || image.height || 0;
    if (definition.grid) cutGrid(record, definition.grid);
    record.loaded = true;
  });
  record.ready.catch((error) => logger.warn(`sheet "${name}" did not load`, error));
  SHEETS.set(name, record);
  return record;
}

/** Show frame `rect` of `record` on a blit: GPU content, and the element's background when the sheet has a URL. */
function show(b, record, rect) {
  const [x, y, w, h] = rect;
  const { width, height } = record;
  gpuContent(b, { texture: record.image, uv: [x / width, y / height, (x + w) / width, (y + h) / height] });
  if (!record.url) return;
  const size = b.size;
  const sx = (size.w || w) / w;
  const sy = (size.h || h) / h;
  Object.assign(b.el.style, {
    backgroundImage: cssUrl(record.url),
    backgroundSize: `${width * sx}px ${height * sy}px`,
    backgroundPosition: `${-x * sx}px ${-y * sy}px`,
    backgroundRepeat: 'no-repeat'
  });
}

/** The root's ticker: one write pass stepping every playing sprite, busy while any plays. */
function tickerOf(root) {
  let ticker = TICKERS.get(root);
  if (ticker) return ticker;
  ticker = { playing: new Set() };
  root.hooks.write.add((ctx) => {
    for (const player of Array.from(ticker.playing)) step(ticker, player, ctx.dt * FRAME_MS);
  });
  // A player on a hidden or parked blit neither steps nor keeps the loop awake; it goes on when shown.
  root.hooks.busy.add(() => Array.from(ticker.playing).some((player) => showing(player.b.el)));
  TICKERS.set(root, ticker);
  return ticker;
}

/** Whether an element is on screen as far as the DOM knows: in the document, under no `hidden`. */
const showing = (element) => element.isConnected && !element.closest('[hidden]');

/** Advance one playing sprite by `ms`; a new frame is shown, a finished one-shot ends. */
function step(ticker, player, ms) {
  const { animation, record, b } = player;
  if (!showing(b.el)) return;
  player.time += ms;
  const at = Math.floor(player.time * (Number(animation.fps) || 12) / 1000);
  if (animation.loop === false && at >= animation.frames.length) {
    ticker.playing.delete(player);
    b.emit('sprite:end', { animation: player.name });
    return;
  }
  const index = at % animation.frames.length;
  if (index === player.index) return;
  player.index = index;
  const rect = rectOf(record, animation.frames[index]);
  if (rect) show(b, record, rect);
}

/**
 * The sheet a sprite's options name, or carry inline - registered once per distinct definition and counted by the
 * sprites using it (`release` drops it with the last); `{record, release}`, or undefined if none.
 */
function sheetOf(o) {
  if (o.sheet !== undefined) return SHEETS.has(o.sheet) ? { record: SHEETS.get(o.sheet), release() {} } : undefined;
  if (typeof o.src !== 'string') return undefined;
  const definition = { src: o.src, frames: o.frames, grid: o.grid, animations: o.animations };
  const key = `inline:${JSON.stringify(definition)}`;
  if (!SHEETS.has(key)) {
    try {
      sheet(key, definition).users = 0;
    } catch (error) {
      logger.warn('an inline sheet was refused', error);
      return undefined;
    }
  }
  const record = SHEETS.get(key);
  record.users += 1;
  let released = false;
  return {
    record,
    release() {
      if (released) return;
      released = true;
      if ((record.users -= 1) === 0 && SHEETS.get(key) === record) SHEETS.delete(key);
    }
  };
}

/**
 * The trait: `{sheet, frame}` shows a frame, `{sheet, play}` plays an animation from its first frame; `src` and
 * the sheet's own keys in place of `sheet` carry it inline.
 * @returns {() => void} cleanup: stops playing and clears what it showed
 */
export function sprite(b, opts, root) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const found = sheetOf(o);
  if (!found) {
    logger.warn(`no sheet named "${String(o.sheet ?? o.src)}"`);
    return undefined;
  }
  const { record } = found;
  let alive = true;
  let player = null;
  record.ready.then(() => {
    if (!alive || !stateOf(b.el)) return;
    const animation = o.play === undefined || !Object.hasOwn(record.animations, o.play) ? null : record.animations[o.play];
    if (o.play !== undefined && !animation?.frames?.length) logger.warn(`sheet "${o.sheet}" has no animation "${o.play}"`);
    const first = animation ? animation.frames[0] : (o.frame ?? 0);
    const rect = rectOf(record, first);
    if (!rect) {
      logger.warn(`sheet "${o.sheet}" has no frame "${String(first)}"`);
      return;
    }
    show(b, record, rect);
    if (animation && root) {
      player = { b, record, animation, name: o.play, time: 0, index: 0 };
      tickerOf(root).playing.add(player);
      schedule(root);
    }
  }, () => {});
  return () => {
    alive = false;
    found.release();
    if (player && root) tickerOf(root).playing.delete(player);
    gpuContent(b, null);
    Object.assign(b.el.style, { backgroundImage: '', backgroundSize: '', backgroundPosition: '', backgroundRepeat: '' });
  };
}
