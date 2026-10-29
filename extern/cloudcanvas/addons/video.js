/**
 * Written by Richard Christopher, Copyright 2026 NeoTec, LLC
 *
 * video: a playing video as a blit, on the GPU or in the DOM. The `video` trait - `{src, loop, muted, autoplay}` -
 * puts a `<video>` filling the blit (what shows without a GPU), and on a `gpu` root makes it the blit's texture,
 * re-uploaded on each new video frame: through `requestVideoFrameCallback` where the browser has it, else once per
 * rendered frame while the video plays, keeping the loop awake only then. The source is loaded CORS-anonymous, so
 * a cross-origin video needs CORS to reach the GPU; without it the DOM still plays it.
 *
 *   blit.use({ video });
 *   app.blit({ x: 0, y: 0, w: 320, h: 180, port: 'gpu', video: { src: 'clip.mp4', loop: true } });
 */
import { schedule } from '../core/frame.js';
import { safeUrl } from '../graphics/primitives/primitives.js';
import { createLogger } from '../log.js';
import { gpuContent } from './gpu.js';

const logger = /* @__PURE__ */ createLogger('video');

/** Marks the `<video>` the trait put in a blit (one it adopted is left in place on cleanup). */
export const VIDEO_ATTR = 'data-blit-video';

/** @type {WeakMap<object, Set<object>>} root -> its playing videos without frame callbacks */
const POLLED = /* @__PURE__ */ new WeakMap();

/** The root's fallback pass: every playing video re-sent once per frame, busy while any plays. */
function polledOf(root) {
  let polled = POLLED.get(root);
  if (polled) return polled;
  polled = new Set();
  root.hooks.read.add(() => { for (const record of polled) if (!record.el.paused) send(record); });
  root.hooks.busy.add(() => Array.from(polled).some((record) => !record.el.paused && !record.el.ended));
  POLLED.set(root, polled);
  return polled;
}

/** Hand the current frame to the GPU (a new version re-uploads it). */
function send(record) {
  if (record.el.readyState < 2) return;
  record.version += 1;
  gpuContent(record.b, { texture: record.el, version: record.version });
}

/** The trait. @returns {() => void} cleanup: stopped, the element it made removed, the GPU content cleared */
export function video(b, opts, root) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const url = o.src === undefined ? '' : safeUrl(o.src);
  if (o.src !== undefined && !url) logger.warn(`"${String(o.src)}" is not a safe video URL; not loaded`);

  const adopted = b.el.querySelector(':scope > video');
  const el = adopted ?? document.createElement('video');
  if (!adopted) {
    el.setAttribute(VIDEO_ATTR, '');
    Object.assign(el.style, { display: 'block', width: '100%', height: '100%', objectFit: 'cover' });
    b.el.appendChild(el);
  }
  el.crossOrigin = 'anonymous';
  el.muted = o.muted !== false;
  el.loop = o.loop === true;
  el.playsInline = true;
  if (url) el.src = url;

  const record = { b, el, version: 0, callback: null, alive: true };
  const onFrame = () => {
    if (!record.alive) return;
    send(record);
    record.callback = el.requestVideoFrameCallback(onFrame);
  };
  const framed = typeof el.requestVideoFrameCallback === 'function';
  const polled = !framed && root ? polledOf(root) : null;
  if (framed) record.callback = el.requestVideoFrameCallback(onFrame);
  else polled?.add(record);
  const wake = () => {
    send(record);
    if (root) schedule(root);
  };
  el.addEventListener('loadeddata', wake);
  el.addEventListener('play', wake);
  if (o.autoplay !== false) el.play?.()?.catch?.((error) => logger.info('autoplay was refused', error));

  return () => {
    record.alive = false;
    el.removeEventListener('loadeddata', wake);
    el.removeEventListener('play', wake);
    if (framed && record.callback !== null) el.cancelVideoFrameCallback?.(record.callback);
    polled?.delete(record);
    gpuContent(b, null);
    if (!adopted) {
      el.pause?.();
      el.remove();
    }
  };
}
